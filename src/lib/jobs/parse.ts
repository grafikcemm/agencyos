// Saf ayrıştırma yardımcıları — 'server-only'/supabase zincirine bağlı OLMAYAN
// modül, böylece vitest (node) altında test edilebilir (planParser.ts ile aynı desen).

// Toleranslı tek-obje JSON ayrıştırma (planParser array versiyonunun obje eşi).
export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as unknown
    return typeof obj === 'object' && obj !== null ? (obj as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// Bilinmeyen değeri en fazla 6 elemanlı, boşları ayıklanmış string dizisine çevirir.
export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v) => v !== null && v !== undefined && v !== '')
    .map((v) => String(v))
    .filter(Boolean)
    .slice(0, 6)
}
