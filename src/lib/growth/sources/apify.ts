// ─────────────────────────────────────────────────────────────────────────────
// APIFY kaynak sağlayıcı — default KAPALI, bütçe kapısının arkasında.
//
// Apify tek "para harcayan" kaynaktır, bu yüzden en sert kurallar burada:
//
//   · `start` bayrak kapalıyken AĞA ÇIKMADAN reddeder. Kontrol isteğin en
//     başındadır; "önce dene, hata alırsan dur" bir Actor koşusu başlatabilir.
//   · Birim fiyat env'de TANIMLI DEĞİLSE tahmin `null` döner. Uydurma birim
//     fiyat, bütçe kapısını kandırmanın en kolay yoludur — bu yüzden yok.
//     Tahmin `null` → `assertWithinBudget` `no_estimate` ile reddeder.
//   · Ham hata gövdesi DIŞARI ÇIKMAZ. 401 gövdesi token parçası, 429 gövdesi
//     hesap kimliği taşıyabilir; çağıran yalnız kapalı küme kod görür.
//
// `start` ile `fetch` ayrıdır: Apify koşusu asenkrondur. Ağ koparsa aynı
// `providerRunId` ile TEKRAR PARA HARCAMADAN `fetch` edilebilir.
// ─────────────────────────────────────────────────────────────────────────────

import { isApifyEnabled } from '../flags'
import type { GrowthEnv } from '../flags'
import { normalizeLeads } from '../normalize'
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
  costPer1kUsd: number | null
}

function readConfig(env: GrowthEnv): ApifyConfig {
  const token = env.APIFY_TOKEN?.trim()
  const actorId = env.APIFY_ACTOR_ID?.trim()
  if (!token || !actorId) {
    throw new SourceProviderError('not_configured', 'apify', 'APIFY_TOKEN / APIFY_ACTOR_ID tanımlı değil.')
  }
  const rawPrice = env.APIFY_COST_PER_1K_USD?.trim()
  const parsed = rawPrice ? Number(rawPrice) : NaN
  return {
    token,
    actorId,
    // Geçersiz/eksik fiyat SIFIR sayılmaz — `null` olur ve bütçe kapısı kapanır.
    costPer1kUsd: Number.isFinite(parsed) && parsed >= 0 ? parsed : null,
  }
}

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

  return {
    key: 'apify',

    health(overrideEnv: GrowthEnv = env): ProviderHealth {
      const enabled = isApifyEnabled(overrideEnv)
      const configured = Boolean(overrideEnv.APIFY_TOKEN?.trim() && overrideEnv.APIFY_ACTOR_ID?.trim())
      const priced = Boolean(overrideEnv.APIFY_COST_PER_1K_USD?.trim())
      const reason = !enabled
        ? 'APIFY_ENABLED kapalı'
        : !configured
          ? 'APIFY_TOKEN / APIFY_ACTOR_ID eksik'
          : !priced
            ? 'APIFY_COST_PER_1K_USD tanımsız — bütçe kapısı koşuyu reddeder'
            : null
      return { key: 'apify', enabled, configured, costed: true, reason }
    },

    /**
     * Maliyet tahmini — AĞA ÇIKMAZ, yerel çarpımdır.
     *
     * Bayrak kapalıyken de çalışır: kokpit "açarsam ne kadara mal olur"
     * sorusunu para harcamadan sorabilmeli.
     */
    async estimate(query: SourceQuery): Promise<CostEstimate> {
      const cfg = readConfig(env)
      if (cfg.costPer1kUsd === null) {
        return {
          provider: 'apify',
          estimatedCostUsd: null,
          basis: 'APIFY_COST_PER_1K_USD tanımsız — tahmin üretilemez (sıfır sayılmaz)',
          requestedCount: query.limit,
        }
      }
      return {
        provider: 'apify',
        estimatedCostUsd: Number(((query.limit / 1000) * cfg.costPer1kUsd).toFixed(4)),
        basis: `${query.limit} sonuç × 1000 sonuç başına ${cfg.costPer1kUsd} USD`,
        requestedCount: query.limit,
      }
    },

    async start(query: SourceQuery): Promise<RunHandle> {
      // SIRA ÖNEMLİ: bayrak → yapılandırma → ağ. Ters sırada kapalı bayrakla
      // bile bir istek çıkabilirdi.
      requireEnabled(env)
      const cfg = readConfig(env)
      const body = await call(
        `${APIFY_BASE}/acts/${encodeURIComponent(cfg.actorId)}/runs`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Actor girdisi: yalnız arama parametreleri. PII ya da CRM verisi
            // sağlayıcıya GÖNDERİLMEZ.
            searchStringsArray: [`${query.niche} ${query.location}`.trim()],
            maxCrawledPlacesPerSearch: query.limit,
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
