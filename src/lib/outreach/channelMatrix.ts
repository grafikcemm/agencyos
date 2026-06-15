// Çok-kanallı outreach matrisi + gün-bazlı sekans planı. TR araştırma temelli.
// MANUEL-GÖNDER korunur: plan yalnız taslak + hatırlatma üretir; otomatik gönderim YOK.
// Kanal otomasyonu (LinkedIn/IG) kasıtlı yok — ban + KVKK riski.

export type OutreachChannel = 'email' | 'linkedin' | 'instagram' | 'whatsapp' | 'phone' | 'x'

export type CustomerType = 'ecommerce' | 'local' | 'agency_b2b' | 'founder'

// Müşteri tipi → kanal öncelik sırası (en etkili kanal başta).
export const CHANNEL_PRIORITY: Record<CustomerType, OutreachChannel[]> = {
  ecommerce: ['instagram', 'email', 'whatsapp', 'linkedin'],
  local: ['phone', 'whatsapp', 'instagram', 'email'],
  agency_b2b: ['linkedin', 'email', 'phone', 'whatsapp'],
  founder: ['linkedin', 'x', 'email'],
}

// Kanal başına başlangıç ayarı (referans — operatör uygular). Hacim muhafazakâr.
export const CHANNEL_CONFIG: Record<OutreachChannel, { tone: string; dailyCap: number }> = {
  email: { tone: 'Profesyonel, kısa, somut (70-110 kelime)', dailyCap: 35 },
  linkedin: { tone: 'Satışsız, ilişki açıcı (180-250 karakter)', dailyCap: 18 },
  instagram: { tone: 'Hafif sıcak, gözlem odaklı (180-350 karakter), ilk mesajda link yok', dailyCap: 12 },
  whatsapp: { tone: 'Çok kısa, izin bazlı (1-3 balon)', dailyCap: 8 },
  phone: { tone: 'İzin isteyen 20-30 sn açılış', dailyCap: 12 },
  x: { tone: 'Kısa, niş bağlamlı', dailyCap: 5 },
}

export type SequenceStepKind = 'first_email' | 'social_connect' | 'social_dm' | 'second_email' | 'direct' | 'close_loop'

export interface SequenceStep {
  step: number
  day: number
  kind: SequenceStepKind
  channel: OutreachChannel
  note: string
}

// Araştırma sekansı: Gün1 email → Gün2 sosyal bağlantı → Gün4 sosyal DM →
// Gün7 email → Gün10 telefon/wa → Gün14 close-loop. Kanal müşteri tipine göre seçilir.
const STEP_TEMPLATE: { day: number; kind: SequenceStepKind; note: string }[] = [
  { day: 1, kind: 'first_email', note: 'İlk e-posta — 1 somut gözlem + düşük baskılı CTA' },
  { day: 2, kind: 'social_connect', note: 'Sosyal bağlantı isteği / takip (satışsız)' },
  { day: 4, kind: 'social_dm', note: 'Sosyal DM — gözlem + 2 maddelik dış göz' },
  { day: 7, kind: 'second_email', note: 'İkinci e-posta — farklı açı (mini-audit/lansman)' },
  { day: 10, kind: 'direct', note: 'Doğrudan temas — telefon/WhatsApp izin mesajı' },
  { day: 14, kind: 'close_loop', note: 'Close-loop — izin CTA’sı, sinyal yoksa beklet' },
]

// Adım türü → o müşteri tipinde hangi kanaldan yürür.
function channelForStep(kind: SequenceStepKind, type: CustomerType): OutreachChannel {
  const prio = CHANNEL_PRIORITY[type]
  const socialPref: OutreachChannel = prio.find((c) => c === 'instagram' || c === 'linkedin') ?? 'email'
  const directPref: OutreachChannel = prio.find((c) => c === 'phone' || c === 'whatsapp') ?? 'email'
  switch (kind) {
    case 'first_email':
    case 'second_email':
    case 'close_loop':
      return 'email'
    case 'social_connect':
    case 'social_dm':
      return socialPref
    case 'direct':
      return directPref
  }
}

/** Müşteri tipi için gün-bazlı çok-kanallı sekans planı (taslak + hatırlatma için). */
export function buildMultiChannelPlan(type: CustomerType): SequenceStep[] {
  return STEP_TEMPLATE.map((t, i) => ({
    step: i + 1,
    day: t.day,
    kind: t.kind,
    channel: channelForStep(t.kind, type),
    note: t.note,
  }))
}

// Lead sinyallerinden müşteri tipini çıkarır (sektör + e-ticaret/sosyal ipuçları).
export function inferCustomerType(input: {
  sector?: string | null
  hasEcommerce?: boolean | null
  instagramAsSite?: boolean | null
}): CustomerType {
  const s = (input.sector ?? '').toLowerCase()
  if (input.hasEcommerce || /e-?ticaret|moda|giyim|butik|tekstil|mağaza|kozmetik/.test(s)) return 'ecommerce'
  if (/ajans|yazılım|startup|teknoloji|danışmanlık|b2b/.test(s)) return 'agency_b2b'
  if (/restoran|kafe|cafe|güzellik|kuaför|berber|spor|emlak|oto|veteriner|klinik|lokanta/.test(s)) return 'local'
  return 'local'
}
