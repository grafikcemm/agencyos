import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── mock'lar: kokpit servis katmanı + App DB + pending aksiyonlar ────────────
import type { TodayCockpit } from '@/lib/cockpit/today'

function emptyCockpit(): TodayCockpit {
  return {
    leadsToCall: { items: [], error: null },
    pendingSends: { items: [], error: null },
    overdueFollowups: { items: [], error: null },
    sendIssues: { items: [], error: null },
    hotLeads: { items: [], error: null },
    revenue: { data: null, error: null },
    callDuplicates: [],
  } as unknown as TodayCockpit
}

let cockpit: TodayCockpit = emptyCockpit()
vi.mock('@/lib/cockpit/today', () => ({
  getTodayCockpit: async () => cockpit,
}))

const applyMock = vi.fn()
vi.mock('@/lib/cockpit/leadActions', () => ({
  applyLeadAction: (...args: unknown[]) => applyMock(...args),
}))

let leadRows: Array<Record<string, unknown>> = []
let leadRowsError: { message: string } | null = null
let leadDetail: Record<string, unknown> | null = null
/** Tablo-bazli maybeSingle/list sonuclari (FINALIZATION Faz 5 komutlari icin). */
let tableSingle: Record<string, { data: Record<string, unknown> | null; error: { message: string; code?: string } | null }> = {}
let tableList: Record<string, { data: Array<Record<string, unknown>> | null; error: { message: string; code?: string } | null }> = {}

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const api: Record<string, unknown> = {}
      Object.assign(api, {
        select: () => api,
        ilike: () => api,
        eq: () => api,
        order: () => api,
        limit: (() => {
          const fn = async () => {
            if (table === 'leads') return { data: leadRowsError ? null : leadRows, error: leadRowsError }
            return tableList[table] ?? { data: [], error: null }
          }
          // limit hem awaited hem chain (maybeSingle oncesi) kullanilir.
          const chain = () => api
          return Object.assign(chain, { then: (r: (v: unknown) => unknown) => fn().then(r) })
        })(),
        maybeSingle: async () => tableSingle[table] ?? { data: leadDetail, error: null },
        then: (resolve: (v: unknown) => unknown) => {
          const out = table === 'leads'
            ? { data: leadRowsError ? null : leadRows, error: leadRowsError }
            : (tableList[table] ?? { data: [], error: null })
          return Promise.resolve(out).then(resolve)
        },
      })
      return api
    },
  },
}))

// LIFE ledger (reconcile gorunumu)
let lifeList: { data: Array<Record<string, unknown>> | null; error: { message: string; code?: string } | null } = { data: [], error: null }
vi.mock('@/lib/lifeSupabaseAdmin', () => ({
  lifeSupabaseAdmin: {
    from: () => {
      const api: Record<string, unknown> = {}
      Object.assign(api, {
        select: () => api,
        in: () => api,
        order: () => api,
        limit: () => api,
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(lifeList).then(resolve),
      })
      return api
    },
  },
}))

// Canonical cold-email servisi (web ile parity kaniti: AYNI fonksiyon cagrilir).
const generateMock = vi.fn()
vi.mock('@/lib/outreach/coldEmailService', () => ({
  generateColdEmailDraft: (...a: unknown[]) => generateMock(...a),
}))

const requestApprovalMock = vi.fn()
const findApprovalMock = vi.fn()
vi.mock('@/lib/outreach/gmail', () => ({
  requestSendApproval: (...a: unknown[]) => requestApprovalMock(...a),
  findSendApproval: (...a: unknown[]) => findApprovalMock(...a),
}))

const createProposalMock = vi.fn()
const listProposalsMock = vi.fn()
vi.mock('@/lib/proposals/proposalService', () => ({
  createProposalDraft: (...a: unknown[]) => createProposalMock(...a),
  listProposalsForLead: (...a: unknown[]) => listProposalsMock(...a),
}))

let recipientMock: { email: string | null; contactId: string | null; contactName: string | null; source: string } = {
  email: 'a@b.co', contactId: null, contactName: null, source: 'lead_email',
}
vi.mock('@/lib/contacts/contactService', () => ({
  resolveCanonicalRecipient: async () => recipientMock,
}))

let suppressedSet = new Set<string>()
vi.mock('@/lib/outreach/auditCompliance', () => ({
  getSuppressedSet: async () => suppressedSet,
}))

