// Brain v2 — EXECUTE karar çekirdeği (§5/§7 active mode). SAF → test edilebilir.
// Bir adım için: izin zorla → gate (auto?) → skill türü. GÜVENLİK: auto-run yalnız
// SIFIR-maliyet + deterministik + allowlist'li handler için; maliyetli/write/external/
// spend her zaman approval. Gerçek gönderim/harcama onaysız imkânsız (flag açıkken bile).

import type { PlanStep } from './types'
import { gateDecision } from './gate'
import { enforcePermissions } from './permissions'
import { getSkill } from '../skills/registry'
import { SKILL_HANDLERS } from '../skills/registry'

export type ExecutionDecision =
  | { kind: 'auto_run'; handlerKey: string }
  | { kind: 'auto_noop'; reason: string }
  | { kind: 'needs_approval'; reason: string }
  | { kind: 'blocked'; reason: 'scope' | 'grant' | 'trifecta'; detail: string }

export interface ExecuteContext {
  callerScopes: string[]
  grantedSkills: Set<string>
  hasUntrustedInput?: boolean
}

export function decideStepExecution(step: PlanStep, ctx: ExecuteContext): ExecutionDecision {
  // 1) İzin kapısı (scope → grant → trifecta) — ilk bloke eden kazanır.
  const perm = enforcePermissions({
    step,
    callerScopes: ctx.callerScopes,
    grantedSkills: ctx.grantedSkills,
    hasUntrustedInput: ctx.hasUntrustedInput,
  })
  if (!perm.ok) return { kind: 'blocked', reason: perm.reason, detail: perm.detail }

  // 2) Gate: yalnız güvenli read otomatik (§13).
  const gate = gateDecision(step)
  if (!gate.auto) return { kind: 'needs_approval', reason: gate.reason }

  // 3) Auto (read) dalı: yalnız sıfır-maliyet deterministik allowlist handler çalışır.
  const skill = step.skillSlug ? getSkill(step.skillSlug) : undefined
  if (!skill) return { kind: 'auto_noop', reason: 'skill yok — deterministik yürütme yok' }
  if (skill.budgetUsdMax > 0) return { kind: 'needs_approval', reason: 'maliyetli skill — onay gerekli' }
  if (skill.kind === 'deterministic' && skill.handlerKey && skill.handlerKey in SKILL_HANDLERS) {
    return { kind: 'auto_run', handlerKey: skill.handlerKey }
  }
  return { kind: 'auto_noop', reason: `deterministik/allowlist değil (${skill.kind})` }
}

// Auto adımı gerçekten yürüt — YALNIZ allowlist deterministik handler. Dış-çağrı/LLM yok.
export function executeAutoStep(handlerKey: string, input: unknown): unknown {
  const handler = SKILL_HANDLERS[handlerKey]
  if (!handler) throw new Error(`handler allowlist dışı: ${handlerKey}`)
  return handler(input)
}

// needs_approval adımı için onay eyleminin kanonik adı (digest'e girer).
export function approvalActionForStep(step: PlanStep): string {
  return step.skillSlug ?? `archetype:${step.archetype}`
}

export interface ActiveStepPlan {
  stepId: string
  decision: ExecutionDecision
}

// Topolojik sırada her adımın yürütme kararı (SAF). active.ts bunu DB'ye uygular.
export function planActiveExecution(steps: PlanStep[], order: string[], ctx: ExecuteContext): ActiveStepPlan[] {
  const byId = new Map(steps.map((s) => [s.id, s]))
  const plans: ActiveStepPlan[] = []
  for (const id of order) {
    const step = byId.get(id)
    if (!step) continue
    plans.push({ stepId: step.id, decision: decideStepExecution(step, ctx) })
  }
  return plans
}
