import { describe, it, expect } from 'vitest'
import {
  ADVERTISED_UNIT_COST_PER_1K,
  APIFY_CREDIT_TOTAL_USD,
  APIFY_MONTHLY_HARD_STOP_USD,
  APIFY_MONTHLY_OPERATING_TARGET_USD,
  APIFY_PILOT_ACTOR,
  APIFY_PILOT_MAX_PLACES,
  APIFY_PILOT_MAX_SPEND_USD,
  APIFY_UNTOUCHABLE_RESERVE_USD,
  CONSERVATIVE_UNIT_COST_PER_1K,
  DEFAULT_OFF_FEATURES,
  PILOT_RUN_DEFAULTS,
  computeRunMetrics,
  estimateRunCost,
  evaluateRunGate,
  preflightActorPricing,
  shouldScale,
  type ActorPricingMetadata,
} from './apifyPolicy'

const goodMeta: ActorPricingMetadata = {
  actorId: APIFY_PILOT_ACTOR.id,
  pricingModel: 'PAY_PER_EVENT',
  perEventUsd: { place: 0.004, search_filter: 0.001, contact_enrichment: 0.002 },
  fetchedAt: '2026-08-10T00:00:00Z',
}

describe('bütçe sabitleri', () => {
  it('$25 kredi · $18 hedef · $22 sert kesme · $3 rezerv', () => {
    expect(APIFY_CREDIT_TOTAL_USD).toBe(25)
    expect(APIFY_MONTHLY_OPERATING_TARGET_USD).toBe(18)
    expect(APIFY_MONTHLY_HARD_STOP_USD).toBe(22)
    expect(APIFY_UNTOUCHABLE_RESERVE_USD).toBe(3)
    // Sert kesme + rezerv toplam krediyi aşamaz.
    expect(APIFY_MONTHLY_HARD_STOP_USD + APIFY_UNTOUCHABLE_RESERVE_USD).toBeLessThanOrEqual(APIFY_CREDIT_TOTAL_USD)
  })

  it('pilot en çok 200 place ve $2', () => {
    expect(APIFY_PILOT_MAX_PLACES).toBe(200)
    expect(APIFY_PILOT_MAX_SPEND_USD).toBe(2)
  })

  it('ana aktör compass/crawler-google-places', () => {
    expect(APIFY_PILOT_ACTOR.id).toBe('compass/crawler-google-places')
    expect(APIFY_PILOT_ACTOR.rationale.length).toBeGreaterThan(0)
  })

  it('reklam fiyatı bütçe hesabına SABİTLENMEZ — muhafazakâr senaryo kullanılır', () => {
    expect(ADVERTISED_UNIT_COST_PER_1K).toBe(1.5)
    expect(CONSERVATIVE_UNIT_COST_PER_1K.basePlace).toBeGreaterThan(ADVERTISED_UNIT_COST_PER_1K)
  })

  it('pahalı eklentiler varsayılan KAPALI', () => {
    expect(PILOT_RUN_DEFAULTS.enabledFeatures).toEqual([])
    expect([...DEFAULT_OFF_FEATURES]).toContain('ai_competitor_analysis')
    expect([...DEFAULT_OFF_FEATURES]).toContain('person_leads_multiplier')
    expect(PILOT_RUN_DEFAULTS.contactEnrichmentForWebsitesOnly).toBe(true)
  })
})

describe('fiyat preflight — FAIL-CLOSED', () => {
  it('metadata yoksa koşu açılmaz', () => {
    const p = preflightActorPricing(null)
    expect(p.ok).toBe(false)
    expect(p.reason).toContain('okunamadı')
    expect(p.source).toBe('none')
  })

  it('farklı aktör reddedilir', () => {
    const p = preflightActorPricing({ ...goodMeta, actorId: 'ucuz/yeni-aktor' })
    expect(p.ok).toBe(false)
    expect(p.reason).toContain('Beklenen aktör')
  })

  it('fiyat/olay modeli beklenenden farklıysa koşu durur', () => {
    expect(preflightActorPricing({ ...goodMeta, pricingModel: 'PAY_PER_RESULT' }).ok).toBe(false)
    expect(preflightActorPricing({ ...goodMeta, pricingModel: null }).ok).toBe(false)
  })

  it('olay fiyat listesi boşsa koşu durur', () => {
    expect(preflightActorPricing({ ...goodMeta, perEventUsd: {} }).ok).toBe(false)
    expect(preflightActorPricing({ ...goodMeta, perEventUsd: null }).ok).toBe(false)
  })

  it('gerçek fiyat muhafazakâr senaryonun iki katını aşarsa koşu durur', () => {
    const p = preflightActorPricing({ ...goodMeta, perEventUsd: { ...goodMeta.perEventUsd!, place: 0.05 } })
    expect(p.ok).toBe(false)
    expect(p.reason).toContain('iki katını')
  })

  it('geçerli metadata gerçek hesap fiyatını kullanır', () => {
    const p = preflightActorPricing(goodMeta)
    expect(p.ok).toBe(true)
    expect(p.source).toBe('account')
    expect(p.unitCostPer1k.basePlace).toBeCloseTo(4)
  })
})

