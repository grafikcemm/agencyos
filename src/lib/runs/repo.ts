// Kanonik run/step yazma yüzeyi (repository). Yeni kod bu API üzerinden
// `directives`(run) + `agent_tasks`(step) + `run_step_dependencies` yazar/okur.
// `runs`/`run_steps` view'ları okuma içindir. Faz 0'da bu yüzey KURULUR ama canlı
// yol (agents/orchestrator) henüz buna geçmez (parity için ayrı faz) — bu yüzden
// bu modül prod davranışını değiştirmez; foundation + gelecek Brain v2 içindir.

import { supabaseAdmin } from '../supabase'
import type { DepEdge } from './deps'
import { normalizeMode, type RunMode } from './steps'

export interface CreateRunInput {
  operatorInput: string
  intent?: string | null
  successCriteria?: unknown
  channel?: string | null
  mode?: RunMode
  budgetUsdMax?: number | null
}

export interface CreateStepInput {
  runId: string
  agentKey: string
  title: string
  input?: unknown
  skillSlug?: string | null
  parentStepId?: string | null
  permissionScopes?: string[] | null
  riskLevel?: string | null
  dataSensitivity?: string | null
}

// directives satırı = kanonik run. Yeni sütunlar (mig 038) doldurulur.
export async function createRun(input: CreateRunInput): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('directives')
    .insert({
      operator_input: input.operatorInput,
      intent: input.intent ?? null,
      success_criteria: input.successCriteria ?? null,
      channel: input.channel ?? null,
      mode: normalizeMode(input.mode),
      budget_usd_max: input.budgetUsdMax ?? null,
    })
    .select('id')
    .single()
  if (error) {
    console.error('[runs.repo] createRun failed:', error.message)
    return null
  }
  return { id: data.id as string }
}

// agent_tasks satırı = kanonik step.
export async function addStep(input: CreateStepInput): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('agent_tasks')
    .insert({
      directive_id: input.runId,
      agent_key: input.agentKey,
      title: input.title,
      input: input.input ?? {},
      skill_slug: input.skillSlug ?? null,
      parent_step_id: input.parentStepId ?? null,
      permission_scopes: input.permissionScopes ?? null,
      risk_level: input.riskLevel ?? null,
      data_sensitivity: input.dataSensitivity ?? null,
    })
    .select('id')
    .single()
  if (error) {
    console.error('[runs.repo] addStep failed:', error.message)
    return null
  }
  return { id: data.id as string }
}

export async function addDependencies(edges: DepEdge[]): Promise<boolean> {
  if (edges.length === 0) return true
  const { error } = await supabaseAdmin.from('run_step_dependencies').insert(
    edges.map((e) => ({ step_id: e.stepId, depends_on_step_id: e.dependsOnStepId }))
  )
  if (error) {
    console.error('[runs.repo] addDependencies failed:', error.message)
    return false
  }
  return true
}

// Okuma: kanonik view'lar üzerinden.
export async function getRun(runId: string) {
  const { data } = await supabaseAdmin.from('runs').select('*').eq('id', runId).maybeSingle()
  return data
}

export async function listSteps(runId: string) {
  const { data } = await supabaseAdmin
    .from('run_steps')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: true })
  return data ?? []
}
