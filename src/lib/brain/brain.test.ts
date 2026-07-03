import { describe, it, expect } from 'vitest'
import { deriveGoal } from './intake'
import { buildPlan, MAX_STEPS } from './plan'
import { classifyScopes, gateDecision, computeActionDigest, redactPreview } from './gate'
import { verifyFindings, type Finding } from './verify'
import { runBrainShadow, isBrainV2Enabled } from './index'

describe('brain/intake deriveGoal', () => {
  it('selam → trivial life', () => {
    const g = deriveGoal('Selam', 'web')
    expect(g.trivial).toBe(true)
    expect(g.route).toBe('life')
  })
  it('iş sorusu → business, trivial değil', () => {
    const g = deriveGoal('Retainer müşteri için teklif hazırla', 'web')
    expect(g.route).toBe('business')
    expect(g.trivial).toBe(false)
  })
  it('sistem anahtarı → system route', () => {
    const g = deriveGoal('cron deploy migration durumunu göster', 'web')
    expect(g.route).toBe('system')
  })
})

describe('brain/plan buildPlan', () => {
  it('trivial → tek read adımı', () => {
    const steps = buildPlan(deriveGoal('Selam', 'web'))
    expect(steps).toHaveLength(1)
    expect(steps[0].dependsOn).toEqual([])
  })
  it('business → bağımlı DAG (research→analyze→draft)', () => {
    const steps = buildPlan(deriveGoal('Retainer müşteri için teklif hazırla', 'web'))
    expect(steps.length).toBeGreaterThan(1)
    expect(steps.length).toBeLessThanOrEqual(MAX_STEPS)
    // son adım öncekine bağlı
    expect(steps[steps.length - 1].dependsOn.length).toBeGreaterThan(0)
  })
})

describe('brain/gate classifyScopes', () => {
  it('precedence spend>external>write>read', () => {
    expect(classifyScopes(['leads:read'])).toBe('read')
    expect(classifyScopes(['leads:read', 'outreach:write'])).toBe('write')
    expect(classifyScopes(['outreach:send'])).toBe('external')
    expect(classifyScopes(['openrouter:spend', 'outreach:send'])).toBe('spend')
  })
  it('gateDecision: read+low+internal auto; write onay', () => {
    const read = gateDecision({ id: 's', permissionClass: 'read', riskLevel: 'low', dataSensitivity: 'internal' } as never)
    expect(read.auto).toBe(true)
    const write = gateDecision({ id: 's', permissionClass: 'write', riskLevel: 'medium', dataSensitivity: 'confidential' } as never)
    expect(write.auto).toBe(false)
  })
})

describe('brain/gate digest + redaction', () => {
  it('digest anahtar sırasından bağımsız (kararlı)', () => {
    const a = computeActionDigest('send', { to: 'x', body: 'y' })
    const b = computeActionDigest('send', { body: 'y', to: 'x' })
    expect(a).toBe(b)
  })
  it('farklı eylem farklı digest', () => {
    expect(computeActionDigest('send', { to: 'x' })).not.toBe(computeActionDigest('send', { to: 'z' }))
  })
  it('redactPreview sır/email maskeler', () => {
    const r = redactPreview('key sk-abcdef123456 mail a@b.com')
    expect(r).not.toContain('sk-abcdef123456')
    expect(r).not.toContain('a@b.com')
  })
})

describe('brain/verify verifyFindings', () => {
  it('kanıtsız bulgu reddedilir', () => {
    const findings: Finding[] = [
      { claim: 'x', evidenceId: 'e1', severity: 'low' },
      { claim: 'y', evidenceId: null, severity: 'high' },
    ]
    const r = verifyFindings(findings, new Set(['e1']))
    expect(r.upheld).toHaveLength(1)
    expect(r.rejected).toHaveLength(1)
    expect(r.verdict).toBe('pass')
  })
  it('yüksek-önem geçerli bulgu → needs_review', () => {
    const r = verifyFindings([{ claim: 'z', evidenceId: 'e1', severity: 'high' }], new Set(['e1']))
    expect(r.verdict).toBe('needs_review')
  })
  it('hepsi kanıtsız → reject', () => {
    const r = verifyFindings([{ claim: 'z', evidenceId: null, severity: 'low' }], new Set())
    expect(r.verdict).toBe('reject')
  })
})

describe('brain/index runBrainShadow', () => {
  it('flag varsayılan kapalı', () => {
    expect(isBrainV2Enabled()).toBe(false)
  })
  it('shadow: hiçbir write yok, gate sınıflandırır', () => {
    const r = runBrainShadow('Retainer müşteri için teklif hazırla', 'web')
    expect(r.mode).toBe('shadow')
    expect(r.order.length).toBe(r.steps.length)
    // business planında en az bir onay-gerektiren (write) adım olmalı
    expect(r.wouldRequestApproval.length).toBeGreaterThan(0)
    expect(r.notes[0]).toContain('shadow')
  })
  it('trivial → tek auto read adımı, onay yok', () => {
    const r = runBrainShadow('Selam', 'web')
    expect(r.wouldExecute).toHaveLength(1)
    expect(r.wouldRequestApproval).toHaveLength(0)
  })
})
