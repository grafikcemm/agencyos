// ─────────────────────────────────────────────────────────────────────────────
// /bugun gelir kokpiti veri katmanı (Sprint 1A — doc 33 §1A).
// 7 panel + beklenen-gelir şeridi; her sorgu bağımsız hata yakalar (bir panelin
// hatası diğerlerini KARARTMAZ — panel kendi error durumunu taşır).
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { findSendApprovalsBatch } from '@/lib/outreach/gmail'
import { extractDomain, getSuppressedSet } from '@/lib/outreach/auditCompliance'
import { resolveCanonicalRecipients } from '@/lib/contacts/contactService'
import type { BudgetAction } from './timeBudget'

// Paylaşılan tipler + saf yardımcılar client-safe modülde (shared.ts) — build:
// 'use client' paneller server-only olan bu dosyadan DEĞER import edemez.
import {
  classifyDraftState,
  normalizePhoneKey,
  DRAFT_NEXT_ACTION,
  type PanelResult,
  type CallLead,
  type CallDuplicate,
  type PendingSendDraft,
  type SendIssue,
} from './shared'
export * from './shared'

/** Bugün aranacaklar üst sınırı (due + daily-pick toplamı). */
const CALL_LIST_CAP = 12

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

/** Faz 4.9: bugün TAMAMLANAN gelir aksiyonları (audit tabanlı — iddia değil kayıt). */
export interface OpsMetrics {
  /** lead_action_audit bugünkü satır sayısı (aksiyon türüne göre). */
  actionsByType: Record<string, number>
  totalActions: number
  /** Bugün gönderilen e-postalar (outreach sent_at bugünde). */
  emailsSent: number
  /** Bugün oluşturulan onay istekleri. */
  approvalsRequested: number
}

export interface TodayCockpit {
  leadsToCall: PanelResult<CallLead>
  /** C2: aynı telefonun dublörleri — review edilsin diye görünür, otomatik merge YOK. */
  callDuplicates: CallDuplicate[]
  pendingSends: PanelResult<PendingSendDraft>
  replies: PanelResult<InboundReply>
  overdueFollowups: PanelResult<OverdueFollowup>
  sendIssues: PanelResult<SendIssue>
  hotLeads: PanelResult<HotLead>
  revenue: { data: RevenueStrip | null; error: string | null }
  opsMetrics: { data: OpsMetrics | null; error: string | null }
  /** Faz 4: gece enrichment son-koşu özeti (hata/limit/maliyet görünürlüğü). */
  enrichment: { data: EnrichmentStatus | null; error: string | null }
  /** Faz 7: 30dk zaman-bütçesi için hazır aksiyonlar (UI değer/süre sıralar). */
  budgetActions: BudgetAction[]
}

export interface EnrichmentStatus {
  at: string | null
  scanned: number
  contactsAdded: number
  evidenceAdded: number
  primaryAutoSet: number
  hitlPending: number
  apolloCalls: number
  duplicatesSkipped: number
  cappedOut: number
  errorCount: number
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
async function loadLeadsToCall(nowIso: string): Promise<{ list: CallLead[]; duplicates: CallDuplicate[] }> {
  // (1) Follow-up zamanı gelmiş.
  const { data: due, error: dueErr } = await supabaseAdmin
    .from('leads')
    .select(CALL_COLS)
    .in('status', ['new', 'contacted', 'responded'])
    .eq('do_not_contact', false)
    .not('phone', 'is', null) // 1.1: aranacaklar listesinde telefonsuz satır olamaz
    .not('next_follow_up_at', 'is', null)
    .lte('next_follow_up_at', nowIso)
    .order('next_follow_up_at', { ascending: true })
    .limit(CALL_LIST_CAP * 2) // dedupe SONRASI cap dolabilsin (SQL-limit öncesi kayıp telafisi)
  if (dueErr) throw new Error(dueErr.message)

  // C2 dedupe: aynı normalize telefon aynı gün listesinde İKİ KEZ çıkmaz.
  // Kanonik = sıralamada önce gelen; atlanan satır silinmez, review için raporlanır.
  const out: CallLead[] = []
  const duplicates: CallDuplicate[] = []
  const seen = new Set<string>()
  const phoneOwner = new Map<string, CallLead>()

  const pushDeduped = (lead: CallLead): void => {
    if (seen.has(lead.id)) return
    const key = normalizePhoneKey(lead.phone)
    if (key) {
      const owner = phoneOwner.get(key)
      if (owner) {
        duplicates.push({
          phoneKey: key,
          canonicalId: owner.id,
          canonicalName: owner.businessName,
          duplicateId: lead.id,
          duplicateName: lead.businessName,
        })
        return
      }
      phoneOwner.set(key, lead)
    }
    seen.add(lead.id)
    out.push(lead)
  }

  const dueRows = (due ?? []) as unknown as LeadRow[]
  for (const r of dueRows) pushDeduped(toCallLead(r, 'due', 'Takip zamanı geldi'))
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
      .limit(remaining * 2) // dedupe telafisi
    if (freshErr) throw new Error(freshErr.message)
    const freshRows = (fresh ?? []) as unknown as LeadRow[]
    for (const r of freshRows) pushDeduped(toCallLead(r, 'daily', 'Günün önceliği (henüz aranmadı)'))
  }