let pendingAction: { type: string; hasCode: boolean } | null = null
let peekCalled = 0
vi.mock('./pendingActions', () => ({
  peekPendingAction: async () => {
    peekCalled += 1
    return pendingAction // TÜKETMEZ (peek)
  },
  // salesActions bu modülü paylaşır — kullanılmayan yollar için no-op stub'lar.
  setPendingAction: async () => ({ digest: 'd', mode: 'memory' }),
  consumeSignedAction: async () => ({ status: 'missing' }),
  makeConfirmCode: () => 'ABC234',
}))
// salesActions handler'ları bu testte sürülmez; modül yükü için stub'la.
vi.mock('./salesActions', () => ({
  confirmAndExecute: async () => ({ text: 'stub' }),
  stageSend: async () => ({ ok: true, text: 'stub' }),
  stageApprovalDecision: async () => ({ ok: true, text: 'stub' }),
  stageProposalDecision: async () => ({ ok: true, text: 'stub' }),
  stageReconcileDecision: async () => ({ ok: true, text: 'stub' }),
}))

import { handleSalesCommand, parseLaterHint } from './salesHandlers'
import type { SalesCommand } from './salesCommands'

const CTX = { updateId: 555, chatKey: '42' }
const run = (cmd: SalesCommand) => handleSalesCommand(cmd, CTX)

beforeEach(() => {
  cockpit = emptyCockpit()
  applyMock.mockReset().mockResolvedValue({ ok: true, audit: 'ok', after: { next_follow_up_at: null } })
  leadRows = []
  leadRowsError = null
  leadDetail = null
  tableSingle = {}
  tableList = {}
  lifeList = { data: [], error: null }
  generateMock.mockReset().mockResolvedValue({
    ok: true,
    draft: { id: 'draft-uuid-12345678', subject: 'K', body: 'B', created_at: null },
    quality: { ok: true, violations: [] },
    claims: [{ text: 'baktım', evidenceId: 'ev-1' }],
    claimPersisted: true,
  })
  requestApprovalMock.mockReset().mockResolvedValue({ ok: true, approvalId: 'ap-1', status: 'pending' })
  findApprovalMock.mockReset().mockResolvedValue(null)
  createProposalMock.mockReset().mockResolvedValue({ ok: true, proposalId: 'p-1', version: 1, atomic: true })
  listProposalsMock.mockReset().mockResolvedValue({ ok: true, proposals: [] })
  recipientMock = { email: 'a@b.co', contactId: null, contactName: null, source: 'lead_email' }
  suppressedSet = new Set()
  pendingAction = null
})

describe('parseLaterHint', () => {
  const NOW = Date.parse('2026-07-13T10:00:00Z')
  it('hint yok → varsayılan yarın', () => {
    expect(parseLaterHint(undefined, NOW)).toBe(new Date(NOW + 86_400_000).toISOString())
  })
  it('"yarın" / "3 gün" / "2 hafta" / ISO tarih', () => {
    expect(parseLaterHint('yarın', NOW)).toBe(new Date(NOW + 86_400_000).toISOString())
    expect(parseLaterHint('3 gün sonra', NOW)).toBe(new Date(NOW + 3 * 86_400_000).toISOString())
    expect(parseLaterHint('2 hafta', NOW)).toBe(new Date(NOW + 14 * 86_400_000).toISOString())
    expect(parseLaterHint('2026-08-01', NOW)).toBe(new Date(Date.parse('2026-08-01')).toISOString())
  })
  it('anlaşılamayan / geçmiş tarih → null (mutasyon yok)', () => {
    expect(parseLaterHint('ne zaman olsun', NOW)).toBeNull()
    expect(parseLaterHint('2020-01-01', NOW)).toBeNull()
  })
})

