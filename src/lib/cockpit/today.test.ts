import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// /bugun kokpit veri katmanı (FINALIZATION Faz 3 — kritik eşiğe alındı):
// panel bağımsızlığı (bir hata diğerini karartmaz) · aranacaklar dedupe/cap ·
// taslak sınıflandırma zinciri · overdue follow-up görünürlüğü · gelir şeridi ·
// ops metrikleri; TÜM loader hata yolları panel error olarak görünür.
// In-memory DB mock — ağ yok. (Saf yardımcı testleri dosyanın altında.)
// ─────────────────────────────────────────────────────────────────────────────

type MockRow = Record<string, unknown>
const db: Record<string, MockRow[]> = {
  leads: [],
  outreach_messages: [],
  outreach_send_attempts: [],
  email_messages: [],
  follow_up_sequences: [],
  settings: [],
  lead_action_audit: [],
  approval_requests: [],
}
const selectError: Record<string, { message: string } | null> = {}
let leadsFreshError: { message: string } | null = null // yalnız .is(next_follow_up_at,null) sorgusu

function from(table: string) {
  const rows = db[table] ?? []
  const filters: Array<(r: MockRow) => boolean> = []
  let usedIsNull = false
  const orderCols: Array<{ col: string; asc: boolean }> = []
  let limitN: number | null = null

  function exec(): { data: unknown; error: { message: string } | null } {
    if (table === 'leads' && usedIsNull && leadsFreshError) return { data: null, error: leadsFreshError }
    if (selectError[table]) return { data: null, error: selectError[table] }
    let matched = rows.filter((r) => filters.every((f) => f(r)))
    if (orderCols.length > 0) {
      matched = [...matched].sort((a, b) => {
        for (const { col, asc } of orderCols) {
          const av = a[col]
          const bv = b[col]
          if (av === bv) continue
          if (av == null) return 1
          if (bv == null) return -1
          return ((av as never) < (bv as never) ? -1 : 1) * (asc ? 1 : -1)
        }
        return 0
      })
    }
    if (limitN != null) matched = matched.slice(0, limitN)
    return { data: matched, error: null }
  }

  const api: Record<string, unknown> = {}
  Object.assign(api, {
    select: () => api,
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api },
    in: (c: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[c])); return api },
    not: (c: string) => { filters.push((r) => r[c] != null); return api },
    is: (c: string, v: unknown) => { usedIsNull = true; filters.push((r) => r[c] === v); return api },
    lte: (c: string, v: string) => { filters.push((r) => String(r[c]) <= v); return api },
    lt: (c: string, v: string) => { filters.push((r) => String(r[c]) < v); return api },
    gte: (c: string, v: string) => { filters.push((r) => String(r[c]) >= v); return api },
    or: () => {
      // loadSendIssues'un tek or() ifadesi: unknown/failed VEYA sent+finalized=false.
      filters.push((r) => ['unknown', 'failed'].includes(String(r.state)) || (r.state === 'sent' && r.finalized === false))
      return api
    },
    order: (c: string, opts?: { ascending?: boolean }) => {
      orderCols.push({ col: c, asc: opts?.ascending !== false })
      return api
    },
    limit: (n: number) => { limitN = n; return api },
    maybeSingle: async () => {
      const r = exec()
      return { data: (r.data as MockRow[])?.[0] ?? null, error: r.error }
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(exec()).then(resolve, reject),
  })
  return api
}
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: (t: string) => from(t) } }))

let approvalsMap = new Map<string, { id: string; status: string; expires_at: string }>()
let approvalsBatchThrow = false
vi.mock('@/lib/outreach/gmail', () => ({
  findSendApprovalsBatch: async () => {
    if (approvalsBatchThrow) throw new Error('approvals batch down')
    return approvalsMap
  },
}))

let suppressed = new Set<string>()
vi.mock('@/lib/outreach/auditCompliance', () => ({
  extractDomain: (email: string | null) => (email ? email.split('@')[1] ?? null : null),
  getSuppressedSet: async () => suppressed,
}))

let recipientsMap = new Map<
  string,
  { email: string | null; contactId: string | null; contactName: string | null; source: 'primary_contact' | 'lead_email' | 'none' }
