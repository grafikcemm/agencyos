// Araştırma JSON'undaki lead kaydını `leads` tablosu şekline çevirir.
//
// TASARIMIN TEK KURALI: ARAŞTIRMA VERİSİ OPERASYONEL VERİYİ EZMEZ.
//
// Bu importer, çoğu zaman ZATEN VAR OLAN bir satıra dokunur. O satırda Cem'in
// aradığı, konuştuğu, teklif verdiği, opt-out aldığı bir geçmiş olabilir.
// Araştırma dosyası 9 Ağustos'ta donmuş bir fotoğraftır; canlı operasyonel
// durumdan DAİMA daha eskidir. Bu yüzden birleştirme tek yönlüdür:
//   • boş araştırma alanı → doldurulur
//   • dolu araştırma alanı → dokunulmaz
//   • operasyonel/uyum/skor alanı → HİÇBİR KOŞULDA yazılmaz
//
// `PROTECTED_FIELDS` bu sözleşmenin makine tarafından okunabilir hâlidir ve
// `buildPatch()` çıktısı testte bu listeye karşı doğrulanır.

import { normalizeDomain } from '../leads/domain'
import { resolveOfferId, EVIDENCE_MAX_AGE_DAYS } from '../../data/niches'
import { breakdownMatchesScore, type ResearchBreakdown } from './scoreReasons'

export const SOURCE_BATCH = 'research-2026-08-09'
export const RESEARCH_DATE = '2026-08-09'

/** Araştırma JSON'undaki bir lead kaydı — dosyadaki alan adlarıyla birebir. */
export interface RawResearchLead {
  company: string
  domain: string
  website: string
  country: string
  city: string
  niche_id: string
  employee_band: string
  ecommerce_status: string
  active_social_channels: string[]
  advertising_activity: string
  evidence_urls: string[]
  trigger_date: string
  recent_trigger: string
  observed_pain: string
  pain_evidence_url: string
  matched_offer: string
  matched_case_study: string
  decision_maker_role: string
  decision_maker_linkedin: string
  public_contact_url: string
  outreach_angle: string
  lead_score: number
  lead_score_breakdown: ResearchBreakdown
  confidence: string
}

/**
 * MEVCUT bir satırda araştırma tarafından ASLA yazılmayacak alanlar.
 *
 * Üç gruptan oluşur:
 *   1. Operasyonel durum — Cem'in eylemlerinin sonucu
 *   2. Uyum — yasal dayanak ve opt-out; eski veriyle ezilirse hukuki risk
 *   3. Skor motoru — `score_reasons` farklı bir tip taşır, `potential_score`
 *      canlı sinyallerden hesaplanır
 */
export const PROTECTED_FIELDS: readonly string[] = [
  // 1. operasyonel durum
  'status',
  'owner',
  'notes',
  'priority',
  'route',
  'archived_at',
  'stage_entered_at',
  'next_follow_up_at',
  'last_contact_at',
  'contacted_at',
  'replied_at',
  'meeting_at',
  'proposal_at',
  'converted_at',
  'lost_at',
  'contact_status',
  'outreach_status',
  'reply_status',
  'meeting_status',
  'paid_entry_status',
  'next_action',
  // 2. uyum
  'lawful_basis',
  'suppression_status',
  'consent_note',
  // 3. skor motoru
  'potential_score',
  'base_score',
  'score_reasons',
  'risk_score',
  'risk_reasons',
  'confidence',
  'quality_score',
  'lead_tier',
  'recommended_offer_id',
  'recommended_offer_name',
]

/**
 * Serbest metin tetikleyici tarihini `date`'e çevirir.
 *
 * Araştırmadaki gerçek değerler: "2026", "2025-2026", "2026-02", "2026-Q1",
 * "2025-09", "Belirsiz", "2026-07-23".
 *
 * YALNIZ tam ISO tarih (YYYY-MM-DD) ayrıştırılır. "2026-02" için ayın birini
 * uydurmak, olmayan bir kesinlik üretir — o veriyle "son 90 gün" filtresi
 * çalıştırmak yanlış lead önceliklendirir. Ayrıştırılamayan değer `null` döner
 * ve ham hâli `trigger_date_raw`'da saklanır.
 */
