import { describe, it, expect, vi } from 'vitest'
import {
  APIFY_MONTHLY_BUDGET_USD,
  BudgetExceededError,
  MAX_LEADS_PER_RUN,
  assertWithinBudget,
  clampLimit,
  describeBudget,
  istanbulMonthKey,
} from './budget'
import type { SpendReader } from './budget'
import { APIFY_MONTHLY_HARD_STOP_USD } from './apifyPolicy'
import { describeGrowthFlags, isApifyEnabled, isInstantlyEnabled } from './flags'
import {
  collectLeads,
  createApifyProvider,
  createApolloProvider,
  createFakeProvider,
  createPlacesProvider,
  getSourceProvider,
  listProviderHealth,
  mapRunState,
  parseActorPricing,
  startSourceRun,
  SourceProviderError,
} from './sources'
import type { CostEstimate, SourceQuery } from './sources'

// RT-A4 — SourceProvider katmanı.
//
// GERÇEK AĞ ÇAĞRISI YOK: her sağlayıcıya `fetchImpl` enjekte edilir. Bir test
// yanlışlıkla dışarı çıkarsa `globalThis.fetch` çağrılırdı; aşağıdaki
// "kapalıyken ağa çıkmaz" testi tam olarak bunu yakalamak için var.

const QUERY: SourceQuery = { niche: 'mimarlık ofisi', location: 'İstanbul', limit: 10 }

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const APIFY_PRICING_BODY = {
  data: {
    currentPricingInfo: {
      pricingModel: 'PAY_PER_EVENT',
      minimalMaxTotalChargeUsd: 0.05,
      pricingPerEvent: {
        actorChargeEvents: {
          'place-scraped': { eventTitle: 'Place scraped', eventPriceUsd: 0.005 },
          'filter-applied': { eventTitle: 'Search filter applied', eventPriceUsd: 0.001 },
          'contact-details-scraped': { eventTitle: 'Contact enrichment', eventPriceUsd: 0.002 },
        },
      },
    },
  },
}

/** Sıfır harcamalı okuyucu — bütçe kapısını açık bırakır. */
const spendZero: SpendReader = async (_p, monthKey) => ({ spentUsd: 0, burnedUsd: 0, runCount: 0, monthKey })
/** Ölçülemeyen harcama — kapı KAPANMALI. */
const spendUnknown: SpendReader = async (_p, monthKey) => ({ spentUsd: null, burnedUsd: 0, runCount: 0, monthKey })

// ─────────────────────────────── bayraklar ───────────────────────────────────

describe('growth bayrakları — hepsi default KAPALI', () => {
  it('tanımsız env kapalıdır', () => {
    expect(isApifyEnabled({})).toBe(false)
    expect(isInstantlyEnabled({})).toBe(false)
  })

  it('yalnız tam `true` açar — yazım hatası açmaz', () => {
    for (const v of ['TRUE', 'True', '1', 'yes', 'on', ' true']) {
      expect(isApifyEnabled({ APIFY_ENABLED: v }), v).toBe(false)
    }
    expect(isApifyEnabled({ APIFY_ENABLED: 'true' })).toBe(true)
  })

  it('durum listesi anahtar DEĞERİ sızdırmaz', () => {
    const env = { APIFY_TOKEN: 'apify_api_GIZLI', APIFY_ACTOR_ID: 'actor', INSTANTLY_API_KEY: 'ins_GIZLI' }
    const dump = JSON.stringify(describeGrowthFlags(env))
    expect(dump).not.toContain('GIZLI')
    expect(describeGrowthFlags(env).find((f) => f.key === 'APIFY_ENABLED')).toMatchObject({
      enabled: false,
      configured: true,
      costed: true,
    })
  })

  it('TrustMRR bu trende hep kapalı ve yapılandırılmamış', () => {
    const t = describeGrowthFlags({ TRUSTMRR_ENABLED: 'true' }).find((f) => f.key === 'TRUSTMRR_ENABLED')!
    expect(t.configured).toBe(false)
  })
})

// ──────────────────────────────── bütçe ──────────────────────────────────────

