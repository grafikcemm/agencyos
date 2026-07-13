import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock'lar ──────────────────────────────────────────────────────────────────
const sendMock = vi.fn()
vi.mock('@/lib/telegram/client', () => ({
  sendTelegramMessage: (...args: unknown[]) => sendMock(...args),
}))
const logTurnMock = vi.fn()
vi.mock('@/lib/assistant/memory', () => ({
  logConversationTurn: (...args: unknown[]) => logTurnMock(...args),
}))

// assistant_reminders tek-satır durum makinesi mock'u (date,type sabit).
interface Row { status: string | null; metadata: Record<string, unknown> | null; telegram_message_id?: number | null }
let row: Row | null = null
let insertError: { code: string } | null = null
let updateError: { code: string } | null = null
let finalizeErrorOnce = false
const providerCalls: string[] = []

function chainResult(data: unknown, error: unknown) {
  const obj = {
    eq: () => obj,
    select: () => obj,
    maybeSingle: async () => ({ data, error }),
    then: (res: (v: { data: unknown; error: unknown }) => void) => res({ data, error }),
  }
  return obj
}

vi.mock('@/lib/lifeSupabaseAdmin', () => ({
  lifeSupabaseAdmin: {
    from: () => ({
      select: () => chainResult(row, null),
      insert: async (payload: Row) => {
        if (insertError) return { error: insertError }
        if (row) return { error: { code: '23505' } } // unique(date,type)
        row = { ...payload }
        return { error: null }
      },
      update: (payload: Partial<Row>) => {
        // CAS zinciri: .eq×2/3 sonra .select() veya await.
        const apply = () => {
          if (updateError) return { data: null, error: updateError }
          if (finalizeErrorOnce && payload.status !== 'sending' && payload.status !== 'send_failed') {
            finalizeErrorOnce = false
            return { data: null, error: { code: '57P01' } }
          }
          // CAS: claim devralma yalnız send_failed/stale-sending üzerinde çağrılır;
          // mock basitleştirmesi: mevcut satır varsa uygula.
          if (!row) return { data: [], error: null }
          row = { ...row, ...payload }
          return { data: [{ reminder_type: 'x' }], error: null }
        }
        const obj = {
          eq: () => obj,
          select: async () => apply(),
          then: (res: (v: { data: unknown; error: unknown }) => void) => res(apply()),
        }
        return obj
      },
    }),
  },
}))

import {
  dispatchReminder,
  filterSentToday,
  nextRetryDelayMs,
  STALE_SENDING_MS,
} from './reminderDispatch'

const NOW = Date.parse('2026-07-13T09:00:00Z')

