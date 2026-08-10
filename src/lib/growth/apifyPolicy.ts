// ─────────────────────────────────────────────────────────────────────────────
// APIFY POLİTİKASI — kontrollü keşif katmanı, gönderim sistemi DEĞİL.
//
// Elde TOPLAM $25 kredi var. Sabit $29 aylık limit KALDIRILDI; tavan buradan
// ve ortamdan yönetilir.
//
//   · aylık operasyon hedefi : $18
//   · sert kesme noktası     : $22   (bu değere ulaşıldığında koşu açılmaz)
//   · dokunulmaz rezerv      : $3
//
// İLK PİLOT: en çok 200 place VE en çok $2 (provider tarafı dahil).
//
// FİYAT VARSAYIMI YAPILMAZ. Apify'nin vitrinindeki "from $1.50/1K" iyimser
// reklam fiyatıdır; ücretsiz/Starter planı ve eklenti olay fiyatları farklı
// olabilir. Bütçe hesabı MUHAFAZAKÂR senaryoyla yapılır ve koşu ancak
// preflight'ta HESABIN GERÇEK GÜNCEL FİYATI okunduktan sonra açılır.
// Fiyat/olay modeli beklenenden farklıysa koşu FAIL-CLOSED durur.
// ─────────────────────────────────────────────────────────────────────────────

/** Elde bulunan toplam kredi. */
export const APIFY_CREDIT_TOTAL_USD = 25
/** Aylık operasyon hedefi — normal çalışma bandı. */
export const APIFY_MONTHLY_OPERATING_TARGET_USD = 18
/** Sert kesme: bu tutara ULAŞILDIĞINDA hiçbir yeni koşu açılmaz. */
export const APIFY_MONTHLY_HARD_STOP_USD = 22
/** Dokunulmaz rezerv — hiçbir koşu buraya el süremez. */
export const APIFY_UNTOUCHABLE_RESERVE_USD = 3

/** İlk pilotun sert sınırları. */
export const APIFY_PILOT_MAX_PLACES = 200
export const APIFY_PILOT_MAX_SPEND_USD = 2

/**
 * Ana pilot aktörü. Gerekçe: Compass tarafından geliştirilmesi, Apify tarafından
 * bakım görmesi, yüksek kullanım/inceleme geçmişi, ülke/alan sorguları ve şirket
 * web sitesinden contact enrichment desteği.
 *
 * Çok daha ucuz görünen ama yeni/az kullanılmış topluluk aktörleri üretim ana
 * hattına ALINMAZ.
 */
export const APIFY_PILOT_ACTOR = Object.freeze({
  id: 'compass/crawler-google-places',
  label: 'Apify Google Maps Scraper (Compass)',
  url: 'https://apify.com/compass/crawler-google-places',
  rationale:
    'Compass geliştirmesi + Apify bakımı + yüksek kullanım geçmişi + ülke/alan sorgusu + ' +
    'şirket web sitesinden public contact enrichment.',
})

/** Beklenen fiyatlandırma modeli. Farklıysa koşu açılmaz. */
export const EXPECTED_PRICING_MODEL = 'PAY_PER_EVENT' as const

/**
 * MUHAFAZAKÂR birim maliyetler (USD / 1.000 birim). Apify'nin resmî yardım
 * sayfasındaki senaryodan alınmıştır; vitrindeki `from $1.50/1K` iyimser reklam
 * fiyatı bütçe hesabına SABİTLENMEZ.
 */
export const CONSERVATIVE_UNIT_COST_PER_1K = Object.freeze({
  basePlace: 5,          // ~$4–5 / 1K temel place
  searchFilter: 1,       // ~$1 / 1K filtre
  contactEnrichment: 2,  // ~$2 / 1K contact enrichment
})

/** Yalnız belgeleme amaçlı — hesapta KULLANILMAZ. */
export const ADVERTISED_UNIT_COST_PER_1K = 1.5

/**
 * Varsayılan KAPALI eklentiler. Her biri ayrı olay ücreti doğurur ve hiçbiri
 * ICP kararını değiştirmez.
 */
export const DEFAULT_OFF_FEATURES = [
  'reviews',
  'images',
  'social_profile_enrichment',
  'ai_competitor_analysis',
  'additional_place_details',
  'person_leads_multiplier',
] as const

export type ApifyFeature = (typeof DEFAULT_OFF_FEATURES)[number]

export interface ApifyRunOptions {
  places: number
  /** Yalnız web sitesi OLAN işletmeler için contact enrichment. */
  contactEnrichmentForWebsitesOnly: boolean
  /** Enrichment uygulanacak aday sayısı (ICP filtresinden GEÇMİŞ olanlar). */
  enrichmentCandidates: number
  enabledFeatures: readonly ApifyFeature[]
}

