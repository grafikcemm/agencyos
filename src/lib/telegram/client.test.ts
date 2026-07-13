import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendTelegramMessage, getWebhookInfo, getMe, setWebhook, redactToken } from './client'

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

  // ── Sprint-3 Faz 1: belirsiz/kesin sınıflandırması (duplicate önleme temeli) ──
  it('network timeout → AMBIGUOUS (istek Telegram\'a ulaşmış olabilir)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')))
    const r = await sendTelegramMessage('x')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.ambiguous).toBe(true)
  })

  it('5xx → AMBIGUOUS (Telegram işlemiş olabilir); 503 dahil', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(503, { ok: false, description: 'service unavailable' }))
    const r = await sendTelegramMessage('x')
    if (!r.ok) {
      expect(r.ambiguous).toBe(true)
      expect(r.retryable).toBe(true)
    }
  })

  it('4xx (400 parse hatası) → KESİN başarısızlık (ambiguous=false, retry güvenli)', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(400, { ok: false, description: 'can not parse entities' }))
    const r = await sendTelegramMessage('x')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.ambiguous).toBe(false)
      expect(r.retryable).toBe(false)
    }
  })

  it('429 + retry sonrası HÂLÂ 429 → KESİN başarısızlık (Telegram "işlemedim" der), retryable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ status: 429, json: async () => ({ ok: false, parameters: { retry_after: 0 } }) })
    vi.stubGlobal('fetch', fetchMock)
    const r = await sendTelegramMessage('x')
    expect(fetchMock).toHaveBeenCalledTimes(2) // tek in-process retry
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.ambiguous).toBe(false)
      expect(r.retryable).toBe(true)
    }
  })

  it('200 ama gövde bozuk/parse edilemedi → AMBIGUOUS ("ok" demiş olabilir)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ status: 200, json: async () => { throw new Error('bozuk json') } }))
    const r = await sendTelegramMessage('x')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.ambiguous).toBe(true)
  })

  it('CHAT_ID / BOT_TOKEN eksik → KESİN (hiç gönderilmedi), ambiguous=false', async () => {
    vi.stubEnv('TELEGRAM_CHAT_ID', '')
    const r1 = await sendTelegramMessage('x')
    if (!r1.ok) expect(r1.ambiguous).toBe(false)
    vi.stubEnv('TELEGRAM_CHAT_ID', '42')
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
    const r2 = await sendTelegramMessage('x')
    if (!r2.ok) expect(r2.ambiguous).toBe(false)
  })

  it('fake transport GUARD: token DOLUYKEN bayrak YOK SAYILIR + CRITICAL log (gerçek yol çalışır)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('TELEGRAM_FAKE_TRANSPORT', 'success')
    vi.stubGlobal('fetch', mockFetchOnce(200, { ok: true, result: { message_id: 88 } }))
    const r = await sendTelegramMessage('x')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.messageId).toBe(88) // fake id (900M+) DEĞİL — gerçek yol
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('CRITICAL'))).toBe(true)
    errSpy.mockRestore()
    vi.stubEnv('TELEGRAM_FAKE_TRANSPORT', '')
  })

  it('fake transport: token BOŞKEN deterministik başarı (dış çağrı yok)', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
    vi.stubEnv('TELEGRAM_FAKE_TRANSPORT', 'success')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const r = await sendTelegramMessage('x')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.messageId).toBeGreaterThan(900_000_000)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.stubEnv('TELEGRAM_FAKE_TRANSPORT', '')
  })

  it('getMe başarı + hata yolları', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(200, { ok: true, result: { id: 1, username: 'bot' } }))
    const ok = await getMe()
    expect(ok.ok).toBe(true)
    vi.stubGlobal('fetch', mockFetchOnce(401, { ok: false, description: 'unauthorized' }))
    const err = await getMe()
    expect(err.ok).toBe(false)
  })

  it('setWebhook başarı + hata + network yolları (yalnız açık onayla çağrılır)', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(200, { ok: true, result: true }))
    expect((await setWebhook('https://x/api/telegram', 's')).ok).toBe(true)
    vi.stubGlobal('fetch', mockFetchOnce(400, { ok: false, description: 'bad url' }))
    expect((await setWebhook('bozuk', 's')).ok).toBe(false)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('down')))
    expect((await setWebhook('https://x', 's')).ok).toBe(false)
  })

  it('getWebhookInfo hata + network yolları', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(500, { ok: false, description: 'boom' }))
    expect((await getWebhookInfo()).ok).toBe(false)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('down')))
    expect((await getWebhookInfo()).ok).toBe(false)
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
