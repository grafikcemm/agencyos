import { describe, it, expect } from 'vitest'
import { parseSalesCommand } from './salesCommands'

describe('parseSalesCommand (Faz B5/B6)', () => {
  it('slash komutları', () => {
    expect(parseSalesCommand('/bugun')?.type).toBe('sales_today')
    expect(parseSalesCommand('/aranacaklar')?.type).toBe('sales_calls')
    expect(parseSalesCommand('/taslaklar')?.type).toBe('sales_drafts')
    expect(parseSalesCommand('/takipler')?.type).toBe('sales_followups')
    expect(parseSalesCommand('/sorunlar')?.type).toBe('sales_issues')
    expect(parseSalesCommand('/pipeline')?.type).toBe('sales_pipeline')
  })

  // Faz B5 kritik listesi: bunlar TAAHHÜT DEĞİL, satış komutu.
  it('"cold email hazırla" → prepare_draft (commitment değil)', () => {
    const c = parseSalesCommand('cold email hazırla')
    expect(c).toMatchObject({ type: 'prepare_draft', kind: 'cold_email', leadName: null })
  })

  it('"Klinik X için cold email hazırla" → lead adıyla prepare_draft', () => {
    const c = parseSalesCommand('Klinik X için cold email hazırla')
    expect(c).toMatchObject({ type: 'prepare_draft', kind: 'cold_email', leadName: 'Klinik X' })
  })

  it('"follow-up hazırla" → prepare_draft follow_up', () => {
    expect(parseSalesCommand('follow-up hazırla')).toMatchObject({
      type: 'prepare_draft',
      kind: 'follow_up',
    })
  })

  it('"teklifleri göster" → show_proposals', () => {
    expect(parseSalesCommand('teklifleri göster')?.type).toBe('show_proposals')
  })

  it('"Klinik X arandı" → lead_action called (Türkçe ad korunur)', () => {
    const c = parseSalesCommand('Güler Klinik arandı')
    expect(c).toMatchObject({ type: 'lead_action', action: 'called', leadName: 'Güler Klinik' })
  })

  it('"bugün kimi arayayım?" → sales_calls', () => {
    expect(parseSalesCommand('bugün kimi arayayım?')?.type).toBe('sales_calls')
  })

  it('"X ulaşılamadı" → no_answer', () => {
    expect(parseSalesCommand('Demir Diş ulaşılamadı')).toMatchObject({
      type: 'lead_action',
      action: 'no_answer',
      leadName: 'Demir Diş',
    })
  })

  it('"X görüşme oldu" → meeting', () => {
    expect(parseSalesCommand('Demir Diş görüşme oldu')).toMatchObject({
      type: 'lead_action',
      action: 'meeting',
    })
  })

  it('"X daha sonra ara yarın" → later + timeHint', () => {
    // timeHint normalize edilmiş metinden gelir ('yarin') — parseLaterHint iki formu da anlar.
    expect(parseSalesCommand('Demir Diş daha sonra ara yarın')).toMatchObject({
      type: 'lead_action',
      action: 'later',
      timeHint: 'yarin',
    })
  })

  it('"X not: web sitesi yenilenecek" → note', () => {
    const c = parseSalesCommand('Demir Diş not: web sitesi yenilenecek')
    expect(c).toMatchObject({ type: 'lead_action', action: 'note', leadName: 'Demir Diş' })
    if (c?.type === 'lead_action') expect(c.note).toContain('web sitesi')
  })

  it('generic "onayla"/"gönder" → generic_approve (asla doğrudan send yetkisi değil)', () => {
    expect(parseSalesCommand('onayla')?.type).toBe('generic_approve')
    expect(parseSalesCommand('gönder')?.type).toBe('generic_approve')
  })

  it('hayat mesajları satış komutu DEĞİL (null → asistan akışına düşer)', () => {
    expect(parseSalesCommand('bugün spora gideceğim')).toBeNull()
    expect(parseSalesCommand('selam')).toBeNull()
    expect(parseSalesCommand('tamam')).toBeNull()
    expect(parseSalesCommand('görev ekle: fatura kes')).toBeNull()
  })
})

