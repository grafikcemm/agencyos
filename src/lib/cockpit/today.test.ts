import { describe, it, expect } from 'vitest'
import { computeExpectedRevenue, STAGE_WEIGHTS } from './today'

// Beklenen-gelir şeridi SAF hesabı (deterministik, LLM'siz — doc 33 §1A/3B).

describe('computeExpectedRevenue', () => {
  it('aşama ağırlıklarıyla toplar', () => {
    const r = computeExpectedRevenue([
      { status: 'contacted', expected_monthly_value_tl: 10000 }, // ×0.1 = 1000
      { status: 'responded', expected_monthly_value_tl: 20000 }, // ×0.35 = 7000
      { status: 'proposal', expected_monthly_value_tl: 10000 },  // ×0.7 = 7000
    ])
    expect(r.weightedPipelineTl).toBe(15000)
    const proposal = r.byStage.find((s) => s.stage === 'proposal')!
    expect(proposal.count).toBe(1)
    expect(proposal.weightedTl).toBe(7000)
  })

  it('ağırlıksız aşamalar (new/won/lost) toplamı ETKİLEMEZ', () => {
    const r = computeExpectedRevenue([
      { status: 'new', expected_monthly_value_tl: 99999 },
      { status: 'converted', expected_monthly_value_tl: 99999 },
    ])
    expect(r.weightedPipelineTl).toBe(0)
  })

  it('null değerler 0 sayılır; boş girişte tüm aşamalar 0 satırıyla döner', () => {
    const r = computeExpectedRevenue([{ status: 'meeting', expected_monthly_value_tl: null }])
    expect(r.weightedPipelineTl).toBe(0)
    expect(r.byStage).toHaveLength(Object.keys(STAGE_WEIGHTS).length)
    expect(r.byStage.every((s) => s.weightedTl === 0)).toBe(true)
  })

  it('ağırlıklar 0-1 aralığında ve funnel sırasıyla artar', () => {
    const w = STAGE_WEIGHTS
    expect(w.contacted).toBeLessThan(w.responded)
    expect(w.responded).toBeLessThan(w.meeting)
    expect(w.meeting).toBeLessThan(w.proposal)
    for (const v of Object.values(w)) expect(v).toBeGreaterThan(0)
    for (const v of Object.values(w)) expect(v).toBeLessThan(1)
  })
})

// ── Faz C4: draft darboğaz sınıflandırıcısı (deterministik) ───────────────────
import { classifyDraftState, normalizePhoneKey, DRAFT_NEXT_ACTION } from './today'

describe('classifyDraftState (finding #5-6)', () => {
  const base = {
    attemptState: null as string | null,
    attemptFinalized: false,
    hasRecipient: true,
    suppressed: false,
    approvalStatus: null as string | null,
  }

  it('attempt sent+finalized → sent; sent+finalize eksik → finalize_pending', () => {
    expect(classifyDraftState({ ...base, attemptState: 'sent', attemptFinalized: true })).toBe('sent')
    expect(classifyDraftState({ ...base, attemptState: 'sent' })).toBe('finalize_pending')
  })

  it('attempt unknown/failed → unknown/failed', () => {
    expect(classifyDraftState({ ...base, attemptState: 'unknown' })).toBe('unknown')
    expect(classifyDraftState({ ...base, attemptState: 'failed' })).toBe('failed')
  })

  it('alıcı yok → recipient_missing (öncelik: alıcı > compliance > onay)', () => {
    expect(classifyDraftState({ ...base, hasRecipient: false, suppressed: true })).toBe('recipient_missing')
  })

  it('suppression → compliance_blocked', () => {
    expect(classifyDraftState({ ...base, suppressed: true })).toBe('compliance_blocked')
  })

  it('onay yok → approval_missing; pending/approved doğru eşleşir', () => {
    expect(classifyDraftState(base)).toBe('approval_missing')
    expect(classifyDraftState({ ...base, approvalStatus: 'pending' })).toBe('approval_pending')
    expect(classifyDraftState({ ...base, approvalStatus: 'approved' })).toBe('approved')
  })

  it('rejected/expired onay → approval_missing (yeniden onay gerekir)', () => {
    expect(classifyDraftState({ ...base, approvalStatus: 'rejected' })).toBe('approval_missing')
    expect(classifyDraftState({ ...base, approvalStatus: 'expired' })).toBe('approval_missing')
  })

  it('her durumun TEK güvenli next action metni var', () => {
    for (const v of Object.values(DRAFT_NEXT_ACTION)) expect(v.length).toBeGreaterThan(5)
  })
})

describe('normalizePhoneKey (C2 dedupe)', () => {
  it('format farkları aynı anahtara iner', () => {
    expect(normalizePhoneKey('+90 555 111 22 33')).toBe('5551112233')
    expect(normalizePhoneKey('0555 111 22 33')).toBe('5551112233')
    expect(normalizePhoneKey('(0555) 111-22-33')).toBe('5551112233')
  })
  it('null/kısa değerler null', () => {
    expect(normalizePhoneKey(null)).toBeNull()
    expect(normalizePhoneKey('112')).toBeNull()
  })
})
