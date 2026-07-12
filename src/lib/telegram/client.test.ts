import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendTelegramMessage, getWebhookInfo, redactToken } from './client'

const TOKEN = 'test-bot-token-123'

function mockFetchOnce(status: number, body: unknown) {
  return vi.fn().mockResolvedValueOnce({
    status,
    json: async () => body,
  })
}

describe('telegram client (Faz B1)', () => {
  beforeEach(() => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', TOKEN)
    vi.stubEnv('TELEGRAM_CHAT_ID', '42')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('başarı: message_id ile ok döner', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(200, { ok: true, result: { message_id: 77 } }))
    const r = await sendTelegramMessage('merhaba')
    expect(r).toEqual({ ok: true, messageId: 77, status: 200 })
  })

  it('message_id yoksa 200 bile olsa BAŞARI DEĞİL', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(200, { ok: true, result: {} }))
    const r = await sendTelegramMessage('merhaba')
    expect(r.ok).toBe(false)
  })

  it('429 → retry_after kadar bekleyip TEK retry (başarılı)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 429,
        json: async () => ({ ok: false, parameters: { retry_after: 0 } }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ ok: true, result: { message_id: 5 } }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const r = await sendTelegramMessage('x')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(r.ok).toBe(true)
  })

  it('5xx → retry YOK (in-process), retryable=true döner', async () => {
    const fetchMock = mockFetchOnce(502, { ok: false, description: 'bad gateway' })
    vi.stubGlobal('fetch', fetchMock)
    const r = await sendTelegramMessage('x')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.retryable).toBe(true)
  })

  it('network hatası → retryable, token sızmaz', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')))
    const r = await sendTelegramMessage('x')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.retryable).toBe(true)
      expect(r.error).not.toContain(TOKEN)
    }
  })

  it('timeout → AbortError kontrollü failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementationOnce((_url: string, opts: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
        })
      }),
    )
    const r = await sendTelegramMessage('x', { timeoutMs: 10 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('timeout')
  })

  it('BOT_TOKEN eksik → kontrollü failure (fetch hiç çağrılmaz)', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const r = await sendTelegramMessage('x')
    expect(r.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('redactToken hata metninden token söker', () => {
    expect(redactToken(`https://api.telegram.org/bot${TOKEN}/sendMessage 404`)).not.toContain(TOKEN)
  })

  it('getWebhookInfo başarı yolu', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(200, { ok: true, result: { url: 'https://x/api/telegram', pending_update_count: 3 } }),
    )
    const r = await getWebhookInfo()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.info.pending_update_count).toBe(3)
  })
})