>()
vi.mock('@/lib/contacts/contactService', () => ({
  resolveCanonicalRecipients: async () => recipientsMap,
}))

import { getTodayCockpit } from './today'

const NOW = Date.parse('2026-07-14T10:00:00Z')

function seedLead(id: string, over: MockRow = {}) {
  db.leads.push({
    id,
    business_name: `İşletme ${id}`,
    phone: `0534 000 ${id.length % 10}${id.length % 10} ${10 + (id.charCodeAt(id.length - 1) % 80)}`,
    status: 'new',
    lead_tier: 'A',
    next_follow_up_at: null,
    expected_monthly_value_tl: 1000,
    quality_score: 5,
    money_potential_score: 5,
    urgency_score: 5,
    last_contact_at: null,
    do_not_contact: false,
    pain_point: null,
    ...over,
  })
}

beforeEach(() => {
  for (const k of Object.keys(db)) db[k] = []
  for (const k of Object.keys(selectError)) selectError[k] = null
  leadsFreshError = null
  approvalsMap = new Map()
  approvalsBatchThrow = false
  suppressed = new Set()
  recipientsMap = new Map()
})

describe('getTodayCockpit — mutlu yol', () => {
  it('aranacaklar: due + günlük seçim, telefon dedupe raporlu, cap 12', async () => {
    seedLead('due-1', { status: 'contacted', next_follow_up_at: '2026-07-10T00:00:00Z', phone: '0534 111 22 33' })
    seedLead('due-2', { status: 'responded', next_follow_up_at: '2026-07-11T00:00:00Z', phone: '0534 111 22 44' })
    seedLead('dup-of-due', { phone: '0534 111 22 33' }) // aynı telefon → listeye girmez, rapora girer
    for (let i = 0; i < 12; i++) seedLead(`fresh-${String(i).padStart(2, '0')}`, { phone: `0534 222 33 ${10 + i}` })

    const r = await getTodayCockpit(NOW)
    expect(r.leadsToCall.error).toBeNull()
    expect(r.leadsToCall.items).toHaveLength(12) // cap
    expect(r.leadsToCall.items[0].source).toBe('due')
    expect(r.leadsToCall.items[0].reason).toContain('Takip zamanı')
    expect(r.leadsToCall.items.some((l) => l.source === 'daily')).toBe(true)
    expect(r.callDuplicates).toHaveLength(1)
    expect(r.callDuplicates[0]).toMatchObject({ canonicalId: 'due-1', duplicateId: 'dup-of-due' })
  })

  it('taslak paneli: sınıflandırma zinciri (recipient/suppressed/approval) + lead-başına tek açık taslak', async () => {
    seedLead('l1')
    seedLead('l2')
    seedLead('l3')
    db.outreach_messages.push(
      { id: 'd1', channel: 'email', status: 'draft', lead_id: 'l1', subject: 'K1', body: 'B1', final_body: null, created_at: '2026-07-14T09:00:00Z', leads: { business_name: 'İşletme l1' } },
      { id: 'd1-eski', channel: 'email', status: 'draft', lead_id: 'l1', subject: 'K0', body: 'B0', final_body: null, created_at: '2026-07-13T09:00:00Z', leads: { business_name: 'İşletme l1' } },
      { id: 'd2', channel: 'email', status: 'draft', lead_id: 'l2', subject: 'K2', body: 'B2', final_body: 'B2-final', created_at: '2026-07-14T08:00:00Z', leads: { business_name: 'İşletme l2' } },
      { id: 'd3', channel: 'email', status: 'draft', lead_id: 'l3', subject: 'K3', body: 'B3', final_body: null, created_at: '2026-07-14T07:00:00Z', leads: { business_name: 'İşletme l3' } },
      { id: 'd4', channel: 'email', status: 'sent', lead_id: 'l1', subject: 'K4', body: 'B4', final_body: null, created_at: '2026-07-12T09:00:00Z', leads: { business_name: 'İşletme l1' } },
    )
    recipientsMap.set('l1', { email: 'a@x.com', contactId: 'c1', contactName: 'Ali', source: 'primary_contact' })
    recipientsMap.set('l2', { email: 'b@y.com', contactId: null, contactName: null, source: 'lead_email' })
    recipientsMap.set('l3', { email: null, contactId: null, contactName: null, source: 'none' })
    suppressed = new Set(['b@y.com'])
    approvalsMap.set('d1', { id: 'ap1', status: 'pending', expires_at: '2099-01-01' })

    const r = await getTodayCockpit(NOW)
    expect(r.pendingSends.error).toBeNull()
    const byId = new Map(r.pendingSends.items.map((d) => [d.draftId, d]))
    expect(byId.has('d1-eski')).toBe(false) // lead-başına tek açık taslak
    expect(byId.get('d1')).toMatchObject({ state: 'approval_pending', approvalId: 'ap1', domain: 'x.com', body: 'B1' })
    expect(byId.get('d2')).toMatchObject({ state: 'compliance_blocked', body: 'B2-final' })
    expect(byId.get('d3')).toMatchObject({ state: 'recipient_missing', recipientSource: 'none' })
    expect(byId.get('d4')?.state).toBe('sent') // legacy sent satırı darboğaz değil
    expect(byId.get('d1')?.nextAction).toContain('Onayı bekle')
  })

  it('attempt durumu sınıflamada önceliklidir (unknown)', async () => {
    db.outreach_messages.push(
      { id: 'du', channel: 'email', status: 'draft', lead_id: null, subject: 's', body: 'b', final_body: null, created_at: '2026-07-14T09:00:00Z' },
    )
    db.outreach_send_attempts.push({ outreach_message_id: 'du', state: 'unknown', finalized: false })
    const r = await getTodayCockpit(NOW)
    expect(r.pendingSends.items[0].state).toBe('unknown')
  })

  it('cevaplar + geciken follow-up + gönderim sorunları + sıcak lead + gelir + ops metrikleri', async () => {
    seedLead('hot-1', { status: 'responded', expected_monthly_value_tl: 5000, pain_point: 'site yok' })
    seedLead('hot-2', { status: 'meeting', expected_monthly_value_tl: 8000 })
    db.email_messages.push({ id: 'in1', direction: 'inbound', from_address: 'x@m.com', subject: 'Re: teklif', sent_at: '2026-07-14T08:00:00Z' })
    db.follow_up_sequences.push({ id: 'f1', lead_id: 'hot-1', step: 2, due_at: '2026-07-10T00:00:00Z', done: false, leads: { business_name: 'İşletme hot-1' } })
    db.outreach_send_attempts.push(
      { outreach_message_id: 'm-u', state: 'unknown', finalized: false, attempt_count: 2, reconcile_search_count: 1, last_error: 'timeout', updated_at: '2026-07-14T01:00:00Z' },
      { outreach_message_id: 'm-fp', state: 'sent', finalized: false, attempt_count: 1, reconcile_search_count: 0, last_error: null, updated_at: '2026-07-14T02:00:00Z' },
      { outreach_message_id: 'm-ok', state: 'sent', finalized: true, attempt_count: 1, reconcile_search_count: 0, last_error: null, updated_at: '2026-07-14T03:00:00Z' },
    )
    db.settings.push({ monthly_revenue_target_tl: 90000 })
    db.lead_action_audit.push(
      { action: 'called', created_at: '2026-07-14T08:00:00Z' },
      { action: 'called', created_at: '2026-07-14T09:00:00Z' },
      { action: 'note', created_at: '2026-07-13T09:00:00Z' }, // dün → sayılmaz
    )
    db.outreach_messages.push({ id: 'sent-today', channel: 'email', status: 'sent', lead_id: null, subject: 's', body: 'b', final_body: null, created_at: '2026-07-14T06:00:00Z', sent_at: '2026-07-14T06:00:00Z' })
    db.approval_requests.push({ id: 'apx', action: 'outreach.send_gmail', created_at: '2026-07-14T05:00:00Z' })

    const r = await getTodayCockpit(NOW)
    expect(r.replies.items).toHaveLength(1)
    expect(r.replies.items[0].fromAddress).toBe('x@m.com')
    expect(r.overdueFollowups.items).toHaveLength(1)
    expect(r.overdueFollowups.items[0]).toMatchObject({ step: 2, businessName: 'İşletme hot-1' })
    expect(r.sendIssues.items.map((s) => s.outreachMessageId).sort()).toEqual(['m-fp', 'm-u'])
    expect(r.hotLeads.items[0]).toMatchObject({ id: 'hot-2', expectedMonthlyTl: 8000 })
    expect(r.revenue.data?.targetTl).toBe(90000)
    expect(r.revenue.data?.weightedPipelineTl).toBe(Math.round(5000 * 0.35 + 8000 * 0.5))
    expect(r.opsMetrics.data).toMatchObject({ totalActions: 2, emailsSent: 1, approvalsRequested: 1 })
    expect(r.opsMetrics.data?.actionsByType).toEqual({ called: 2 })
  })
})

