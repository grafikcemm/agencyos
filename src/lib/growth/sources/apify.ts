// ─────────────────────────────────────────────────────────────────────────────
// APIFY kaynak sağlayıcı — default KAPALI, bütçe kapısının arkasında.
//
// Apify tek "para harcayan" kaynaktır, bu yüzden en sert kurallar burada:
//
//   · `start` bayrak kapalıyken AĞA ÇIKMADAN reddeder. Kontrol isteğin en
//     başındadır; "önce dene, hata alırsan dur" bir Actor koşusu başlatabilir.
//   · Birim fiyat env'den ALINMAZ. Actor metadata'sındaki güncel PAY_PER_EVENT
//     fiyatları okunur; okunamazsa tahmin `null` ve koşu fail-closed kalır.
//   · POST isteği sağlayıcı tarafındaki `maxTotalChargeUsd` ve `maxItems`
//     sınırlarını taşır. Yerel bütçe kapısı ile provider tavanı birbirinin
//     alternatifi değil, iki ayrı emniyet katmanıdır.
//   · Ham hata gövdesi DIŞARI ÇIKMAZ. 401 gövdesi token parçası, 429 gövdesi
//     hesap kimliği taşıyabilir; çağıran yalnız kapalı küme kod görür.
//
// `start` ile `fetch` ayrıdır: Apify koşusu asenkrondur. Ağ koparsa aynı
// `providerRunId` ile TEKRAR PARA HARCAMADAN `fetch` edilebilir.
// ─────────────────────────────────────────────────────────────────────────────

import { isApifyEnabled } from '../flags'
import type { GrowthEnv } from '../flags'
import { normalizeLeads } from '../normalize'
import {
  APIFY_PILOT_ACTOR,
  APIFY_PILOT_MAX_SPEND_USD,
  estimateRunCost,
  preflightActorPricing,
  type ActorPricingMetadata,
  type ApifyRunOptions,
  type PricingPreflight,
} from '../apifyPolicy'
import { SourceProviderError } from './types'
import type {
  CostEstimate,
  ProviderHealth,
  RawRecord,
  RunHandle,
  RunState,
  RunStatus,
  SourceProvider,
  SourceQuery,
} from './types'

const APIFY_BASE = 'https://api.apify.com/v2'
const TIMEOUT_MS = 20_000
/** Tek yanıtta kabul edilen azami gövde — bellek/DoS emniyeti. */
const MAX_BYTES = 2_000_000

export interface ApifyDeps {
  env?: GrowthEnv
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

interface ApifyConfig {
  token: string
  actorId: string
}

function readConfig(env: GrowthEnv): ApifyConfig {
  const token = env.APIFY_TOKEN?.trim()
  const actorId = env.APIFY_ACTOR_ID?.trim()
  if (!token || !actorId) {
    throw new SourceProviderError('not_configured', 'apify', 'APIFY_TOKEN / APIFY_ACTOR_ID tanımlı değil.')
  }
  const canonical = actorId.replace('~', '/')
  if (canonical !== APIFY_PILOT_ACTOR.id) {
    throw new SourceProviderError(
      'not_configured',
      'apify',
      `Pilot yalnız ${APIFY_PILOT_ACTOR.id} aktörüyle çalışır.`,
    )
  }
  return { token, actorId: APIFY_PILOT_ACTOR.id }
}

/** URL'de Apify'nin owner~actor kimliği kullanılır; politika slash formunu tutar. */
const actorApiId = (actorId: string): string => actorId.replace('/', '~')

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null

const finiteNonNegative = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/**
 * PAY_PER_EVENT metadata'sındaki düz veya kademeli fiyatı muhafazakâr biçimde
 * çözer. Kademeli modelde en yüksek birim fiyat seçilir; bilinmeyen hesap
 * kademesini ucuz varsaymak bütçe kapısını delmemelidir.
 */
function eventPriceUsd(value: unknown): number | null {
  const event = record(value)
  if (!event) return null
  for (const key of ['eventPriceUsd', 'eventPrice', 'priceUsd', 'unitPriceUsd']) {
    const price = finiteNonNegative(event[key])
    if (price !== null) return price
  }

  const candidates: number[] = []
  const visit = (node: unknown, depth = 0) => {
    if (depth > 4) return
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, depth + 1))
      return
    }
    const obj = record(node)
    if (!obj) return
    for (const [key, nested] of Object.entries(obj)) {
      if (['unitPriceUsd', 'eventPriceUsd', 'priceUsd'].includes(key)) {
        const price = finiteNonNegative(nested)
        if (price !== null) candidates.push(price)
      } else if (/tier|pricing/i.test(key)) {
        visit(nested, depth + 1)
      }
    }
  }
  visit(event)
  return candidates.length ? Math.max(...candidates) : null
}

