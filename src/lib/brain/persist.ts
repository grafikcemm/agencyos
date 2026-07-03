// Brain v2 — PERSIST (§7/§8/§12). Sonuç + durum yazımı; depolamadan önce redaction
// (ham çıktı sır-strip + özet). Kanonik step = agent_tasks. active mode (active.ts)
// kullanır. governance (retention/provenance/quarantine) Faz 4'te genişler.

import { supabaseAdmin } from '../supabase'
import { redactPreview } from './gate'
import type { StepStatus } from '../runs/steps'

// Ham sonucu depolanabilir güvenli özete indir (sır/token/email maskeli).
export function summarizeForStorage(result: unknown, maxLen = 2000): string {
  let raw: string
  try {
    raw = typeof result === 'string' ? result : JSON.stringify(result)
  } catch {
    raw = String(result)
  }
  return redactPreview(raw, maxLen)
}

export async function persistStepResult(stepId: string, status: StepStatus, result: unknown): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('agent_tasks')
    .update({
      status,
      result: { summary: summarizeForStorage(result) },
      finished_at: new Date().toISOString(),
    })
    .eq('id', stepId)
  if (error) {
    console.error('[brain.persist] persistStepResult failed:', error.message)
    return false
  }
  return true
}

export async function markStepBlockedOnApproval(stepId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('agent_tasks')
    .update({ status: 'blocked_on_approval' })
    .eq('id', stepId)
  if (error) {
    console.error('[brain.persist] markStepBlockedOnApproval failed:', error.message)
    return false
  }
  return true
}
