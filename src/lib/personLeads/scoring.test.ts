import { describe, it, expect } from 'vitest'
import { scorePersonLead } from './scoring'
import type { ApolloPerson } from './types'
import { APOLLO_B2B_PRESETS, POSITION_PRESETS } from './presets'

function person(overrides: Partial<ApolloPerson> = {}): ApolloPerson {
  return {
    apollo_person_id: 'p1',
    full_name: 'Ada Lovelace',
    title: 'Founder',
    seniority: 'founder',
    linkedin_url: null,
    email: null,
    email_status: null,
    phone: null,
    company_name: 'Acme',
    company_domain: 'acme.com',
    company_industry: 'marketing and advertising',
    company_size: '30',
    city: 'Istanbul',
    country: 'Turkey',
    raw: {},
    ...overrides,
  }
}

const b2bPreset = APOLLO_B2B_PRESETS[0]
const jobPreset = POSITION_PRESETS[0]

describe('scorePersonLead', () => {
  it('owner/founder at a small company scores high and tiers A or B', () => {
    const r = scorePersonLead(person({ seniority: 'founder', company_size: '30' }), b2bPreset)
    expect(r.person_score).toBeGreaterThanOrEqual(60)
    expect(['A', 'B']).toContain(r.person_tier)
  })

  it('clamps all sub-scores into 0..100', () => {
    const r = scorePersonLead(person(), b2bPreset)
    for (const v of [r.difficulty_score, r.market_score, r.earning_score, r.person_score]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })

  it('known email lowers difficulty vs unknown', () => {
    const withEmail = scorePersonLead(person({ email: 'ada@acme.com' }), b2bPreset)
    const without = scorePersonLead(person({ email: null }), b2bPreset)
    expect(withEmail.difficulty_score).toBeLessThan(without.difficulty_score)
  })

  it('b2b_sell yields a monthly value, job_application yields 0', () => {
    const b2b = scorePersonLead(person(), b2bPreset)
    const job = scorePersonLead(person(), jobPreset)
    expect(b2b.expected_monthly_value_tl).toBeGreaterThan(0)
    expect(job.expected_monthly_value_tl).toBe(0)
  })

  it('larger company raises earning score', () => {
    const small = scorePersonLead(person({ company_size: '5', seniority: 'manager' }), b2bPreset)
    const large = scorePersonLead(person({ company_size: '400', seniority: 'manager' }), b2bPreset)
    expect(large.earning_score).toBeGreaterThan(small.earning_score)
  })
})
