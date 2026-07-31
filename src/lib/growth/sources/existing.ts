// ─────────────────────────────────────────────────────────────────────────────
// MEVCUT KAYNAKLAR — Google Places ve Apollo, SourceProvider sözleşmesinde.
//
// NEDEN BURADALAR: kokpit "hangi kaynak lead başına ne kadara mal oluyor ve ne
// kalitede getiriyor" sorusunu soracak. Apify tek başına ölçülürse kıyas yok;
// zaten sahip olunan iki kaynak da aynı sözleşmede konuşmalı.
//
// NEDEN `scanLeads`/`personLeads.scan` ÇAĞRILMIYOR: onlar birer PIPELINE'dır —
// arar, zenginleştirir, puanlar ve DB'ye upsert eder. Bir SourceProvider ise
// YAN ETKİSİZ olmalı; `fetch` iki kez çağrıldığında ikinci kez satır
// yazılmamalı. Bu yüzden buradaki adapterler yalnız ARAMA adımını yapar; upsert
// çağırana aittir. Mevcut tarama rotaları DEĞİŞMEDİ, hâlâ kendi yollarında
// çalışıyor.
//
// MALİYET: ikisi de kendi kotasından harcar (GOOGLE_MAPS_KEY / APOLLO_API_KEY),
// Apify'ın $29'undan değil. Bu yüzden tahmin 0 USD döner — "bedava" demek değil,
// "bu bütçe havuzunu tüketmez" demek. Bunu `basis` metni açıkça söyler.
// ─────────────────────────────────────────────────────────────────────────────

import { searchPeople } from '../../personLeads/apollo'
import type { GrowthEnv } from '../flags'
import { normalizeLeads } from '../normalize'
import { SourceProviderError } from './types'
import type {
  CostEstimate,
  ProviderHealth,
  RawRecord,
  RunHandle,
  RunStatus,
  SourceProvider,
  SourceQuery,
} from './types'

const PLACES_TEXTSEARCH = 'https://maps.googleapis.com/maps/api/place/textsearch/json'
const TIMEOUT_MS = 15_000

export interface ExistingDeps {
  env?: GrowthEnv
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Apollo araması — testte enjekte edilir, üretimde gerçek istemci. */
  searchPeopleImpl?: typeof searchPeople
}

/** Sorguyu koşu kimliğine çevirir; senkron kaynakta kimlik sorgunun kendisidir. */
const runIdOf = (prefix: string, q: SourceQuery) =>
  `${prefix}:${q.niche}|${q.location}|${q.limit}`.toLowerCase()

/** Koşu kimliğinden sorguyu geri okur — `fetch(runId)` sözleşmesi bunu ister. */
function parseRunId(prefix: string, runId: string): SourceQuery {
  const [head, rest] = [runId.slice(0, prefix.length + 1), runId.slice(prefix.length + 1)]
  if (head !== `${prefix}:`) {
    throw new SourceProviderError('not_found', prefix === 'places' ? 'places' : 'apollo', 'Koşu kimliği bu sağlayıcıya ait değil.')
  }
  const [niche = '', location = '', limitRaw = ''] = rest.split('|')
  const limit = Number(limitRaw)
  return { niche, location, limit: Number.isFinite(limit) && limit > 0 ? limit : 20 }
}

// ─────────────────────────────── Google Places ───────────────────────────────

