import { describe, it, expect } from 'vitest'
import { normalizeDomain, DOMAIN_FIXTURES } from './domain'

describe('normalizeDomain', () => {
  for (const [input, expected] of DOMAIN_FIXTURES) {
    it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      expect(normalizeDomain(input)).toBe(expected)
    })
  }

  it('idempotenttir — normalize(normalize(x)) === normalize(x)', () => {
    for (const [input] of DOMAIN_FIXTURES) {
      const once = normalizeDomain(input)
      expect(normalizeDomain(once)).toBe(once)
    }
  })

  it('araştırma JSON undaki 60 domain in tamamını kanonikleştirir ve benzersiz bırakır', async () => {
    const research = (await import('../../../docs/grafikcem-b2b-pazar-arastirmasi-2026-08-09.json', {
      with: { type: 'json' },
    })) as unknown as { default: { leads: { domain: string; website: string }[] } }

    const leads = research.default.leads
    expect(leads).toHaveLength(60)

    const normalized = leads.map((l) => normalizeDomain(l.domain))
    // Hiçbiri düşmemeli — düşen bir domain, o lead in eşleştirilemeyeceği demek.
    expect(normalized.filter((d) => d === null)).toEqual([])
    // 60 benzersiz domain: UNIQUE constraint in dayanağı.
    expect(new Set(normalized).size).toBe(60)

    // `website` alanı da aynı kanonik değere indirgenmeli; ikisi ayrışırsa
    // hangi alandan türeteceğimiz belirsizleşir.
    for (const lead of leads) {
      expect(normalizeDomain(lead.website)).toBe(normalizeDomain(lead.domain))
    }
  })
})