export const PILOT_RUN_DEFAULTS: ApifyRunOptions = Object.freeze({
  places: APIFY_PILOT_MAX_PLACES,
  contactEnrichmentForWebsitesOnly: true,
  enrichmentCandidates: 0,
  enabledFeatures: [],
})

// ─────────────────────────────────────────────────────────────────────────────
// Fiyat preflight
// ─────────────────────────────────────────────────────────────────────────────

export interface ActorPricingMetadata {
  actorId: string
  pricingModel: string | null
  /** Olay adı → USD birim fiyat. Boş/eksik ise fiyat okunamamış sayılır. */
  perEventUsd: Record<string, number> | null
  fetchedAt: string | null
}

export interface PricingPreflight {
  ok: boolean
  /** Reddin nedeni — insan dilinde. */
  reason: string | null
  /** Hesapta kullanılacak birim maliyetler (USD / 1.000). */
  unitCostPer1k: { basePlace: number; searchFilter: number; contactEnrichment: number }
  /** Gerçek hesap fiyatı okundu mu, yoksa muhafazakâr varsayıma mı düşüldü. */
  source: 'account' | 'none'
}

/**
 * Koşu açılmadan ÖNCE aktörün güncel fiyat metadata'sını değerlendirir.
 *
 * FAIL-CLOSED: metadata yoksa, model beklenenden farklıysa veya birim fiyat
 * muhafazakâr varsayımın ÜSTÜNDEYSE koşu açılmaz. "Fiyatı okuyamadım, tahminle
 * devam edeyim" davranışı YOKTUR.
 */
