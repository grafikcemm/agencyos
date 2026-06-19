// ─────────────────────────────────────────────────────────────────────────────
// Durum-eşleşmeli teknik retrieval — Cem'in mesajına göre en uygun terapötik
// teknik kart(lar)ını seçer ve mentor prompt'una enjekte edilecek blok üretir.
//
// Deterministik keyword skorlama (LLM/embedding/dış servis YOK) → hızlı, ucuz,
// Vercel'de güvenli, çapraz-dil sorunu yok (kartlar Türkçe, mesaj Türkçe).
// Eşleşme yoksa boş döner → mentor Faz 1 gibi çalışır (additive, bozmaz).
// ─────────────────────────────────────────────────────────────────────────────
import { THERAPEUTIC_TECHNIQUES, type TechniqueCard } from '@/data/therapeuticTechniques'

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ş/g, 's')
    .replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .trim()
}

interface ScoredCard {
  card: TechniqueCard
  score: number
}

/** Mesaja en uygun teknik kartlarını skorla (trigger isabet sayısı). */
export function scoreTechniques(text: string): ScoredCard[] {
  const norm = normalize(text ?? '')
  if (!norm) return []
  return THERAPEUTIC_TECHNIQUES
    .map((card) => {
      const score = card.triggers.reduce((n, t) => (norm.includes(t) ? n + 1 : n), 0)
      return { card, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
}

/** En uygun max kadar tekniği seçer (eşleşme yoksa boş). */
export function selectTechniques(text: string, max = 2): TechniqueCard[] {
  return scoreTechniques(text).slice(0, max).map((s) => s.card)
}

/**
 * Seçilen teknikleri mentor system prompt'una eklenecek bloğa çevirir.
 * Eşleşme yoksa boş string → çağıran taraf eklemez.
 */
export function buildTechniqueBlock(text: string, max = 2): string {
  const cards = selectTechniques(text, max)
  if (cards.length === 0) return ''
  const lines = [
    '=== BU MESAJ İÇİN ÖNERİLEN TEKNİK (uygula, adını/etiketini Cem\'e söyleme) ===',
  ]
  for (const c of cards) {
    lines.push(`• ${c.title}: ${c.guidance}`)
  }
  return lines.join('\n')
}
