// ─────────────────────────────────────────────────────────────────────────────
// /bugun gelir kokpiti veri katmanı (Sprint 1A — doc 33 §1A).
// 7 panel + beklenen-gelir şeridi; her sorgu bağımsız hata yakalar (bir panelin
// hatası diğerlerini KARARTMAZ — panel kendi error durumunu taşır).
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { findSendApproval } from '@/lib/outreach/gmail'
import { extractDomain } from '@/lib/outreach/auditCompliance'

export interface PanelResult<T> {
  items: T[]
  error: string | null
}

export interface CallLead {
  id: string
  businessName: string
  phone: string | null
  status: string
  tier: string | null
  nextFollowUpAt: string | null
  expectedMonthlyTl: number
  /** 'due' = follow-up zamanı gelmiş; 'daily' = deterministik günlük seçim (NULL follow-up). */
  source: 'due' | 'daily'
  reason: string
}

/** Bugün aranacaklar üst sınırı (due + daily-pick toplamı). */
const CALL_LIST_CAP = 12

export interface PendingSendDraft {
  draftId: string
  approvalId: string
  approvalStatus: string
  businessName: string
  domain: string
  subject: string
}

export interface InboundReply {
  id: string
  fromAddress: string | null
  subject: string | null
  sentAt: string | null
}

export interface OverdueFollowup {
  id: string
  leadId: string | null
  businessName: string
  step: number
  dueAt: string
}

export interface SendIssue {
  outreachMessageId: string
  state: string
  finalized: boolean
  attemptCount: number
  searchCount: number
  lastError: string | null
}

export interface HotLead {
  id: string
  businessName: string
  status: string
  expectedMonthlyTl: number
  painPoint: string | null
}

export interface RevenueStrip {
  targetTl: number
  weightedPipelineTl: number
  byStage: Array<{ stage: string; count: number; weightedTl: number }>
}

export interface TodayCockpit {
  leadsToCall: PanelResult<CallLead>
  pendingSends: PanelResult<PendingSendDraft>
  replies: PanelResult<InboundReply>
  overdueFollowups: PanelResult<OverdueFollowup>
  sendIssues: PanelResult<SendIssue>
  hotLeads: PanelResult<HotLead>
  revenue: { data: RevenueStrip | null; error: string | null }
}

/** Aşama → kapanma olasılığı katsayısı. [ASSUMPTION] Başlangıç kalibrasyonu —
 *  gerçek funnel verisi biriktikçe lead_match_feedback ile güncellenir (doc 33 §3B). */
export const STAGE_WEIGHTS: Record<string, number> = {
  contacted: 0.1,
  responded: 0.35,
  meeting: 0.5,
  proposal: 0.7,
}

/** SAF hesap: aşama-ağırlıklı beklenen aylık gelir (deterministik, LLM'siz). */
export function computeExpectedRevenue(
  rows: Array<{ status: string; expected_monthly_value_tl: number | null }>
): Pick<RevenueStrip, 'weightedPipelineTl' | 'byStage'> {
  const byStage = new Map<string, { count: number; weightedTl: number }>()
  let total = 0
  for (const row of rows) {
    const weight = STAGE_WEIGHTS[row.status]
    if (!weight) continue
    const value = (row.expected_monthly_value_tl ?? 0) * weight
    total += value
    const agg = byStage.get(row.status) ?? { count: 0, weightedTl: 0 }
    agg.count += 1
    agg.weightedTl += value
    byStage.set(row.status, agg)
  }
  return {
    weightedPipelineTl: Math.round(total),
    byStage: Object.keys(STAGE_WEIGHTS).map((stage) => ({
      stage,
      count: byStage.get(stage)?.count ?? 0,
      weightedTl: Math.round(byStage.get(stage)?.weightedTl ?? 0),
    })),
  }
}

async function panel<T>(fn: () => Promise<T[]>): Promise<PanelResult<T>> {
  try {
    return { items: await fn(), error: null }
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : 'bilinmeyen hata' }
  }
}