  return { list: out.slice(0, CALL_LIST_CAP), duplicates }
}

async function loadPendingSends(): Promise<PendingSendDraft[]> {
  // TÜM email taslakları görünür — onayı olmayanlar da (finding #5-6).
  // Faz 2.4: draft başına DB turu YOK — attempts/recipients/suppression/
  // approvals TOPLU sorgulanır (p95 hedefi ≤1.5 sn).
  const { data, error } = await supabaseAdmin
    .from('outreach_messages')
    .select('id, subject, body, final_body, status, lead_id, created_at, leads(business_name)')
    .eq('channel', 'email')
    .in('status', ['draft', 'sent'])
    .order('created_at', { ascending: false })
    .limit(24) // dedupe sonrası 12 dolabilsin
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<{
    id: string
    subject: string | null
    body: string | null
    final_body: string | null
    status: string
    lead_id: string | null
    leads?: { business_name?: string }
  }>

  // Aynı lead için birden çok AÇIK draft → yalnız en yenisi listede (dedupe).
  // Gönderilmiş satırlar dedupe'a girmez (tarihçe değil darboğaz listesi bu).
  const seenOpenLead = new Set<string>()
  const picked: typeof rows = []
  for (const row of rows) {
    if (row.status === 'draft' && row.lead_id) {
      if (seenOpenLead.has(row.lead_id)) continue
      seenOpenLead.add(row.lead_id)
    }
    picked.push(row)
    if (picked.length >= 12) break
  }

  const draftIds = picked.map((r) => r.id)
  const leadIds = [...new Set(picked.map((r) => r.lead_id).filter((x): x is string => Boolean(x)))]

  // Toplu: attempts + canonical recipients (primary contact → lead.email).
  const [attemptsQ, recipients] = await Promise.all([
    supabaseAdmin
      .from('outreach_send_attempts')
      .select('outreach_message_id, state, finalized')
      .in('outreach_message_id', draftIds),
    resolveCanonicalRecipients(leadIds),
  ])
  // Faz 4.7: attempt sorgusu hatası yutulmaz — yanlış 'approval_missing'
  // sınıflaması yerine panel error'a düşer.
  if (attemptsQ.error) throw new Error(`send attempts okunamadı: ${attemptsQ.error.message}`)
  const attemptByDraft = new Map<string, { state: string; finalized: boolean }>()
  for (const a of attemptsQ.data ?? []) {
    attemptByDraft.set(a.outreach_message_id as string, {
      state: a.state as string,
      finalized: Boolean(a.finalized),
    })
  }

  // Toplu suppression (fail-closed) + toplu onay durumu (digest formülü tekil yolla aynı).
  const emails = [...recipients.values()].map((r) => r.email).filter((e): e is string => Boolean(e))
  const [suppressedSet, approvals] = await Promise.all([
    getSuppressedSet(emails),
    findSendApprovalsBatch(
      picked
        .filter((r) => r.lead_id && r.status === 'draft')
        .map((r) => {
          const rec = recipients.get(r.lead_id as string)
          return {
            draftId: r.id,
            leadId: r.lead_id as string,
            businessName: r.leads?.business_name ?? null,
            email: rec?.email ?? null,
            contactId: rec?.contactId ?? null,
            subject: r.subject ?? '',
            body: (r.final_body ?? r.body ?? '').trim(),
          }
        }),
    ),
  ])

  return picked.map((row) => {
    const rec = row.lead_id ? recipients.get(row.lead_id) : undefined
    const email = rec?.email ?? null
    const attempt = attemptByDraft.get(row.id) ?? null
    const approval = approvals.get(row.id) ?? null
    const state = classifyDraftState({
      attemptState: attempt?.state ?? null,
      attemptFinalized: Boolean(attempt?.finalized),
      hasRecipient: Boolean(email),
      suppressed: email ? suppressedSet.has(email) : false,
      approvalStatus: approval?.status ?? null,
      rowStatus: row.status,
    })
    return {
      draftId: row.id,
      leadId: row.lead_id,
      approvalId: approval?.id ?? null,
      approvalStatus: approval?.status ?? null,
      businessName: row.leads?.business_name ?? '—',
      domain: extractDomain(email) ?? 'bilinmiyor',
      subject: row.subject ?? '(konu yok)',
      body: (row.final_body ?? row.body ?? '').trim(),
      state,
      recipientSource: rec?.source ?? 'none',
      nextAction: DRAFT_NEXT_ACTION[state],
    }
  })
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

/** Faz 4.9: bugünkü tamamlanan gelir aksiyonları — audit kayıtlarından sayılır. */
async function loadOpsMetrics(nowIso: string): Promise<OpsMetrics> {
  const dayStart = `${nowIso.slice(0, 10)}T00:00:00.000Z`
  const [auditQ, sentQ, approvalsQ] = await Promise.all([
    supabaseAdmin.from('lead_action_audit').select('action').gte('created_at', dayStart),
    supabaseAdmin
      .from('outreach_messages')
      .select('id')
      .eq('status', 'sent')
      .gte('sent_at', dayStart),
    supabaseAdmin
      .from('approval_requests')
      .select('id')
      .eq('action', 'outreach.send_gmail')
      .gte('created_at', dayStart),
  ])
  // Hata yutulmaz — sahte "0 aksiyon" yerine panel error (Faz 4.7 ilkesi).
  if (auditQ.error) throw new Error(`aksiyon metriği okunamadı: ${auditQ.error.message}`)
  if (sentQ.error) throw new Error(`gönderim metriği okunamadı: ${sentQ.error.message}`)
  if (approvalsQ.error) throw new Error(`onay metriği okunamadı: ${approvalsQ.error.message}`)
  const actionsByType: Record<string, number> = {}
  for (const a of auditQ.data ?? []) {
    const key = String(a.action ?? 'other')
    actionsByType[key] = (actionsByType[key] ?? 0) + 1
  }
  return {
    actionsByType,
    totalActions: (auditQ.data ?? []).length,
    emailsSent: (sentQ.data ?? []).length,
    approvalsRequested: (approvalsQ.data ?? []).length,
  }
}

/** Faz 4: settings'teki enrichment son-koşu özetini kokpite taşır (görünürlük).
 *  Kayıt yoksa null (henüz koşmadı) — hata değildir. */
async function loadEnrichmentStatus(): Promise<EnrichmentStatus | null> {
  const { data, error } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'enrichment_last_run')
    .maybeSingle()
  if (error) throw new Error(`enrichment durumu okunamadı: ${error.message}`)
  if (!data?.value) return null
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(data.value as string) as Record<string, unknown>
  } catch {
    return null
  }
  const num = (k: string): number => (typeof parsed[k] === 'number' ? (parsed[k] as number) : 0)
  return {
    at: typeof parsed.at === 'string' ? parsed.at : null,
    scanned: num('scanned'),
    contactsAdded: num('contactsAdded'),
    evidenceAdded: num('evidenceAdded'),
    primaryAutoSet: num('primaryAutoSet'),
    hitlPending: num('hitlPending'),
    apolloCalls: num('apolloCalls'),
    duplicatesSkipped: num('duplicatesSkipped'),
    cappedOut: num('cappedOut'),
    errorCount: num('errorCount'),
  }
}

