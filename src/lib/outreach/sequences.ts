import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { buildMultiChannelPlan, type CustomerType } from './channelMatrix'
import { buildFollowUpDraft, shouldStopSequence, type FollowUpDraft } from './followupAngles'
import { getSuppressedSet } from './auditCompliance'

const MS_PER_DAY = 24 * 60 * 60 * 1000

// ─────────────────────────────────────────────────────────────────────────────
// Follow-up sequence dayanıklılığı (Sprint-3 Faz 2).
//
// Kurallar:
// - TÜM insert/update sonuçları authoritative kontrol edilir (sessiz düşüş yok).
// - Adım terfisi CAS-idempotency ile: done=false→true CAS'ini KAZANAN tek
//   instance task üretir (eşzamanlı cron'lar duplicate task üretemez).
// - Task insert BAŞARISIZSA sequence done KALMAZ (telafi CAS'i done=false).
//   Telafi de düşerse CRITICAL log + failed sayacı (adım kaybı GİZLENMEZ).
// - Task dedupe: aynı (lead, step) için queued task varsa yeniden üretilmez
//   (crash-sonrası retry çoğaltmaz).
// - Reply/opt-out → sequence DURUR (tüm açık adımlar iptal edilir).
// - Suppression HER adımda fail-closed: kontrol edilemiyorsa adım BLOKLU.
// - İş günü kuralı: hafta sonu vadesi gelen adım bir sonraki iş gününe ertelenir.
// - followupAngles: her adım FARKLI ikna açısıyla TASLAK üretir — task input'una
//   yazılır. OTOMATİK GÖNDERİM YOK: FOLLOWUP_FSM_ENABLED=false; gönderim yalnız
//   operatör + HITL onay + mevcut send makinesi. Bu modülde provider çağrısı YOKTUR.
// ─────────────────────────────────────────────────────────────────────────────

export function isBusinessDay(d: Date): boolean {
  const day = d.getUTCDay()
  return day !== 0 && day !== 6
}

export function nextBusinessDayIso(fromMs: number): string {
  const d = new Date(fromMs)
  do {
    d.setUTCDate(d.getUTCDate() + 1)
  } while (!isBusinessDay(d))
  return d.toISOString()
}

export interface ScheduleSequenceResult {
  scheduled: number
  /** true → lead'in zaten açık sekansı var; İKİNCİ kez planlanmadı (idempotent). */
  alreadyScheduled?: boolean
}

// Çok-kanallı gün-bazlı sekansı follow_up_sequences'a yazar. Her adım, due_at'i
// geldiğinde cron tarafından agent_task'a (hatırlatma) terfi eder — OTOMATİK GÖNDERİM YOK.
export async function scheduleMultiChannelSequence(opts: {
  leadId: string
  customerType: CustomerType
}): Promise<ScheduleSequenceResult> {
  // İdempotenlik: açık (done=false) adımı olan lead'e ikinci plan YAZILMAZ.
  const { data: open, error: openErr } = await supabaseAdmin
    .from('follow_up_sequences')
    .select('id')
    .eq('lead_id', opts.leadId)
    .eq('done', false)
    .limit(1)
  if (openErr) throw new Error(`sekans kontrolü başarısız: ${openErr.message}`)
  if ((open ?? []).length > 0) return { scheduled: 0, alreadyScheduled: true }

  const plan = buildMultiChannelPlan(opts.customerType)
  const now = Date.now()
  const rows = plan.map((step) => ({
    lead_id: opts.leadId,
    step: step.step,
    channel: step.channel,
    due_at: new Date(now + step.day * MS_PER_DAY).toISOString(),
  }))

  const { error } = await supabaseAdmin.from('follow_up_sequences').insert(rows)
  if (error) throw new Error(`sekans yazılamadı: ${error.message}`)
  return { scheduled: rows.length }
}

// Schedules the next follow-up step for a lead. due_at is computed from now.
export async function scheduleFollowUp(opts: {
  leadId: string
  step: number
  channel?: string
  dueInDays: number
  outreachMessageId?: string | null
}): Promise<void> {
  const dueAt = new Date(Date.now() + opts.dueInDays * MS_PER_DAY).toISOString()

  const { error } = await supabaseAdmin.from('follow_up_sequences').insert({
    lead_id: opts.leadId,
    step: opts.step,
    channel: opts.channel ?? 'email',
    due_at: dueAt,
    outreach_message_id: opts.outreachMessageId ?? null,
  })
  // Authoritative: takip adımı yazılamadıysa çağıran BİLMELİ (sessiz kayıp yok).
  if (error) throw new Error(`follow-up planlanamadı: ${error.message}`)
}

export interface ProcessResult {
  /** Task'ı üretilen adım sayısı. */
  processed: number
  /** Reply/opt-out ile DURDURULAN sequence'lerin iptal edilen adım sayısı. */
  stopped: number
  /** Suppression (veya kontrol edilemedi → fail-closed) nedeniyle bloklanan adımlar. */
  blocked: number
  /** İş günü kuralıyla ertelenen adımlar. */
  deferred: number
  /** Görünür hata alan adımlar (telafi edildi ya da CRITICAL loglandı). */
  failed: number
}

