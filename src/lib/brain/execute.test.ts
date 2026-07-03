import { describe, it, expect } from 'vitest'
import {
  decideStepExecution,
  executeAutoStep,
  planActiveExecution,
  approvalActionForStep,
  type ExecuteContext,
} from './execute'
import type { PlanStep } from './types'

function step(over: Partial<PlanStep> = {}): PlanStep {
  return {
    id: 's0',
    title: 't',
    archetype: 'executor',
    skillSlug: null,
    tier: 'light',
    dependsOn: [],
    permissionScopes: ['leads:read'],
    permissionClass: 'read',
    riskLevel: 'low',
    dataSensitivity: 'internal',
    ...over,
  }
}

const FULL: ExecuteContext = { callerScopes: ['*'], grantedSkills: new Set() }

describe('decideStepExecution — güvenlik değişmezleri (§13)', () => {
  it('güvenli read + sıfır-maliyet deterministik allowlist → auto_run', () => {
    const d = decideStepExecution(
      step({ skillSlug: 'lead.score_deterministic', permissionScopes: ['leads:read'], permissionClass: 'read' }),
      FULL
    )
    expect(d.kind).toBe('auto_run')
    if (d.kind === 'auto_run') expect(d.handlerKey).toBe('lead.score_deterministic')
  })

  it('write sınıfı → asla auto; needs_approval', () => {
    const d = decideStepExecution(
      step({ permissionScopes: ['outreach:write'], permissionClass: 'write', riskLevel: 'medium', dataSensitivity: 'confidential' }),
      FULL
    )
    expect(d.kind).toBe('needs_approval')
  })

  it('maliyetli skill read olsa bile → needs_approval (spend koruması)', () => {
    // lead.audit_website: read scope, budget>0, composite.
    const d = decideStepExecution(
      step({ skillSlug: 'lead.audit_website', permissionScopes: ['leads:read'], permissionClass: 'read' }),
      FULL
    )
    expect(d.kind).toBe('needs_approval')
  })

  it('skill yok, güvenli read → auto_noop (yürütülecek deterministik yok)', () => {
    const d = decideStepExecution(step({ skillSlug: null, permissionClass: 'read' }), FULL)
    expect(d.kind).toBe('auto_noop')
  })

  it('scope yetersiz → blocked scope', () => {
    const d = decideStepExecution(
      step({ permissionScopes: ['outreach:write'], permissionClass: 'read' }),
      { callerScopes: ['leads:read'], grantedSkills: new Set() }
    )
    expect(d.kind).toBe('blocked')
    if (d.kind === 'blocked') expect(d.reason).toBe('scope')
  })

  it('grant dışı skill → blocked grant', () => {
    const d = decideStepExecution(
      step({ skillSlug: 'lead.score_deterministic', permissionClass: 'read' }),
      { callerScopes: ['*'], grantedSkills: new Set(['some.other']) }
    )
    expect(d.kind).toBe('blocked')
    if (d.kind === 'blocked') expect(d.reason).toBe('grant')
  })

  it('lethal trifecta → blocked trifecta', () => {
    const d = decideStepExecution(
      step({ permissionScopes: ['data:send'], permissionClass: 'external', dataSensitivity: 'confidential' }),
      { callerScopes: ['*'], grantedSkills: new Set(), hasUntrustedInput: true }
    )
    expect(d.kind).toBe('blocked')
    if (d.kind === 'blocked') expect(d.reason).toBe('trifecta')
  })
})

describe('executeAutoStep + planActiveExecution', () => {
  it('allowlist deterministik handler çalışır', () => {
    const out = executeAutoStep('lead.score_deterministic', { evidence: [] }) as { design: number; ai: number }
    expect(out.design).toBe(60)
    expect(out.ai).toBe(35)
  })
  it('allowlist dışı handler → hata', () => {
    expect(() => executeAutoStep('nope.key', {})).toThrow(/allowlist dışı/)
  })
  it('planActiveExecution order sırasında karar üretir', () => {
    const steps = [
      step({ id: 's0', skillSlug: 'lead.score_deterministic', permissionClass: 'read' }),
      step({ id: 's1', permissionScopes: ['outreach:write'], permissionClass: 'write' }),
    ]
    const plans = planActiveExecution(steps, ['s1', 's0'], FULL)
    expect(plans.map((p) => p.stepId)).toEqual(['s1', 's0'])
    expect(plans[0].decision.kind).toBe('needs_approval')
    expect(plans[1].decision.kind).toBe('auto_run')
  })
  it('approvalActionForStep: skill ya da archetype', () => {
    expect(approvalActionForStep(step({ skillSlug: 'x' }))).toBe('x')
    expect(approvalActionForStep(step({ skillSlug: null, archetype: 'executor' }))).toBe('archetype:executor')
  })
})
