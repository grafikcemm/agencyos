// Brain v2 — ACTIVE mode orkestrasyonu (§5-§8, Faz 3). Kanonik run/step yazar, auto
// (güvenli read) adımları YÜRÜTÜR (yalnız sıfır-maliyet deterministik handler), diğer
// her adımı approval_requests'e gate'ler. GERÇEK gönderim/harcama onaysız İMKÂNSIZ.
// Flag BRAIN_ACTIVE_ENABLED default KAPALI → hiçbir mevcut yol etkilenmez.

import { deriveGoal } from './intake'
import { buildPlan } from './plan'
import { routePlan } from './route'
import {
  planActiveExecution,
  executeAutoStep,
  approvalActionForStep,
  type ActiveStepPlan,
  type ExecuteContext,
} from './execute'
import { markStepBlockedOnApproval, persistStepResult } from './persist'
import { buildApprovalDraft } from '../approvals/integrity'
import { createApprovalRequest } from '../approvals/repo'
import { createRun, addStep, addDependencies } from '../runs/repo'
import type { PlanStep } from './types'

export interface ActiveRunResult {
  runId: string | null
  outcomes: { stepId: string; kind: ActiveStepPlan['decision']['kind']; note: string }[]
  approvalsCreated: number
}

// nowMs enjekte edilebilir (test/deterministiklik); default Date.now (impure kabuk).
export async function runBrainActive(
  rawInput: string,
  channel: string,
  ctx: ExecuteContext,
  nowMs: number = Date.now()
): Promise<ActiveRunResult> {
  const goal = deriveGoal(rawInput, channel)
  const rawSteps = buildPlan(goal)
  const { steps, order } = routePlan(rawSteps)

  const run = await createRun({
    operatorInput: rawInput,
    intent: goal.intent,
    successCriteria: goal.successCriteria,
    channel,
    mode: 'active',
    budgetUsdMax: goal.budgetUsdMax,
  })
  if (!run) return { runId: null, outcomes: [], approvalsCreated: 0 }

  // Plan adım id (s0..) → DB step id eşlemesi.
  const dbIdByPlanId = new Map<string, string>()
  const stepById = new Map<string, PlanStep>(steps.map((s) => [s.id, s]))
  for (const id of order) {
    const step = stepById.get(id)
    if (!step) continue
    const created = await addStep({
      runId: run.id,
      agentKey: step.archetype,
      title: step.title,
      input: { planId: step.id },
      skillSlug: step.skillSlug,
      permissionScopes: step.permissionScopes,
      riskLevel: step.riskLevel,
      dataSensitivity: step.dataSensitivity,
    })
    if (created) dbIdByPlanId.set(step.id, created.id)
  }

  // Bağımlılık kenarları (DB id'lerle).
  const edges = steps.flatMap((s) =>
    s.dependsOn
      .map((dep) => ({ stepId: dbIdByPlanId.get(s.id), dependsOnStepId: dbIdByPlanId.get(dep) }))
      .filter((e): e is { stepId: string; dependsOnStepId: string } => Boolean(e.stepId && e.dependsOnStepId))
  )
  await addDependencies(edges)

  const plans = planActiveExecution(steps, order, ctx)
  const outcomes: ActiveRunResult['outcomes'] = []
  let approvalsCreated = 0
  // Bağımlılık kapısı: yalnız TÜM ancestor'ları 'done' olan adım yürütülür.
  // (Onay bekleyen / hata almış ancestor → downstream çalışmaz; DAG bunun için var.)
  const donePlanIds = new Set<string>()

  for (const { stepId, decision } of plans) {
    const dbId = dbIdByPlanId.get(stepId)
    const step = stepById.get(stepId)
    if (!dbId || !step) continue

    const unmetDep = step.dependsOn.find((dep) => !donePlanIds.has(dep))
    if (unmetDep) {
      await persistStepResult(dbId, 'error', {
        blockedByDependency: unmetDep,
        detail: 'bağımlı adım tamamlanmadı (done değil) — adım yürütülmedi',
      })
      outcomes.push({ stepId: dbId, kind: 'blocked', note: `bağımlılık bekliyor: ${unmetDep}` })
      continue
    }

    if (decision.kind === 'auto_run') {
      // Yalnız allowlist deterministik handler; arg-uyuşmazlığında hata → step error.
      try {
        // Handler girdisi adımın kendi input'u; yoksa goal (yalnız goal-şekilli
        // handler'lar — ör. orchestration.plan_decompose — bununla çalışır).
        const result = executeAutoStep(decision.handlerKey, step.input ?? goal)
        await persistStepResult(dbId, 'done', result)
        donePlanIds.add(step.id)
        outcomes.push({ stepId: dbId, kind: 'auto_run', note: `handler ${decision.handlerKey} çalıştı` })
      } catch (err) {
        await persistStepResult(dbId, 'error', { error: err instanceof Error ? err.message : String(err) })
        outcomes.push({ stepId: dbId, kind: 'auto_run', note: 'handler hata' })
      }
    } else if (decision.kind === 'auto_noop') {
      await persistStepResult(dbId, 'done', { noop: decision.reason })
      donePlanIds.add(step.id)
      outcomes.push({ stepId: dbId, kind: 'auto_noop', note: decision.reason })
    } else if (decision.kind === 'needs_approval') {
      const draft = buildApprovalDraft({
        runId: run.id,
        stepId: dbId,
        action: approvalActionForStep(step),
        args: { planId: step.id, title: step.title },
        previewText: `${step.title} — ${decision.reason}`,
        permissionScopes: step.permissionScopes,
        riskLevel: step.riskLevel,
        dataSensitivity: step.dataSensitivity,
        nowMs,
      })
      const created = await createApprovalRequest(draft)
      if (created) approvalsCreated++
      await markStepBlockedOnApproval(dbId)
      outcomes.push({ stepId: dbId, kind: 'needs_approval', note: decision.reason })
    } else {
      await persistStepResult(dbId, 'error', { blocked: decision.detail })
      outcomes.push({ stepId: dbId, kind: 'blocked', note: decision.detail })
    }
  }

  return { runId: run.id, outcomes, approvalsCreated }
}