export async function getTodayCockpit(nowMs: number = Date.now()): Promise<TodayCockpit> {
  const nowIso = new Date(nowMs).toISOString()
  const [callResult, pendingSends, replies, overdueFollowups, sendIssues, hotLeads, revenue, opsMetrics, enrichment] =
    await Promise.all([
      loadLeadsToCall(nowIso).then(
        (r) => ({ items: r.list, duplicates: r.duplicates, error: null as string | null }),
        (err: unknown) => ({
          items: [] as CallLead[],
          duplicates: [] as CallDuplicate[],
          error: err instanceof Error ? err.message : 'bilinmeyen hata',
        })
      ),
      panel(loadPendingSends),
      panel(loadReplies),
      panel(() => loadOverdueFollowups(nowIso)),
      panel(loadSendIssues),
      panel(loadHotLeads),
      loadRevenue().then(
        (data) => ({ data, error: null as string | null }),
        (err: unknown) => ({ data: null, error: err instanceof Error ? err.message : 'hata' })
      ),
      loadOpsMetrics(nowIso).then(
        (data) => ({ data, error: null as string | null }),
        (err: unknown) => ({ data: null, error: err instanceof Error ? err.message : 'hata' })
      ),
      loadEnrichmentStatus().then(
        (data) => ({ data, error: null as string | null }),
        (err: unknown) => ({ data: null, error: err instanceof Error ? err.message : 'hata' })
      ),
    ])
  // Faz 7: panelleri zaman-bütçesi aksiyonlarına çevir (UI değer/süre sıralar).
  const budgetActions: BudgetAction[] = [
    ...callResult.items.map((l) => ({ id: `call:${l.id}`, kind: 'call' as const, label: `Ara: ${l.businessName}` })),
    ...pendingSends.items.map((d) => ({ id: `send:${d.draftId}`, kind: 'approve_send' as const, label: `Onayla/gönder: ${d.businessName}` })),
    ...overdueFollowups.items.map((f) => ({ id: `fu:${f.id}`, kind: 'followup' as const, label: `Takip: ${f.businessName}` })),
  ]

  return {
    leadsToCall: { items: callResult.items, error: callResult.error },
    callDuplicates: callResult.duplicates,
    pendingSends,
    replies,
    overdueFollowups,
    sendIssues,
    hotLeads,
    revenue,
    opsMetrics,
    enrichment,
    budgetActions,
  }
}
