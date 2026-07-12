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

interface UpsertCall {
  table: string
  payload: Record<string, unknown>
}
const upserts: UpsertCall[] = []
let existingRow: { status: string; metadata: Record<string, unknown> } | null = null

vi.mock('@/lib/lifeSupabaseAdmin', () => ({
  lifeSupabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: existingRow, error: null }),
          }),
        }),
      }),
      upsert: async (payload: Record<string, unknown>) => {
        upserts.push({ table, payload })
        return { error: null }
      },
    }),
  },
}))

import { dispatchReminder, filterSentToday, nextRetryDelayMs } from './reminderDispatch'

describe('dispatchReminder (Faz B2 — sahte başarı düzeltmesi)', () => {
  beforeEach(() => {
    sendMock.mockReset()
    logTurnMock.mockReset()
    upserts.length = 0
    existingRow = null
  })

  it('gönderim BAŞARISIZ → success kaydı YOK, conversation log YOK, send_failed + next_retry_at var', async () => {
    sendMock.mockResolvedValueOnce({ ok: false, status: 502, error: 'bad gateway', retryable: true })
    const r = await dispatchReminder({
      date: '2026-07-13',
      reminderType: 'morning_checkin',
      message: 'günaydın',
      nowMs: 1_000_000,
    })
    expect(r.sent).toBe(false)
    expect(logTurnMock).not.toHaveBeenCalled()
    expect(upserts).toHaveLength(1)
    const p = upserts[0].payload
    expect(p.status).toBe('send_failed')
    expect(p.telegram_message_id).toBeNull()
    const meta = p.metadata as { attempts: number; last_error: string; next_retry_at: string }
    expect(meta.attempts).toBe(1)
    expect(meta.last_error).toBe('bad gateway')
    expect(Date.parse(meta.next_retry_at)).toBeGreaterThan(1_000_000)
  })

  it('başarılı retry → TAM BİR kayıt (aynı satır upsert), attempts görünür, log yazılır', async () => {
    existingRow = { status: 'send_failed', metadata: { attempts: 2 } }
    sendMock.mockResolvedValueOnce({ ok: true, messageId: 55, status: 200 })
    const r = await dispatchReminder({
      date: '2026-07-13',
      reminderType: 'morning_checkin',
      message: 'günaydın',
    })
    expect(r.sent).toBe(true)
    expect(r.messageId).toBe(55)
    expect(r.attempts).toBe(3)
    expect(logTurnMock).toHaveBeenCalledTimes(1)
    // TEK upsert — onConflict(date,reminder_type) aynı satırı pending'e çevirir.
    expect(upserts).toHaveLength(1)
    expect(upserts[0].payload.status).toBe('pending')
    expect(upserts[0].payload.telegram_message_id).toBe(55)
  })

  it('message_id yoksa client zaten failure döner → success izi imkânsız', async () => {
    sendMock.mockResolvedValueOnce({ ok: false, status: 200, error: 'message_id yok', retryable: false })
    const r = await dispatchReminder({ date: '2026-07-13', reminderType: 'x', message: 'm' })
    expect(r.sent).toBe(false)
    expect(logTurnMock).not.toHaveBeenCalled()
  })
})

describe('filterSentToday (retry kilidi)', () => {
  const now = Date.parse('2026-07-13T10:00:00Z')

  it('send_failed + retry vadesi GEÇMİŞ → listede YOK (yeniden denenebilir)', () => {
    const rows = [
      { reminder_type: 'morning_checkin', status: 'send_failed', metadata: { next_retry_at: '2026-07-13T09:00:00Z' } },
    ]
    expect(filterSentToday(rows, now)).toEqual([])
  })

  it('send_failed + vadesi GELMEMİŞ → bloklar (hammer yok)', () => {
    const rows = [
      { reminder_type: 'morning_checkin', status: 'send_failed', metadata: { next_retry_at: '2026-07-13T11:00:00Z' } },
    ]
    expect(filterSentToday(rows, now)).toEqual(['morning_checkin'])
  })

  it('normal pending/done satırlar her zaman sayılır', () => {
    const rows = [
      { reminder_type: 'a', status: 'pending', metadata: null },
      { reminder_type: 'b', status: 'done', metadata: null },
    ]
    expect(filterSentToday(rows, now)).toEqual(['a', 'b'])
  })
})

describe('nextRetryDelayMs', () => {
  it('artan backoff, 4 saatte cap', () => {
    expect(nextRetryDelayMs(1)).toBe(5 * 60_000)
    expect(nextRetryDelayMs(2)).toBe(15 * 60_000)
    expect(nextRetryDelayMs(10)).toBe(4 * 60 * 60_000)
  })
})
