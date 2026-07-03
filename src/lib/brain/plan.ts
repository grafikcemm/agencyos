// Brain v2 — PLAN: hedeften bağımlı görev DAG'ı (§4 adım 3). Faz 1 shadow'da
// deterministik (LLM'siz) dekompozisyon; her adım kanonik step alanlarını taşır.
// Sert tavan: ≤5 adım / ≤7 skill (plan §11).

import type { Goal, PlanStep, Archetype, ModelTier, RiskLevel, DataSensitivity } from './types'

export const MAX_STEPS = 5
export const MAX_SKILLS = 7

interface StepSpec {
  title: string
  archetype: Archetype
  skillSlug: string | null
  tier: ModelTier
  dependsOnIdx: number[]
  permissionScopes: string[]
  riskLevel: RiskLevel
  dataSensitivity: DataSensitivity
}

function trivialPlan(goal: Goal): StepSpec[] {
  return [
    {
      title: goal.intent === 'meta' ? 'Yetenekleri açıkla' : 'Doğrudan yanıt',
      archetype: 'router',
      skillSlug: null,
      tier: 'light',
      dependsOnIdx: [],
      permissionScopes: ['assistant:read'],
      riskLevel: 'low',
      dataSensitivity: 'internal',
    },
  ]
}

function businessPlan(): StepSpec[] {
  // research(read) → analyze(read, dep 0) → draft(write, dep 1)
  return [
    {
      title: 'İlgili veriyi/ kanıtı topla',
      archetype: 'researcher',
      skillSlug: null,
      tier: 'light',
      dependsOnIdx: [],
      permissionScopes: ['leads:read', 'metrics:read'],
      riskLevel: 'low',
      dataSensitivity: 'internal',
    },
    {
      title: 'Analiz + öneri üret',
      archetype: 'specialist',
      skillSlug: null,
      tier: 'medium',
      dependsOnIdx: [0],
      permissionScopes: ['leads:read'],
      riskLevel: 'low',
      dataSensitivity: 'internal',
    },
    {
      title: 'Taslak/çıktı hazırla (onay gerektirir)',
      archetype: 'executor',
      skillSlug: null,
      tier: 'medium',
      dependsOnIdx: [1],
      permissionScopes: ['outreach:write'],
      riskLevel: 'medium',
      dataSensitivity: 'confidential',
    },
  ]
}

function lifePlan(): StepSpec[] {
  return [
    {
      title: 'Mentor yanıtı üret',
      archetype: 'specialist',
      skillSlug: null,
      tier: 'light',
      dependsOnIdx: [],
      permissionScopes: ['assistant:read'],
      riskLevel: 'low',
      dataSensitivity: 'internal',
    },
  ]
}

export function buildPlan(goal: Goal): PlanStep[] {
  let specs: StepSpec[]
  if (goal.trivial) specs = trivialPlan(goal)
  else if (goal.route === 'business' || goal.route === 'system') specs = businessPlan()
  else specs = lifePlan()

  // Sert tavan (§11): asla >MAX_STEPS.
  specs = specs.slice(0, MAX_STEPS)

  const steps: PlanStep[] = specs.map((s, i) => ({
    id: `s${i}`,
    title: s.title,
    archetype: s.archetype,
    skillSlug: s.skillSlug,
    tier: s.tier,
    dependsOn: s.dependsOnIdx.map((idx) => `s${idx}`),
    permissionScopes: s.permissionScopes,
    permissionClass: 'read', // route.ts scope'lardan türetip doldurur
    riskLevel: s.riskLevel,
    dataSensitivity: s.dataSensitivity,
  }))

  return steps
}