describe('bütçe kapısı — sert kesme $22, aşım yok', () => {
  const est = (usd: number | null): CostEstimate => ({
    provider: 'apify',
    estimatedCostUsd: usd,
    basis: 'test',
    requestedCount: 10,
  })

  it('bütçe içindeyse geçer ve kalanı bildirir', async () => {
    const d = await assertWithinBudget(est(5), async (_p, m) => ({ spentUsd: 10, burnedUsd: 1, runCount: 2, monthKey: m }))
    expect(d).toMatchObject({ allowed: true, spentUsd: 10, estimateUsd: 5, capUsd: APIFY_MONTHLY_HARD_STOP_USD })
    expect(d.remainingAfterUsd).toBe(APIFY_MONTHLY_HARD_STOP_USD - 15)
  })

  it('ÖLÇÜLEMEYEN harcama sıfır sayılmaz — kapı kapanır', async () => {
    await expect(assertWithinBudget(est(1), spendUnknown)).rejects.toThrow(BudgetExceededError)
    await assertWithinBudget(est(1), spendUnknown).catch((e: BudgetExceededError) => {
      expect(e.detail.reason).toBe('unmeasurable')
    })
  })

  it('tahmin yoksa koşu başlamaz (uydurma fiyat yok)', async () => {
    await assertWithinBudget(est(null), spendZero).catch((e: BudgetExceededError) => {
      expect(e.detail.reason).toBe('no_estimate')
    })
    await expect(assertWithinBudget(est(null), spendZero)).rejects.toThrow(BudgetExceededError)
  })

  it('tavanı aşacaksa koşu KÜÇÜLTÜLMEZ, tamamen reddedilir', async () => {
    const nearCap = APIFY_MONTHLY_HARD_STOP_USD - 1
    const spent: SpendReader = async (_p, m) => ({ spentUsd: nearCap, burnedUsd: 0, runCount: 9, monthKey: m })
    await assertWithinBudget(est(2), spent).catch((e: BudgetExceededError) => {
      expect(e.detail.reason).toBe('would_exceed')
      expect(e.detail.spentUsd).toBe(nearCap)
    })
    // Tam tavan geçer, bir kuruş fazlası geçmez.
    await expect(assertWithinBudget(est(1), spent)).resolves.toMatchObject({ remainingAfterUsd: 0 })
    await expect(assertWithinBudget(est(1.01), spent)).rejects.toThrow(BudgetExceededError)
  })

  it('tavan sert kesme noktasıdır ($22) ve koşu başına 100 lead', () => {
    // Sabit $29 KALDIRILDI — tavan apifyPolicy.ts'ten gelir.
    expect(APIFY_MONTHLY_BUDGET_USD).toBe(APIFY_MONTHLY_HARD_STOP_USD)
    expect(APIFY_MONTHLY_HARD_STOP_USD).toBe(22)
    expect(MAX_LEADS_PER_RUN).toBe(100)
  })

  it('limit kırpılır ve kırpıldığını SÖYLER', () => {
    expect(clampLimit(5000)).toEqual({ limit: 100, clamped: true })
    expect(clampLimit(0)).toEqual({ limit: 1, clamped: true })
    expect(clampLimit(-3)).toEqual({ limit: 1, clamped: true })
    expect(clampLimit('yüz')).toEqual({ limit: 1, clamped: true })
    expect(clampLimit(NaN)).toEqual({ limit: 1, clamped: true })
    expect(clampLimit(50)).toEqual({ limit: 50, clamped: false })
  })

  it('okunamayan harcama kokpitte SAĞLIKLI görünmez', () => {
    expect(describeBudget({ spentUsd: null, burnedUsd: 0, runCount: 0, monthKey: '2026-07' }).state).toBe('unmeasurable')
    expect(describeBudget({ spentUsd: APIFY_MONTHLY_HARD_STOP_USD, burnedUsd: 3, runCount: 5, monthKey: '2026-07' }).state).toBe('exhausted')
    expect(describeBudget({ spentUsd: 4, burnedUsd: 1, runCount: 1, monthKey: '2026-07' })).toMatchObject({
      remainingUsd: APIFY_MONTHLY_HARD_STOP_USD - 4,
      burnedUsd: 1,
      state: 'ok',
    })
  })

  it('ay anahtarı Europe/Istanbul takvimine göre', () => {
    // 2026-08-01 00:30 İstanbul = 2026-07-31 21:30Z → ay AĞUSTOS olmalı.
    expect(istanbulMonthKey(new Date('2026-07-31T21:30:00Z'))).toBe('2026-08')
    expect(istanbulMonthKey(new Date('2026-07-31T20:30:00Z'))).toBe('2026-07')
  })
})

