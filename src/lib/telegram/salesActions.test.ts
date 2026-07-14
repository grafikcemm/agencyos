import { describe, it, expect, vi, beforeEach } from 'vitest'

// FINAL PILOT BLOCKERS Faz 6 — imzalı satış aksiyonları: kart üretimi (mutasyon
// YOK) + kod'lu teyit → GERÇEK uygulama servisine dispatch. Tüm bağımlılıklar
// mocklu; DB/provider SIFIR.

let draftRow: Record<string, unknown> | null = { id: 'draft-1', subject: 'Konu', status: 'draft' }
let draftError: { message: string } | null = null
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => {
      const api: Record<string, unknown> = {}
      Object.assign(api, {
        select: () => api, eq: () => api, order: () => api, limit: () => api,
        maybeSingle: async () => (draftError ? { data: null, error: draftError } : { data: draftRow, error: null }),
      })
      return api
    },
  },
}))

const decideApproval = vi.fn()
vi.mock('@/lib/approvals/repo', () => ({ decideApproval: (...a: unknown[]) => decideApproval(...a) }))

const sendGmailMessage = vi.fn()
const findSendApproval = vi.fn()
const reconcileOutreachSend = vi.fn()
vi.mock('@/lib/outreach/gmail', () => ({
  sendGmailMessage: (...a: unknown[]) => sendGmailMessage(...a),
  findSendApproval: (...a: unknown[]) => findSendApproval(...a),
  reconcileOutreachSend: (...a: unknown[]) => reconcileOutreachSend(...a),
}))

const decideProposalApproval = vi.fn()
const listProposalsForLead = vi.fn()
vi.mock('@/lib/proposals/proposalService', () => ({
  decideProposalApproval: (...a: unknown[]) => decideProposalApproval(...a),
  listProposalsForLead: (...a: unknown[]) => listProposalsForLead(...a),
}))

const resolveCanonicalRecipient = vi.fn()
vi.mock('@/lib/contacts/contactService', () => ({ resolveCanonicalRecipient: (...a: unknown[]) => resolveCanonicalRecipient(...a) }))
vi.mock('@/lib/outreach/auditCompliance', () => ({ extractDomain: (e: string) => e.split('@')[1] ?? null }))

const setPendingAction = vi.fn()
const consumeSignedAction = vi.fn()
vi.mock('./pendingActions', () => ({
  setPendingAction: (...a: unknown[]) => setPendingAction(...a),
  consumeSignedAction: (...a: unknown[]) => consumeSignedAction(...a),
  makeConfirmCode: () => 'ABC234',
}))

import {
  stageSend, stageApprovalDecision, stageProposalDecision, stageReconcileDecision, confirmAndExecute,
} from './salesActions'

beforeEach(() => {
  draftRow = { id: 'draft-1', subject: 'Konu', status: 'draft' }
  draftError = null
  decideApproval.mockReset().mockResolvedValue(true)
  sendGmailMessage.mockReset().mockResolvedValue({ ok: true, dryRun: true })
  findSendApproval.mockReset().mockResolvedValue({ id: 'ap-1', status: 'approved' })
  reconcileOutreachSend.mockReset().mockResolvedValue({ ok: true, outcome: 'not_found_needs_confirmation' })
  decideProposalApproval.mockReset().mockResolvedValue({ ok: true })
  listProposalsForLead.mockReset().mockResolvedValue({ ok: true, proposals: [{ id: 'p-1', pendingApprovalVersion: 2 }] })
  resolveCanonicalRecipient.mockReset().mockResolvedValue({ email: 'alici@musteri.com', contactId: null, contactName: null, source: 'lead_email' })
  setPendingAction.mockReset().mockResolvedValue({ digest: 'dig123', mode: 'durable' })
  consumeSignedAction.mockReset()
})

