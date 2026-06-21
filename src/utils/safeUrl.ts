/**
 * Dış link güvenliği: sadece http/https şemasına izin ver.
 * `javascript:` ve `data:` gibi şemalar XSS riski taşır (react/security.md).
 * Güvenli değilse undefined döner → çağıran link'i render etmez.
 */
export function safeExternalUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href
    }
  } catch {
    return undefined
  }
  return undefined
}