export function preflightActorPricing(meta: ActorPricingMetadata | null): PricingPreflight {
  const fallback = { ...CONSERVATIVE_UNIT_COST_PER_1K }

  if (!meta) {
    return {
      ok: false,
      reason: 'Aktör fiyat bilgisi okunamadı — koşu açılmadı. Ölçülemeyen fiyat "ucuz" sayılmaz.',
      unitCostPer1k: fallback,
      source: 'none',
    }
  }
  if (meta.actorId !== APIFY_PILOT_ACTOR.id) {
    return {
      ok: false,
      reason: `Beklenen aktör ${APIFY_PILOT_ACTOR.id}, gelen ${meta.actorId} — koşu açılmadı.`,
      unitCostPer1k: fallback,
      source: 'none',
    }
  }
  if (meta.pricingModel !== EXPECTED_PRICING_MODEL) {
    return {
      ok: false,
      reason: `Fiyatlandırma modeli beklenenden farklı (${meta.pricingModel ?? 'bilinmiyor'}) — koşu açılmadı.`,
      unitCostPer1k: fallback,
      source: 'none',
    }
  }
  const events = meta.perEventUsd
  if (!events || Object.keys(events).length === 0) {
    return {
      ok: false,
      reason: 'Olay bazlı fiyat listesi boş — koşu açılmadı.',
      unitCostPer1k: fallback,
      source: 'none',
    }
  }

  // Olay fiyatı tekil birim başınadır; 1.000 birime çevrilir.
  const per1k = (key: string, fb: number): number => {
    const v = events[key]
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v * 1000 : fb
  }
  const unitCostPer1k = {
    basePlace: per1k('place', fallback.basePlace),
    searchFilter: per1k('search_filter', fallback.searchFilter),
    contactEnrichment: per1k('contact_enrichment', fallback.contactEnrichment),
  }

  // Gerçek fiyat muhafazakâr varsayımı AŞIYORSA sessizce kabul edilmez.
  const over = (Object.keys(unitCostPer1k) as (keyof typeof unitCostPer1k)[]).filter(
    (k) => unitCostPer1k[k] > fallback[k] * 2,
  )
  if (over.length > 0) {
    return {
      ok: false,
      reason: `Güncel fiyat muhafazakâr senaryonun iki katını aşıyor (${over.join(', ')}) — koşu açılmadı.`,
      unitCostPer1k,
      source: 'account',
    }
  }

  return { ok: true, reason: null, unitCostPer1k, source: 'account' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Maliyet tahmini ve kapılar
// ─────────────────────────────────────────────────────────────────────────────

export interface CostBreakdown {
  basePlaceUsd: number
  searchFilterUsd: number
  contactEnrichmentUsd: number
  featureSurchargeUsd: number
  /** Tahmini AZAMİ maliyet — beklenen değil, üst sınır. */
  maxUsd: number
}

/** Kapalı olması gereken bir eklenti açıksa maliyet tahmini şişer ve kapı bunu görür. */
const FEATURE_SURCHARGE_PER_1K: Record<ApifyFeature, number> = {
  reviews: 2,
  images: 2,
  social_profile_enrichment: 2,
  ai_competitor_analysis: 5,
  additional_place_details: 2,
  person_leads_multiplier: 4,
}

export function estimateRunCost(opts: ApifyRunOptions, pricing: PricingPreflight): CostBreakdown {
  const u = pricing.unitCostPer1k
  const per = (n: number, per1k: number) => (n / 1000) * per1k

  const basePlaceUsd = per(opts.places, u.basePlace)
  const searchFilterUsd = per(opts.places, u.searchFilter)
  // Enrichment YALNIZ ICP filtresinden geçmiş adaylara uygulanır — ücretli
  // zenginleştirme kendi filtremizden ÖNCE çalışmaz.
  const enrichCount = opts.contactEnrichmentForWebsitesOnly ? opts.enrichmentCandidates : opts.places
  const contactEnrichmentUsd = per(enrichCount, u.contactEnrichment)
  const featureSurchargeUsd = opts.enabledFeatures.reduce(
    (sum, f) => sum + per(opts.places, FEATURE_SURCHARGE_PER_1K[f] ?? 0),
    0,
  )

  const maxUsd = Number((basePlaceUsd + searchFilterUsd + contactEnrichmentUsd + featureSurchargeUsd).toFixed(4))
  return {
    basePlaceUsd: Number(basePlaceUsd.toFixed(4)),
    searchFilterUsd: Number(searchFilterUsd.toFixed(4)),
    contactEnrichmentUsd: Number(contactEnrichmentUsd.toFixed(4)),
    featureSurchargeUsd: Number(featureSurchargeUsd.toFixed(4)),
    maxUsd,
  }
}

export interface RunGateInput {
  opts: ApifyRunOptions
  pricing: PricingPreflight
  /** Bu ay bu sağlayıcıya harcanan gerçek tutar. Okunamadıysa `null`. */
  spentThisMonthUsd: number | null
  /** İlk pilot mu — daha dar sınırlar uygulanır. */
  isPilot: boolean
}

export interface RunGateVerdict {
  allowed: boolean
  reasons: string[]
  estimate: CostBreakdown | null
  hardStopUsd: number
  remainingUsd: number | null
}

/**
 * Koşu kapısı. Kısmi koşu YOKTUR: sınır aşılıyorsa koşu küçültülmez, reddedilir.
 * Bütçe bittiğinde veya sağlayıcı başarısız olduğunda OTOMATİK ÜCRETLİ FALLBACK
 * ÇALIŞMAZ — bu fonksiyon asla alternatif bir ücretli sağlayıcı önermez.
 */
export function evaluateRunGate(input: RunGateInput): RunGateVerdict {
  const reasons: string[] = []
  const hardStopUsd = APIFY_MONTHLY_HARD_STOP_USD

  if (!input.pricing.ok) {
    return {
      allowed: false,
      reasons: [input.pricing.reason ?? 'Fiyat preflight geçilemedi.'],
      estimate: null,
      hardStopUsd,
      remainingUsd: null,
    }
  }

  const enabledButShouldBeOff = input.opts.enabledFeatures.filter((f) =>
    (DEFAULT_OFF_FEATURES as readonly string[]).includes(f),
  )
  if (enabledButShouldBeOff.length > 0) {
    reasons.push(
      `Varsayılan kapalı eklentiler açık: ${enabledButShouldBeOff.join(', ')} — açık onay olmadan koşu başlatılmaz.`,
    )
  }

  if (input.spentThisMonthUsd === null || !Number.isFinite(input.spentThisMonthUsd)) {
    return {
      allowed: false,
      reasons: [...reasons, 'Aylık harcama okunamadı — ölçülemeyen harcama sıfır sayılmaz, koşu açılmadı.'],
      estimate: null,
      hardStopUsd,
      remainingUsd: null,
    }
  }

  const estimate = estimateRunCost(input.opts, input.pricing)
  const remainingUsd = Number((hardStopUsd - input.spentThisMonthUsd).toFixed(4))

  if (input.isPilot) {
    if (input.opts.places > APIFY_PILOT_MAX_PLACES) {
      reasons.push(`Pilot en çok ${APIFY_PILOT_MAX_PLACES} place ile çalışır (istenen ${input.opts.places}).`)
    }
    if (estimate.maxUsd > APIFY_PILOT_MAX_SPEND_USD) {
      reasons.push(
        `Pilot tahmini azami maliyeti $${estimate.maxUsd.toFixed(2)} — pilot tavanı $${APIFY_PILOT_MAX_SPEND_USD}.`,
      )
    }
  }

  if (input.spentThisMonthUsd + estimate.maxUsd > hardStopUsd) {
    reasons.push(
      `Sert kesme aşılırdı ($${(input.spentThisMonthUsd + estimate.maxUsd).toFixed(2)} > $${hardStopUsd}) — ` +
        'koşu küçültülmedi, reddedildi.',
    )
  }

  const projectedRemainingCredit = APIFY_CREDIT_TOTAL_USD - (input.spentThisMonthUsd + estimate.maxUsd)
  if (projectedRemainingCredit < APIFY_UNTOUCHABLE_RESERVE_USD) {
    reasons.push(
      `Dokunulmaz $${APIFY_UNTOUCHABLE_RESERVE_USD} rezervine el atılırdı (kalan $${projectedRemainingCredit.toFixed(2)}).`,
    )
  }

  return { allowed: reasons.length === 0, reasons, estimate, hardStopUsd, remainingUsd }
}

// ─────────────────────────────────────────────────────────────────────────────
// Koşu sonrası ölçüm — ölçek kararı sezgiyle değil bu sayılarla verilir.
// ─────────────────────────────────────────────────────────────────────────────

export interface RunOutcome {
  actualCostUsd: number
  resultCount: number
  relevantAccountCount: number
  publicContactCount: number
  verifiedSendableEmailCount: number
  duplicateCount: number
}

export interface RunMetrics {
  costPerResultUsd: number | null
  costPerRelevantAccountUsd: number | null
  costPerUsableEmailUsd: number | null
  /** Duplicate'lere harcanan pay — "ucuz göründü ama aynı şirketi 3 kez aldık". */
  duplicateCostUsd: number
  relevantAccountYield: number | null
  publicContactYield: number | null
  verifiedSendableRate: number | null
  duplicateRate: number | null
}

const ratio = (a: number, b: number): number | null => (b > 0 ? Number((a / b).toFixed(4)) : null)

export function computeRunMetrics(o: RunOutcome): RunMetrics {
  return {
    costPerResultUsd: ratio(o.actualCostUsd, o.resultCount),
    costPerRelevantAccountUsd: ratio(o.actualCostUsd, o.relevantAccountCount),
    costPerUsableEmailUsd: ratio(o.actualCostUsd, o.verifiedSendableEmailCount),
    duplicateCostUsd:
      o.resultCount > 0 ? Number(((o.actualCostUsd / o.resultCount) * o.duplicateCount).toFixed(4)) : 0,
    relevantAccountYield: ratio(o.relevantAccountCount, o.resultCount),
    publicContactYield: ratio(o.publicContactCount, o.relevantAccountCount),
    verifiedSendableRate: ratio(o.verifiedSendableEmailCount, o.publicContactCount),
    duplicateRate: ratio(o.duplicateCount, o.resultCount),
  }
}

/** Pilot sonrası ölçek eşikleri — tutmazsa kalan kredi HARCANMAZ. */
export const SCALE_THRESHOLDS = Object.freeze({
  minRelevantAccountYield: 0.35,
  minPublicContactYield: 0.3,
  minVerifiedSendableRate: 0.5,
  maxDuplicateRate: 0.25,
  maxCostPerUsableEmailUsd: 0.15,
})

export function shouldScale(m: RunMetrics): { scale: boolean; blockers: string[] } {
  const blockers: string[] = []
  const need = (value: number | null, min: number, label: string) => {
    if (value === null) blockers.push(`${label} ölçülemedi`)
    else if (value < min) blockers.push(`${label} %${(value * 100).toFixed(0)} < %${(min * 100).toFixed(0)}`)
  }
  need(m.relevantAccountYield, SCALE_THRESHOLDS.minRelevantAccountYield, 'İlgili hesap verimi')
  need(m.publicContactYield, SCALE_THRESHOLDS.minPublicContactYield, 'Public iletişim verimi')
  need(m.verifiedSendableRate, SCALE_THRESHOLDS.minVerifiedSendableRate, 'Doğrulanmış gönderilebilir oran')

  if (m.duplicateRate === null) blockers.push('Duplicate oranı ölçülemedi')
  else if (m.duplicateRate > SCALE_THRESHOLDS.maxDuplicateRate) {
    blockers.push(`Duplicate oranı %${(m.duplicateRate * 100).toFixed(0)} > %${SCALE_THRESHOLDS.maxDuplicateRate * 100}`)
  }

  if (m.costPerUsableEmailUsd === null) blockers.push('Kullanılabilir e-posta başına maliyet ölçülemedi')
  else if (m.costPerUsableEmailUsd > SCALE_THRESHOLDS.maxCostPerUsableEmailUsd) {
    blockers.push(`E-posta başına $${m.costPerUsableEmailUsd.toFixed(3)} > $${SCALE_THRESHOLDS.maxCostPerUsableEmailUsd}`)
  }

  return { scale: blockers.length === 0, blockers }
}