describe('kart üretimi — mutasyon YOK, imzalı aksiyon + alıcı/domain gösterir', () => {
  it('stageSend: approved onay → send kartı (alıcı+domain+kod); setPendingAction sales_send', async () => {
    const c = await stageSend('chat', 'lead-1', 'Denta Klinik')
    expect(c.ok).toBe(true)
    expect(c.text).toContain('alici@musteri.com')
    expect(c.text).toContain('musteri.com') // domain
    expect(c.text).toContain('ABC234') // kod
    expect(c.text).toContain('dig123') // digest
    expect(sendGmailMessage).not.toHaveBeenCalled() // KART üretimi mutasyon değil
    const call = setPendingAction.mock.calls[0]
    expect(call[1]).toBe('sales_send')
    expect(call[2]).toMatchObject({ draftId: 'draft-1', approvalId: 'ap-1' })
    expect(call[4]).toBe('ABC234') // code arg
  })

  it('stageSend: onay approved DEĞİL → gönderim reddi (fail)', async () => {
    findSendApproval.mockResolvedValue({ id: 'ap-1', status: 'pending' })
    const c = await stageSend('chat', 'lead-1', 'Denta')
    expect(c.ok).toBe(false)
    expect(c.text).toContain("'approved'")
  })

  it('stageSend: alıcı yok → recipient_missing (gönderilemez)', async () => {
    resolveCanonicalRecipient.mockResolvedValue({ email: null, contactId: null, contactName: null, source: 'none' })
    const c = await stageSend('chat', 'lead-1', 'Denta')
    expect(c.ok).toBe(false)
    expect(c.text).toContain('recipient_missing')
  })

  it('stageApprovalDecision: pending onay → approval_decision kartı; ONAYLA ≠ GÖNDER notu', async () => {
    findSendApproval.mockResolvedValue({ id: 'ap-1', status: 'pending' })
    const c = await stageApprovalDecision('chat', 'lead-1', 'Denta', 'approved')
    expect(c.ok).toBe(true)
    expect(c.text).toContain('GÖNDERİM ayrı')
    expect(setPendingAction.mock.calls[0][1]).toBe('sales_approval_decision')
  })

  it('stageProposalDecision: onay-bekleyen teklif → proposal_decision kartı (v2)', async () => {
    const c = await stageProposalDecision('chat', 'lead-1', 'Denta', 'approved')
    expect(c.ok).toBe(true)
    expect(c.text).toContain('v2')
    expect(setPendingAction.mock.calls[0][2]).toMatchObject({ proposalId: 'p-1', version: 2, decision: 'approved' })
  })

  it('stageProposalDecision: onay-bekleyen teklif yok → fail', async () => {
    listProposalsForLead.mockResolvedValue({ ok: true, proposals: [{ id: 'p-1', pendingApprovalVersion: null }] })
    const c = await stageProposalDecision('chat', 'lead-1', 'Denta', 'approved')
    expect(c.ok).toBe(false)
  })

  it('stageReconcileDecision: confirmNotFound kartı', async () => {
    const c = await stageReconcileDecision('chat', 'lead-1', 'Denta', true)
    expect(c.ok).toBe(true)
    expect(c.text).toContain('GÖNDERİLMEDİ')
    expect(setPendingAction.mock.calls[0][2]).toMatchObject({ outreachMessageId: 'draft-1', confirmNotFound: true })
  })

  it('taslak yoksa → fail (kart üretilmez)', async () => {
    draftRow = null
    expect((await stageSend('chat', 'lead-1', 'Denta')).ok).toBe(false)
    expect((await stageReconcileDecision('chat', 'lead-1', 'Denta', false)).ok).toBe(false)
  })

  it('taslak sorgu hatası → fail (görünür)', async () => {
    draftError = { message: 'db down' }
    const c = await stageSend('chat', 'lead-1', 'Denta')
    expect(c.ok).toBe(false)
    expect(c.text).toContain('db down')
  })

  it('memory mode (LIFE 006 yok) → kart dayanıklılık uyarısı gösterir', async () => {
    setPendingAction.mockResolvedValue({ digest: 'd', mode: 'memory' })
    const c = await stageSend('chat', 'lead-1', 'Denta')
    expect(c.text).toContain('dayanıklı kayıt yok')
  })

  it('stageApprovalDecision: onay yok → fail (önce "onaya al")', async () => {
    findSendApproval.mockResolvedValue(null)
    const c = await stageApprovalDecision('chat', 'lead-1', 'Denta', 'approved')
    expect(c.ok).toBe(false)
    expect(c.text).toContain('onaya al')
  })

  it('stageApprovalDecision: onay zaten karara bağlı → fail', async () => {
    findSendApproval.mockResolvedValue({ id: 'ap-1', status: 'approved' })
    const c = await stageApprovalDecision('chat', 'lead-1', 'Denta', 'approved')
    expect(c.ok).toBe(false)
    expect(c.text).toContain("zaten")
  })

  it('stageApprovalDecision: findSendApproval throw → fail (görünür)', async () => {
    findSendApproval.mockRejectedValue(new Error('onay okunamadı'))
    const c = await stageApprovalDecision('chat', 'lead-1', 'Denta', 'rejected')
    expect(c.ok).toBe(false)
    expect(c.text).toContain('okunamadı')
  })

  it('stageSend: findSendApproval throw → fail', async () => {
    findSendApproval.mockRejectedValue(new Error('boom'))
    const c = await stageSend('chat', 'lead-1', 'Denta')
    expect(c.ok).toBe(false)
  })

  it('stageSend: onay yok → fail (önce onaya al)', async () => {
    findSendApproval.mockResolvedValue(null)
    const c = await stageSend('chat', 'lead-1', 'Denta')
    expect(c.ok).toBe(false)
    expect(c.text).toContain('onaya al')
  })

  it('stageProposalDecision: teklifler okunamadı → fail', async () => {
    listProposalsForLead.mockResolvedValue({ ok: false, proposals: [], error: 'db down' })
    const c = await stageProposalDecision('chat', 'lead-1', 'Denta', 'approved')
    expect(c.ok).toBe(false)
    expect(c.text).toContain('okunamadı')
  })

  it('stageReconcileDecision: not-confirm (aramayı çalıştır) kartı', async () => {
    const c = await stageReconcileDecision('chat', 'lead-1', 'Denta', false)
    expect(c.ok).toBe(true)
    expect(c.text).toContain('aramayı çalıştır')
  })

  it('stageApprovalDecision: taslak yok → fail', async () => {
    draftRow = null
    expect((await stageApprovalDecision('chat', 'lead-1', 'Denta', 'approved')).ok).toBe(false)
  })

  it('stageApprovalDecision: taslak sorgu hatası → fail', async () => {
    draftError = { message: 'x' }
    expect((await stageApprovalDecision('chat', 'lead-1', 'Denta', 'approved')).ok).toBe(false)
  })

  it('stageReconcileDecision: taslak sorgu hatası → fail', async () => {
    draftError = { message: 'x' }
    expect((await stageReconcileDecision('chat', 'lead-1', 'Denta', true)).ok).toBe(false)
  })

  it('reddet kararı → REDDET etiketi', async () => {
    findSendApproval.mockResolvedValue({ id: 'ap-1', status: 'pending' })
    const c = await stageApprovalDecision('chat', 'lead-1', 'Denta', 'rejected')
    expect(c.text).toContain('REDDET')
  })
})