export function createPlacesProvider(deps: ExistingDeps = {}): SourceProvider {
  const env = deps.env ?? process.env
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS

  async function search(query: SourceQuery): Promise<RawRecord[]> {
    const key = env.GOOGLE_MAPS_KEY?.trim()
    if (!key) throw new SourceProviderError('not_configured', 'places', 'GOOGLE_MAPS_KEY tanımlı değil.')

    const url = `${PLACES_TEXTSEARCH}?query=${encodeURIComponent(`${query.niche} ${query.location}`.trim())}&key=${key}&language=tr&region=tr`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetchImpl(url, { signal: controller.signal, redirect: 'manual' })
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      throw new SourceProviderError(name === 'AbortError' ? 'timeout' : 'server_error', 'places', 'Places çağrısı başarısız.')
    } finally {
      clearTimeout(timer)
    }
    if (res.status === 429) throw new SourceProviderError('rate_limited', 'places', 'Places hız sınırı.')
    if (res.status >= 500) throw new SourceProviderError('server_error', 'places', `Places sunucu hatası (${res.status}).`)
    if (res.status >= 300) throw new SourceProviderError('bad_response', 'places', `Places beklenmeyen durum (${res.status}).`)

    let body: unknown
    try {
      body = await res.json()
    } catch {
      throw new SourceProviderError('bad_response', 'places', 'Places yanıtı JSON değil.')
    }
    const results = (body as { results?: unknown })?.results
    if (!Array.isArray(results)) {
      throw new SourceProviderError('bad_response', 'places', 'Places yanıtında `results` dizisi yok.')
    }
    // Places bir İŞLETME dizinidir: e-posta VERMEZ. Kayıtlar site/ad ile gelir,
    // e-posta ayrı bir zenginleştirme adımının işidir. Bu yüzden buradan çıkan
    // lead'ler çoğunlukla `outreachEligible=false` olur — bu bir arıza değil,
    // kaynağın doğasıdır ve kokpitte öyle görünmelidir.
    return results
      .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object' && !Array.isArray(r))
      .slice(0, query.limit)
      .map((r) => ({
        company: r.name,
        website: r.website,
        city: r.formatted_address,
        placeId: r.place_id,
      }))
  }

  return {
    key: 'places',
    health(overrideEnv: GrowthEnv = env): ProviderHealth {
      const configured = Boolean(overrideEnv.GOOGLE_MAPS_KEY?.trim())
      return {
        key: 'places',
        enabled: configured,
        configured,
        costed: true,
        reason: configured ? null : 'GOOGLE_MAPS_KEY eksik',
      }
    },
    async estimate(query: SourceQuery): Promise<CostEstimate> {
      return {
        provider: 'places',
        estimatedCostUsd: 0,
        basis: 'Google Places kendi kotasından harcar — Apify aylık bütçesini TÜKETMEZ',
        requestedCount: query.limit,
      }
    },
    async start(query: SourceQuery): Promise<RunHandle> {
      return { provider: 'places', providerRunId: runIdOf('places', query), startedAt: new Date().toISOString() }
    },
    async status(providerRunId: string): Promise<RunStatus> {
      // Senkron kaynak: `start` bir koşu yaratmaz, `fetch` anında çalışır.
      return { provider: 'places', providerRunId, state: 'succeeded', actualCostUsd: null }
    },
    // `async` ZORUNLU: `parseRunId` senkron throw eder. Ok fonksiyonu olarak
    // bırakılsaydı hata bir Promise reddi değil, senkron istisna olurdu ve
    // yalnız `.catch()` kullanan çağıranlar onu KAÇIRIRDI.
    async fetch(providerRunId: string): Promise<RawRecord[]> {
      return search(parseRunId('places', providerRunId))
    },
    normalize: normalizeLeads,
  }
}

// ───────────────────────────────── Apollo ────────────────────────────────────

export function createApolloProvider(deps: ExistingDeps = {}): SourceProvider {
  const env = deps.env ?? process.env
  const impl = deps.searchPeopleImpl ?? searchPeople

  return {
    key: 'apollo',
    health(overrideEnv: GrowthEnv = env): ProviderHealth {
      const configured = Boolean(overrideEnv.APOLLO_API_KEY?.trim())
      return {
        key: 'apollo',
        enabled: configured,
        configured,
        costed: true,
        reason: configured ? null : 'APOLLO_API_KEY eksik',
      }
    },
    async estimate(query: SourceQuery): Promise<CostEstimate> {
      return {
        provider: 'apollo',
        estimatedCostUsd: 0,
        basis: 'Apollo kendi kredisinden harcar — Apify aylık bütçesini TÜKETMEZ',
        requestedCount: query.limit,
      }
    },
    async start(query: SourceQuery): Promise<RunHandle> {
      return { provider: 'apollo', providerRunId: runIdOf('apollo', query), startedAt: new Date().toISOString() }
    },
    async status(providerRunId: string): Promise<RunStatus> {
      return { provider: 'apollo', providerRunId, state: 'succeeded', actualCostUsd: null }
    },
    async fetch(providerRunId: string): Promise<RawRecord[]> {
      const query = parseRunId('apollo', providerRunId)
      const result = await impl(
        { person_titles: [query.niche], person_locations: [query.location] },
        { perPage: Math.min(query.limit, 25) },
      )
      // `searchPeople` ASLA throw etmez, hatayı alan olarak döner. Sessizce boş
      // liste dönmek "sonuç yok" ile "çağrı başarısız"ı aynı gösterirdi.
      if (result.error) throw new SourceProviderError('server_error', 'apollo', 'Apollo araması başarısız.')
      return result.people.slice(0, query.limit).map((p) => ({
        full_name: p.full_name,
        title: p.title,
        company_name: p.company_name,
        company_domain: p.company_domain,
        email: p.email,
        linkedin_url: p.linkedin_url,
        city: p.city,
        country: p.country,
        // p.raw ve p.phone KASITLI olarak taşınmıyor: ham payload ve telefon
        // bu hattın dışındadır (normalize.ts kural 2 ve 3).
      }))
    },
    normalize: normalizeLeads,
  }
}
