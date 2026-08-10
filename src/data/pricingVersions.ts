// ─────────────────────────────────────────────────────────────────────────────
// VERSİYONLU HİZMET VE FİYAT YAPILANDIRMASI.
//
// FİYAT TABANI VE HİZMET KATALOĞU KULLANICI TARAFINDAN HENÜZ KESİNLEŞTİRİLMEDİ.
// Bu yüzden bu modül fiyat UYDURMAZ ve eski fiyatları kalıcı gerçek gibi
// göstermez. Hiçbir sürüm `approved` değildir; arayüz açıkça "karar bekliyor"
// der ve onaylı sürüm olmadan teklif dışarı ÇIKAMAZ.
//
// Eski/gözlemlenmiş fiyatlar `HISTORICAL_REFERENCE` altında, açıkça
// "referans, teklif değil" etiketiyle tutulur.
// ─────────────────────────────────────────────────────────────────────────────

export type PricingStatus = 'draft' | 'approved' | 'retired'
export type Currency = 'TRY' | 'USD' | 'EUR' | 'GBP'
export type TaxMode = 'kdv_haric' | 'kdv_dahil' | 'vat_excluded' | 'vat_included' | 'belirsiz'

export interface ServicePrice {
  readonly serviceId: string
  readonly label: string
  /** Fiyat KESİN DEĞİL: onaylı sürüm yoksa `null`. */
  readonly amount: number | null
  readonly currency: Currency
  readonly taxMode: TaxMode
  /** Bu fiyatın hangi varsayımlara dayandığı — boş bırakılamaz. */
  readonly assumptions: readonly string[]
}

export interface PricingVersion {
  readonly id: string
  readonly status: PricingStatus
  readonly marketScope: 'tr' | 'global'
  readonly currency: Currency
  readonly taxMode: TaxMode
  /** Altına inilemeyecek taban. Belirlenmediyse `null` → teklif üretilemez. */
  readonly minimumPriceFloor: number | null
  readonly validFrom: string | null
  readonly validUntil: string | null
  readonly approvedBy: string | null
  readonly approvedAt: string | null
  readonly services: readonly ServicePrice[]
  readonly note: string
}

const UNPRICED_ASSUMPTION = [
  'Kapsam, teslim tarihi, revizyon sayısı ve kabul ölçütü netleşmeden fiyat bağlanamaz.',
  'Üçüncü taraf lisans ve medya maliyetleri hariçtir.',
] as const

/**
 * Şu anki durum: HER İKİ PAZAR İÇİN DE onaylı sürüm YOK.
 * Hizmet kimlikleri niş kaydından gelir; TUTARLAR boştur.
 */
export const PRICING_VERSIONS: readonly PricingVersion[] = [
  {
    id: 'tr-v0-draft',
    status: 'draft',
    marketScope: 'tr',
    currency: 'TRY',
    taxMode: 'belirsiz',
    minimumPriceFloor: null,
    validFrom: null,
    validUntil: null,
    approvedBy: null,
    approvedAt: null,
    services: [
      { serviceId: 'launch-creative-diagnostic', label: '7 günlük Launch Creative Diagnostic', amount: null, currency: 'TRY', taxMode: 'belirsiz', assumptions: UNPRICED_ASSUMPTION },
      { serviceId: 'sku-channel-audit', label: '10 günlük SKU & Channel Creative Audit', amount: null, currency: 'TRY', taxMode: 'belirsiz', assumptions: UNPRICED_ASSUMPTION },
      { serviceId: 'seasonal-campaign-diagnostic', label: '5 günlük Seasonal Campaign Diagnostic', amount: null, currency: 'TRY', taxMode: 'belirsiz', assumptions: UNPRICED_ASSUMPTION },
    ],
    note: 'Kullanıcı fiyat tabanını ve KDV yaklaşımını kesinleştirmedi. Teklif üretimi KAPALI.',
  },
  {
    id: 'global-v0-draft',
    status: 'draft',
    marketScope: 'global',
    currency: 'USD',
    taxMode: 'belirsiz',
    minimumPriceFloor: null,
    validFrom: null,
    validUntil: null,
    approvedBy: null,
    approvedAt: null,
    services: [
      { serviceId: 'launch-creative-diagnostic', label: 'Launch Creative Diagnostic (7 days)', amount: null, currency: 'USD', taxMode: 'belirsiz', assumptions: UNPRICED_ASSUMPTION },
      { serviceId: 'sku-channel-audit', label: 'SKU & Channel Creative Audit (10 days)', amount: null, currency: 'USD', taxMode: 'belirsiz', assumptions: UNPRICED_ASSUMPTION },
      { serviceId: 'seasonal-campaign-diagnostic', label: 'Seasonal Campaign Diagnostic (5 days)', amount: null, currency: 'USD', taxMode: 'belirsiz', assumptions: UNPRICED_ASSUMPTION },
    ],
    note: 'Currency, tax/VAT/withholding treatment and price floor not decided. Proposal generation DISABLED.',
  },
] as const

