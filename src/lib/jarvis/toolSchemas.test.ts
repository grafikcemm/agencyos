import { describe, it, expect } from 'vitest'
import { TOOL_ARG_SCHEMAS } from './toolSchemas'

describe('TOOL_ARG_SCHEMAS', () => {
  it('update_lead_stage geçerli enum kabul, geçersiz red', () => {
    const s = TOOL_ARG_SCHEMAS.update_lead_stage
    expect(s.safeParse({ lead_id: 'x', stage: 'converted' }).success).toBe(true)
    expect(s.safeParse({ lead_id: 'x', stage: 'hacked' }).success).toBe(false)
    expect(s.safeParse({ stage: 'converted' }).success).toBe(false) // lead_id eksik
  })

  it('create_project negatif/aşırı revenue reddeder', () => {
    const s = TOOL_ARG_SCHEMAS.create_project
    expect(s.safeParse({ lead_id: 'x', title: 'P', revenue_tl: 5000 }).success).toBe(true)
    expect(s.safeParse({ lead_id: 'x', title: 'P', revenue_tl: -1 }).success).toBe(false)
    expect(s.safeParse({ lead_id: 'x', title: 'P', revenue_tl: 99_999_999 }).success).toBe(false)
    expect(s.safeParse({ lead_id: 'x' }).success).toBe(false) // title eksik
  })

  it('scan_leads zorunlu niche/city ister', () => {
    const s = TOOL_ARG_SCHEMAS.scan_leads
    expect(s.safeParse({ niche: 'klinik', city: 'istanbul' }).success).toBe(true)
    expect(s.safeParse({ niche: 'klinik' }).success).toBe(false)
  })

  it('get_quality_leads tier enum doğrular', () => {
    const s = TOOL_ARG_SCHEMAS.get_quality_leads
    expect(s.safeParse({ tier: 'A' }).success).toBe(true)
    expect(s.safeParse({ tier: 'Z' }).success).toBe(false)
    expect(s.safeParse({}).success).toBe(true) // tier opsiyonel
  })

  it('arg alan tüm tool şemaları tanımlı', () => {
    for (const t of ['find_lead_by_name', 'draft_email', 'draft_proposal', 'generate_pitch', 'build_carousel_brief', 'build_visual_prompt', 'wrap_session']) {
      expect(TOOL_ARG_SCHEMAS[t]).toBeDefined()
    }
  })
})
