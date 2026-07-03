// Brain v2 — ROUTE: her adıma permission sınıfı doldurur + topolojik sıra üretir
// (§4 adım 4). run_step_dependencies grafiği (deps.ts) üzerinden.

import type { PlanStep } from './types'
import { classifyScopes } from './gate'
import { topoSort, type DepEdge } from '../runs/deps'
import { MAX_SKILLS } from './plan'

export interface RoutedPlan {
  steps: PlanStep[]
  order: string[]
  notes: string[]
}

export function routePlan(rawSteps: PlanStep[]): RoutedPlan {
  const notes: string[] = []

  // permission_class'ı scope'lardan türet.
  const steps = rawSteps.map((s) => ({ ...s, permissionClass: classifyScopes(s.permissionScopes) }))

  // Skill sert tavanı (§11): benzersiz skill sayısı ≤ MAX_SKILLS.
  const skills = new Set(steps.map((s) => s.skillSlug).filter(Boolean) as string[])
  if (skills.size > MAX_SKILLS) {
    notes.push(`skill tavanı aşıldı (${skills.size} > ${MAX_SKILLS}) — fazlası reddedildi`)
  }

  // DAG topolojik sırası; çevrim → deterministik giriş sırasına düş + not.
  const edges: DepEdge[] = steps.flatMap((s) => s.dependsOn.map((d) => ({ stepId: s.id, dependsOnStepId: d })))
  const topo = topoSort(steps.map((s) => s.id), edges)
  let order: string[]
  if (topo.ok) {
    order = topo.order
  } else {
    order = steps.map((s) => s.id)
    notes.push(`bağımlılık çevrimi: ${topo.cycle.join(',')} — giriş sırası kullanıldı`)
  }

  return { steps, order, notes }
}