interface DueRow {
  id: string
  lead_id: string
  step: number
  channel: string
}

interface LeadCtx {
  business_name: string | null
  email: string | null
  do_not_contact: boolean | null
  sector: string | null
}

/** Toplu bağlam: leads + suppression + inbound-reply seti + önceki gövdeler + kanıt. */
async function loadBatchContext(leadIds: string[]) {
  const [leadsQ, threadsQ, prevQ, evidenceQ] = await Promise.all([
    supabaseAdmin.from('leads').select('id, business_name, email, do_not_contact, sector').in('id', leadIds),
    supabaseAdmin.from('email_threads').select('id, lead_id').in('lead_id', leadIds),
    supabaseAdmin
      .from('outreach_messages')
      .select('lead_id, body, final_body')
      .in('lead_id', leadIds)
      .eq('status', 'sent'),
    supabaseAdmin.from('lead_evidence').select('lead_id, summary').in('lead_id', leadIds),
  ])
  if (leadsQ.error) throw new Error(`lead bağlamı okunamadı: ${leadsQ.error.message}`)

  const leads = new Map<string, LeadCtx>()
  for (const l of leadsQ.data ?? []) leads.set(l.id as string, l as unknown as LeadCtx)

  // Inbound reply seti (thread → lead).
  const threadToLead = new Map<string, string>()
  for (const t of threadsQ.data ?? []) threadToLead.set(t.id as string, t.lead_id as string)
  const repliedLeads = new Set<string>()
  if (threadToLead.size > 0) {
    const { data: inbound } = await supabaseAdmin
      .from('email_messages')
      .select('thread_id')
      .in('thread_id', [...threadToLead.keys()])
      .eq('direction', 'inbound')
    for (const m of inbound ?? []) {
      const lead = threadToLead.get(m.thread_id as string)
      if (lead) repliedLeads.add(lead)
    }
  }

  const prevBodies = new Map<string, string[]>()
  for (const p of prevQ.data ?? []) {
    const arr = prevBodies.get(p.lead_id as string) ?? []
    arr.push(String(p.final_body ?? p.body ?? ''))
    prevBodies.set(p.lead_id as string, arr)
  }

  const evidence = new Map<string, string>()
  for (const e of evidenceQ.data ?? []) {
    if (!evidence.has(e.lead_id as string) && e.summary) evidence.set(e.lead_id as string, String(e.summary))
  }

  // Suppression FAIL-CLOSED (getSuppressedSet hata durumunda hepsini döner).
  const emails = [...leads.values()].map((l) => l.email).filter((e): e is string => Boolean(e))
  const suppressed = await getSuppressedSet(emails)

  return { leads, repliedLeads, prevBodies, evidence, suppressed }
}

/** CAS: done=false → done=true; yalnız kazanan task üretir. */
async function claimStep(id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('follow_up_sequences')
    .update({ done: true })
    .eq('id', id)
    .eq('done', false)
    .select('id')
  if (error) throw new Error(`adım claim edilemedi: ${error.message}`)
  return (data ?? []).length === 1
}

/** Telafi: task üretilemedi → adım done=false'a geri alınır (kayıp yok). */
async function releaseStep(id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('follow_up_sequences')
    .update({ done: false })
    .eq('id', id)
    .eq('done', true)
    .select('id')
  return !error && (data ?? []).length === 1
}

/** Reply/opt-out: lead'in TÜM açık adımları iptal (done=true) — sequence durur. */
async function cancelOpenSteps(leadId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('follow_up_sequences')
    .update({ done: true })
    .eq('lead_id', leadId)
    .eq('done', false)
    .select('id')
  if (error) {
    console.error('[sequences] sequence iptali yazılamadı', leadId, error.message)
    return 0
  }
  return (data ?? []).length
}

/** Aynı (lead, step) için kuyrukta task var mı? (crash-retry dedupe). */
async function taskExists(leadId: string, step: number): Promise<'exists' | 'missing' | 'error'> {
  const { data, error } = await supabaseAdmin
    .from('agent_tasks')
    .select('id')
    .eq('agent_key', 'sales_rep')
    .eq('status', 'queued')
    .contains('input', { lead_id: leadId, sequence_step: step })
    .limit(1)
  if (error) {
    console.error('[sequences] task dedupe kontrolü başarısız:', error.message)
    return 'error'
  }
  return (data ?? []).length > 0 ? 'exists' : 'missing'
}

/**
 * Vadesi gelen adımları operatör görevlerine terfi ettirir.
 * OTOMATİK GÖNDERİM YOK — üretilen taslak yalnız task input'unda taşınır;
 * gönderim operatör + HITL onay + send makinesi yolundadır (FSM bayrağından bağımsız).
 */
