import { describe, it, expect } from 'vitest'
import { mapApolloPerson } from './apollo'

describe('mapApolloPerson', () => {
  it('maps a full Apollo person object', () => {
    const p = mapApolloPerson({
      id: 'abc',
      name: 'Ada Lovelace',
      title: 'CMO',
      seniority: 'c_suite',
      linkedin_url: 'https://linkedin.com/in/ada',
      email: 'ada@acme.com',
      email_status: 'verified',
      city: 'Istanbul',
      country: 'Turkey',
      organization: { name: 'Acme', primary_domain: 'acme.com', industry: 'retail', estimated_num_employees: 120 },
    })
    expect(p).not.toBeNull()
    expect(p!.apollo_person_id).toBe('abc')
    expect(p!.full_name).toBe('Ada Lovelace')
    expect(p!.company_name).toBe('Acme')
    expect(p!.company_size).toBe('120')
    expect(p!.email).toBe('ada@acme.com')
  })

  it('builds full_name from first/last when name missing', () => {
    const p = mapApolloPerson({ id: 'x', first_name: 'Grace', last_name: 'Hopper' })
    expect(p!.full_name).toBe('Grace Hopper')
  })

  it('returns null when id or name missing', () => {
    expect(mapApolloPerson({ name: 'No Id' })).toBeNull()
    expect(mapApolloPerson({ id: 'noname' })).toBeNull()
  })

  it('masks locked Apollo emails to null', () => {
    const p = mapApolloPerson({ id: 'y', name: 'Locked Person', email: 'email_not_unlocked@domain.com' })
    expect(p!.email).toBeNull()
  })
})
