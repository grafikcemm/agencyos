// Kanonik run/step tipleri + saf yürütme-uygunluk mantığı.
// Kanonik model = mevcut `directives`(run) + `agent_tasks`(step) genişletilmiş
// (plan §8). Buradaki tipler `run_steps`/`runs` view kolonlarını yansıtır.

import type { DepEdge } from './deps'

export type RunMode = 'shadow' | 'active'
export type StepStatus = 'queued' | 'working' | 'done' | 'error' | 'blocked_on_approval'

export interface RunStep {
  id: string
  runId: string
  parentStepId: string | null
  agentKey: string
  skillSlug: string | null
  title: string
  status: StepStatus
  permissionScopes: string[]
  riskLevel: string | null
  dataSensitivity: string | null
  attempts: number
  maxAttempts: number
}

export interface RunHeader {
  id: string
  operatorInput: string
  intent: string | null
  channel: string | null
  mode: RunMode
  status: string
}

// Migration 038 backfill semantiği: mode yoksa 'active', geçersizse 'active'.
export function normalizeMode(mode?: string | null): RunMode {
  return mode === 'shadow' ? 'shadow' : 'active'
}

// Bağımlılıkları tamamlanmış (deps hepsi 'done') ve kendisi 'queued' olan adımlar.
// Yürütücü (brain/execute, Faz 1+) bir sonraki paralel-güvenli partiyi buradan alır.
export function nextRunnableSteps<T extends { id: string; status: StepStatus }>(
  steps: T[],
  edges: DepEdge[]
): T[] {
  const statusById = new Map(steps.map((s) => [s.id, s.status]))
  const depsByStep = new Map<string, string[]>()
  for (const e of edges) {
    if (!depsByStep.has(e.stepId)) depsByStep.set(e.stepId, [])
    depsByStep.get(e.stepId)!.push(e.dependsOnStepId)
  }
  return steps.filter((s) => {
    if (s.status !== 'queued') return false
    const deps = depsByStep.get(s.id) ?? []
    return deps.every((d) => statusById.get(d) === 'done')
  })
}

// Retry uygunluğu (lease/backoff, ADR-001). attempts < maxAttempts → tekrar denenebilir.
export function canRetry(step: Pick<RunStep, 'attempts' | 'maxAttempts'>): boolean {
  return step.attempts < step.maxAttempts
}
