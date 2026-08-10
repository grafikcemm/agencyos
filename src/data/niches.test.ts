import { describe, it, expect } from 'vitest'
import {
  NICHES,
  CASE_ALIASES,
  TOTAL_OUTBOUND_SHARE,
  EVIDENCE_MAX_AGE_DAYS,
  getNiche,
  allOffers,
  resolveOfferId,
} from './niches'

type ResearchJson = {
  top_niches: {
    rank: number
    niche_id: string
    score: number
    case_study_match: string
    icp: { employee_bands: string[] }
    entry_offer: { name: string; budget_tr: string; budget_global: string; duration: string }
    core_offer: { name: string }
    retainer_offer: { name: string }
    disqualifiers: string[]
  }[]
  leads: { niche_id: string; matched_case_study: string; matched_offer: string }[]
}

async function loadResearch(): Promise<ResearchJson> {
  const mod = (await import('../../docs/grafikcem-b2b-pazar-arastirmasi-2026-08-09.json', {
    with: { type: 'json' },
  })) as unknown as { default: ResearchJson }
  return mod.default
}

describe('NICHES — araştırma ile parite', () => {
  it('üç niş, doğru sıra ve öncelik taşır', () => {
    expect(NICHES.map((n) => n.id)).toEqual([
      'beauty_fragrance_cosmetics',
      'premium_home_kitchen_multibrand',
      'toy_kids_family',
    ])
    expect(NICHES.map((n) => n.rank)).toEqual([1, 2, 3])
    expect(NICHES.filter((n) => n.priority === 'ana')).toHaveLength(1)
  })

  it('outbound payları tam 100 eder — kapasite sessizce kaybolmaz', () => {
    expect(TOTAL_OUTBOUND_SHARE).toBe(100)
    expect(NICHES.map((n) => n.outboundShare)).toEqual([60, 25, 15])
  })

  it('skor, ICP bandı, vaka ve teklif adları araştırma JSON undan ayrışmamış', async () => {
    const research = await loadResearch()
    for (const niche of NICHES) {
      const src = research.top_niches.find((n) => n.niche_id === niche.id)
      expect(src, `araştırmada ${niche.id} yok`).toBeDefined()
      expect(niche.score).toBe(src!.score)
      expect(niche.rank).toBe(src!.rank)
      expect(niche.caseMatch).toBe(src!.case_study_match)
      expect(niche.icp.employeeBands).toEqual(src!.icp.employee_bands)
      expect(niche.disqualifiers).toEqual(src!.disqualifiers)
      expect(niche.entryOffer.name).toBe(src!.entry_offer.name)
      expect(niche.coreOffer.name).toBe(src!.core_offer.name)
      expect(niche.retainerOffer.name).toBe(src!.retainer_offer.name)
      expect(niche.entryOffer.budgetTr).toBe(src!.entry_offer.budget_tr)
      expect(niche.entryOffer.budgetGlobal).toBe(src!.entry_offer.budget_global)
      expect(niche.entryOffer.duration).toBe(src!.entry_offer.duration)
    }
  })

  it('teklif kimlikleri sistem genelinde benzersiz', () => {
    const ids = NICHES.flatMap((n) => allOffers(n).map((o) => o.id))
    expect(ids).toHaveLength(9)
    expect(new Set(ids).size).toBe(9)
  })

  it('fiyatlar serbest metin aralık olarak kalır — sayıya çevrilmez', () => {
    for (const niche of NICHES) {
      for (const offer of allOffers(niche)) {
        expect(typeof offer.budgetTr).toBe('string')
        expect(offer.budgetTr).toMatch(/TL/)
        expect(offer.budgetGlobal).toMatch(/EUR/)
        expect(Number.isFinite(Number(offer.budgetTr))).toBe(false)
      }
    }
  })
})

describe('CASE_ALIASES', () => {
  it('araştırmadaki her lead vaka kısa adını karşılar', async () => {
    const research = await loadResearch()
    const shortNames = new Set(research.leads.map((l) => l.matched_case_study))
    for (const name of shortNames) {
      expect(CASE_ALIASES[name], `eşlenmemiş vaka adı: ${name}`).toBeTruthy()
    }
  })
})

describe('resolveOfferId', () => {
  it('kanonik teklif adını çözer', () => {
    expect(resolveOfferId('beauty_fragrance_cosmetics', 'Launch Creative Diagnostic')).toBe(
      'launch-creative-diagnostic',
    )
    expect(resolveOfferId('toy_kids_family', '  seasonal campaign diagnostic ')).toBe(
      'seasonal-campaign-diagnostic',
    )
  })

  it('serbest metni UYDURMAZ — çözülemeyen null döner', () => {
    // Araştırmada gerçekten geçen, teklif olmayan bir değer.
    expect(resolveOfferId('toy_kids_family', 'Nurture; güncel sinyal bekle')).toBeNull()
    expect(resolveOfferId('beauty_fragrance_cosmetics', 'TR/EN launch sistemi')).toBeNull()
    expect(resolveOfferId(null, 'Launch Creative Diagnostic')).toBeNull()
    expect(resolveOfferId('beauty_fragrance_cosmetics', '')).toBeNull()
    expect(resolveOfferId('beauty_fragrance_cosmetics', null)).toBeNull()
  })

  it('yanlış nişin teklifini çözmez — hücreler karışmaz', () => {
    expect(resolveOfferId('toy_kids_family', 'Launch Creative Diagnostic')).toBeNull()
  })

  it('araştırmadaki 60 lead in serbest teklif metni çoğunlukla çözülemez — bu beklenen', async () => {
    const research = await loadResearch()
    const resolved = research.leads.filter((l) => resolveOfferId(l.niche_id, l.matched_offer))
    // 60 lead'de 45 farklı serbest metin var; yalnız birebir eşleşenler çözülür.
    expect(resolved.length).toBeGreaterThan(0)
    expect(resolved.length).toBeLessThan(research.leads.length)
  })
})

describe('getNiche', () => {
  it('bilinmeyen kimlik için null döner, patlamaz', () => {
    expect(getNiche('dis-hekimi')).toBeNull()
    expect(getNiche(null)).toBeNull()
    expect(getNiche(undefined)).toBeNull()
  })
})

describe('EVIDENCE_MAX_AGE_DAYS', () => {
  it('araştırmanın 14 günlük yeniden doğrulama kuralını taşır', () => {
    expect(EVIDENCE_MAX_AGE_DAYS).toBe(14)
  })
})