describe('formatlayıcılar — /bugun /aranacaklar /taslaklar /takipler /sorunlar /pipeline', () => {
  it('boş kokpit: her komut anlamlı boş mesaj döner', async () => {
    expect(await run({ type: 'sales_calls' } as SalesCommand)).toContain('aranacak aktif lead yok')
    expect(await run({ type: 'sales_drafts' } as SalesCommand)).toContain('Bekleyen e-posta taslağı yok')
    expect(await run({ type: 'sales_followups' } as SalesCommand)).toContain('Geciken follow-up yok')
    expect(await run({ type: 'sales_issues' } as SalesCommand)).toContain('sorunu yok')
    expect(await run({ type: 'sales_pipeline' } as SalesCommand)).toContain('Pipeline yüklenemedi')
  })

  it('hata taşıyan bölümler hatayı GİZLEMEZ', async () => {
    cockpit.leadsToCall = { items: [], error: 'db down' } as never
    cockpit.pendingSends = { items: [], error: 'db down' } as never
    cockpit.overdueFollowups = { items: [], error: 'db down' } as never
    cockpit.sendIssues = { items: [], error: 'db down' } as never
    expect(await run({ type: 'sales_calls' } as SalesCommand)).toContain('yüklenemedi')
    expect(await run({ type: 'sales_drafts' } as SalesCommand)).toContain('yüklenemedi')
    expect(await run({ type: 'sales_followups' } as SalesCommand)).toContain('yüklenemedi')
    expect(await run({ type: 'sales_issues' } as SalesCommand)).toContain('yüklenemedi')
  })

  it('dolu kokpit: aranacaklar listesi + duplicate uyarısı + HTML escape', async () => {
    cockpit.leadsToCall = {
      items: [
        { businessName: 'Klinik <X>', phone: '+90 555', source: 'due' },
        { businessName: 'Kafe Y', phone: null, source: 'daily' },
      ],
      error: null,
    } as never
    cockpit.callDuplicates = [{ phoneKey: 'x' }] as never
    const msg = await run({ type: 'sales_calls' } as SalesCommand)
    expect(msg).toContain('Klinik &lt;X&gt;')
    expect(msg).toContain('TAKİP')
    expect(msg).toContain('telefon yok')
    expect(msg).toContain('duplicate telefon')
  })

  it('/bugun özeti: sayılar + ilk-iş önerisi + pipeline satırı', async () => {
    cockpit.leadsToCall = { items: [{ businessName: 'A Kliniği', phone: 'x', source: 'daily' }], error: null } as never
    cockpit.revenue = { data: { weightedPipelineTl: 50_000, targetTl: 120_000, byStage: [] }, error: null } as never
    const msg = await run({ type: 'sales_today' } as SalesCommand)
    expect(msg).toContain('Aranacak: 1')
    expect(msg).toContain("A Kliniği")
    expect(msg).toContain('50.000 TL')
  })

  it('/bugun: arama yoksa taslak önerisi; ikisi de yoksa "acil iş yok"', async () => {
    cockpit.pendingSends = { items: [{ businessName: 'B', state: 'approval_missing', nextAction: 'x' }], error: null } as never
    expect(await run({ type: 'sales_today' } as SalesCommand)).toContain('taslak darboğazını temizle')
    cockpit.pendingSends = { items: [], error: null } as never
    expect(await run({ type: 'sales_today' } as SalesCommand)).toContain('acil satış işi görünmüyor')
  })

  it('taslaklar: durum etiketi + sonraki adım; takipler + sorunlar + pipeline dolu hâlleri', async () => {
    cockpit.pendingSends = {
      items: [{ businessName: 'B Ltd', state: 'recipient_missing', nextAction: 'Alıcıyı ekle' }],
      error: null,
    } as never
    expect(await run({ type: 'sales_drafts' } as SalesCommand)).toContain('alıcı yok')

    cockpit.overdueFollowups = { items: [{ businessName: 'C', step: 2, dueAt: '2026-07-10T00:00:00Z' }], error: null } as never
    expect(await run({ type: 'sales_followups' } as SalesCommand)).toContain('adım 2')

    cockpit.sendIssues = { items: [{ outreachMessageId: 'abcdefgh1234', state: 'unknown', finalized: false }], error: null } as never
    expect(await run({ type: 'sales_issues' } as SalesCommand)).toContain('finalize eksik')

    cockpit.revenue = {
      data: { weightedPipelineTl: 10_000, targetTl: 120_000, byStage: [{ stage: 'contacted', count: 3, weightedTl: 10_000 }] },
      error: null,
    } as never
    expect(await run({ type: 'sales_pipeline' } as SalesCommand)).toContain('contacted: 3 lead')
  })
})