describe('maliyet tahmini', () => {
  const pricing = preflightActorPricing(goodMeta)

  it('enrichment yalnız ICP filtresinden geçen adaylara uygulanır', () => {
    const filtered = estimateRunCost(
      { places: 200, contactEnrichmentForWebsitesOnly: true, enrichmentCandidates: 40, enabledFeatures: [] },
      pricing,
    )
    const unfiltered = estimateRunCost(
      { places: 200, contactEnrichmentForWebsitesOnly: false, enrichmentCandidates: 40, enabledFeatures: [] },
      pricing,
    )
    expect(filtered.contactEnrichmentUsd).toBeLessThan(unfiltered.contactEnrichmentUsd)
  })

  it('kapalı olması gereken eklenti açılırsa tahmin şişer', () => {
    const base = estimateRunCost({ ...PILOT_RUN_DEFAULTS, places: 200 }, pricing)
    const withAi = estimateRunCost(
      { ...PILOT_RUN_DEFAULTS, places: 200, enabledFeatures: ['ai_competitor_analysis'] },
      pricing,
    )
    expect(withAi.maxUsd).toBeGreaterThan(base.maxUsd)
  })
})

describe('koşu kapısı', () => {
  const pricing = preflightActorPricing(goodMeta)
  const pilotOpts = { places: 200, contactEnrichmentForWebsitesOnly: true, enrichmentCandidates: 40, enabledFeatures: [] }

  it('fiyat preflight geçmediyse koşu açılmaz', () => {
    const v = evaluateRunGate({
      opts: pilotOpts,
      pricing: preflightActorPricing(null),
      spentThisMonthUsd: 0,
      isPilot: true,
    })
    expect(v.allowed).toBe(false)
    expect(v.estimate).toBeNull()
  })

  it('ölçülemeyen harcama sıfır sayılmaz', () => {
    const v = evaluateRunGate({ opts: pilotOpts, pricing, spentThisMonthUsd: null, isPilot: true })
    expect(v.allowed).toBe(false)
    expect(v.reasons.join(' ')).toContain('sıfır sayılmaz')
  })

  it('pilot 200 place ve $2 sınırını aşamaz', () => {
    const tooMany = evaluateRunGate({
      opts: { ...pilotOpts, places: 500 },
      pricing,
      spentThisMonthUsd: 0,
      isPilot: true,
    })
    expect(tooMany.allowed).toBe(false)
    expect(tooMany.reasons.join(' ')).toContain('200 place')
  })

  it('sert kesme aşılırsa koşu KÜÇÜLTÜLMEZ, reddedilir', () => {
    const v = evaluateRunGate({ opts: pilotOpts, pricing, spentThisMonthUsd: 21.9, isPilot: false })
    expect(v.allowed).toBe(false)
    expect(v.reasons.join(' ')).toContain('küçültülmedi')
  })

  it('dokunulmaz rezerve el atılamaz', () => {
    const v = evaluateRunGate({ opts: pilotOpts, pricing, spentThisMonthUsd: 21.5, isPilot: false })
    expect(v.allowed).toBe(false)
    expect(v.reasons.join(' ')).toContain('rezerv')
  })

  it('varsayılan kapalı eklenti açıksa koşu açılmaz', () => {
    const v = evaluateRunGate({
      opts: { ...pilotOpts, enabledFeatures: ['reviews'] },
      pricing,
      spentThisMonthUsd: 0,
      isPilot: true,
    })
    expect(v.allowed).toBe(false)
    expect(v.reasons.join(' ')).toContain('reviews')
  })

  it('sınırlar içindeki pilot geçer ve tahmini gösterir', () => {
    const v = evaluateRunGate({ opts: pilotOpts, pricing, spentThisMonthUsd: 0, isPilot: true })
    expect(v.allowed).toBe(true)
    expect(v.estimate!.maxUsd).toBeLessThanOrEqual(APIFY_PILOT_MAX_SPEND_USD)
    expect(v.remainingUsd).toBe(APIFY_MONTHLY_HARD_STOP_USD)
  })

  it('kapı asla alternatif ÜCRETLİ sağlayıcı önermez', () => {
    const v = evaluateRunGate({ opts: pilotOpts, pricing, spentThisMonthUsd: 22, isPilot: false })
    expect(v.allowed).toBe(false)
    for (const r of v.reasons) {
      expect(r.toLowerCase()).not.toContain('leadmash')
      expect(r.toLowerCase()).not.toContain('explee')
      expect(r.toLowerCase()).not.toContain('yerine')
    }
  })
})

describe('koşu sonrası ölçüm ve ölçek kararı', () => {
  const good = {
    actualCostUsd: 1.5,
    resultCount: 200,
    relevantAccountCount: 90,
    publicContactCount: 40,
    verifiedSendableEmailCount: 25,
    duplicateCount: 20,
  }

  it('sonuç başı, hesap başı ve kullanılabilir e-posta başı maliyet ayrı ölçülür', () => {
    const m = computeRunMetrics(good)
    expect(m.costPerResultUsd).toBeCloseTo(0.0075)
    expect(m.costPerUsableEmailUsd).toBeCloseTo(0.06)
    expect(m.duplicateCostUsd).toBeCloseTo(0.15)
  })

  it('sıfır bölme null döner, 0 değil', () => {
    const m = computeRunMetrics({ ...good, resultCount: 0, verifiedSendableEmailCount: 0 })
    expect(m.costPerResultUsd).toBeNull()
    expect(m.costPerUsableEmailUsd).toBeNull()
  })

  it('kalite eşiği tutmazsa ölçek AÇILMAZ', () => {
    const weak = computeRunMetrics({ ...good, relevantAccountCount: 10, verifiedSendableEmailCount: 2 })
    const v = shouldScale(weak)
    expect(v.scale).toBe(false)
    expect(v.blockers.length).toBeGreaterThan(0)
  })

  it('ölçülemeyen metrik "iyi" sayılmaz', () => {
    const v = shouldScale(computeRunMetrics({ ...good, resultCount: 0 }))
    expect(v.scale).toBe(false)
    expect(v.blockers.join(' ')).toContain('ölçülemedi')
  })

  it('eşikler tutuyorsa ölçek açılır', () => {
    expect(shouldScale(computeRunMetrics(good)).scale).toBe(true)
  })
})