const CALL_COLS =
  'id, business_name, phone, status, lead_tier, next_follow_up_at, expected_monthly_value_tl, ' +
  'quality_score, money_potential_score, urgency_score, last_contact_at, do_not_contact'

type LeadRow = {
  id: string
  business_name: string | null
  phone: string | null
  status: string
  lead_tier: string | null
  next_follow_up_at: string | null
  expected_monthly_value_tl: number | null
}

function toCallLead(r: LeadRow, source: 'due' | 'daily', reason: string): CallLead {
  return {
    id: r.id,
    businessName: r.business_name ?? '—',
    phone: r.phone ?? null,
    status: r.status,
    tier: r.lead_tier ?? null,
    nextFollowUpAt: r.next_follow_up_at ?? null,
    expectedMonthlyTl: r.expected_monthly_value_tl ?? 0,
    source,
    reason,
  }
}

// Bugün aranacaklar: (1) follow-up zamanı gelmiş leadler + (2) hiç planlanmamış
// (next_follow_up_at NULL) aktif new leadlerden DETERMINISTIK günlük seçim.
// (2) olmadan 61 telefonlu-ama-follow-up'sız lead görünmez → "0 aranacak" (finding #1-4).
// Sayfa okunurken DB'ye YAZILMAZ; sıralama sabit kolonlarla → aynı gün aynı sıra.
async function loadLeadsToCall(nowIso: string): Promise<CallLead[]> {
  // (1) Follow-up zamanı gelmiş.
  const { data: due, error: dueErr } = await supabaseAdmin
    .from('leads')
    .select(CALL_COLS)
    .in('status', ['new', 'contacted', 'responded'])
    .eq('do_not_contact', false)
    .not('next_follow_up_at', 'is', null)
    .lte('next_follow_up_at', nowIso)
    .order('next_follow_up_at', { ascending: true })
    .limit(CALL_LIST_CAP)
  if (dueErr) throw new Error(dueErr.message)

  const dueRows = (due ?? []) as unknown as LeadRow[]
  const out: CallLead[] = dueRows.map((r) => toCallLead(r, 'due', 'Takip zamanı geldi'))
  const seen = new Set(out.map((l) => l.id))
  const remaining = CALL_LIST_CAP - out.length

  // (2) Günlük deterministik seçim: hiç planlanmamış (NULL follow-up) aktif new leadler.
  //     Öncelik: aranabilir (telefon var, do_not_contact=false) + tier A>B>… (asc: A önce,
  //     null sona) → kalite → para → aciliyet → en eski temas → id (stabil tie-break).
  if (remaining > 0) {
    const { data: fresh, error: freshErr } = await supabaseAdmin
      .from('leads')
      .select(CALL_COLS)
      .eq('status', 'new')
      .eq('do_not_contact', false)
      .not('phone', 'is', null)
      .is('next_follow_up_at', null)
      .order('lead_tier', { ascending: true, nullsFirst: false })
      .order('quality_score', { ascending: false, nullsFirst: false })
      .order('money_potential_score', { ascending: false, nullsFirst: false })
      .order('urgency_score', { ascending: false, nullsFirst: false })
      .order('last_contact_at', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true })
      .limit(remaining)
    if (freshErr) throw new Error(freshErr.message)
    const freshRows = (fresh ?? []) as unknown as LeadRow[]
    for (const r of freshRows) {
      if (seen.has(r.id)) continue
      out.push(toCallLead(r, 'daily', 'Günün önceliği (henüz aranmadı)'))
    }
  }

  return out
}

async function loadPendingSends(): Promise<PendingSendDraft[]> {
  // Email taslakları → her biri için onay durumu (idempotency türevli lookup).
  const { data, error } = await supabaseAdmin
    .from('outreach_messages')
    .select('id, subject, lead_id, leads(business_name, email)')
    .eq('channel', 'email')
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw new Error(error.message)
  const out: PendingSendDraft[] = []
  for (const row of data ?? []) {
    const approval = await findSendApproval(row.id as string)
    if (!approval || !['pending', 'approved'].includes(approval.status)) continue
    const lead = (row as { leads?: { business_name?: string; email?: string } }).leads
    out.push({
      draftId: row.id as string,
      approvalId: approval.id,
      approvalStatus: approval.status,
      businessName: lead?.business_name ?? '—',
      domain: extractDomain(lead?.email ?? null) ?? 'bilinmiyor',
      subject: (row.subject as string) ?? '(konu yok)',
    })
  }
  return out
}

