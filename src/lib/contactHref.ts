// Güvenli mailto:/tel: href üretimi. DB değerleri (Apollo/generic proxy) UI'da
// tekrar güvenli kabul edilmemeli — geçersiz/şüpheli değerler için undefined döner,
// geçerliler URL-encode edilir (örn. `tel:javascript:` gibi şema enjeksiyonunu önler).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[+()\d][\d\s().-]{4,}$/

export function safeMailto(email: string | null | undefined): string | undefined {
  if (!email || !EMAIL_RE.test(email.trim())) return undefined
  return `mailto:${encodeURIComponent(email.trim())}`
}

export function safeTel(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined
  const trimmed = phone.trim()
  if (!PHONE_RE.test(trimmed)) return undefined
  // tel: için izinli karakterler dışını at.
  return `tel:${trimmed.replace(/[^+\d]/g, '')}`
}