export function parseTriggerDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  const d = new Date(`${trimmed}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  // Takvimsel olarak var olmayan tarih (2026-02-31) round-trip'te kayar.
  if (d.toISOString().slice(0, 10) !== trimmed) return null
  return trimmed
}

/** Boş string ve yalnız-boşluk `null`'a indirgenir — "" bir değer değildir. */
function nullifyEmpty(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

const COUNTRY_CODES: Readonly<Record<string, string>> = Object.freeze({
  Türkiye: 'TR',
  'Amerika Birleşik Devletleri': 'US',
  'Birleşik Krallık': 'GB',
  Almanya: 'DE',
  Hollanda: 'NL',
  İrlanda: 'IE',
  'Birleşik Arap Emirlikleri': 'AE',
})

/** Araştırma dosyasındaki kapalı ülke kümesini ISO-3166-1 alpha-2'ye çevirir. */
export function researchCountryCode(country: string): string | null {
  return COUNTRY_CODES[country.trim()] ?? null
}

export interface MappedLead {
  /** Eşleştirme anahtarı. GENERATED sütuna yazılmaz, yalnız arama için. */
  matchKey: string
  /** `leads` sütun adı → değer. Yalnız araştırma alanları. */
  fields: Record<string, unknown>
  /** Bu kaydın kanıtı 14 günden eskiyse satış eylemi kilitlenir. */
  needsReverification: boolean
  warnings: string[]
}

/**
 * Tek bir araştırma kaydını `leads` alanlarına çevirir.
 *
 * @param raw    araştırma JSON kaydı
 * @param nowIso "şimdi" — deterministik test için dışarıdan verilir
 */
export function mapResearchLead(raw: RawResearchLead, nowIso: string): MappedLead {
  const warnings: string[] = []

  const matchKey = normalizeDomain(raw.domain) ?? normalizeDomain(raw.website) ?? ''
  if (matchKey === '') {
    warnings.push(`${raw.company}: alan adı kanonikleştirilemedi — eşleştirilemez`)
  }

  // Skor: kırılım toplamı bildirilen skoru tutmuyorsa skor YAZILMAZ.
  // Açıklanamayan puan, kaynaksız puandır.
  const scoreTrustworthy = breakdownMatchesScore(raw.lead_score_breakdown, raw.lead_score)
  if (!scoreTrustworthy) {
    warnings.push(
      `${raw.company}: skor kırılımı toplamı (${raw.lead_score}) ile uyuşmuyor — skor yazılmadı`,
    )
  }

  const verifiedAt = `${RESEARCH_DATE}T00:00:00.000Z`
  const ageDays = Math.floor(
    (Date.parse(nowIso) - Date.parse(verifiedAt)) / (1000 * 60 * 60 * 24),
  )
  const needsReverification = ageDays > EVIDENCE_MAX_AGE_DAYS

  const offerLabel = nullifyEmpty(raw.matched_offer)
  const offerId = resolveOfferId(raw.niche_id, offerLabel)
  const countryCode = researchCountryCode(raw.country)
  if (!countryCode) warnings.push(`${raw.company}: ülke ISO koduna çevrilemedi — seed durdurulmalı`)
  const marketScope = countryCode === 'TR' ? 'tr' : 'global'

  const fields: Record<string, unknown> = {
    business_name: nullifyEmpty(raw.company),
    domain: matchKey || null,
    website: nullifyEmpty(raw.website),
    country: nullifyEmpty(raw.country),
    city: nullifyEmpty(raw.city),
    market_scope: marketScope,
    country_code: countryCode,
    lead_language: marketScope === 'tr' ? 'tr' : 'en',
    lead_currency: marketScope === 'tr' ? 'TRY' : 'USD',
    lead_timezone: marketScope === 'tr' ? 'Europe/Istanbul' : 'UTC',
    source_provider: 'research_seed',
    acquired_at: nowIso,

    niche_id: nullifyEmpty(raw.niche_id),
    employee_band: nullifyEmpty(raw.employee_band),
    ecommerce_status: nullifyEmpty(raw.ecommerce_status),
    advertising_activity: nullifyEmpty(raw.advertising_activity),
    active_social_channels: raw.active_social_channels?.length ? raw.active_social_channels : null,

    trigger_label: nullifyEmpty(raw.recent_trigger),
    trigger_date: parseTriggerDate(raw.trigger_date),
    trigger_date_raw: nullifyEmpty(raw.trigger_date),
    evidence_urls: raw.evidence_urls?.length ? raw.evidence_urls : null,
    verified_at: verifiedAt,
    research_confidence: nullifyEmpty(raw.confidence),

    research_score: scoreTrustworthy ? raw.lead_score : null,
    research_score_breakdown: scoreTrustworthy ? raw.lead_score_breakdown : null,

    case_match: nullifyEmpty(raw.matched_case_study),
    offer_match_label: offerLabel,
    offer_match_id: offerId,

    pain_point: nullifyEmpty(raw.observed_pain),
    decision_maker: nullifyEmpty(raw.decision_maker_role),
    sales_angle: nullifyEmpty(raw.outreach_angle),

    // 14 günden eskiyse bugün yeniden doğrulanmalı; değilse tarih uydurulmaz.
    next_check_date: needsReverification ? nowIso.slice(0, 10) : null,

    source_batch: SOURCE_BATCH,
    seeded_at: nowIso,
    provenance: {
      source: 'research_seed',
      research_date: RESEARCH_DATE,
      verified_at: verifiedAt,
      confidence: nullifyEmpty(raw.confidence),
      evidence_urls: raw.evidence_urls ?? [],
      pain_evidence_url: nullifyEmpty(raw.pain_evidence_url),
      public_contact_url: nullifyEmpty(raw.public_contact_url),
      decision_maker_linkedin: nullifyEmpty(raw.decision_maker_linkedin),
      research: { breakdown: raw.lead_score_breakdown ?? null, score: raw.lead_score ?? null },
      cost: { paid_lookups: 0 },
    },
  }

  // Sağlık kontrolü: koruma listesindeki hiçbir alan patch'e sızmamalı.
  for (const key of Object.keys(fields)) {
    if (PROTECTED_FIELDS.includes(key)) {
      throw new Error(
        `seedMapper sözleşme ihlali: korumalı alan "${key}" araştırma patch'ine girdi`,
      )
    }
  }

  return { matchKey, fields, needsReverification, warnings }
}

