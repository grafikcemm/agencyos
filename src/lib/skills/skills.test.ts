import { describe, it, expect } from 'vitest'
import { SKILL_CATALOG } from './catalog'
import { validateRegistry, getSkill, listSkillsByTeam, SKILL_HANDLERS } from './registry'
import {
  cosine, eligibilityFilter, semanticTopK, grantBudgetValidate, retrieveSkills,
  type SkillCandidate, MAX_SKILLS,
} from './retrieve'

describe('skill registry integrity (§10.1)', () => {
  it('katalog benzersizlik/bütünlük değişmezlerini geçer (yapay tekrar yok)', () => {
    const issues = validateRegistry()
    expect(issues, JSON.stringify(issues, null, 2)).toHaveLength(0)
  })
  it('her handlerKey compile-time allowlist içinde', () => {
    for (const s of SKILL_CATALOG) {
      if (s.handlerKey) expect(s.handlerKey in SKILL_HANDLERS).toBe(true)
    }
  })
  it('öncelikli takımlar dolu', () => {
    for (const t of ['lead_intelligence', 'sales', 'design', 'ai_automation']) {
      expect(listSkillsByTeam(t).length).toBeGreaterThan(0)
    }
  })
  it('gerçek handler çalışır (score_deterministic)', () => {
    const h = SKILL_HANDLERS['lead.score_deterministic']
    const out = h({ evidence: [] }) as { design: number; ai: number }
    expect(out.design).toBe(60)
    expect(out.ai).toBe(35)
  })
  it('uygulanmamış handler açık hata verir (dinamik import yok)', () => {
    expect(() => SKILL_HANDLERS['lead.audit_website']({})).toThrow(/uygulanmadı/)
  })
})

function cand(slug: string, vector: number[], over: Partial<SkillCandidate> = {}): SkillCandidate {
  const m = getSkill(slug)!
  return { slug, vector, manifest: m, ...over }
}

describe('skill retrieval 4-stage (§11)', () => {
  it('cosine temel', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosine([1, 0], [])).toBe(0)
  })

  it('eligibility: izinsiz skill elenir', () => {
    const cands = [cand('sales.draft_proposal', [1, 0])] // outreach:write ister
    const readOnly = eligibilityFilter(cands, { callerScopes: ['leads:read'], maxSensitivity: 'confidential' })
    expect(readOnly).toHaveLength(0)
    const full = eligibilityFilter(cands, { callerScopes: ['*'], maxSensitivity: 'confidential' })
    expect(full).toHaveLength(1)
  })

  it('eligibility: sensitivity tavanı', () => {
    const cands = [cand('sales.draft_proposal', [1, 0])] // confidential
    const low = eligibilityFilter(cands, { callerScopes: ['*'], maxSensitivity: 'internal' })
    expect(low).toHaveLength(0)
  })

  it('semanticTopK sıralar + keser', () => {
    const cands = [cand('lead.score_deterministic', [1, 0]), cand('design.moodboard_prompt', [0, 1])]
    const top = semanticTopK(cands, [1, 0], 1)
    expect(top).toHaveLength(1)
    expect(top[0].cand.slug).toBe('lead.score_deterministic')
  })

  it('grant/budget: grant dışı + bütçe aşımı elenir; skill tavanı', () => {
    const ranked = SKILL_CATALOG.slice(0, 3).map((m, i) => ({ cand: cand(m.slug, [1, 0]), score: 1 - i * 0.1 }))
    const granted = new Set([SKILL_CATALOG[0].slug])
    const r = grantBudgetValidate(ranked, granted, 1)
    expect(r.selected.map((s) => s.slug)).toEqual([SKILL_CATALOG[0].slug])
    expect(r.rejected.some((x) => x.reason === 'grant yok')).toBe(true)
  })

  it('tam pipeline ≤ MAX_SKILLS seçer', () => {
    const cands = SKILL_CATALOG.map((m, i) => cand(m.slug, i === 0 ? [1, 0] : [0.9, 0.1]))
    const r = retrieveSkills(cands, [1, 0], { callerScopes: ['*'], maxSensitivity: 'secret' }, new Set(), 5)
    expect(r.selected.length).toBeLessThanOrEqual(MAX_SKILLS)
    expect(r.notes[0]).toContain('eligible=')
  })
})
