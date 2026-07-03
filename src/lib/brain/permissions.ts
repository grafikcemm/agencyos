// Brain v2 — izin zorlaması (§13). SAF → test edilebilir. Runner (execute.ts) bunu
// gate'ten ÖNCE uygular: (1) caller scope ⊇ adım scope, (2) grant var mı (agent_skill
// _grants), (3) lethal trifecta guard. Hiçbiri geçmezse adım bloke edilir.

import type { PlanStep, DataSensitivity } from './types'

const SENS_ORDER: Record<DataSensitivity, number> = { public: 0, internal: 1, confidential: 2, secret: 3 }

// caller scope kümesi adımın istediği tüm scope'ları kapsıyor mu? '*' = tümü.
export function scopeSatisfied(callerScopes: string[], requiredScopes: string[]): boolean {
  if (callerScopes.includes('*')) return true
  const have = new Set(callerScopes)
  return requiredScopes.every((s) => have.has(s))
}

// Ajan yalnız agent_skill_grants'taki skill'i çağırabilir (§6/§13). grant kümesi boşsa
// (grant modeli devrede değil) → serbest; doluysa üyelik zorunlu.
export function grantSatisfied(skillSlug: string | null, grantedSkills: Set<string>): boolean {
  if (!skillSlug) return true
  if (grantedSkills.size === 0) return true
  return grantedSkills.has(skillSlug)
}

// Lethal trifecta (Simon Willison): tek adım aynı anda confidential+ okuma + güvenilmez
// içerik + dış-gönderim taşıyamaz → checkpoint zorunlu (yürütme reddi).
export interface TrifectaInput {
  permissionClass: PlanStep['permissionClass']
  dataSensitivity: DataSensitivity
  hasUntrustedInput: boolean
}

export function hasLethalTrifecta(input: TrifectaInput): boolean {
  const confidentialRead = SENS_ORDER[input.dataSensitivity] >= SENS_ORDER.confidential
  const externalSend = input.permissionClass === 'external' || input.permissionClass === 'spend'
  return confidentialRead && externalSend && input.hasUntrustedInput
}

export type PermissionOutcome =
  | { ok: true }
  | { ok: false; reason: 'scope' | 'grant' | 'trifecta'; detail: string }

export interface EnforceInput {
  step: PlanStep
  callerScopes: string[]
  grantedSkills: Set<string>
  hasUntrustedInput?: boolean
}

// Tek kapı: scope → grant → trifecta sırasıyla. İlk başarısız olan bloke eder.
export function enforcePermissions(input: EnforceInput): PermissionOutcome {
  const { step } = input
  if (!scopeSatisfied(input.callerScopes, step.permissionScopes)) {
    return { ok: false, reason: 'scope', detail: `izin dışı scope: ${step.permissionScopes.join(',')}` }
  }
  if (!grantSatisfied(step.skillSlug, input.grantedSkills)) {
    return { ok: false, reason: 'grant', detail: `grant yok: ${step.skillSlug}` }
  }
  if (
    hasLethalTrifecta({
      permissionClass: step.permissionClass,
      dataSensitivity: step.dataSensitivity,
      hasUntrustedInput: input.hasUntrustedInput ?? false,
    })
  ) {
    return { ok: false, reason: 'trifecta', detail: 'lethal trifecta — checkpoint zorunlu' }
  }
  return { ok: true }
}
