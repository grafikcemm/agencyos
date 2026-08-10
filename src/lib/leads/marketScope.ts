// ─────────────────────────────────────────────────────────────────────────────
// LEAD RADAR — İKİ ÇALIŞMA ALANI, TEK MOTOR.
//
// "Türkiye" ve "Global" iki ayrı ürün DEĞİLDİR. Aynı veri ve karar motorunun
// iki çalışma alanıdır: ayrı sorgu presetleri, kota/bütçe, coğrafya görünümü,
// mesaj dili, para birimi, saat dilimi ve uygunluk politikası taşırlar; fakat
// aynı `leads` tablosunu, aynı lifecycle'ı ve aynı gönderim kapısını kullanırlar.
//
// Kopyalanan bir CRM veya ikinci lead veritabanı OLUŞTURULMAZ.
// ─────────────────────────────────────────────────────────────────────────────

import { NICHES, type Niche } from '@/data/niches'
import { SEND_ALLOWLIST_COUNTRIES, policyFor } from '@/lib/compliance/countryPolicy'

export type MarketScope = 'tr' | 'global'

export const MARKET_SCOPES: readonly MarketScope[] = ['tr', 'global'] as const

export interface QueryPreset {
  readonly id: string
  readonly label: string
  readonly nicheId: string
  /** Provider'a gidecek serbest metin sorgusu. */
  readonly query: string
  /** Aranacak ülkeler — provider'a `country` parametresi olarak gider. */
  readonly countries: readonly string[]
  /** Sorgu dili — sabit `tr` YOKTUR. */
  readonly language: string
}

export interface MarketWorkspace {
  readonly scope: MarketScope
  readonly label: string
  /** Bu alanda çalışılabilecek ülkeler. Gönderim izni AYRI bir karardır. */
  readonly countries: readonly string[]
  readonly language: 'tr' | 'en'
  readonly currency: 'TRY' | 'USD'
  readonly timezone: string
  /** Coğrafya görünümü: TR il/ilçe haritası, Global dünya/ülke görünümü. */
  readonly geoView: 'province' | 'world'
  /** Aylık yeni doğrulanmış prospect hedefi (hipotez — bkz. outboundCapacity). */
  readonly monthlyProspectTarget: number
  /** Aylık ücretli keşif bütçesi payı (USD). */
  readonly monthlyDiscoveryBudgetUsd: number
  readonly note: string
}

/**
 * Aylık 1.400–1.600 yeni prospect hedefinin pazarlar arası dağılımı.
 * HİPOTEZDİR: TR'de erişim ucuz ama gönderim kapısı (İYS/tacir doğrulaması) dar;
 * Global'de erişim pahalı ama CAN-SPAM kapısı daha öngörülebilir.
 */
export const MARKET_WORKSPACES: Readonly<Record<MarketScope, MarketWorkspace>> = Object.freeze({
  tr: {
    scope: 'tr',
    label: 'Lead Radar — Türkiye',
    countries: ['TR'],
    language: 'tr',
    currency: 'TRY',
    timezone: 'Europe/Istanbul',
    geoView: 'province',
    monthlyProspectTarget: 900,
    monthlyDiscoveryBudgetUsd: 10,
    note: 'İl/ilçe + sektör keşfi. Gönderim yalnız tacir/esnaf statüsü ve İYS kapısı geçilirse.',
  },
  global: {
    scope: 'global',
    label: 'Lead Radar — Global',
    // Başlangıç kapsamı gönderim allowlist'iyle hizalı. Yeni ülke eklemek,
    // önce ülke politikası yazmayı gerektirir (countryPolicy.ts).
    countries: ['US', 'GB'],
    language: 'en',
    currency: 'USD',
    timezone: 'UTC',
    geoView: 'world',
    monthlyProspectTarget: 600,
    monthlyDiscoveryBudgetUsd: 8,
    note: 'Ülke/sektör/şirket-boyutu keşfi. Harita karar bilgisini gizlemez; liste birincil yüzeydir.',
  },
})

export function workspaceFor(scope: MarketScope): MarketWorkspace {
  return MARKET_WORKSPACES[scope]
}

/** Ülke kodundan çalışma alanı — bilinmeyen ülke Global'e düşer, TR'ye DEĞİL. */
export function scopeForCountry(countryCode: string | null | undefined): MarketScope {
  return String(countryCode ?? '').trim().toUpperCase() === 'TR' ? 'tr' : 'global'
}

/**
 * Niş × pazar sorgu presetleri. `language=tr` ve `region=tr` SABİT DEĞİLDİR —
 * her preset kendi ülkesini ve dilini taşır.
 */
export function presetsFor(scope: MarketScope): readonly QueryPreset[] {
  const ws = workspaceFor(scope)
  const out: QueryPreset[] = []
  for (const niche of NICHES) {
    const queries = scope === 'tr' ? trQueries(niche) : globalQueries(niche)
    queries.forEach((query, i) => {
      out.push({
        id: `${scope}:${niche.id}:${i}`,
        label: `${niche.name} — ${scope === 'tr' ? 'Türkiye' : 'Global'}`,
        nicheId: niche.id,
        query,
        countries: ws.countries,
        language: ws.language,
      })
    })
  }
  return out
}

function trQueries(niche: Niche): string[] {
  // TR presetleri KORUNUR: il bazlı keşif Google Places'te en yüksek verimi verir.
  return niche.icp.priorityCities.slice(0, 4).map((city) => `${niche.icp.mustHave[0] ?? niche.name} ${city}`)
}

function globalQueries(niche: Niche): string[] {
  return niche.searchQueries.web.slice(0, 2)
}

/** Pazar payları toplamı — sessizce kayan hedef olmasın diye test edilir. */
export const TOTAL_PROSPECT_TARGET =
  MARKET_WORKSPACES.tr.monthlyProspectTarget + MARKET_WORKSPACES.global.monthlyProspectTarget

/**
 * Bir çalışma alanının ülkelerinden kaçı gönderime açık — arayüz bunu
 * "3 ülkeden 2'si gönderime açık" gibi gösterir, ham liste değil.
 */
export function sendableCountryCount(scope: MarketScope): { open: number; total: number } {
  const ws = workspaceFor(scope)
  const open = ws.countries.filter(
    (c) => policyFor(c).ceiling === 'allowed' && (SEND_ALLOWLIST_COUNTRIES as readonly string[]).includes(c),
  ).length
  return { open, total: ws.countries.length }
}