export async function processDueSequences(limit = 10, nowMs = Date.now()): Promise<ProcessResult> {
  const nowIso = new Date(nowMs).toISOString()
  const result: ProcessResult = { processed: 0, stopped: 0, blocked: 0, deferred: 0, failed: 0 }

  const { data: due, error } = await supabaseAdmin
    .from('follow_up_sequences')
    .select('id, lead_id, step, channel')
    .eq('done', false)
    .lte('due_at', nowIso)
    .order('due_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`vadeli adımlar okunamadı: ${error.message}`)
  if (!due || due.length === 0) return result

  // İş günü kuralı: hafta sonuysa TÜM terfileri bir sonraki iş gününe ertele.
  if (!isBusinessDay(new Date(nowMs))) {
    const nextIso = nextBusinessDayIso(nowMs)
    const { error: deferErr } = await supabaseAdmin
      .from('follow_up_sequences')
      .update({ due_at: nextIso })
      .in('id', (due as DueRow[]).map((d) => d.id))
      .eq('done', false)
    if (deferErr) throw new Error(`iş günü ertelemesi yazılamadı: ${deferErr.message}`)
    result.deferred = due.length
    return result
  }

  const rows = due as DueRow[]
  const ctx = await loadBatchContext([...new Set(rows.map((r) => r.lead_id))])

  for (const seq of rows) {
    try {
      const lead = ctx.leads.get(seq.lead_id)
      const email = lead?.email?.trim().toLowerCase() ?? null
      const decision = shouldStopSequence({
        hasInboundReply: ctx.repliedLeads.has(seq.lead_id),
        optedOut: Boolean(lead?.do_not_contact),
        suppressed: email ? ctx.suppressed.has(email) : false,
        // e-postasız lead'de suppression DOĞRULANAMAZ → fail-closed blok.
        suppressionCheckFailed: !email,
      })

      if (decision.stop) {
        result.stopped += await cancelOpenSteps(seq.lead_id)
        continue
      }
      if (decision.stepBlocked) {
        // Adım bloklu (suppression/fail-closed): done YAPILMAZ, task da üretilmez.
        // Görünürlük operatörde (kokpit suppression paneli); burada sadece sayılır.
        result.blocked += 1
        continue
      }

      // CAS claim: eşzamanlı cron'lardan yalnız BİRİ task üretir.
      const claimed = await claimStep(seq.id)
      if (!claimed) continue // başka instance kazandı — duplicate task YOK.

      // Crash-retry dedupe: task zaten kuyruktaysa yeniden üretme (done kalır).
      const existing = await taskExists(seq.lead_id, seq.step)
      if (existing === 'exists') continue
      if (existing === 'error') {
        // Ne duplicate riskini alırız ne adımı kaybederiz: claim'i GERİ AÇ,
        // sonraki cron dedupe kontrolü çalıştığında yeniden dener.
        const released = await releaseStep(seq.id)
        if (!released) console.error('[sequences] CRITICAL: dedupe-hata telafisi yazılamadı', seq.id)
        result.failed += 1
        continue
      }

      const draft: FollowUpDraft = buildFollowUpDraft({
        step: seq.step,
        businessName: lead?.business_name ?? 'İşletme',
        evidenceSnippet: ctx.evidence.get(seq.lead_id) ?? null,
        sector: lead?.sector ?? null,
        previousBodies: ctx.prevBodies.get(seq.lead_id) ?? [],
      })

      const { error: taskErr } = await supabaseAdmin.from('agent_tasks').insert({
        agent_key: 'sales_rep',
        title: `Takip adımı ${seq.step} (${draft.angle}) — ${lead?.business_name ?? seq.lead_id}`,
        input: {
          lead_id: seq.lead_id,
          sequence_step: seq.step,
          channel: seq.channel,
          angle: draft.angle,
          draft_body: draft.body,
          evidence_missing: draft.evidenceMissing ?? false,
          // Yapısal not: bu task bir OPERATÖR hatırlatmasıdır; otomatik gönderim
          // yolu YOKTUR (gönderim yalnız HITL onay + send makinesi).
          auto_send: false,
        },
        status: 'queued',
        directive_id: null,
      })

      if (taskErr) {
        // Task yazılamadı → sequence done KALAMAZ (adım kaybolmasın).
        const released = await releaseStep(seq.id)
        if (!released) {
          console.error(
            '[sequences] CRITICAL: task insert başarısız VE telafi yazılamadı — adım kaybolabilir',
            seq.id,
            taskErr.message,
          )
        } else {
          console.error('[sequences] task insert başarısız — adım geri açıldı (retry edilecek)', seq.id, taskErr.message)
        }
        result.failed += 1
        continue
      }

      result.processed += 1
    } catch (rowError: unknown) {
      const message = rowError instanceof Error ? rowError.message : 'Bilinmeyen hata'
      console.error('[sequences] adım işlenemedi:', seq.id, message)
      result.failed += 1
    }
  }

  return result
}