describe('confirmAndExecute — kod eşleşince GERÇEK servise dispatch', () => {
  it('sales_send → sendGmailMessage (at-most-once); dry-run mesajı', async () => {
    consumeSignedAction.mockResolvedValue({ status: 'ok', action: { type: 'sales_send', payload: { draftId: 'd', approvalId: 'a', businessName: 'X' } } })
    const r = await confirmAndExecute('chat', 'abc234')
    expect(sendGmailMessage).toHaveBeenCalledWith(expect.objectContaining({ outreachMessageId: 'd', approvalId: 'a' }))
    expect(r.text).toContain('DRY-RUN')
  })

  it('sales_send belirsiz sonuç → otomatik resend YOK mesajı', async () => {
    sendGmailMessage.mockResolvedValue({ ok: false, needsReconciliation: true })
    consumeSignedAction.mockResolvedValue({ status: 'ok', action: { type: 'sales_send', payload: { draftId: 'd', approvalId: 'a', businessName: 'X' } } })
    const r = await confirmAndExecute('chat', 'abc234')
    expect(r.text).toContain('otomatik tekrar YOK')
  })

  it('sales_send blocked → görünür ret', async () => {
    sendGmailMessage.mockResolvedValue({ ok: false, blockedReasons: ['suppressed'] })
    consumeSignedAction.mockResolvedValue({ status: 'ok', action: { type: 'sales_send', payload: { draftId: 'd', approvalId: 'a', businessName: 'X' } } })
    const r = await confirmAndExecute('chat', 'abc234')
    expect(r.text).toContain('suppressed')
  })

  it('sales_approval_decision → decideApproval(telegram)', async () => {
    consumeSignedAction.mockResolvedValue({ status: 'ok', action: { type: 'sales_approval_decision', payload: { approvalId: 'a', decision: 'approved', businessName: 'X' } } })
    const r = await confirmAndExecute('chat', 'abc234')
    expect(decideApproval).toHaveBeenCalledWith('a', 'approved', 'telegram')
    expect(r.text).toContain('ONAYLANDI')
  })

  it('sales_proposal_decision → decideProposalApproval', async () => {
    consumeSignedAction.mockResolvedValue({ status: 'ok', action: { type: 'sales_proposal_decision', payload: { proposalId: 'p', version: 2, decision: 'rejected', businessName: 'X' } } })
    const r = await confirmAndExecute('chat', 'abc234')
    expect(decideProposalApproval).toHaveBeenCalledWith(expect.objectContaining({ proposalId: 'p', version: 2 }))
    expect(r.text).toContain('REDDEDİLDİ')
  })

  it('sales_reconcile_decision → reconcileOutreachSend', async () => {
    consumeSignedAction.mockResolvedValue({ status: 'ok', action: { type: 'sales_reconcile_decision', payload: { outreachMessageId: 'd', confirmNotFound: true, businessName: 'X' } } })
    await confirmAndExecute('chat', 'abc234')
    expect(reconcileOutreachSend).toHaveBeenCalledWith('d', expect.objectContaining({ confirmNotFound: true }))
  })

  it('mismatch (tampered) → hiçbir servis çağrılmaz', async () => {
    consumeSignedAction.mockResolvedValue({ status: 'mismatch' })
    const r = await confirmAndExecute('chat', 'yanlis')
    expect(r.text).toContain('Kod uyuşmadı')
    expect(sendGmailMessage).not.toHaveBeenCalled()
    expect(decideApproval).not.toHaveBeenCalled()
  })

  it('expired → süre doldu; missing → bekleyen yok', async () => {
    consumeSignedAction.mockResolvedValueOnce({ status: 'expired' })
    expect((await confirmAndExecute('chat', 'abc234')).text).toContain('süresi doldu')
    consumeSignedAction.mockResolvedValueOnce({ status: 'missing' })
    expect((await confirmAndExecute('chat', 'abc234')).text).toContain('Bekleyen imzalı aksiyon yok')
  })

  it('approval karar uygulanamadı (yarış) → görünür ret', async () => {
    decideApproval.mockResolvedValue(false)
    consumeSignedAction.mockResolvedValue({ status: 'ok', action: { type: 'sales_approval_decision', payload: { approvalId: 'a', decision: 'approved', businessName: 'X' } } })
    const r = await confirmAndExecute('chat', 'abc234')
    expect(r.text).toContain('uygulanamadı')
  })

  it('sales_send zaten gönderilmiş (idempotent)', async () => {
    sendGmailMessage.mockResolvedValue({ ok: true, alreadySent: true })
    consumeSignedAction.mockResolvedValue({ status: 'ok', action: { type: 'sales_send', payload: { draftId: 'd', approvalId: 'a', businessName: 'X' } } })
    expect((await confirmAndExecute('chat', 'abc234')).text).toContain('zaten gönderilmiş')
  })

  it('sales_send başka istekte yürütülüyor (inProgress)', async () => {
    sendGmailMessage.mockResolvedValue({ ok: false, inProgress: true })
    consumeSignedAction.mockResolvedValue({ status: 'ok', action: { type: 'sales_send', payload: { draftId: 'd', approvalId: 'a', businessName: 'X' } } })
    expect((await confirmAndExecute('chat', 'abc234')).text).toContain('yürütülüyor')
  })

  it('sales_send GERÇEK gönderim (dryRun false)', async () => {
    sendGmailMessage.mockResolvedValue({ ok: true, dryRun: false, followUpScheduled: true })
    consumeSignedAction.mockResolvedValue({ status: 'ok', action: { type: 'sales_send', payload: { draftId: 'd', approvalId: 'a', businessName: 'X' } } })
    const text = (await confirmAndExecute('chat', 'abc234')).text
    expect(text).toContain('GERÇEK')
    expect(text).toContain('takip planı otomatik')
  })

  it('sales_send başarılı ama takip kurulamadı → Telegram uyarıyı saklamaz', async () => {
    sendGmailMessage.mockResolvedValue({ ok: true, dryRun: false, followUpScheduleError: 'sequence db down' })
    consumeSignedAction.mockResolvedValue({ status: 'ok', action: { type: 'sales_send', payload: { draftId: 'd', approvalId: 'a', businessName: 'X' } } })
    const text = (await confirmAndExecute('chat', 'abc234')).text
    expect(text).toContain('E-posta gönderildi')
    expect(text).toContain('sequence db down')
  })

  it('sales_send blocked (error only, blockedReasons yok) → error metni', async () => {
    sendGmailMessage.mockResolvedValue({ ok: false, error: 'digest stale' })
    consumeSignedAction.mockResolvedValue({ status: 'ok', action: { type: 'sales_send', payload: { draftId: 'd', approvalId: 'a', businessName: 'X' } } })
    expect((await confirmAndExecute('chat', 'abc234')).text).toContain('digest stale')
  })

  it('proposal karar hatası → görünür', async () => {
    decideProposalApproval.mockResolvedValue({ ok: false, error: 'stale version' })
    consumeSignedAction.mockResolvedValue({ status: 'ok', action: { type: 'sales_proposal_decision', payload: { proposalId: 'p', version: 2, decision: 'approved', businessName: 'X' } } })
    expect((await confirmAndExecute('chat', 'abc234')).text).toContain('stale version')
  })

  it('reconcile hatası → görünür', async () => {
    reconcileOutreachSend.mockResolvedValue({ ok: false, error: 'grace period' })
    consumeSignedAction.mockResolvedValue({ status: 'ok', action: { type: 'sales_reconcile_decision', payload: { outreachMessageId: 'd', confirmNotFound: false, businessName: 'X' } } })
    expect((await confirmAndExecute('chat', 'abc234')).text).toContain('grace period')
  })

  it('reconcile başarı → outcome döner', async () => {
    consumeSignedAction.mockResolvedValue({ status: 'ok', action: { type: 'sales_reconcile_decision', payload: { outreachMessageId: 'd', confirmNotFound: false, businessName: 'X' } } })
    expect((await confirmAndExecute('chat', 'abc234')).text).toContain('not_found_needs_confirmation')
  })

  it('bilinmeyen aksiyon tipi → yürütülemiyor', async () => {
    consumeSignedAction.mockResolvedValue({ status: 'ok', action: { type: 'add_task_choice', payload: {} } })
    expect((await confirmAndExecute('chat', 'abc234')).text).toContain('yürütülemiyor')
  })
})