describe('getTodayCockpit — hata bağımsızlığı (bir panel hatası diğerini karartmaz)', () => {
  it('leads sorgusu hatası: aranacaklar/hot error, replies etkilenmez', async () => {
    selectError.leads = { message: 'leads down' }
    db.email_messages.push({ id: 'in1', direction: 'inbound', from_address: 'x@m.com', subject: 's', sent_at: '2026-07-14T08:00:00Z' })
    const r = await getTodayCockpit(NOW)
    expect(r.leadsToCall.error).toContain('leads down')
    expect(r.hotLeads.error).toContain('leads down') // aynı tablo — o da etkilenir (dürüst)
    expect(r.replies.error).toBeNull()
    expect(r.replies.items).toHaveLength(1)
  })

  it('günlük-seçim (fresh) sorgusu hatası da GİZLENMEZ', async () => {
    seedLead('due-1', { status: 'contacted', next_follow_up_at: '2026-07-10T00:00:00Z' })
    leadsFreshError = { message: 'fresh down' }
    const r = await getTodayCockpit(NOW)
    expect(r.leadsToCall.error).toContain('fresh down')
  })

  it('taslak sorgusu hatası → pendingSends error', async () => {
    selectError.outreach_messages = { message: 'om down' }
    const r = await getTodayCockpit(NOW)
    expect(r.pendingSends.error).toContain('om down')
    expect(r.opsMetrics.error).toContain('om down') // aynı tablo (gönderim metriği) — dürüst
  })

  it('attempt sorgusu hatası → sahte approval_missing YOK, panel error', async () => {
    seedLead('l1')
    db.outreach_messages.push({ id: 'd1', channel: 'email', status: 'draft', lead_id: 'l1', subject: 's', body: 'b', final_body: null, created_at: '2026-07-14T09:00:00Z' })
    selectError.outreach_send_attempts = { message: 'attempts down' }
    const r = await getTodayCockpit(NOW)
    expect(r.pendingSends.error).toContain('attempts down')
  })

  it('approvals batch hatası → pendingSends error (yutulmaz)', async () => {
    seedLead('l1')
    db.outreach_messages.push({ id: 'd1', channel: 'email', status: 'draft', lead_id: 'l1', subject: 's', body: 'b', final_body: null, created_at: '2026-07-14T09:00:00Z' })
    recipientsMap.set('l1', { email: 'a@x.com', contactId: null, contactName: null, source: 'lead_email' })
    approvalsBatchThrow = true
    const r = await getTodayCockpit(NOW)
    expect(r.pendingSends.error).toContain('approvals batch down')
  })

  it('replies / follow-up / sendIssues / ops hata yolları ayrı ayrı görünür', async () => {
    selectError.email_messages = { message: 'em down' }
    selectError.follow_up_sequences = { message: 'fus down' }
    selectError.outreach_send_attempts = { message: 'osa down' }
    selectError.lead_action_audit = { message: 'audit down' }
    const r = await getTodayCockpit(NOW)
    expect(r.replies.error).toContain('em down')
    expect(r.overdueFollowups.error).toContain('fus down')
    expect(r.sendIssues.error).toContain('osa down')
    expect(r.opsMetrics.error).toContain('audit down')
    expect(r.leadsToCall.error).toBeNull() // leads sağlam
  })

  it('onay metriği sorgusu hatası → opsMetrics error', async () => {
    selectError.approval_requests = { message: 'apr down' }
    const r = await getTodayCockpit(NOW)
    expect(r.opsMetrics.error).toContain('onay metriği okunamadı')
  })

  it('revenue: settings yoksa default hedef 120000', async () => {
    seedLead('c1', { status: 'contacted', expected_monthly_value_tl: 1000 })
    const r = await getTodayCockpit(NOW)
    expect(r.revenue.data?.targetTl).toBe(120000)
    expect(r.revenue.data?.weightedPipelineTl).toBe(100)
  })
})