function canonicalEventKey(key: string, value: unknown): 'place' | 'search_filter' | 'contact_enrichment' | null {
  const event = record(value)
  const haystack = [key, event?.eventTitle, event?.title, event?.name]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')

  if (/contact|enrich|email|phone/.test(haystack)) return 'contact_enrichment'
  if (/filter/.test(haystack)) return 'search_filter'
  if (/place|result|lead/.test(haystack)) return 'place'
  return null
}

interface LoadedPricing {
  metadata: ActorPricingMetadata
  preflight: PricingPreflight
  minimumChargeUsd: number
}

/** Apify Get Actor yanıtını kanonik politika metadata'sına çevirir. */
export function parseActorPricing(body: unknown, fetchedAt = new Date().toISOString()): LoadedPricing {
  const data = record(record(body)?.data) ?? {}
  const infos = Array.isArray(data.pricingInfos) ? data.pricingInfos.map(record).filter(Boolean) : []
  const current = record(data.currentPricingInfo) ?? record(data.pricingInfo) ?? infos.at(-1) ?? null
  const pricingPerEvent = record(current?.pricingPerEvent)
  const chargeEvents = record(pricingPerEvent?.actorChargeEvents) ?? record(current?.actorChargeEvents)
  const perEventUsd: Record<string, number> = {}

  for (const [key, value] of Object.entries(chargeEvents ?? {})) {
    const canonical = canonicalEventKey(key, value)
    const price = eventPriceUsd(value)
    if (!canonical || price === null) continue
    // Aynı kanonik olaya birden fazla sağlayıcı olayı düşerse pahalı olanı seç.
    perEventUsd[canonical] = Math.max(perEventUsd[canonical] ?? 0, price)
  }

  const metadata: ActorPricingMetadata = {
    actorId: APIFY_PILOT_ACTOR.id,
    pricingModel: typeof current?.pricingModel === 'string' ? current.pricingModel : null,
    perEventUsd: Object.keys(perEventUsd).length ? perEventUsd : null,
    fetchedAt,
  }
  const minimumChargeUsd = finiteNonNegative(
    current?.minimalMaxTotalChargeUsd ?? pricingPerEvent?.minimalMaxTotalChargeUsd,
  ) ?? 0
  return { metadata, preflight: preflightActorPricing(metadata), minimumChargeUsd }
}

const runOptions = (query: SourceQuery): ApifyRunOptions => ({
  places: query.limit,
  // Discovery koşusu yalnız şirketleri toplar. Contact enrichment ICP filtresi
  // SONRASINDA ayrı, açık onaylı bir aşamadır.
  contactEnrichmentForWebsitesOnly: true,
  enrichmentCandidates: 0,
  enabledFeatures: [],
})

const queryKey = (query: SourceQuery): string =>
  JSON.stringify([query.niche.trim(), query.location.trim(), query.limit, query.experimentKey ?? null])

function requireEnabled(env: GrowthEnv): void {
  if (!isApifyEnabled(env)) {
    throw new SourceProviderError('disabled', 'apify', 'APIFY_ENABLED kapalı — hiçbir Actor koşusu başlatılmadı.')
  }
}

/** HTTP arızalarını kapalı küme koda çevirir. Ham gövde asla taşınmaz. */
async function call(
  url: string,
  init: RequestInit,
  deps: Required<Pick<ApifyDeps, 'fetchImpl' | 'timeoutMs'>>,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs)
  let res: Response
  try {
    res = await deps.fetchImpl(url, { ...init, signal: controller.signal, redirect: 'manual' })
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    throw new SourceProviderError(
      name === 'AbortError' ? 'timeout' : 'server_error',
      'apify',
      name === 'AbortError' ? `Apify zaman aşımı (${deps.timeoutMs} ms).` : 'Apify bağlantısı kurulamadı.',
    )
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 429) throw new SourceProviderError('rate_limited', 'apify', 'Apify hız sınırı.')
  if (res.status >= 500) throw new SourceProviderError('server_error', 'apify', `Apify sunucu hatası (${res.status}).`)
  if (res.status === 404) throw new SourceProviderError('not_found', 'apify', 'Apify koşusu bulunamadı.')
  if (res.status >= 300) throw new SourceProviderError('bad_response', 'apify', `Apify beklenmeyen durum (${res.status}).`)

  const text = await res.text()
  if (text.length > MAX_BYTES) {
    throw new SourceProviderError('bad_response', 'apify', 'Apify yanıtı boyut sınırını aştı.')
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new SourceProviderError('bad_response', 'apify', 'Apify yanıtı JSON değil.')
  }
}

