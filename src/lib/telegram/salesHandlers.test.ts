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
let leadDetail: Record<string, unknown> | null = null
let draftInsertError: { message: string } | null = null
const draftInserts: Array<Record<string, unknown>> = []

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const api: Record<string, unknown> = {}
      Object.assign(api, {
        select: () => api,
        ilike: () => api,
        eq: () => api,
        limit: async () =>
          table === 'leads' ? { data: leadRows, error: null } : { data: [], error: null },
        maybeSingle: async () => ({ data: leadDetail, error: null }),
        insert: (row: Record<string, unknown>) => {
          draftInserts.push(row)
          return {
            select: () => ({
              single: async () =>
                draftInsertError
                  ? { data: null, error: draftInsertError }
                  : { data: { id: 'draft-uuid-12345678' }, error: null },
            }),
          }
        },
      })
      return api
    },
  },
}))

let pendingAction: { type: string; payload: Record<string, unknown> } | null = null
vi.mock('./pendingActions', () => ({
  consumePendingAction: async () => {
    const p = pendingAction
    pendingAction = null
    return p
  },
}))

import { handleSalesCommand, parseLaterHint } from './salesHandlers'
import type { SalesCommand } from './salesCommands'

const CTX = { updateId: 555, chatKey: '42' }
const run = (cmd: SalesCommand) => handleSalesCommand(cmd, CTX)

beforeEach(() => {
  cockpit = emptyCockpit()
  applyMock.mockReset().mockResolvedValue({ ok: true, audit: 'ok', after: { next_follow_up_at: null } })
  leadRows = []
  leadDetail = null
  draftInsertError = null
  draftInserts.length = 0
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

describe('prepare_draft — gerçek draft kaydı, asla "gönderilebilir" izlenimi yok', () => {
  it('isimsiz → taslak oluşturulmaz', async () => {
    const msg = await run({ type: 'prepare_draft', kind: 'cold_email' } as SalesCommand)
    expect(msg).toContain('Hangi işletme')
    expect(draftInserts).toHaveLength(0)
  })

  it('bulunamadı / çoklu eşleşme → taslak oluşturulmaz', async () => {
    expect(await run({ type: 'prepare_draft', kind: 'cold_email', leadName: 'Yok' } as SalesCommand)).toContain('bulamadım')
    leadRows = [
      { id: '1', business_name: 'A' },
      { id: '2', business_name: 'B' },
    ]
    expect(await run({ type: 'prepare_draft', kind: 'cold_email', leadName: 'X' } as SalesCommand)).toContain('Birden çok eşleşme')
    expect(draftInserts).toHaveLength(0)
  })

  it('hazır mesaj verisi yoksa UYDURMAZ', async () => {
    leadRows = [{ id: 'l1', business_name: 'A Ltd' }]
    leadDetail = { id: 'l1', first_message: null, pitch_draft: null }
    const msg = await run({ type: 'prepare_draft', kind: 'cold_email', leadName: 'A' } as SalesCommand)
    expect(msg).toContain('Uydurma içerik yazmam')
    expect(draftInserts).toHaveLength(0)
  })

  it('başarı: draft status=draft + gönderilebilir DEĞİL mesajı; follow_up sequence_step=1', async () => {
    leadRows = [{ id: 'l1', business_name: 'A Ltd' }]
    leadDetail = { id: 'l1', first_message: 'Merhaba, kanıtlı öneri.', pitch_draft: null }
    const msg = await run({ type: 'prepare_draft', kind: 'cold_email', leadName: 'A' } as SalesCommand)
    expect(draftInserts[0]).toMatchObject({ status: 'draft', channel: 'email', created_by: 'telegram', sequence_step: 0 })
    expect(msg).toContain('gönderilebilir DEĞİL')

    const msg2 = await run({ type: 'prepare_draft', kind: 'follow_up', leadName: 'A' } as SalesCommand)
    expect(draftInserts[1]).toMatchObject({ sequence_step: 1 })
    expect(msg2).toContain('Taslak oluşturuldu')
  })

  it('insert hatası görünür', async () => {
    leadRows = [{ id: 'l1', business_name: 'A Ltd' }]
    leadDetail = { id: 'l1', first_message: 'x', pitch_draft: null }
    draftInsertError = { message: 'kolon yok' }
    expect(await run({ type: 'prepare_draft', kind: 'cold_email', leadName: 'A' } as SalesCommand)).toContain('Taslak kaydedilemedi')
  })
})

describe('generic_approve — Telegram üzerinden gönderim onayı YAPISAL kapalı', () => {
  it('pending yok → hiçbir şey gönderilmedi mesajı', async () => {
    expect(await run({ type: 'generic_approve' } as SalesCommand)).toContain('hiçbir şey gönderilmedi')
  })
  it('pending olsa bile Telegram onayı reddedilir (tüketilir)', async () => {
    pendingAction = { type: 'send_email', payload: {} }
    const msg = await run({ type: 'generic_approve' } as SalesCommand)
    expect(msg).toContain('Telegram üzerinden onaylanamaz')
    expect(pendingAction).toBeNull() // tüketildi — replay edilemez
  })
})

describe('show_proposals', () => {
  it('teklif motoru canlı değil bilgisi', async () => {
    expect(await run({ type: 'show_proposals' } as SalesCommand)).toContain('teklif motoru')
  })
})