describe('lead_action — isim çözümleme + applyLeadAction köprüsü', () => {
  const CMD: SalesCommand = { type: 'lead_action', leadName: 'Klinik', action: 'called' } as SalesCommand

  it('eşleşme yok → mutasyonsuz açıklama', async () => {
    const msg = await run(CMD)
    expect(msg).toContain('bulamadım')
    expect(applyMock).not.toHaveBeenCalled()
  })

  it('çoklu eşleşme → seçenek listesi, MUTASYON YOK', async () => {
    leadRows = [
      { id: '1', business_name: 'Klinik A' },
      { id: '2', business_name: 'Klinik B' },
    ]
    const msg = await run(CMD)
    expect(msg).toContain('Birden çok eşleşme')
    expect(applyMock).not.toHaveBeenCalled()
  })

  it('tek eşleşme → applyLeadAction update-scoped idempotency key ile çağrılır', async () => {
    leadRows = [{ id: 'lead-9', business_name: 'Klinik A' }]
    applyMock.mockResolvedValue({ ok: true, audit: 'ok', after: { next_follow_up_at: '2026-07-14T09:00:00Z' } })
    const msg = await run(CMD)
    expect(applyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-9',
        action: 'called',
        channel: 'telegram',
        idempotencyKey: 'tg-555-lead-9-called', // updateId'ye bağlı — retry'da AYNI
      }),
    )
    expect(msg).toContain('arandı')
    expect(msg).toContain('Sonraki takip')
  })

  it('idempotent replay + degraded audit görünür; başarısızlık gizlenmez', async () => {
    leadRows = [{ id: 'lead-9', business_name: 'Klinik A' }]
    applyMock.mockResolvedValue({ ok: true, idempotentReplay: true, audit: 'degraded' })
    const msg = await run(CMD)
    expect(msg).toContain('tekrar — zaten işlenmişti')
    expect(msg).toContain('Audit tablosu henüz canlı değil')

    applyMock.mockResolvedValue({ ok: false, error: 'geçersiz geçiş' })
    expect(await run(CMD)).toContain('Aksiyon uygulanamadı')
  })

  it('later + anlaşılamayan zaman → MUTASYON YOK', async () => {
    leadRows = [{ id: 'lead-9', business_name: 'Klinik A' }]
    const msg = await run({ type: 'lead_action', leadName: 'Klinik', action: 'later', timeHint: 'bilinmez' } as SalesCommand)
    expect(msg).toContain('Zamanı anlayamadım')
    expect(applyMock).not.toHaveBeenCalled()
  })

  it('later + "yarın" → laterAtIso ile mutasyon', async () => {
    leadRows = [{ id: 'lead-9', business_name: 'Klinik A' }]
    await run({ type: 'lead_action', leadName: 'Klinik', action: 'later', timeHint: 'yarın' } as SalesCommand)
    expect(applyMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'later', laterAtIso: expect.any(String) }))
  })
})

describe('prepare_draft — CANONICAL cold-email servisi (web ile parity)', () => {
  it('isimsiz → üretim çağrılmaz', async () => {
    const msg = await run({ type: 'prepare_draft', kind: 'cold_email' } as SalesCommand)
    expect(msg).toContain('Hangi işletme')
    expect(generateMock).not.toHaveBeenCalled()
  })

  it('bulunamadı / çoklu eşleşme → üretim çağrılmaz', async () => {
    expect(await run({ type: 'prepare_draft', kind: 'cold_email', leadName: 'Yok' } as SalesCommand)).toContain('bulamadım')
    leadRows = [
      { id: '1', business_name: 'A' },
      { id: '2', business_name: 'B' },
    ]
    expect(await run({ type: 'prepare_draft', kind: 'cold_email', leadName: 'X' } as SalesCommand)).toContain('Birden çok eşleşme')
    expect(generateMock).not.toHaveBeenCalled()
  })

  it('LEAD SORGUSU HATASI "bulunamadı" DEĞİL — açık hata döner', async () => {
    leadRowsError = { message: 'connection reset' }
    const msg = await run({ type: 'prepare_draft', kind: 'cold_email', leadName: 'A' } as SalesCommand)
    expect(msg).toContain('HATA verdi')
    expect(msg).not.toContain('bulamadım')
    expect(generateMock).not.toHaveBeenCalled()
  })

  it('başarı: generateColdEmailDraft (web ile AYNI servis) çağrılır; gate + iddia izi raporlanır', async () => {
    leadRows = [{ id: 'l1', business_name: 'A Ltd' }]
    const msg = await run({ type: 'prepare_draft', kind: 'cold_email', leadName: 'A' } as SalesCommand)
    expect(generateMock).toHaveBeenCalledWith('l1')
    expect(msg).toContain('Canonical taslak üretildi')
    expect(msg).toContain('Kalite kapısı: geçti')
    expect(msg).toContain('Kanıtlı iddia: 1')
    expect(msg).toContain('gönderilebilir DEĞİL')
  })

  it('gate ihlalli üretim: ihlaller GÖRÜNÜR; iz yazılamadıysa mig 062 uyarısı', async () => {
    leadRows = [{ id: 'l1', business_name: 'A Ltd' }]
    generateMock.mockResolvedValue({
      ok: true,
      draft: { id: 'draft-2', subject: 'K', body: 'B', created_at: null },
      quality: { ok: false, violations: [{ code: 'CLAIM_WITHOUT_EVIDENCE', detail: 'x', fix: 'y' }] },
      claims: [{ text: 'iddia', evidenceId: 'ev-9' }],
      claimPersisted: false,
      voiceDegraded: true,
    })
    const msg = await run({ type: 'prepare_draft', kind: 'cold_email', leadName: 'A' } as SalesCommand)
    expect(msg).toContain('CLAIM_WITHOUT_EVIDENCE')
    expect(msg).toContain('mig 062 bekliyor')
    expect(msg).toContain('Voice DNA kuralları okunamadı')
  })

  it('üretim hatası görünür; follow_up sequence motoruna yönlendirir (legacy metin YOK)', async () => {
    leadRows = [{ id: 'l1', business_name: 'A Ltd' }]
    generateMock.mockResolvedValue({ ok: false, error: 'model down', modelFailed: true })
    expect(await run({ type: 'prepare_draft', kind: 'cold_email', leadName: 'A' } as SalesCommand)).toContain('Taslak üretilemedi')

    const fu = await run({ type: 'prepare_draft', kind: 'follow_up', leadName: 'A' } as SalesCommand)
    expect(fu).toContain('sequence motorundan')
    expect(generateMock).toHaveBeenCalledTimes(1) // follow_up icin cagrilmadi
  })
})