/** Apify koşu durumu → kanonik durum. Bilinmeyen durum `unknown` kalır. */
export function mapRunState(status: unknown): RunState {
  switch (status) {
    case 'READY':
    case 'RUNNING':
      return 'running'
    case 'SUCCEEDED':
      return 'succeeded'
    case 'FAILED':
    case 'ABORTED':
      return 'failed'
    case 'TIMING-OUT':
    case 'TIMED-OUT':
      return 'timed_out'
    default:
      // Bilinmeyen durumu 'failed' saymak da 'succeeded' saymak da yanlış:
      // ilki gerçek sonucu atar, ikincisi olmayan veriyi var gösterir.
      return 'unknown'
  }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function createApifyProvider(deps: ApifyDeps = {}): SourceProvider {
  const env = deps.env ?? process.env
  const net = {
    fetchImpl: deps.fetchImpl ?? globalThis.fetch,
    timeoutMs: deps.timeoutMs ?? TIMEOUT_MS,
  }
  // estimate → bütçe → start sırasını provider içinde de görünür kılar. Onay
  // tek kullanımlıktır; aynı tahminle iki ücretli koşu açılamaz.
  const approvedEstimates = new Map<string, { maxChargeUsd: number; preflight: PricingPreflight }>()

  async function loadPricing(cfg: ApifyConfig): Promise<LoadedPricing> {
    const body = await call(
      `${APIFY_BASE}/acts/${encodeURIComponent(actorApiId(cfg.actorId))}`,
      { headers: { Authorization: `Bearer ${cfg.token}` } },
      net,
    )
    return parseActorPricing(body)
  }

  return {
    key: 'apify',

    health(overrideEnv: GrowthEnv = env): ProviderHealth {
      const enabled = isApifyEnabled(overrideEnv)
      const actorId = overrideEnv.APIFY_ACTOR_ID?.trim().replace('~', '/')
      const configured = Boolean(
        overrideEnv.APIFY_TOKEN?.trim() && actorId === APIFY_PILOT_ACTOR.id,
      )
      const reason = !enabled
        ? 'APIFY_ENABLED kapalı'
        : !configured
          ? `APIFY_TOKEN eksik veya Actor ${APIFY_PILOT_ACTOR.id} değil`
          : null
      return { key: 'apify', enabled, configured, costed: true, reason }
    },

    /**
     * Maliyet tahmini Actor metadata'sını okur fakat KOŞU BAŞLATMAZ. Metadata
     * okunamazsa veya model kaymışsa null tahmin döner; bütçe kapısı kapanır.
     */
    async estimate(query: SourceQuery): Promise<CostEstimate> {
      const cfg = readConfig(env)
      const pricing = await loadPricing(cfg)
      if (!pricing.preflight.ok) {
        return {
          provider: 'apify',
          estimatedCostUsd: null,
          basis: pricing.preflight.reason ?? 'Apify fiyat preflight geçilemedi',
          requestedCount: query.limit,
        }
      }

      const breakdown = estimateRunCost(runOptions(query), pricing.preflight)
      const maxChargeUsd = Number(Math.max(breakdown.maxUsd, pricing.minimumChargeUsd).toFixed(4))
      if (maxChargeUsd > APIFY_PILOT_MAX_SPEND_USD) {
        return {
          provider: 'apify',
          estimatedCostUsd: null,
          basis: `Provider minimum/tahmini tavan $${maxChargeUsd}, pilot sınırı $${APIFY_PILOT_MAX_SPEND_USD}`,
          requestedCount: query.limit,
        }
      }
      approvedEstimates.set(queryKey(query), { maxChargeUsd, preflight: pricing.preflight })
      return {
        provider: 'apify',
        estimatedCostUsd: maxChargeUsd,
        basis:
          `${query.limit} place · güncel PAY_PER_EVENT · base $${breakdown.basePlaceUsd} + ` +
          `filter $${breakdown.searchFilterUsd}; provider tavanı $${maxChargeUsd}`,
        requestedCount: query.limit,
      }
    },

    async start(query: SourceQuery): Promise<RunHandle> {
      // SIRA ÖNEMLİ: bayrak → yapılandırma → ağ. Ters sırada kapalı bayrakla
      // bile bir istek çıkabilirdi.
      requireEnabled(env)
      const cfg = readConfig(env)
      const approval = approvedEstimates.get(queryKey(query))
      if (!approval) {
        throw new SourceProviderError(
          'budget_exceeded',
          'apify',
          'Apify koşusu yalnız güncel fiyat tahmini ve bütçe kontrolünden sonra başlatılabilir.',
        )
      }
      approvedEstimates.delete(queryKey(query))
      if (!approval.preflight.ok) {
        throw new SourceProviderError('budget_exceeded', 'apify', 'Apify fiyat preflight geçilemedi.')
      }
      const maxTotalChargeUsd = Math.min(approval.maxChargeUsd, APIFY_PILOT_MAX_SPEND_USD)
      const runUrl = new URL(`${APIFY_BASE}/acts/${encodeURIComponent(actorApiId(cfg.actorId))}/runs`)
      runUrl.searchParams.set('maxItems', String(query.limit))
      runUrl.searchParams.set('maxTotalChargeUsd', String(maxTotalChargeUsd))
      const body = await call(
        runUrl.toString(),
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Actor girdisi: yalnız arama parametreleri. PII ya da CRM verisi
            // sağlayıcıya GÖNDERİLMEZ.
            searchStringsArray: [`${query.niche} ${query.location}`.trim()],
            maxCrawledPlacesPerSearch: query.limit,
            scrapeContacts: false,
            maximumLeadsEnrichmentRecords: 0,
            maxReviews: 0,
            maxImages: 0,
            enableCompetitorAnalysis: false,
          }),
        },
        net,
      )
      const data = (body as { data?: Record<string, unknown> })?.data
      const id = typeof data?.id === 'string' ? data.id : null
      if (!id) throw new SourceProviderError('bad_response', 'apify', 'Apify koşu kimliği dönmedi.')
      return {
        provider: 'apify',
        providerRunId: id,
        startedAt: typeof data?.startedAt === 'string' ? data.startedAt : new Date().toISOString(),
      }
    },

    async status(providerRunId: string): Promise<RunStatus> {
      requireEnabled(env)
      const cfg = readConfig(env)
      const body = await call(
        `${APIFY_BASE}/actor-runs/${encodeURIComponent(providerRunId)}`,
        { headers: { Authorization: `Bearer ${cfg.token}` } },
        net,
      )
      const data = (body as { data?: Record<string, unknown> })?.data ?? {}
      const usage = (data.usageTotalUsd ?? (data.usage as Record<string, unknown> | undefined)?.totalUsd) as unknown
      return {
        provider: 'apify',
        providerRunId,
        state: mapRunState(data.status),
        // Sağlayıcı gerçek maliyeti bildirmediyse `null` — tahmin YAZILMAZ.
        actualCostUsd: num(usage),
      }
    },

    async fetch(providerRunId: string): Promise<RawRecord[]> {
      requireEnabled(env)
      const cfg = readConfig(env)
      const body = await call(
        `${APIFY_BASE}/actor-runs/${encodeURIComponent(providerRunId)}/dataset/items?clean=true&limit=1000`,
        { headers: { Authorization: `Bearer ${cfg.token}` } },
        net,
      )
      // Boş veri kümesi bir HATA DEĞİLDİR: "bu nişte sonuç yok" geçerli bir
      // cevaptır ve öyle raporlanmalı. Dizi değilse şema kaymasıdır.
      if (!Array.isArray(body)) {
        throw new SourceProviderError('bad_response', 'apify', 'Apify veri kümesi dizi değil.')
      }
      return body.filter((r): r is RawRecord => Boolean(r) && typeof r === 'object' && !Array.isArray(r))
    },

    normalize: normalizeLeads,
  }
}