describe('getTodayCockpit — fallback dalları (null alanlar)', () => {
  it('null alanlı satırlar güvenli fallback ile görünür (—, 0, (konu yok))', async () => {
    // Kısa telefonlu lead: normalize anahtarı null → dedupe atlanır ama listede.
    db.leads.push({
      id: 'n1', business_name: null, phone: '112', status: 'contacted', lead_tier: null,
      next_follow_up_at: '2026-07-10T00:00:00Z', expected_monthly_value_tl: null,
      quality_score: null, money_potential_score: null, urgency_score: null,
      last_contact_at: null, do_not_contact: false, pain_point: null,
    })
    db.outreach_messages.push({
      id: 'dn', channel: 'email', status: 'draft', lead_id: null, subject: null, body: null,
      final_body: null, created_at: '2026-07-14T09:00:00Z',
    })
    db.email_messages.push({ id: 'r1', direction: 'inbound', from_address: null, subject: null, sent_at: null })
    db.follow_up_sequences.push({ id: 'fo', lead_id: null, step: null, due_at: '2026-07-01T00:00:00Z', done: false })
    db.outreach_send_attempts.push({
      outreach_message_id: 'mx', state: 'failed', finalized: null, attempt_count: null,
      reconcile_search_count: null, last_error: null, updated_at: '2026-07-14T01:00:00Z',
    })
    db.leads.push({
      id: 'h-null', business_name: null, phone: null, status: 'responded', lead_tier: null,
      next_follow_up_at: null, expected_monthly_value_tl: null, quality_score: null,
      money_potential_score: null, urgency_score: null, last_contact_at: null,
      do_not_contact: false, pain_point: null,
    })
    db.lead_action_audit.push({ action: null, created_at: '2026-07-14T08:00:00Z' })

    const r = await getTodayCockpit(NOW)
    expect(r.leadsToCall.items[0]).toMatchObject({ businessName: '—', expectedMonthlyTl: 0, tier: null })
    const draft = r.pendingSends.items.find((d) => d.draftId === 'dn')!
    expect(draft).toMatchObject({ subject: '(konu yok)', businessName: '—', domain: 'bilinmiyor', recipientSource: 'none' })
    expect(r.replies.items[0]).toMatchObject({ fromAddress: null, subject: null, sentAt: null })
    expect(r.overdueFollowups.items[0]).toMatchObject({ leadId: null, businessName: '—', step: 0 })
    expect(r.sendIssues.items[0]).toMatchObject({ attemptCount: 1, searchCount: 0, lastError: null, finalized: false })
    expect(r.hotLeads.items[0]).toMatchObject({ businessName: '—', expectedMonthlyTl: 0, painPoint: null })
    expect(r.opsMetrics.data?.actionsByType).toEqual({ other: 1 })
  })

  it('revenue leads hatası → revenue.error dolu, data null', async () => {
    selectError.leads = { message: 'leads down' }
    const r = await getTodayCockpit(NOW)
    expect(r.revenue.data).toBeNull()
    expect(r.revenue.error).toContain('leads down')
  })

  it('approved onaylı taslak → state approved + next action gönder', async () => {
    seedLead('l1')
    db.outreach_messages.push({ id: 'da', channel: 'email', status: 'draft', lead_id: 'l1', subject: 's', body: 'b', final_body: null, created_at: '2026-07-14T09:00:00Z', leads: { business_name: 'İşletme l1' } })
    recipientsMap.set('l1', { email: 'a@x.com', contactId: null, contactName: null, source: 'lead_email' })
    approvalsMap.set('da', { id: 'ap9', status: 'approved', expires_at: '2099-01-01' })
    const r = await getTodayCockpit(NOW)
    expect(r.pendingSends.items[0].state).toBe('approved')
    expect(r.pendingSends.items[0].nextAction).toContain('gönder')
  })
})

// ── Mevcut saf yardımcı testleri (korundu) ──────────────────────────────────
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