describe('generic_approve — bare "onayla" imzalı aksiyonu TÜKETMEZ (audit #10)', () => {
  it('pending yok → hiçbir şey gönderilmedi mesajı', async () => {
    pendingAction = null
    expect(await run({ type: 'generic_approve' } as SalesCommand)).toContain('hiçbir şey gönderilmedi')
  })
  it('imzalı (kodlu) aksiyon varsa → KODLA teyide yönlendirir, TÜKETMEZ (peek)', async () => {
    pendingAction = { type: 'sales_send', hasCode: true }
    peekCalled = 0
    const msg = await run({ type: 'generic_approve' } as SalesCommand)
    expect(msg).toContain('onayla')
    expect(msg).toContain('KOD')
    expect(pendingAction).not.toBeNull() // TÜKETİLMEDİ — replay/consume yok
    expect(peekCalled).toBe(1) // peek (consume DEĞİL)
  })
})

describe('FINALIZATION Faz 5 — parity komutları', () => {
  it('show_proposals (global): şema yoksa açık bilgi; dolu liste formatlanır', async () => {
    tableList['proposals'] = { data: null, error: { message: 'yok', code: '42P01' } }
    expect(await run({ type: 'show_proposals', leadName: null } as SalesCommand)).toContain('mig 061')

    tableList['proposals'] = {
      data: [{ id: 'p1', status: 'review', current_version: 2, leads: { business_name: 'A Ltd' } }],
      error: null,
    }
    const msg = await run({ type: 'show_proposals', leadName: null } as SalesCommand)
    expect(msg).toContain('A Ltd')
    expect(msg).toContain('v2 review')
  })

  it('show_proposals (lead): application service (listProposalsForLead) kullanılır', async () => {
    leadRows = [{ id: 'l1', business_name: 'A Ltd' }]
    listProposalsMock.mockResolvedValue({
      ok: true,
      proposals: [{ id: 'p1', leadId: 'l1', status: 'review', currentVersion: 1, updatedAt: null, pendingApprovalVersion: 1 }],
    })
    const msg = await run({ type: 'show_proposals', leadName: 'A' } as SalesCommand)
    expect(listProposalsMock).toHaveBeenCalledWith('l1')
    expect(msg).toContain('onay bekliyor: v1')
  })

  it('create_proposal: önerilmiş hizmet yoksa yönlendirme; varsa createProposalDraft (web ile AYNI)', async () => {
    leadRows = [{ id: 'l1', business_name: 'A Ltd' }]
    tableSingle['leads'] = { data: { recommended_offers: [] }, error: null }
    expect(await run({ type: 'create_proposal', leadName: 'A' } as SalesCommand)).toContain('önerilmiş hizmet yok')

    tableSingle['leads'] = { data: { recommended_offers: [{ offerId: 'ai_lead_response' }] }, error: null }
    const msg = await run({ type: 'create_proposal', leadName: 'A' } as SalesCommand)
    expect(createProposalMock).toHaveBeenCalledWith({ leadId: 'l1', offerIds: ['ai_lead_response'] })
    expect(msg).toContain('Kalıcı teklif')
    expect(msg).toContain('Gönderim yolu YOK')
  })

  it('create_proposal: kalite bloğu ve schemaMissing görünür', async () => {
    leadRows = [{ id: 'l1', business_name: 'A Ltd' }]
    tableSingle['leads'] = { data: { recommended_offers: [{ offerId: 'x' }] }, error: null }
    createProposalMock.mockResolvedValue({ ok: false, quality: { ok: false, violations: [{ code: 'NO_CTA', detail: 'd', fix: 'f' }] } })
    expect(await run({ type: 'create_proposal', leadName: 'A' } as SalesCommand)).toContain('NO_CTA')
    createProposalMock.mockResolvedValue({ ok: false, schemaMissing: true })
    expect(await run({ type: 'create_proposal', leadName: 'A' } as SalesCommand)).toContain('mig 061')
  })

  it('draft_status: web ile AYNI sınıflandırıcı — approval_pending + sonraki adım', async () => {
    leadRows = [{ id: 'l1', business_name: 'A Ltd' }]
    tableSingle['outreach_messages'] = { data: { id: 'd1', status: 'draft', subject: 'K' }, error: null }
    tableSingle['outreach_send_attempts'] = { data: null, error: null }
    findApprovalMock.mockResolvedValue({ id: 'ap', status: 'pending', expires_at: 'x' })
    const msg = await run({ type: 'draft_status', leadName: 'A' } as SalesCommand)
    expect(msg).toContain('approval_pending')
    expect(msg).toContain('Onayı bekle')
  })

  it('draft_status: taslak yoksa yönlendirme; sorgu hatası görünür', async () => {
    leadRows = [{ id: 'l1', business_name: 'A Ltd' }]
    tableSingle['outreach_messages'] = { data: null, error: null }
    expect(await run({ type: 'draft_status', leadName: 'A' } as SalesCommand)).toContain('taslağı yok')
    tableSingle['outreach_messages'] = { data: null, error: { message: 'db down' } }
    expect(await run({ type: 'draft_status', leadName: 'A' } as SalesCommand)).toContain('hata verdi')
  })

  it('request_send_approval: GERÇEK HITL onay isteği (send DEĞİL); bloklar görünür', async () => {
    leadRows = [{ id: 'l1', business_name: 'A Ltd' }]
    tableSingle['outreach_messages'] = { data: { id: 'd1' }, error: null }
    const ok = await run({ type: 'request_send_approval', leadName: 'A' } as SalesCommand)
    expect(requestApprovalMock).toHaveBeenCalledWith('d1')
    expect(ok).toContain('Onay isteği oluşturuldu')
    expect(ok).toContain('Gönderim YAPILMADI')

    requestApprovalMock.mockResolvedValue({ ok: false, blockedReasons: ['CLAIM_WITHOUT_EVIDENCE'] })
    expect(await run({ type: 'request_send_approval', leadName: 'A' } as SalesCommand)).toContain('bloklandı')
  })

  it('show_reconcile: Gmail sorunları + Telegram unknown/pending birlikte; şema yoksa açık bilgi', async () => {
    cockpit.sendIssues = { items: [{ outreachMessageId: 'abcdefgh1234', state: 'unknown', finalized: false }], error: null } as never
    lifeList = { data: [{ delivery_key: 'update:1:reply:1', status: 'unknown', attempt_count: 1 }], error: null }
    const msg = await run({ type: 'show_reconcile' } as SalesCommand)
    expect(msg).toContain('Gmail')
    expect(msg).toContain('update:1:reply:1')
    expect(msg).toContain('otomatik resend YOK')

    lifeList = { data: null, error: { message: 'yok', code: '42P01' } }
    expect(await run({ type: 'show_reconcile' } as SalesCommand)).toContain('LIFE 006')
  })
})

