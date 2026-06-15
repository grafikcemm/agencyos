// İkna tetikleyici kütüphanesi — Cialdini ilkeleri + solo "küçük görünme"yi
// avantaja çeviren çerçeve. TR araştırma: önce güven/bağlam, sonra pitch; aşırı
// sales-first ve AI-hissi rahatsız ediyor. Snippet'ler cold email/outreach'e bağlam olur.

export type CialdiniPrinciple =
  | 'reciprocity'
  | 'authority'
  | 'social_proof'
  | 'scarcity'
  | 'consistency'
  | 'liking'

export interface PersuasionTrigger {
  principle: CialdiniPrinciple
  label: string
  /** Mesaja gömülecek örnek cümle (değişkenli). */
  snippet: string
  /** Kullanım kuralı — yanlış kullanımı önler. */
  rule: string
}

export const PERSUASION_TRIGGERS: Record<CialdiniPrinciple, PersuasionTrigger> = {
  reciprocity: {
    principle: 'reciprocity',
    label: 'Karşılıklılık',
    snippet: 'İsterseniz satış görüşmesi yerine önce 3 maddelik mini-audit göndereyim.',
    rule: 'Ücretsiz bitmiş tasarım verme; sadece tanısal değer ver.',
  },
  authority: {
    principle: 'authority',
    label: 'Otorite',
    snippet: 'Benzer {sektör} işlerinde en sık gördüğüm problem {problem}; çözümü genelde {çözüm}.',
    rule: 'Genel portföy yerine sektöre yakın 1-2 somut kanıt göster.',
  },
  social_proof: {
    principle: 'social_proof',
    label: 'Sosyal kanıt',
    snippet: 'Benzer ölçekteki markalarda en iyi çalışan şey, içerik sayısını artırmak değil kreatif standardı sabitlemek oldu.',
    rule: 'Aynı sektör veya benzer ölçek referansına öncelik ver.',
  },
  scarcity: {
    principle: 'scarcity',
    label: 'Kıtlık',
    snippet: 'Aynı anda az sayıda markayla ilerlediğim için işler hızlı yürüyor; bu ay açılabilecek bir slotum var.',
    rule: 'Sahte kıtlık kullanma; gerçek kapasite verisiyle bağla.',
  },
  consistency: {
    principle: 'consistency',
    label: 'Tutarlılık',
    snippet: 'Uygunsa önce sadece 2 öneri paylaşayım; işe yararsa devamını konuşuruz.',
    rule: 'İlk CTA daima düşük baskılı olsun (mikro-commitment).',
  },
  liking: {
    principle: 'liking',
    label: 'Beğeni / yakınlık',
    snippet: '{son_post/kampanya} detayını görünce yazmak istedim; özellikle {somut_detay} dikkat çekti.',
    rule: 'Şablon açılış yasak; ilk cümle gerçek bir gözlem içersin.',
  },
}

// Solo freelancer'ın "küçük görünme" dezavantajını çevirten çerçeve.
export const SOLO_REFRAME_LINES: string[] = [
  'Tek farkım daha ucuz olmam değil; daha az koordinasyonla daha hızlı kreatif akışı kurmam.',
  'Ajans kadar katmanlı değilim; bu yüzden onay ve revizyon döngüsü daha kısa ilerliyor.',
  'AI’ı hız için kullanıyorum, çıktıyı insan editörlüğüyle teslim ediyorum.',
]

/**
 * Lead sinyallerine göre cold email'e bağlam olacak ikna açılarını seçer.
 * Karşılıklılık + tutarlılık daima (düşük baskı); sosyal kanıt/otorite sektör kanıtı varsa.
 */
export function selectPersuasionTriggers(input: {
  hasSectorProof?: boolean
  limitedCapacity?: boolean
}): PersuasionTrigger[] {
  const picks: CialdiniPrinciple[] = ['reciprocity', 'consistency', 'liking']
  if (input.hasSectorProof) picks.push('social_proof', 'authority')
  if (input.limitedCapacity) picks.push('scarcity')
  return picks.map((p) => PERSUASION_TRIGGERS[p])
}
