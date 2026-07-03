import { describe, it, expect } from 'vitest'
import {
  buildApprovalDraft,
  verifyExecutionDigest,
  isExpired,
  canExecuteApproval,
  computeIdempotencyKey,
  DEFAULT_APPROVAL_TTL_MS,
} from './integrity'

const base = {
  runId: 'run-1',
  stepId: 'step-1',
  action: 'sales.draft_proposal',
  args: { leadId: 'L1', serviceSlug: 'web' },
  previewText: 'Teklif taslağı: müşteri@firma.com için sk-secret123456 anahtarıyla',
  permissionScopes: ['outreach:write'],
  riskLevel: 'high' as const,
  dataSensitivity: 'confidential' as const,
  nowMs: 1_000_000,
}

describe('approval integrity (§13)', () => {
  it('draft: digest + idempotency + expiry + redaction', () => {
    const d = buildApprovalDraft(base)
    expect(d.actionDigest).toHaveLength(64) // sha256 hex
    expect(d.idempotencyKey).toBe(computeIdempotencyKey('run-1', 'step-1', d.actionDigest))
    expect(d.expiresAtMs).toBe(base.nowMs + DEFAULT_APPROVAL_TTL_MS)
    expect(d.redactedPreview).not.toContain('sk-secret123456')
    expect(d.redactedPreview).not.toContain('müşteri@firma.com')
  })

  it('digest argüman anahtar sırasından bağımsız (kararlı)', () => {
    const a = buildApprovalDraft(base)
    const b = buildApprovalDraft({ ...base, args: { serviceSlug: 'web', leadId: 'L1' } })
    expect(a.actionDigest).toBe(b.actionDigest)
  })

  it('verifyExecutionDigest: eşleşme / kurcalama / null', () => {
    const d = buildApprovalDraft(base)
    expect(verifyExecutionDigest(d.actionDigest, base.action, base.args)).toBe(true)
    expect(verifyExecutionDigest(d.actionDigest, base.action, { leadId: 'L2' })).toBe(false)
    expect(verifyExecutionDigest(d.actionDigest, 'other.action', base.args)).toBe(false)
    expect(verifyExecutionDigest(null, base.action, base.args)).toBe(false)
  })

  it('isExpired sınır', () => {
    expect(isExpired(1000, 999)).toBe(false)
    expect(isExpired(1000, 1000)).toBe(true)
    expect(isExpired(1000, 1001)).toBe(true)
  })

  it('canExecuteApproval: onaylı+eşleşen+süreli → izin', () => {
    const d = buildApprovalDraft(base)
    const r = canExecuteApproval({
      status: 'approved',
      approvedDigest: d.actionDigest,
      expiresAtMs: d.expiresAtMs,
      action: base.action,
      args: base.args,
      nowMs: base.nowMs + 1000,
    })
    expect(r.allowed).toBe(true)
  })

  it('canExecuteApproval: pending/expired/mismatch/executed → red', () => {
    const d = buildApprovalDraft(base)
    const common = { approvedDigest: d.actionDigest, action: base.action, args: base.args }
    expect(
      canExecuteApproval({ ...common, status: 'pending', expiresAtMs: d.expiresAtMs, nowMs: base.nowMs }).allowed
    ).toBe(false)
    expect(
      canExecuteApproval({ ...common, status: 'approved', expiresAtMs: base.nowMs, nowMs: base.nowMs + 1 }).allowed
    ).toBe(false)
    expect(
      canExecuteApproval({
        status: 'approved',
        approvedDigest: d.actionDigest,
        expiresAtMs: d.expiresAtMs,
        action: base.action,
        args: { leadId: 'TAMPERED' },
        nowMs: base.nowMs,
      }).allowed
    ).toBe(false)
    expect(
      canExecuteApproval({ ...common, status: 'executed', expiresAtMs: d.expiresAtMs, nowMs: base.nowMs }).allowed
    ).toBe(false)
  })
})
