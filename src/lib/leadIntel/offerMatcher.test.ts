import { describe, it, expect } from 'vitest'
import { matchServices, MatcherEvidence } from './offerMatcher'
import { mergeCatalog } from '../services/catalogOverrides'

const CATALOG = mergeCatalog([])

const EV = (id: string, kind: string, verified = true): MatcherEvidence => ({ id, kind, verified })

describe('matchServices (deterministik Offer Matcher)', () => {
  it('aynı lead eşzamanlı Tasarım VE AI eşleşmesi alabilir', () => {
    const matches = matchServices({
      designScore: 85,
      aiScore: 80,
      sector: 'beauty',
      evidence: [
        EV('e1', 'screenshot'),
        EV('e2', 'pagespeed'),
        EV('e3', 'html_signal'),
        EV('e4', 'review_signal'),
        EV('e5', 'places_data'),
      ],
      catalog: CATALOG,
      maxMatches: 6,
    })
    const domains = new Set(matches.map((m) => m.domain))
    expect(domains.has('tasarim')).toBe(true)
    expect(domains.has('ai_otomasyon')).toBe(true)
    expect(matches[0].rank).toBe(1)
  })

  it('DOĞRULANMAMIŞ kanıt eşleşme kapısını AÇMAZ', () => {
    const verified = matchServices({
      designScore: 90, aiScore: 20, sector: 'beauty',
      evidence: [EV('e1', 'screenshot'), EV('e2', 'pagespeed'), EV('e3', 'html_signal')],
      catalog: CATALOG,
    })
    const unverified = matchServices({
      designScore: 90, aiScore: 20, sector: 'beauty',
      evidence: [EV('e1', 'screenshot', false), EV('e2', 'pagespeed', false), EV('e3', 'html_signal', false)],
      catalog: CATALOG,
    })
    expect(verified.length).toBeGreaterThan(0)
    expect(unverified).toHaveLength(0)
  })

  it('pasif paket asla önerilmez', () => {
    const catalogWithInactive = mergeCatalog([
      { slug: 'web-sitesi', setup_price_override_tl: null, monthly_price_override_tl: null, active: false },
    ])
    const matches = matchServices({
      designScore: 95, aiScore: 10, sector: 'beauty',
      evidence: [EV('e1', 'screenshot'), EV('e2', 'pagespeed'), EV('e3', 'html_signal')],
      catalog: catalogWithInactive, maxMatches: 20,
    })
    expect(matches.find((m) => m.service_slug === 'web-sitesi')).toBeUndefined()
  })

  it('evidence_refs eşleşen doğrulanmış kanıt id\'lerini taşır', () => {
    const matches = matchServices({
      designScore: 85, aiScore: 40, sector: 'health_clinic',
      evidence: [EV('shot-1', 'screenshot'), EV('psi-1', 'pagespeed'), EV('html-1', 'html_signal')],
      catalog: CATALOG,
    })
    const web = matches.find((m) => m.service_slug === 'web-sitesi')
    expect(web).toBeDefined()
    expect(web!.evidence_refs).toEqual(expect.arrayContaining(['shot-1', 'psi-1', 'html-1']))
    expect(web!.reasons.length).toBeGreaterThan(0)
  })

  it('sektör uyumu skoru etkiler (bonus/ceza)', () => {
    const evidence = [EV('e4', 'review_signal'), EV('e5', 'places_data'), EV('e3', 'html_signal')]
    const inSector = matchServices({ designScore: 50, aiScore: 70, sector: 'health_clinic', evidence, catalog: CATALOG, maxMatches: 30 })
    const outSector = matchServices({ designScore: 50, aiScore: 70, sector: 'logistics', evidence, catalog: CATALOG, maxMatches: 30 })
    const inScore = inSector.find((m) => m.service_slug === 'ai-satis-asistani')?.score ?? 0
    const outScore = outSector.find((m) => m.service_slug === 'ai-satis-asistani')?.score ?? 0
    expect(inScore).toBeGreaterThan(outScore)
  })

  it('kanıt hiç yoksa eşleşme yok (boş liste, uydurma yok)', () => {
    expect(matchServices({ designScore: 99, aiScore: 99, sector: 'beauty', evidence: [], catalog: CATALOG })).toHaveLength(0)
  })
})
