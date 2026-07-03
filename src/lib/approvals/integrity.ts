// Approval bütünlüğü — SAF çekirdek (§13). DB'siz → tam test edilebilir. digest +
// idempotency + expiry mantığı burada; DB yüzeyi approvals/repo.ts'te. gate.ts'in
// computeActionDigest/redactPreview yardımcıları compile-time paylaşılır (tek kaynak).

import { createHash } from 'node:crypto'
import { computeActionDigest, redactPreview } from '../brain/gate'
import type { RiskLevel, DataSensitivity } from '../brain/types'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'executed'

// 24 saat: onay penceresi. Süre dolunca karar isteği otomatik 'expired'.
export const DEFAULT_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000

export interface BuildApprovalParams {
  runId: string
  stepId: string
  action: string // handler_key / tool adı
  args: unknown // ONAYLANAN tam argümanlar (digest'e girer)
  previewText: string // operatöre gösterilecek ham metin (maskelenir)
  permissionScopes: string[]
  riskLevel: RiskLevel
  dataSensitivity: DataSensitivity
  nowMs: number // saf: dış saat enjekte edilir (Date.now repo katmanında)
  ttlMs?: number
}

export interface ApprovalDraft {
  runId: string
  stepId: string
  action: string
  actionDigest: string
  redactedPreview: string
  idempotencyKey: string
  expiresAtMs: number
  permissionScopes: string[]
  riskLevel: RiskLevel
  dataSensitivity: DataSensitivity
}

// idempotency_key = (runId, stepId, actionDigest) türevi → aynı adım+eylem iki kez
// onay isteği üretmez (mig 043 UNIQUE ile birlikte çift-yürütme engeli).
export function computeIdempotencyKey(runId: string, stepId: string, actionDigest: string): string {
  return createHash('sha256').update(`${runId}::${stepId}::${actionDigest}`).digest('hex')
}

export function buildApprovalDraft(params: BuildApprovalParams): ApprovalDraft {
  const actionDigest = computeActionDigest(params.action, params.args)
  const ttl = params.ttlMs ?? DEFAULT_APPROVAL_TTL_MS
  return {
    runId: params.runId,
    stepId: params.stepId,
    action: params.action,
    actionDigest,
    redactedPreview: redactPreview(params.previewText),
    idempotencyKey: computeIdempotencyKey(params.runId, params.stepId, actionDigest),
    expiresAtMs: params.nowMs + ttl,
    permissionScopes: params.permissionScopes,
    riskLevel: params.riskLevel,
    dataSensitivity: params.dataSensitivity,
  }
}

export function isExpired(expiresAtMs: number, nowMs: number): boolean {
  return nowMs >= expiresAtMs
}

// BÜTÜNLÜK KİLİDİ (§13): yürütme anında gerçek eylemi yeniden digest'le, onaylanan
// digest'le eşleşmiyorsa reddet — "X onayla, Y çalıştır" imkânsız.
export function verifyExecutionDigest(approvedDigest: string | null, action: string, args: unknown): boolean {
  if (!approvedDigest) return false
  return computeActionDigest(action, args) === approvedDigest
}

export interface ExecuteGuardInput {
  status: ApprovalStatus
  approvedDigest: string | null
  expiresAtMs: number
  action: string
  args: unknown
  nowMs: number
}

export interface ExecuteGuardResult {
  allowed: boolean
  reason: string
}

// Yürütmeden önce SON kapı: onaylı + süresi geçmemiş + digest eşleşir + henüz
// yürütülmemiş. Aksi → yürütme reddedilir (yan-etki yok).
export function canExecuteApproval(input: ExecuteGuardInput): ExecuteGuardResult {
  if (input.status === 'executed') return { allowed: false, reason: 'zaten yürütüldü (idempotent)' }
  if (input.status !== 'approved') return { allowed: false, reason: `onaylı değil (${input.status})` }
  if (isExpired(input.expiresAtMs, input.nowMs)) return { allowed: false, reason: 'onay süresi doldu' }
  if (!verifyExecutionDigest(input.approvedDigest, input.action, input.args)) {
    return { allowed: false, reason: 'digest eşleşmiyor — onaylanan eylem ≠ yürütülen' }
  }
  return { allowed: true, reason: 'onaylı + digest eşleşti' }
}