/**
 * YENİ satır için: araştırma alanlarına ek olarak, yalnız yeni kayıtta
 * anlamlı olan başlangıç durumlarını da verir.
 *
 * `contact_status` burada verilir çünkü YENİ satırda ezilecek bir geçmiş yok.
 * MEVCUT satırda aynı alan korumalıdır — bkz. PROTECTED_FIELDS.
 */
export function insertRow(mapped: MappedLead): Record<string, unknown> {
  return {
    ...mapped.fields,
    status: 'new',
    contact_status: mapped.fields.provenance &&
      (mapped.fields.provenance as { decision_maker_linkedin?: string | null })
        .decision_maker_linkedin
      ? 'enriched'
      : 'unenriched',
    suppression_status: 'unknown',
    lawful_basis: null, // Cem'in yasal dayanak kararı; sistem varsayamaz.
    has_website: Boolean(mapped.fields.website),
  }
}

export interface MergeResult {
  /** Gerçekten UPDATE edilecek alanlar. Boşsa satıra dokunulmaz. */
  patch: Record<string, unknown>
  /** Dolu olduğu için korunan araştırma alanları. */
  keptExisting: string[]
  /** Koruma listesi nedeniyle hiç denenmeyen alanlar. */
  protectedSkipped: string[]
}

/** Bir alanın "boş" sayılıp doldurulabileceğini belirler. */
function isEmpty(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * MEVCUT satır için birleştirme. Yalnız boş araştırma alanlarını doldurur.
 *
 * `source_batch`, `seeded_at` ve `provenance` de aynı kurala tabidir: satır
 * başka bir kaynaktan geldiyse provenance'ı araştırmayla EZİLMEZ — o satırın
 * gerçek kökeni kaybolurdu.
 */
export function mergeIntoExisting(
  existing: Record<string, unknown>,
  mapped: MappedLead,
): MergeResult {
  const patch: Record<string, unknown> = {}
  const keptExisting: string[] = []
  const protectedSkipped: string[] = []

  for (const [key, value] of Object.entries(mapped.fields)) {
    if (PROTECTED_FIELDS.includes(key)) {
      protectedSkipped.push(key)
      continue
    }
    if (isEmpty(value)) continue
    if (!isEmpty(existing[key])) {
      keptExisting.push(key)
      continue
    }
    patch[key] = value
  }

  return { patch, keptExisting, protectedSkipped }
}