// ──────────────────────────────── Apify ──────────────────────────────────────

describe('Apify sağlayıcı — default kapalı', () => {
  const enabledEnv = {
    APIFY_ENABLED: 'true',
    APIFY_TOKEN: 'apify_api_GIZLI',
    APIFY_ACTOR_ID: 'compass/crawler-google-places',
  }

  it('KAPALIYKEN start AĞA ÇIKMADAN reddeder', async () => {
    const fetchImpl = vi.fn()
    const p = createApifyProvider({ env: { APIFY_TOKEN: 't', APIFY_ACTOR_ID: 'a' }, fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(p.start(QUERY)).rejects.toMatchObject({ code: 'disabled' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('kapalıyken status ve fetch de ağa çıkmaz', async () => {
    const fetchImpl = vi.fn()
    const p = createApifyProvider({ env: {}, fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(p.status('r1')).rejects.toMatchObject({ code: 'disabled' })
    await expect(p.fetch('r1')).rejects.toMatchObject({ code: 'disabled' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('açık ama yapılandırılmamışsa not_configured', async () => {
    const p = createApifyProvider({ env: { APIFY_ENABLED: 'true' }, fetchImpl: vi.fn() as unknown as typeof fetch })
    await expect(p.start(QUERY)).rejects.toMatchObject({ code: 'not_configured' })
  })

  it('sağlık: kapalıyken yeşil değil ve NEDENİ yazılı', () => {
    const p = createApifyProvider({ env: {} })
    expect(p.health({})).toMatchObject({ enabled: false, reason: 'APIFY_ENABLED kapalı' })
    expect(p.health({ APIFY_ENABLED: 'true', APIFY_TOKEN: 't', APIFY_ACTOR_ID: 'a' }).reason)
      .toContain('compass/crawler-google-places')
  })

  it('fiyat metadata yoksa tahmin null (sıfır DEĞİL) ve bütçe kapısı kapanır', async () => {
    const p = createApifyProvider({
      env: enabledEnv,
      fetchImpl: (async () => jsonResponse({ data: {} })) as unknown as typeof fetch,
    })
    const e = await p.estimate(QUERY)
    expect(e.estimatedCostUsd).toBeNull()
    await expect(assertWithinBudget(e, spendZero)).rejects.toThrow(BudgetExceededError)
  })

  it('beklenmeyen fiyat modeli null üretir', async () => {
    const bad = { data: { currentPricingInfo: { pricingModel: 'PRICE_PER_DATASET_ITEM', pricingPerEvent: {} } } }
    const p = createApifyProvider({ env: enabledEnv, fetchImpl: (async () => jsonResponse(bad)) as unknown as typeof fetch })
    expect((await p.estimate(QUERY)).estimatedCostUsd).toBeNull()
  })

  it('tahmin güncel Actor metadata fiyatından üretilir ve koşu başlatmaz', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      void url
      void init
      return jsonResponse(APIFY_PRICING_BODY)
    })
    const p = createApifyProvider({ env: enabledEnv, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(await p.estimate({ ...QUERY, limit: 100 })).toMatchObject({ estimatedCostUsd: 0.6 })
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('/acts/compass~crawler-google-places')
    expect(fetchImpl.mock.calls[0]?.[1]?.method).not.toBe('POST')
  })

  it('koşu provider tavanıyla başlar; CRM verisi ve pahalı eklentiler girdiye GİRMEZ', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') return jsonResponse(APIFY_PRICING_BODY)
      expect(url).toContain('maxItems=10')
      expect(url).toContain('maxTotalChargeUsd=0.06')
      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({
        maxCrawledPlacesPerSearch: 10,
        scrapeContacts: false,
        maximumLeadsEnrichmentRecords: 0,
        maxReviews: 0,
        maxImages: 0,
        enableCompetitorAnalysis: false,
      })
      return jsonResponse({ data: { id: 'run-1', startedAt: '2026-07-31T10:00:00Z' } })
    })
    const p = createApifyProvider({ env: enabledEnv, fetchImpl: fetchImpl as unknown as typeof fetch })
    await p.estimate(QUERY)
    await expect(p.start(QUERY)).resolves.toMatchObject({ provider: 'apify', providerRunId: 'run-1' })
    await expect(p.start(QUERY)).rejects.toMatchObject({ code: 'budget_exceeded' })
  })

  it('kademeli fiyatlarda en pahalı birimi seçer', () => {
    const parsed = parseActorPricing({
      data: {
        currentPricingInfo: {
          pricingModel: 'PAY_PER_EVENT',
          pricingPerEvent: {
            actorChargeEvents: {
              place: { eventTieredPricingUsd: [{ unitPriceUsd: 0.001 }, { unitPriceUsd: 0.005 }] },
            },
          },
        },
      },
    })
    expect(parsed.metadata.perEventUsd?.place).toBe(0.005)
  })
})

describe('Apify sağlayıcı — arıza sınıfları', () => {
  const env = { APIFY_ENABLED: 'true', APIFY_TOKEN: 't', APIFY_ACTOR_ID: 'compass/crawler-google-places' }
  const withFetch = (impl: unknown) => createApifyProvider({ env, fetchImpl: impl as typeof fetch, timeoutMs: 20 })

  it('429 → rate_limited', async () => {
    await expect(withFetch(async () => new Response('slow down', { status: 429 })).estimate(QUERY))
      .rejects.toMatchObject({ code: 'rate_limited' })
  })

  it('5xx → server_error', async () => {
    for (const s of [500, 502, 503]) {
      await expect(withFetch(async () => new Response('boom', { status: s })).estimate(QUERY))
        .rejects.toMatchObject({ code: 'server_error' })
    }
  })

  it('404 → not_found', async () => {
    await expect(withFetch(async () => new Response('', { status: 404 })).status('yok'))
      .rejects.toMatchObject({ code: 'not_found' })
  })

  it('yönlendirme izlenmez, bad_response olur', async () => {
    await expect(withFetch(async () => new Response('', { status: 302 })).estimate(QUERY))
      .rejects.toMatchObject({ code: 'bad_response' })
  })

  it('zaman aşımı → timeout', async () => {
    const hanging = (_u: string, init?: RequestInit) =>
      new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('aborted')
          e.name = 'AbortError'
          rej(e)
        })
      })
    await expect(withFetch(hanging).estimate(QUERY)).rejects.toMatchObject({ code: 'timeout' })
  })

  it('JSON olmayan yanıt → bad_response', async () => {
    await expect(withFetch(async () => new Response('<html>502 Bad Gateway</html>', { status: 200 })).estimate(QUERY))
      .rejects.toMatchObject({ code: 'bad_response' })
  })

  it('HAM hata gövdesi mesaja SIZMAZ', async () => {
    const secretBody = 'token apify_api_GIZLI gecersiz'
    try {
      await withFetch(async () => new Response(secretBody, { status: 500 })).estimate(QUERY)
      throw new Error('reddetmeliydi')
    } catch (e) {
      expect(e).toBeInstanceOf(SourceProviderError)
      expect((e as Error).message).not.toContain('GIZLI')
    }
  })

  it('şema kayması: koşu kimliği dönmezse bad_response', async () => {
    const p = withFetch(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? jsonResponse({ data: { identifier: 'run-1' } })
        : jsonResponse(APIFY_PRICING_BODY))
    await p.estimate(QUERY)
    await expect(p.start(QUERY))
      .rejects.toMatchObject({ code: 'bad_response' })
  })

  it('veri kümesi dizi değilse bad_response', async () => {
    await expect(withFetch(async () => jsonResponse({ items: [] })).fetch('run-1'))
      .rejects.toMatchObject({ code: 'bad_response' })
  })

  it('BOŞ veri kümesi hata değildir', async () => {
    await expect(withFetch(async () => jsonResponse([])).fetch('run-1')).resolves.toEqual([])
  })

  it('dizideki nesne olmayan öğeler süzülür', async () => {
    await expect(withFetch(async () => jsonResponse([{ a: 1 }, null, 'x', [1], { b: 2 }])).fetch('run-1'))
      .resolves.toEqual([{ a: 1 }, { b: 2 }])
  })

  it('bilinmeyen koşu durumu succeeded SAYILMAZ', () => {
    expect(mapRunState('SUCCEEDED')).toBe('succeeded')
    expect(mapRunState('RUNNING')).toBe('running')
    expect(mapRunState('ABORTED')).toBe('failed')
    expect(mapRunState('TIMED-OUT')).toBe('timed_out')
    expect(mapRunState('YENI_DURUM')).toBe('unknown')
    expect(mapRunState(undefined)).toBe('unknown')
  })

  it('gerçek maliyet bildirilmediyse null kalır — tahmin yazılmaz', async () => {
    const s = await withFetch(async () => jsonResponse({ data: { status: 'SUCCEEDED' } })).status('run-1')
    expect(s.actualCostUsd).toBeNull()
    const s2 = await withFetch(async () => jsonResponse({ data: { status: 'SUCCEEDED', usageTotalUsd: 0.42 } })).status('run-1')
    expect(s2.actualCostUsd).toBe(0.42)
  })
})

// ───────────────────────── mevcut kaynaklar (Places/Apollo) ──────────────────

describe('Places sağlayıcı', () => {
  const env = { GOOGLE_MAPS_KEY: 'gm_GIZLI' }

  it('anahtar yoksa not_configured, ağa çıkmaz', async () => {
    const fetchImpl = vi.fn()
    const p = createPlacesProvider({ env: {}, fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(p.fetch('places:a|b|10')).rejects.toMatchObject({ code: 'not_configured' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('Apify bütçesini TÜKETMEZ (tahmin 0 + gerekçe yazılı)', async () => {
    const e = await createPlacesProvider({ env }).estimate(QUERY)
    expect(e.estimatedCostUsd).toBe(0)
    expect(e.basis).toContain('TÜKETMEZ')
  })

  it('sonuçlar limite kırpılır ve e-postasız gelir → diziye giremez', async () => {
    const results = Array.from({ length: 5 }, (_v, i) => ({
      name: `Ofis ${i}`,
      website: `https://ofis${i}.com.tr`,
      formatted_address: 'İstanbul',
      place_id: `p${i}`,
    }))
    const p = createPlacesProvider({ env, fetchImpl: (async () => jsonResponse({ results })) as unknown as typeof fetch })
    const raw = await p.fetch('places:mimar|istanbul|3')
    expect(raw).toHaveLength(3)
    // Places e-posta VERMEZ ve kişi adı taşımaz → kimlik kurulamaz. Bu kaynağın
    // doğasıdır; kokpitte "0 kabul" olarak görünmeli, gizlenmemeli.
    const n = p.normalize(raw)
    expect(n.metrics.receivedCount).toBe(3)
    expect(n.metrics.acceptedCount).toBe(0)
    expect(n.rejects.map((r) => r.reason)).toEqual(['no_identity', 'no_identity', 'no_identity'])
  })

  it('429 ve 5xx kapalı küme koda çevrilir', async () => {
    const p429 = createPlacesProvider({ env, fetchImpl: (async () => new Response('', { status: 429 })) as unknown as typeof fetch })
    await expect(p429.fetch('places:a|b|1')).rejects.toMatchObject({ code: 'rate_limited' })
    const p500 = createPlacesProvider({ env, fetchImpl: (async () => new Response('', { status: 503 })) as unknown as typeof fetch })
    await expect(p500.fetch('places:a|b|1')).rejects.toMatchObject({ code: 'server_error' })
  })

  it('results dizisi yoksa bad_response', async () => {
    const p = createPlacesProvider({ env, fetchImpl: (async () => jsonResponse({ status: 'ZERO_RESULTS' })) as unknown as typeof fetch })
    await expect(p.fetch('places:a|b|1')).rejects.toMatchObject({ code: 'bad_response' })
  })

  it('başka sağlayıcının koşu kimliği reddedilir', async () => {
    await expect(createPlacesProvider({ env }).fetch('apollo:a|b|1')).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('Apollo sağlayıcı', () => {
  const env = { APOLLO_API_KEY: 'ap_GIZLI' }

  it('TELEFON ve HAM payload taşınmaz', async () => {
    const searchPeopleImpl = vi.fn(async () => ({
      people: [
        {
          apollo_person_id: 'x1',
          full_name: 'Ayşe Demir',
          title: 'Kurucu',
          seniority: 'owner',
          linkedin_url: 'https://linkedin.com/in/aysedemir',
          email: 'ayse@sirket.com',
          email_status: 'verified',
          phone: '+90 555 111 22 33',
          company_name: 'Sirket',
          company_domain: 'sirket.com',
          company_industry: 'design',
          company_size: '10',
          city: 'İstanbul',
          country: 'TR',
          raw: { gizli_alan: 'HAM-PAYLOAD' },
        },
      ],
      rateLimitRemaining: 100,
    }))
    const p = createApolloProvider({ env, searchPeopleImpl: searchPeopleImpl as never })
    const raw = await p.fetch('apollo:kurucu|istanbul|5')
    const dump = JSON.stringify(raw)
    expect(dump).not.toContain('555')
    expect(dump).not.toContain('HAM-PAYLOAD')
    expect(p.normalize(raw).leads[0]).toMatchObject({ emailKind: 'business', outreachEligible: true })
  })

  it('arama hatası SESSİZ boş liste olmaz', async () => {
    const p = createApolloProvider({
      env,
      searchPeopleImpl: (async () => ({ people: [], rateLimitRemaining: null, error: 'Apollo status 429' })) as never,
    })
    await expect(p.fetch('apollo:a|b|1')).rejects.toMatchObject({ code: 'server_error' })
  })

  it('anahtar yoksa sağlık yeşil değil', () => {
    expect(createApolloProvider({ env: {} }).health({}))
      .toMatchObject({ enabled: false, reason: 'APOLLO_API_KEY eksik' })
  })
})

// ────────────────────────────── çalıştırıcı ──────────────────────────────────

describe('startSourceRun — sıra zorunlu', () => {
  it('bütçe reddederse provider.start ASLA çağrılmaz', async () => {
    const provider = createFakeProvider()
    const start = vi.spyOn(provider, 'start')
    vi.spyOn(provider, 'estimate').mockResolvedValue({
      provider: 'fake', estimatedCostUsd: 100, basis: 'test', requestedCount: 10,
    })
    // getSourceProvider yerine doğrudan sözleşmeyi kullanarak sırayı sınıyoruz.
    const est = await provider.estimate(QUERY)
    await expect(assertWithinBudget(est, spendZero)).rejects.toThrow(BudgetExceededError)
    expect(start).not.toHaveBeenCalled()
  })

  it('fake sağlayıcıyla uçtan uca: kırpma + bütçe + koşu', async () => {
    const out = await startSourceRun({
      providerKey: 'fake',
      query: { ...QUERY, limit: 5000 },
      readSpend: spendZero,
    })
    expect(out.limitClamped).toBe(true)
    expect(out.effectiveQuery.limit).toBe(MAX_LEADS_PER_RUN)
    expect(out.budget.allowed).toBe(true)
    expect(out.handle.provider).toBe('fake')
  })

  it('ölçülemeyen harcamada koşu başlamaz', async () => {
    await expect(
      startSourceRun({ providerKey: 'fake', query: QUERY, readSpend: spendUnknown }),
    ).rejects.toThrow(BudgetExceededError)
  })

  it('kapalı sağlayıcı çalıştırılamaz', async () => {
    await expect(
      startSourceRun({ providerKey: 'apify', query: QUERY, readSpend: spendZero, deps: { env: {} } }),
    ).rejects.toMatchObject({ code: 'disabled' })
  })

  it('bilinmeyen sağlayıcı sessizce fake`e düşmez', () => {
    expect(() => getSourceProvider('yok' as never)).toThrow(SourceProviderError)
  })

  it('sağlık tablosu dört sağlayıcıyı da listeler', () => {
    const h = listProviderHealth({ env: {} })
    expect(h.map((x) => x.key)).toEqual(['places', 'apollo', 'apify', 'fake'])
    expect(h.find((x) => x.key === 'apify')!.enabled).toBe(false)
    expect(h.find((x) => x.key === 'fake')!.enabled).toBe(true)
  })
})

describe('collectLeads — fake fixture uçtan uca', () => {
  it('kirli fixture doğru sayaçlara ayrışır', async () => {
    const started = await startSourceRun({ providerKey: 'fake', query: QUERY, readSpend: spendZero })
    // NOT: fake sağlayıcı örneği paylaşılmadığı için collectLeads yeni örnek
    // yaratır ve tüm veri kümesini döner — sayaçlar veri kümesinin tamamı için.
    const c = await collectLeads('fake', started.handle.providerRunId)
    expect(c.metrics.receivedCount).toBe(6)
    expect(c.metrics.duplicateCount).toBe(1)
    expect(c.metrics.invalidCount).toBe(1)
    // Kişisel adresli kayıt CRM'e girer ama otomatik diziye GİRMEZ.
    expect(c.leads.some((l) => l.emailKind === 'personal' && !l.outreachEligible)).toBe(true)
    // Telefon fixture'da VAR, çıktıda YOK.
    expect(JSON.stringify(c.leads)).not.toContain('555 000')
  })
})
