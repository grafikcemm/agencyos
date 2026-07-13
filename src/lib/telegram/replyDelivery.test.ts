import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── mock: LIFE ledger + telegram client ──────────────────────────────────────
let insertError: { code: string } | null = null
let finalizeRows: Array<{ id: number }> = [{ id: 1 }]
let finalizeError: { code: string } | null = null
const inserts: Array<Record<string, unknown>> = []
const finalizes: Array<Record<string, unknown>> = []

vi.mock('@/lib/lifeSupabaseAdmin', () => ({
  lifeSupabaseAdmin: {
    from: () => ({
      insert: async (payload: Record<string, unknown>) => {
        if (!insertError) inserts.push(payload)
        return { error: insertError }
      },
      update: (patch: Record<string, unknown>) => {
        const chain = {
          eq: () => chain,
          select: async () => {
            finalizes.push(patch)
            return { data: finalizeError ? null : finalizeRows, error: finalizeError }
          },
        }
        return chain
      },
    }),
  },
}))

const sendMock = vi.fn()
vi.mock('@/lib/telegram/client', () => ({
  sendTelegramMessage: (...args: unknown[]) => sendMock(...args),
}))

import { sendReplyOnce, replyDeliveryKey } from './replyDelivery'

describe('sendReplyOnce — durable delivery ledger (Faz 0.1)', () => {
  beforeEach(() => {
    insertError = null
    finalizeRows = [{ id: 1 }]
    finalizeError = null
    inserts.length = 0
    finalizes.length = 0
    sendMock.mockReset().mockResolvedValue({ ok: true, status: 200, messageId: 42, error: null })
    vi.stubEnv('NODE_ENV', 'test')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('normal akış: claim(sending) → provider → finalize(sent)', async () => {
    const r = await sendReplyOnce({ updateId: 10, seq: 1, text: 'merhaba' })
    expect(r).toMatchObject({ sent: true, status: 200 })
    expect(inserts[0]).toMatchObject({ delivery_key: 'update:10:reply:1', status: 'sending' })
    expect(finalizes[0]).toMatchObject({ status: 'sent', message_id: 42 })
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('duplicate update (aynı delivery_key, 23505) → provider ÇAĞRILMAZ — ikinci Telegram mesajı YOK', async () => {
    insertError = { code: '23505' }
    const r = await sendReplyOnce({ updateId: 10, seq: 1, text: 'merhaba' })
    expect(r).toMatchObject({ sent: false, deduped: true })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('provider success + finalize BAŞARISIZ → sent:true + recordError (otomatik resend YOK)', async () => {
    finalizeError = { code: '57P01' }
    const r = await sendReplyOnce({ updateId: 11, seq: 1, text: 'x' })
    expect(r).toMatchObject({ sent: true, recordError: true })
    // Satır 'sending' kaldı; aynı key ile ikinci çağrı 23505'e çarpar (dedupe testi yukarıda).
  })

  it('provider success + finalize 0 satır (yarış) → recordError, resend yok', async () => {
    finalizeRows = []
    const r = await sendReplyOnce({ updateId: 12, seq: 1, text: 'x' })
    expect(r).toMatchObject({ sent: true, recordError: true })
  })

  it('provider başarısız → failed finalize; sent:false', async () => {
    sendMock.mockResolvedValue({ ok: false, status: 502, messageId: null, error: 'bad gateway' })
    const r = await sendReplyOnce({ updateId: 13, seq: 1, text: 'x' })
    expect(r).toMatchObject({ sent: false, status: 502 })
    expect(finalizes[0]).toMatchObject({ status: 'failed' })
  })

  it('ledger tablosu yok (006 bekliyor, 42P01) → unledgered düz gönderim (durable success TAKLİT EDİLMEZ)', async () => {
    insertError = { code: '42P01' }
    const r = await sendReplyOnce({ updateId: 14, seq: 1, text: 'x' })
    expect(r).toMatchObject({ sent: true, unledgered: true })
    expect(finalizes).toHaveLength(0)
  })

  it('PROD + ledger yazılamıyor (tablo VAR ama hata) → provider çağrılmaz (fail-closed)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    insertError = { code: '57P01' }
    const r = await sendReplyOnce({ updateId: 15, seq: 1, text: 'x' })
    expect(r).toMatchObject({ sent: false, error: 'delivery ledger unavailable' })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('deterministik anahtar: aynı update+seq → aynı key (retry dedupe temeli)', () => {
    expect(replyDeliveryKey(99, 2)).toBe('update:99:reply:2')
  })
})
