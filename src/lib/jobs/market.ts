// İlan pazarı sınıflandırması: Türkiye ('tr') vs Global ('global').
// Şema değişikliği gerektirmeden okuma anında türetilir (saf fonksiyon, test edilebilir).
// - Firecrawl kaynağı TR sorgularından gelir → 'tr'.
// - Lokasyonda İstanbul/Türkiye sinyali varsa → 'tr'.
// - Aksi halde (uluslararası ATS) → 'global'.

export type Market = 'tr' | 'global'

const TR_HINT = /istanbul|i̇stanbul|türkiye|turkiye|turkey/i

export function classifyMarket(source: string, location: string | null | undefined): Market {
  if (source === 'firecrawl') return 'tr'
  if (location && TR_HINT.test(location)) return 'tr'
  return 'global'
}