/**
 * Gözlemlenmiş eski fiyatlar. **Teklif değildir, hedef değildir, geçerli
 * değildir.** Yalnız kullanıcı karar verirken referans olsun diye durur.
 */
export const HISTORICAL_REFERENCE = Object.freeze({
  label: 'Referans — geçerli teklif DEĞİL',
  note:
    'Geçmiş işlerden gözlemlenen tutarlar burada tutulmaz; kullanıcı kesinleştirene kadar ' +
    'sistem hiçbir rakamı "Grafikcem fiyatı" olarak sunmaz.',
})

export function approvedVersionFor(marketScope: 'tr' | 'global'): PricingVersion | null {
  return PRICING_VERSIONS.find((v) => v.marketScope === marketScope && v.status === 'approved') ?? null
}

export interface ProposalGate {
  allowed: boolean
  /** Arayüzde gösterilecek insan dilinde neden. */
  reason: string
  versionId: string | null
}

/**
 * Teklif dışarı çıkabilir mi. Onaylı sürüm yoksa arayüz "karar bekliyor" der;
 * boş fiyatlı ya da uydurma tutarlı bir teklif ÜRETİLMEZ.
 */
export function canSendProposal(marketScope: 'tr' | 'global'): ProposalGate {
  const approved = approvedVersionFor(marketScope)
  if (!approved) {
    return {
      allowed: false,
      reason: 'Onaylı fiyat ve hizmet sürümü yok — teklif üretimi karar bekliyor.',
      versionId: null,
    }
  }
  if (approved.minimumPriceFloor === null) {
    return { allowed: false, reason: 'Asgari fiyat tabanı belirlenmedi — teklif üretimi karar bekliyor.', versionId: approved.id }
  }
  const unpriced = approved.services.filter((s) => s.amount === null)
  if (unpriced.length > 0) {
    return {
      allowed: false,
      reason: `Fiyatı belirlenmemiş hizmet var: ${unpriced.map((s) => s.label).join(', ')}.`,
      versionId: approved.id,
    }
  }
  if (approved.validUntil && Date.parse(approved.validUntil) < Date.now()) {
    return { allowed: false, reason: 'Onaylı fiyat sürümünün geçerlilik tarihi geçmiş.', versionId: approved.id }
  }
  return { allowed: true, reason: 'Onaylı fiyat sürümü geçerli.', versionId: approved.id }
}

/** Kullanıcıdan beklenen kararlar — arayüz bunları liste olarak gösterir. */
export const PENDING_PRICING_DECISIONS = [
  'Hizmet kataloğunun nihai listesi',
  'Her hizmet için taban fiyat ve para birimi',
  'KDV / VAT / stopaj yaklaşımı',
  'Asgari fiyat tabanı (altına inilmeyecek tutar)',
  'Fiyat sürümünün geçerlilik tarihi',
  'Global pazarda para birimi ve ödeme yöntemi',
] as const