describe('dispatchReminder — at-most-once makine (Faz B2 + 0.5)', () => {
  beforeEach(() => {
    sendMock.mockReset()
    logTurnMock.mockReset()
    row = null
    insertError = null
    updateError = null
    finalizeErrorOnce = false
    providerCalls.length = 0
    sendMock.mockImplementation(async (msg: string) => {
      providerCalls.push(msg)
      return { ok: true, messageId: 55, status: 200 }
    })
  })

  it('başarı: claim(sending) → provider 1 kez → finalize(pending) + log', async () => {
    const r = await dispatchReminder({ date: 'd', reminderType: 't', message: 'm', nowMs: NOW })
    expect(r).toMatchObject({ sent: true, messageId: 55, attempts: 1 })
    expect(providerCalls).toHaveLength(1)
    expect(logTurnMock).toHaveBeenCalledTimes(1)
    expect(row?.status).toBe('pending')
  })

  it('eşzamanlı iki dispatch → INSERT yarışı → provider TAM 1 kez', async () => {
    const [a, b] = await Promise.all([
      dispatchReminder({ date: 'd', reminderType: 't', message: 'm', nowMs: NOW }),
      dispatchReminder({ date: 'd', reminderType: 't', message: 'm', nowMs: NOW }),
    ])
    expect(providerCalls).toHaveLength(1)
    expect([a.skipped, b.skipped].filter(Boolean)).toHaveLength(1)
  })

  it('claim YAZILAMAZSA provider ÇAĞRILMAZ (fail-closed)', async () => {
    insertError = { code: '57P01' }
    const r = await dispatchReminder({ date: 'd', reminderType: 't', message: 'm', nowMs: NOW })
    expect(r.skipped).toBe(true)
    expect(providerCalls).toHaveLength(0)
  })

  it('provider FAIL → send_failed + next_retry_at; log YOK; retry CAS ile devralır ve TEK finalize', async () => {
    sendMock.mockImplementationOnce(async (msg: string) => {
      providerCalls.push(msg)
      return { ok: false, status: 502, error: 'bad gateway', retryable: true }
    })
    const r1 = await dispatchReminder({ date: 'd', reminderType: 't', message: 'm', nowMs: NOW })
    expect(r1.sent).toBe(false)
    expect(logTurnMock).not.toHaveBeenCalled()
    expect(row?.status).toBe('send_failed')
    const meta = row?.metadata as { attempts: number; next_retry_at: string }
    expect(meta.attempts).toBe(1)
    expect(Date.parse(meta.next_retry_at)).toBeGreaterThan(NOW)

    // retry (vade geldi): send_failed devralınır → başarı → attempts 2, tek log.
    const r2 = await dispatchReminder({ date: 'd', reminderType: 't', message: 'm', nowMs: NOW + 10 * 60_000 })
    expect(r2).toMatchObject({ sent: true, attempts: 2 })
    expect(providerCalls).toHaveLength(2)
    expect(logTurnMock).toHaveBeenCalledTimes(1)
    expect(row?.status).toBe('pending')
  })

  it('pending/done satır varken yeni dispatch → skipped, provider çağrılmaz', async () => {
    row = { status: 'pending', metadata: { attempts: 1 } }
    const r = await dispatchReminder({ date: 'd', reminderType: 't', message: 'm', nowMs: NOW })
    expect(r.skipped).toBe(true)
    expect(providerCalls).toHaveLength(0)
  })

  it('TAZE sending satır → devralınmaz (başka instance gönderiyor)', async () => {
    row = { status: 'sending', metadata: { attempts: 1, claimed_at: new Date(NOW - 1000).toISOString() } }
    const r = await dispatchReminder({ date: 'd', reminderType: 't', message: 'm', nowMs: NOW })
    expect(r.skipped).toBe(true)
    expect(providerCalls).toHaveLength(0)
  })

  it('STALE sending (crash-before-send) → devralınır ve gönderilir', async () => {
    row = {
      status: 'sending',
      metadata: { attempts: 1, claimed_at: new Date(NOW - STALE_SENDING_MS - 1).toISOString() },
    }
    const r = await dispatchReminder({ date: 'd', reminderType: 't', message: 'm', nowMs: NOW })
    expect(r).toMatchObject({ sent: true, attempts: 2 })
    expect(providerCalls).toHaveLength(1)
  })

  it('provider SUCCESS + finalize DB hatası → recordError, satır sending kalır → aynı gün İKİNCİ provider çağrısı YOK', async () => {
    finalizeErrorOnce = true
    const r1 = await dispatchReminder({ date: 'd', reminderType: 't', message: 'm', nowMs: NOW })
    expect(r1).toMatchObject({ sent: true, recordError: true })
    expect(row?.status).toBe('sending')
    // aynı gün tekrar dene (taze sending) → skipped.
    const r2 = await dispatchReminder({ date: 'd', reminderType: 't', message: 'm', nowMs: NOW + 60_000 })
    expect(r2.skipped).toBe(true)
    expect(providerCalls).toHaveLength(1) // duplicate YOK
  })
})

describe('filterSentToday (Faz 0.5)', () => {
  const now = Date.parse('2026-07-13T10:00:00Z')
  it('send_failed vadesi geçmiş → seçilebilir; vadesi gelmemiş → bloklar', () => {
    expect(
      filterSentToday(
        [{ reminder_type: 'a', status: 'send_failed', metadata: { next_retry_at: new Date(now - 1).toISOString() } }],
        now,
      ),
    ).toEqual([])
    expect(
      filterSentToday(
        [{ reminder_type: 'a', status: 'send_failed', metadata: { next_retry_at: new Date(now + 1).toISOString() } }],
        now,
      ),
    ).toEqual(['a'])
  })
  it('sending taze → bloklar; stale → seçilebilir (kurtarma)', () => {
    expect(
      filterSentToday(
        [{ reminder_type: 'a', status: 'sending', metadata: { claimed_at: new Date(now - 1000).toISOString() } }],
        now,
      ),
    ).toEqual(['a'])
    expect(
      filterSentToday(
        [{ reminder_type: 'a', status: 'sending', metadata: { claimed_at: new Date(now - STALE_SENDING_MS - 1).toISOString() } }],
        now,
      ),
    ).toEqual([])
  })
  it('pending/done sayılır', () => {
    expect(filterSentToday([{ reminder_type: 'a', status: 'pending', metadata: null }], now)).toEqual(['a'])
  })
})

describe('nextRetryDelayMs', () => {
  it('artan backoff, 4 saatte cap', () => {
    expect(nextRetryDelayMs(1)).toBe(5 * 60_000)
    expect(nextRetryDelayMs(2)).toBe(15 * 60_000)
    expect(nextRetryDelayMs(10)).toBe(4 * 60 * 60_000)
  })
})
