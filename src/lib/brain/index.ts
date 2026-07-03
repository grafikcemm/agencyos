// Brain v2 — orkestratör (§4-§8). Faz 1: yalnız SHADOW (read-only). intake → plan
// → route → gate(sınıflandır) → "would-do" kaydı. HİÇBİR write/dış-çağrı/LLM yok.
// active mode (write/gate yürütme + persist) Faz 3'te açılır. Flag varsayılan KAPALI
// → hiçbir mevcut yol (JARVIS/mentor/council) etkilenmez.

import type { BrainShadowResult, RunMode } from './types'
import { deriveGoal } from './intake'
import { buildPlan } from './plan'
import { routePlan } from './route'
import { gateDecision } from './gate'
import { runBrainActive, type ActiveRunResult } from './active'
import type { ExecuteContext } from './execute'

export function isBrainV2Enabled(): boolean {
  return process.env.BRAIN_V2_ENABLED === 'true'
}

// Faz 3: active mode ayrı bayrak (BRAIN_V2 açık olsa da active default KAPALI).
export function isBrainActiveEnabled(): boolean {
  return process.env.BRAIN_ACTIVE_ENABLED === 'true'
}

// Tek-operatör varsayılan bağlamı: tüm scope + grant modeli henüz zorlanmaz (boş küme
// = serbest, mig 041 agent_skill_grants dolunca daralır).
const DEFAULT_ACTIVE_CTX: ExecuteContext = { callerScopes: ['*'], grantedSkills: new Set(), hasUntrustedInput: false }

// Saf + deterministik (DB/LLM yok) → tam test edilebilir. Shadow parity kapısı bunu
// mevcut yolların kararlarıyla kıyaslar (Faz 4 eval).
export function runBrainShadow(rawInput: string, channel: string): BrainShadowResult {
  const goal = deriveGoal(rawInput, channel)
  const rawSteps = buildPlan(goal)
  const { steps, order, notes } = routePlan(rawSteps)
  const gates = steps.map(gateDecision)
  const wouldExecute = gates.filter((g) => g.auto).map((g) => g.stepId)
  const wouldRequestApproval = gates.filter((g) => !g.auto).map((g) => g.stepId)
  return {
    mode: 'shadow',
    goal,
    steps,
    order,
    gates,
    wouldExecute,
    wouldRequestApproval,
    notes: ['shadow: hiçbir write/dış-çağrı yapılmadı', ...notes],
  }
}

// Kanal adaptörleri buraya girer. mode='active' + flag açık → gerçek run/step yazımı +
// gated yürütme (active.ts). Aksi → shadow (yalnız gözlem). Flag kapalıysa active
// istense bile güvenli şekilde shadow'a düşer.
export async function runBrain(
  rawInput: string,
  channel: string,
  mode: RunMode = 'shadow'
): Promise<BrainShadowResult | ActiveRunResult> {
  if (mode === 'active' && isBrainActiveEnabled()) {
    return runBrainActive(rawInput, channel, DEFAULT_ACTIVE_CTX)
  }
  return runBrainShadow(rawInput, channel)
}

export * from './types'
export { deriveGoal } from './intake'
export { buildPlan } from './plan'
export { routePlan } from './route'
export { classifyScopes, gateDecision, computeActionDigest, redactPreview } from './gate'
export { verifyFindings } from './verify'
export { enforcePermissions, scopeSatisfied, grantSatisfied, hasLethalTrifecta } from './permissions'
export { decideStepExecution, executeAutoStep, planActiveExecution } from './execute'
export { runBrainActive, type ActiveRunResult } from './active'
