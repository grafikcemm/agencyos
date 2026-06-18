// ─────────────────────────────────────────────────────────────────────────────
// Log redaction — ham LLM/3rd-party gövdelerini loglara basmadan önce kısalt +
// belirgin PII desenlerini maskele. Loglar daha geniş erişim/retention'a sahip
// olabilir; müşteri verisi / sağlayıcı detayı sızdırma.
// ─────────────────────────────────────────────────────────────────────────────

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g
const DEFAULT_MAX = 500

/**
 * Loglanabilir güvenli bir özet döndürür: e-posta/telefon maskelenir, metin
 * `maxLen` karaktere kırpılır. Hata ayıklama için yapı korunur, içerik korunmaz.
 */
export function redactForLog(input: unknown, maxLen: number = DEFAULT_MAX): string {
  const text = typeof input === 'string' ? input : JSON.stringify(input ?? '')
  const masked = text
    .replace(EMAIL_RE, '[email]')
    .replace(PHONE_RE, '[phone]')
  return masked.length > maxLen ? `${masked.slice(0, maxLen)}… [+${masked.length - maxLen} char kırpıldı]` : masked
}
