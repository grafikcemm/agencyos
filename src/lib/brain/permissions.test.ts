import { describe, it, expect } from 'vitest'
import {
  scopeSatisfied,
  grantSatisfied,
  hasLethalTrifecta,
  enforcePermissions,
} from './permissions'
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

describe('permissions — scope/grant (§13)', () => {
  it('scopeSatisfied: alt küme / eksik / wildcard', () => {
    expect(scopeSatisfied(['leads:read', 'x'], ['leads:read'])).toBe(true)
    expect(scopeSatisfied(['leads:read'], ['leads:read', 'outreach:write'])).toBe(false)
    expect(scopeSatisfied(['*'], ['anything:send'])).toBe(true)
  })

  it('grantSatisfied: null skill / boş grant / üye / üye değil', () => {
    expect(grantSatisfied(null, new Set(['a']))).toBe(true)
    expect(grantSatisfied('a', new Set())).toBe(true) // grant modeli devrede değil
    expect(grantSatisfied('a', new Set(['a']))).toBe(true)
    expect(grantSatisfied('a', new Set(['b']))).toBe(false)
  })
})

describe('lethal trifecta guard (§13)', () => {
  it('confidential + external + untrusted → true', () => {
    expect(
      hasLethalTrifecta({ permissionClass: 'external', dataSensitivity: 'confidential', hasUntrustedInput: true })
    ).toBe(true)
    expect(
      hasLethalTrifecta({ permissionClass: 'spend', dataSensitivity: 'secret', hasUntrustedInput: true })
    ).toBe(true)
  })
  it('bir bileşen eksikse → false', () => {
    expect(
      hasLethalTrifecta({ permissionClass: 'external', dataSensitivity: 'internal', hasUntrustedInput: true })
    ).toBe(false)
    expect(
      hasLethalTrifecta({ permissionClass: 'write', dataSensitivity: 'confidential', hasUntrustedInput: true })
    ).toBe(false)
    expect(
      hasLethalTrifecta({ permissionClass: 'external', dataSensitivity: 'confidential', hasUntrustedInput: false })
    ).toBe(false)
  })
})

describe('enforcePermissions — kapı sırası', () => {
  it('hepsi geçerse ok', () => {
    expect(enforcePermissions({ step: step(), callerScopes: ['*'], grantedSkills: new Set() }).ok).toBe(true)
  })
  it('scope eksik → blocked scope', () => {
    const r = enforcePermissions({ step: step({ permissionScopes: ['outreach:write'] }), callerScopes: ['leads:read'], grantedSkills: new Set() })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('scope')
  })
  it('grant yok → blocked grant', () => {
    const r = enforcePermissions({ step: step({ skillSlug: 'x' }), callerScopes: ['*'], grantedSkills: new Set(['y']) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('grant')
  })
  it('trifecta → blocked trifecta', () => {
    const r = enforcePermissions({
      step: step({ permissionScopes: ['data:send'], permissionClass: 'external', dataSensitivity: 'confidential' }),
      callerScopes: ['*'],
      grantedSkills: new Set(),
      hasUntrustedInput: true,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('trifecta')
  })
})
