// ─────────────────────────────────────────────────────────────────────────────
// Telegram transport katmanı (Faz B1).
//
// TEK istemci: webhook cevabı, orchestrator/weekly-retro proaktif mesajları ve
// diagnostics (getMe/getWebhookInfo) aynı yoldan geçer.
//
// Güvenlik/dayanıklılık kuralları:
// - AbortController + timeout (varsayılan 10 sn) — asılı fetch yok.
// - Retry YALNIZ güvenli hatalarda: 429 (Telegram retry_after ile açıkça
//   "işlemedim, bekle" der). Network hatası / 5xx sendMessage için AMBIGUOUS
//   (mesaj gitmiş olabilir) → in-process kör retry YOK; sonuç retryable=true
//   döner, kalıcı retry kararı ÇAĞIRANIN (ör. cron next_retry_at) işidir.
// - Token/secret asla log'a veya hata mesajına yazılmaz (redactToken).
// ─────────────────────────────────────────────────────────────────────────────

export interface TelegramSendOk {
  ok: true
  messageId: number
  status: number
}

export interface TelegramSendErr {
  ok: false
  status: number
  /** Redacted, kısa hata tanımı — token/secret içermez. */
  error: string
  /** true → çağıran kalıcı retry planlayabilir (429/5xx/network). */
  retryable: boolean
}

export type TelegramSendResult = TelegramSendOk | TelegramSendErr

const DEFAULT_TIMEOUT_MS = 10_000
const RETRY_AFTER_CAP_MS = 5_000

function botToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN ?? ''
}

/** Hata metninden bot token'ı söker (URL'de geçer — asla sızmasın). */
export function redactToken(text: string): string {
  const token = botToken()
  if (!token) return text
  return text.split(token).join('<redacted>')
}

interface TelegramApiEnvelope<T> {
  ok: boolean
  result?: T
  description?: string
  error_code?: number
  parameters?: { retry_after?: number }
}

async function callTelegramApi<T>(
  method: string,
  payload: Record<string, unknown> | null,
  opts?: { timeoutMs?: number },
): Promise<{ status: number; body: TelegramApiEnvelope<T> | null; networkError: string | null }> {
  const token = botToken()
  if (!token) {
    return { status: 0, body: null, networkError: 'TELEGRAM_BOT_TOKEN eksik' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
      signal: controller.signal,
    })
    let body: TelegramApiEnvelope<T> | null = null
    try {
      body = (await res.json()) as TelegramApiEnvelope<T>
    } catch {
      body = null
    }
    return { status: res.status, body, networkError: null }
  } catch (err) {
    const name = err instanceof Error ? err.name : 'unknown'
    return {
      status: 0,
      body: null,
      networkError: name === 'AbortError' ? 'timeout' : `network:${name}`,
    }
  } finally {
    clearTimeout(timer)
  }
}

export interface SendMessageOpts {
  chatId?: string
  parseMode?: 'HTML' | null
  timeoutMs?: number
}

/**
 * sendMessage — typed sonuç, message_id'siz başarı YOK.
 * 429'da retry_after (≤5 sn) kadar bekleyip TEK retry yapar (Telegram 429'da
 * mesajı işlememiştir → güvenli). Diğer hatalarda retry yok; retryable bayrağı döner.
 */
export async function sendTelegramMessage(
  text: string,
  opts: SendMessageOpts = {},
): Promise<TelegramSendResult> {
  const chatId = opts.chatId ?? process.env.TELEGRAM_CHAT_ID ?? ''
  if (!chatId) {
    return { ok: false, status: 0, error: 'TELEGRAM_CHAT_ID eksik', retryable: false }
  }
  const payload: Record<string, unknown> = { chat_id: chatId, text }
  if (opts.parseMode !== null) payload.parse_mode = opts.parseMode ?? 'HTML'

  const attempt = () =>
    callTelegramApi<{ message_id: number }>('sendMessage', payload, { timeoutMs: opts.timeoutMs })

  let { status, body, networkError } = await attempt()

  // 429: Telegram işlemedi + ne kadar bekleyeceğimizi söyledi → tek güvenli retry.
  if (status === 429) {
    const retryAfterMs = Math.min(
      ((body?.parameters?.retry_after ?? 1) as number) * 1000,
      RETRY_AFTER_CAP_MS,
    )
    await new Promise((r) => setTimeout(r, retryAfterMs))
    ;({ status, body, networkError } = await attempt())
  }

  if (networkError) {
    return { ok: false, status: 0, error: redactToken(networkError), retryable: true }
  }
  const messageId = body?.result?.message_id
  if (status === 200 && body?.ok && typeof messageId === 'number') {
    return { ok: true, messageId, status }
  }
  const desc = body?.description ?? `http ${status}`
  return {
    ok: false,
    status,
    error: redactToken(desc).slice(0, 200),
    retryable: status === 429 || status >= 500,
  }
}

export interface WebhookInfo {
  url: string
  pending_update_count: number
  last_error_date?: number
  last_error_message?: string
  has_custom_certificate?: boolean
}

export async function getWebhookInfo(): Promise<
  { ok: true; info: WebhookInfo } | { ok: false; error: string }
> {
  const { status, body, networkError } = await callTelegramApi<WebhookInfo>('getWebhookInfo', null)
  if (networkError) return { ok: false, error: redactToken(networkError) }
  if (status === 200 && body?.ok && body.result) return { ok: true, info: body.result }
  return { ok: false, error: redactToken(body?.description ?? `http ${status}`) }
}

export interface BotIdentity {
  id: number
  username?: string
  first_name?: string
}

export async function getMe(): Promise<{ ok: true; bot: BotIdentity } | { ok: false; error: string }> {
  const { status, body, networkError } = await callTelegramApi<BotIdentity>('getMe', null)
  if (networkError) return { ok: false, error: redactToken(networkError) }
  if (status === 200 && body?.ok && body.result) return { ok: true, bot: body.result }
  return { ok: false, error: redactToken(body?.description ?? `http ${status}`) }
}

/**
 * setWebhook — YALNIZ kullanıcı deploy sonrası açıkça onaylarsa çağrılır
 * (otomatik kayıt YOK — pazarlıksız sınır). Secret buradan geçer, asla loglanmaz.
 */
export async function setWebhook(
  url: string,
  secretToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { status, body, networkError } = await callTelegramApi<boolean>('setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: ['message'],
  })
  if (networkError) return { ok: false, error: redactToken(networkError) }
  if (status === 200 && body?.ok) return { ok: true }
  return { ok: false, error: redactToken(body?.description ?? `http ${status}`) }
}