async function loadReplies(): Promise<InboundReply[]> {
  const { data, error } = await supabaseAdmin
    .from('email_messages')
    .select('id, from_address, subject, sent_at')
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: false })
    .limit(5)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    fromAddress: (r.from_address as string) ?? null,
    subject: (r.subject as string) ?? null,
    sentAt: (r.sent_at as string) ?? null,
  }))
}

async function loadOverdueFollowups(nowIso: string): Promise<OverdueFollowup[]> {
  const { data, error } = await supabaseAdmin
    .from('follow_up_sequences')
    .select('id, lead_id, step, due_at, leads(business_name)')
    .eq('done', false)
    .lt('due_at', nowIso)
    .order('due_at', { ascending: true })
    .limit(8)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    leadId: (r.lead_id as string) ?? null,
    businessName: (r as { leads?: { business_name?: string } }).leads?.business_name ?? '—',
    step: (r.step as number) ?? 0,
    dueAt: r.due_at as string,
  }))
}

async function loadSendIssues(): Promise<SendIssue[]> {
  // unknown/failed + "provider gönderdi ama finalize eksik" (reconciliation kuyruğu).
  const { data, error } = await supabaseAdmin
    .from('outreach_send_attempts')
    .select('outreach_message_id, state, finalized, attempt_count, reconcile_search_count, last_error')
    .or('state.in.(unknown,failed),and(state.eq.sent,finalized.eq.false)')
    .order('updated_at', { ascending: false })
    .limit(8)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    outreachMessageId: r.outreach_message_id as string,
    state: r.state as string,
    finalized: Boolean(r.finalized),
    attemptCount: (r.attempt_count as number) ?? 1,
    searchCount: (r.reconcile_search_count as number) ?? 0,
    lastError: (r.last_error as string) ?? null,
  }))
}

async function loadHotLeads(): Promise<HotLead[]> {
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('id, business_name, status, expected_monthly_value_tl, pain_point')
    .in('status', ['responded', 'meeting'])
    .order('expected_monthly_value_tl', { ascending: false, nullsFirst: false })
    .limit(6)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    businessName: (r.business_name as string) ?? '—',
    status: r.status as string,
    expectedMonthlyTl: (r.expected_monthly_value_tl as number) ?? 0,
    painPoint: (r.pain_point as string) ?? null,
  }))
}

async function loadRevenue(): Promise<RevenueStrip> {
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('status, expected_monthly_value_tl')
    .in('status', Object.keys(STAGE_WEIGHTS))
  if (error) throw new Error(error.message)
  const { data: target } = await supabaseAdmin
    .from('settings')
    .select('monthly_revenue_target_tl')
    .limit(1)
    .maybeSingle()
  const computed = computeExpectedRevenue(
    (data ?? []) as Array<{ status: string; expected_monthly_value_tl: number | null }>
  )
  return {
    targetTl: (target?.monthly_revenue_target_tl as number) ?? 120000,
    ...computed,
  }
}

export async function getTodayCockpit(nowMs: number = Date.now()): Promise<TodayCockpit> {
  const nowIso = new Date(nowMs).toISOString()
  const [leadsToCall, pendingSends, replies, overdueFollowups, sendIssues, hotLeads, revenue] =
    await Promise.all([
      panel(() => loadLeadsToCall(nowIso)),
      panel(loadPendingSends),
      panel(loadReplies),
      panel(() => loadOverdueFollowups(nowIso)),
      panel(loadSendIssues),
      panel(loadHotLeads),
      loadRevenue().then(
        (data) => ({ data, error: null as string | null }),
        (err: unknown) => ({ data: null, error: err instanceof Error ? err.message : 'hata' })
      ),
    ])
  return { leadsToCall, pendingSends, replies, overdueFollowups, sendIssues, hotLeads, revenue }
}