describe('show_proposals eski davranış kaldırıldı (regresyon)', () => {
  it('artık "motor canlı değil" sabit mesajı dönmez — gerçek sorgu/servis konuşur', async () => {
    tableList['proposals'] = { data: [], error: null }
    const msg = await run({ type: 'show_proposals', leadName: null } as SalesCommand)
    expect(msg).not.toContain('henüz canlı değil')
    expect(msg).toContain('Kalıcı teklif yok')
  })
})

// ── Dal kapsamı: her yeni handler'ın error/none/many/boş yolları ─────────────
describe('parity komutları — hata/sınır dalları', () => {
  it('draft_status: isimsiz / lead-hata / bulunamadı / çoklu', async () => {
    expect(await run({ type: 'draft_status', leadName: null } as SalesCommand)).toContain('Hangi işletme')
    leadRowsError = { message: 'down' }
    expect(await run({ type: 'draft_status', leadName: 'A' } as SalesCommand)).toContain('HATA verdi')
    leadRowsError = null
    expect(await run({ type: 'draft_status', leadName: 'Yok' } as SalesCommand)).toContain('bulamadım')
    leadRows = [
      { id: '1', business_name: 'A' },
      { id: '2', business_name: 'B' },
    ]
    expect(await run({ type: 'draft_status', leadName: 'X' } as SalesCommand)).toContain('Birden çok eşleşme')
  })

  it('draft_status: attempt hatası + onay okuma hatası + suppressed + alıcı yok dalları', async () => {
    leadRows = [{ id: 'l1', business_name: 'A Ltd' }]
    tableSingle['outreach_messages'] = { data: { id: 'd1', status: 'draft', subject: null }, error: null }
    tableSingle['outreach_send_attempts'] = { data: null, error: { message: 'osa down' } }
    expect(await run({ type: 'draft_status', leadName: 'A' } as SalesCommand)).toContain('Gönderim durumu okunamadı')

    tableSingle['outreach_send_attempts'] = { data: null, error: null }
    findApprovalMock.mockRejectedValue(new Error('appr down'))
    expect(await run({ type: 'draft_status', leadName: 'A' } as SalesCommand)).toContain('Onay durumu okunamadı')

    findApprovalMock.mockResolvedValue(null)
    suppressedSet = new Set(['a@b.co'])
    const sup = await run({ type: 'draft_status', leadName: 'A' } as SalesCommand)
    expect(sup).toContain('compliance_blocked')
    expect(sup).toContain('(yok)') // subject null fallback

    suppressedSet = new Set()
    recipientMock = { email: null, contactId: null, contactName: null, source: 'none' }
    expect(await run({ type: 'draft_status', leadName: 'A' } as SalesCommand)).toContain('recipient_missing')
  })

  it('draft_status: attempt sent+finalized → sent dalı', async () => {
    leadRows = [{ id: 'l1', business_name: 'A Ltd' }]
    tableSingle['outreach_messages'] = { data: { id: 'd1', status: 'sent', subject: 'K' }, error: null }
    tableSingle['outreach_send_attempts'] = { data: { state: 'sent', finalized: true }, error: null }
    expect(await run({ type: 'draft_status', leadName: 'A' } as SalesCommand)).toContain('sent')
  })

  it('request_send_approval: isimsiz / lead-hata / bulunamadı / çoklu / taslak sorgu hatası / generic hata', async () => {
    expect(await run({ type: 'request_send_approval', leadName: '' } as SalesCommand)).toContain('Hangi işletme')
    leadRowsError = { message: 'down' }
    expect(await run({ type: 'request_send_approval', leadName: 'A' } as SalesCommand)).toContain('HATA verdi')
    leadRowsError = null
    expect(await run({ type: 'request_send_approval', leadName: 'Yok' } as SalesCommand)).toContain('bulamadım')
    leadRows = [
      { id: '1', business_name: 'A' },
      { id: '2', business_name: 'B' },
    ]
    expect(await run({ type: 'request_send_approval', leadName: 'X' } as SalesCommand)).toContain('Birden çok eşleşme')

    leadRows = [{ id: 'l1', business_name: 'A Ltd' }]
    tableSingle['outreach_messages'] = { data: null, error: { message: 'om down' } }
    expect(await run({ type: 'request_send_approval', leadName: 'A' } as SalesCommand)).toContain('hata verdi')
    tableSingle['outreach_messages'] = { data: null, error: null }
    expect(await run({ type: 'request_send_approval', leadName: 'A' } as SalesCommand)).toContain('açık taslak yok')
    tableSingle['outreach_messages'] = { data: { id: 'd1' }, error: null }
    requestApprovalMock.mockResolvedValue({ ok: false, error: 'zaten gönderilmiş' })
    expect(await run({ type: 'request_send_approval', leadName: 'A' } as SalesCommand)).toContain('oluşturulamadı')
  })

  it('show_proposals (lead): hata/none/çoklu/generic-hata/schemaMissing/boş', async () => {
    leadRowsError = { message: 'down' }
    expect(await run({ type: 'show_proposals', leadName: 'A' } as SalesCommand)).toContain('HATA verdi')
    leadRowsError = null
    expect(await run({ type: 'show_proposals', leadName: 'Yok' } as SalesCommand)).toContain('bulamadım')
    leadRows = [
      { id: '1', business_name: 'A' },
      { id: '2', business_name: 'B' },
    ]
    expect(await run({ type: 'show_proposals', leadName: 'X' } as SalesCommand)).toContain('Birden çok eşleşme')

    leadRows = [{ id: 'l1', business_name: 'A Ltd' }]
    listProposalsMock.mockResolvedValue({ ok: false, error: 'okunamadı' })
    expect(await run({ type: 'show_proposals', leadName: 'A' } as SalesCommand)).toContain('okunamadı')
    listProposalsMock.mockResolvedValue({ ok: false, schemaMissing: true })
    expect(await run({ type: 'show_proposals', leadName: 'A' } as SalesCommand)).toContain('mig 061')
    listProposalsMock.mockResolvedValue({ ok: true, proposals: [] })
    expect(await run({ type: 'show_proposals', leadName: 'A' } as SalesCommand)).toContain('kalıcı teklif yok')
    listProposalsMock.mockResolvedValue({
      ok: true,
      proposals: [{ id: 'p1', leadId: 'l1', status: 'draft', currentVersion: 1, updatedAt: null, pendingApprovalVersion: null }],
    })
    expect(await run({ type: 'show_proposals', leadName: 'A' } as SalesCommand)).not.toContain('onay bekliyor')
  })

  it('show_proposals (global): generic hata + boş + isimsiz lead join fallback', async () => {
    tableList['proposals'] = { data: null, error: { message: 'db down', code: 'XX000' } }
    expect(await run({ type: 'show_proposals', leadName: null } as SalesCommand)).toContain('okunamadı')
    tableList['proposals'] = { data: [{ id: 'p1', status: 'draft', current_version: 1 }], error: null }
    expect(await run({ type: 'show_proposals', leadName: null } as SalesCommand)).toContain('—')
  })

  it('create_proposal: isimsiz / lead-hata / none / çoklu / lead okunamadı / generic hata / legacy etiketi', async () => {
    expect(await run({ type: 'create_proposal', leadName: '' } as SalesCommand)).toContain('Hangi işletme')
    leadRowsError = { message: 'down' }
    expect(await run({ type: 'create_proposal', leadName: 'A' } as SalesCommand)).toContain('HATA verdi')
    leadRowsError = null
    expect(await run({ type: 'create_proposal', leadName: 'Yok' } as SalesCommand)).toContain('bulamadım')
    leadRows = [
      { id: '1', business_name: 'A' },
      { id: '2', business_name: 'B' },
    ]
    expect(await run({ type: 'create_proposal', leadName: 'X' } as SalesCommand)).toContain('Birden çok eşleşme')

    leadRows = [{ id: 'l1', business_name: 'A Ltd' }]
    tableSingle['leads'] = { data: null, error: { message: 'lead down' } }
    expect(await run({ type: 'create_proposal', leadName: 'A' } as SalesCommand)).toContain('Lead okunamadı')
    tableSingle['leads'] = { data: { recommended_offers: [{ offerId: 'x' }, { bozuk: true }] }, error: null }
    createProposalMock.mockResolvedValue({ ok: false, error: 'tx reddetti' })
    expect(await run({ type: 'create_proposal', leadName: 'A' } as SalesCommand)).toContain('oluşturulamadı')
    createProposalMock.mockResolvedValue({ ok: true, proposalId: 'p', version: 2, atomic: false })
    expect(await run({ type: 'create_proposal', leadName: 'A' } as SalesCommand)).toContain('legacy yol')
  })

  it('reconcile: gmail hata + boş gmail + life generic hata + attempt_count null', async () => {
    cockpit.sendIssues = { items: [], error: 'si down' } as never
    lifeList = { data: null, error: { message: 'life down', code: 'XX000' } }
    const msg = await run({ type: 'show_reconcile' } as SalesCommand)
    expect(msg).toContain('Gmail sorunları okunamadı')
    expect(msg).toContain('Telegram teslimatları okunamadı')

    cockpit.sendIssues = { items: [], error: null } as never
    lifeList = { data: [{ delivery_key: 'k', status: 'pending', attempt_count: null }], error: null }
    const msg2 = await run({ type: 'show_reconcile' } as SalesCommand)
    expect(msg2).toContain('bekleyen sorun yok')
    expect(msg2).toContain('deneme 1')
  })

  it('prepare_draft: claims boş dalı + quality nullish fallback', async () => {
    leadRows = [{ id: 'l1', business_name: 'A Ltd' }]
    generateMock.mockResolvedValue({
      ok: true,
      draft: { id: 'draft-3', subject: 'K', body: 'B', created_at: null },
      quality: { ok: true, violations: [] },
      claims: [],
      claimPersisted: false,
    })
    const msg = await run({ type: 'prepare_draft', kind: 'cold_email', leadName: 'A' } as SalesCommand)
    expect(msg).toContain('Somut iddia yok')
  })

  it('lead_action: lead sorgu hatası açık hata (bulunamadı değil)', async () => {
    leadRowsError = { message: 'conn reset' }
    const msg = await run({ type: 'lead_action', leadName: 'Klinik', action: 'called' } as SalesCommand)
    expect(msg).toContain('HATA verdi')
    expect(applyMock).not.toHaveBeenCalled()
  })
})