// FINALIZATION Faz 5 — parity komutları parser'ı.
describe('parity komutları (Faz 5)', () => {
  it('teklif hazırla / teklifleri göster (global + lead)', () => {
    expect(parseSalesCommand('Denta için teklif hazırla')).toEqual({ type: 'create_proposal', leadName: 'Denta' })
    expect(parseSalesCommand('teklif hazırla')).toEqual({ type: 'create_proposal', leadName: '' })
    expect(parseSalesCommand('teklifleri göster')).toEqual({ type: 'show_proposals', leadName: null })
    expect(parseSalesCommand('/teklifler')).toEqual({ type: 'show_proposals', leadName: null })
    expect(parseSalesCommand('Denta tekliflerini göster')).toEqual({ type: 'show_proposals', leadName: 'Denta' })
  })

  it('taslak durumu + onaya al + reconcile', () => {
    expect(parseSalesCommand('Denta taslak durumu')).toEqual({ type: 'draft_status', leadName: 'Denta' })
    expect(parseSalesCommand('taslak durumu')).toEqual({ type: 'draft_status', leadName: null })
    expect(parseSalesCommand('Denta onaya al')).toEqual({ type: 'request_send_approval', leadName: 'Denta' })
    expect(parseSalesCommand('onaya al')).toEqual({ type: 'request_send_approval', leadName: '' })
    expect(parseSalesCommand('/reconcile')).toEqual({ type: 'show_reconcile' })
    expect(parseSalesCommand('reconcile')).toEqual({ type: 'show_reconcile' })
  })

  it('Türkçe karakterli lead adı korunur', () => {
    expect(parseSalesCommand('Güler Kliniği için teklif hazırla')).toEqual({
      type: 'create_proposal',
      leadName: 'Güler Kliniği',
    })
  })
})

describe('FINAL PILOT BLOCKERS Faz 6 — imzalı satış aksiyonları', () => {
  it('onayla <KOD> → confirm_action (generic onaylardan ÖNCE)', () => {
    expect(parseSalesCommand('onayla ABC234')).toEqual({ type: 'confirm_action', code: 'abc234' })
    // Bare "onayla" (kodsuz) → generic (confirm DEĞİL).
    expect(parseSalesCommand('onayla')).toEqual({ type: 'generic_approve', raw: 'onayla' })
  })

  it('<lead> gönder → send_draft', () => {
    expect(parseSalesCommand('Denta gönder')).toEqual({ type: 'send_draft', leadName: 'Denta' })
    // Bare "gönder" → generic.
    expect(parseSalesCommand('gönder')).toEqual({ type: 'generic_approve', raw: 'gönder' })
  })

  it('<lead> taslak onayla/reddet → approval_decision', () => {
    expect(parseSalesCommand('Denta taslak onayla')).toEqual({ type: 'approval_decision', leadName: 'Denta', decision: 'approved' })
    expect(parseSalesCommand('Denta taslak reddet')).toEqual({ type: 'approval_decision', leadName: 'Denta', decision: 'rejected' })
  })

  it('<lead> teklif onayla/reddet → proposal_decision', () => {
    expect(parseSalesCommand('Denta teklif onayla')).toEqual({ type: 'proposal_decision', leadName: 'Denta', decision: 'approved' })
    expect(parseSalesCommand('Denta teklif reddet')).toEqual({ type: 'proposal_decision', leadName: 'Denta', decision: 'rejected' })
  })

  it('<lead> gonderildi/gonderilmedi → reconcile_decision', () => {
    expect(parseSalesCommand('Denta gönderildi')).toEqual({ type: 'reconcile_decision', leadName: 'Denta', confirmNotFound: false })
    expect(parseSalesCommand('Denta gönderilmedi')).toEqual({ type: 'reconcile_decision', leadName: 'Denta', confirmNotFound: true })
  })

  it('Türkçe karakterli lead adı imzalı komutlarda korunur', () => {
    expect(parseSalesCommand('Güler Kliniği gönder')).toEqual({ type: 'send_draft', leadName: 'Güler Kliniği' })
  })
})
