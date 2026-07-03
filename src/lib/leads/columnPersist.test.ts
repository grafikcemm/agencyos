import { describe, it, expect } from 'vitest'
import { V2_LEAD_KEYS, isMissingColumnError, stripKeys } from './columnPersist'

describe('isMissingColumnError', () => {
  it('PGRST204 kodu yakalanır', () => {
    expect(isMissingColumnError({ code: 'PGRST204', message: 'x' })).toBe(true)
  })

  it('mesaj-temelli v2 kolon adı yakalanır', () => {
    expect(isMissingColumnError({ code: null, message: "Could not find the 'design_score' column" })).toBe(true)
    expect(isMissingColumnError({ code: null, message: "Could not find the 'primary_service_slug' column" })).toBe(true)
  })

  it('alakasız hata yakalanmaz', () => {
    expect(isMissingColumnError({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isMissingColumnError(null)).toBe(false)
    expect(isMissingColumnError(undefined)).toBe(false)
  })
})

describe('stripKeys', () => {
  it('v2 anahtarlarını çıkarır, diğer alanlar kalır (immutable)', () => {
    const payload = {
      business_name: 'ACME',
      design_score: 80,
      ai_score: 60,
      primary_service_slug: 'web-sitesi',
      last_assessment_id: 'uuid',
      last_assessed_at: 'now',
      quality_score: 70,
    }
    const stripped = stripKeys(payload)
    expect(stripped).toEqual({ business_name: 'ACME', quality_score: 70 })
    // orijinal mutasyona uğramaz
    expect(payload.design_score).toBe(80)
    expect(V2_LEAD_KEYS.length).toBe(5)
  })
})
