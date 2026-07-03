// Approval DB yüzeyi (repository). approvals/integrity.ts SAF mantığı üretir; bu modül
// approval_requests (mig 043) tablosuna yazar/okur. Politikasız-RLS → service-role
// (supabaseAdmin) bypass. Onay anında approved_digest = action_digest sabitlenir (§13).

import { supabaseAdmin } from '../supabase'
import type { ApprovalDraft } from './integrity'

export interface ApprovalRow {
  id: string
  run_id: string | null
  step_id: string | null
  action: string
  action_digest: string
  approved_digest: string | null
  redacted_preview: string
  status: string
  expires_at: string
}

// Idempotent: aynı idempotency_key ikinci kez eklenmez (mig 043 UNIQUE + ignoreDuplicates).
export async function createApprovalRequest(draft: ApprovalDraft): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('approval_requests')
    .upsert(
      {
        run_id: draft.runId,
        step_id: draft.stepId,
        action: draft.action,
        action_digest: draft.actionDigest,
        redacted_preview: draft.redactedPreview,
        idempotency_key: draft.idempotencyKey,
        expires_at: new Date(draft.expiresAtMs).toISOString(),
        permission_scopes: draft.permissionScopes,
        risk_level: draft.riskLevel,
        data_sensitivity: draft.dataSensitivity,
        status: 'pending',
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true }
    )
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('[approvals.repo] createApprovalRequest failed:', error.message)
    return null
  }
  return data ? { id: data.id as string } : null
}

export async function getApproval(id: string): Promise<ApprovalRow | null> {
  const { data } = await supabaseAdmin.from('approval_requests').select('*').eq('id', id).maybeSingle()
  return (data as ApprovalRow) ?? null
}

export async function listPendingApprovals(): Promise<ApprovalRow[]> {
  const { data } = await supabaseAdmin
    .from('approval_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  return (data as ApprovalRow[]) ?? []
}

// Onay: approved_digest = action_digest (yürütme eşleşme kilidi). Yalnız 'pending' →
// karar; süresi geçmişse çağıran expireStale ile 'expired' yapar.
export async function decideApproval(
  id: string,
  decision: 'approved' | 'rejected',
  decidedBy: string
): Promise<boolean> {
  const row = await getApproval(id)
  if (!row || row.status !== 'pending') return false
  const patch: Record<string, unknown> = {
    status: decision,
    decided_at: new Date().toISOString(),
    decided_by: decidedBy,
  }
  if (decision === 'approved') patch.approved_digest = row.action_digest
  const { error } = await supabaseAdmin.from('approval_requests').update(patch).eq('id', id).eq('status', 'pending')
  if (error) {
    console.error('[approvals.repo] decideApproval failed:', error.message)
    return false
  }
  return true
}

export async function markApprovalExecuted(id: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('approval_requests')
    .update({ status: 'executed', executed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'approved')
  if (error) {
    console.error('[approvals.repo] markApprovalExecuted failed:', error.message)
    return false
  }
  return true
}

// Bayat pending onayları toplu 'expired' yapar (cleanup/cron).
export async function expireStaleApprovals(nowIso: string = new Date().toISOString()): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('approval_requests')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('expires_at', nowIso)
    .select('id')
  if (error) {
    console.error('[approvals.repo] expireStaleApprovals failed:', error.message)
    return 0
  }
  return data?.length ?? 0
}
