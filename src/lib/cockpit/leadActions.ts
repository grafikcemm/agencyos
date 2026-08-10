// ─────────────────────────────────────────────────────────────────────────────
// Lead satır aksiyonları — TEK service katmanı (Faz B6 + C1).
//
// /bugun kokpiti (API route) ve Telegram komutları AYNI fonksiyonu çağırır:
// aynı geçiş kuralları, aynı audit, aynı idempotency. Kopya sorgu yok.
//
// Audit: lead_action_audit (mig 057 — kullanıcı onayı bekliyor). Tablo yoksa
// aksiyon YİNE uygulanır ama sonuçta audit:'degraded' görünür (sessiz kayıp yok).
// Idempotency: audit tablosundaki UNIQUE idempotency_key claim'i — aynı anahtar
// ikinci kez gelirse mutasyon TEKRARLANMAZ.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '@/lib/supabase'

export type LeadRowAction = 'called' | 'no_answer' | 'meeting' | 'later' | 'note'

/**
 * Yaşam döngüsü eylemleri (mig 069). Satır aksiyonlarından AYRI tutulur:
 * bunlar `lead_lifecycle_events` yazar ve kanıt kapılarına tabidir.
 *
 * Legacy (RPC'siz) yolda DESTEKLENMEZ — kanıt kapıları yalnız RPC içinde,
 * transaction altında uygulanabilir. RPC yoksa fail-closed döneriz; yarım
 * uygulanmış bir "gönderildi" kaydı, olmayan bir onayı varmış gibi gösterir.
 */
export type LeadLifecycleAction =
  | 'verify_signal' | 'qualify' | 'enrich_contact' | 'compliance_check'
  | 'draft' | 'request_approval' | 'send' | 'reply'
  | 'convert' | 'onboard' | 'produce_case' | 'grow'
  | 'disqualify' | 'suppress' | 'archive'

const LIFECYCLE_ACTIONS: readonly LeadLifecycleAction[] = [
  'verify_signal', 'qualify', 'enrich_contact', 'compliance_check',
  'draft', 'request_approval', 'send', 'reply',
  'convert', 'onboard', 'produce_case', 'grow',
  'disqualify', 'suppress', 'archive',
]

export function isLifecycleAction(action: string): action is LeadLifecycleAction {
  return (LIFECYCLE_ACTIONS as readonly string[]).includes(action)
}

/** Aksiyon → izinli kaynak statüler. (won/lost/archived'a satır aksiyonu YOK.) */
const ALLOWED_FROM: Record<LeadRowAction, string[]> = {
  called: ['new', 'contacted', 'responded'],
  no_answer: ['new', 'contacted', 'responded'],
  meeting: ['new', 'contacted', 'responded', 'meeting'],
  later: ['new', 'contacted', 'responded', 'meeting'],
  note: ['new', 'contacted', 'responded', 'meeting', 'proposal'],
}

/** [ASSUMPTION] Takvim günü bazlı basit aralıklar; iş-günü hesabı Faz E'de FSM ile gelir. */
const FOLLOW_UP_DAYS: Partial<Record<LeadRowAction, number>> = {
  called: 3,
  no_answer: 1,
  meeting: 1,
}

export interface ApplyLeadActionInput {
  leadId: string
  action: LeadRowAction | LeadLifecycleAction
  actor: string
  channel: 'ui' | 'telegram' | 'system' | 'cron'
  note?: string
  /** action='later' için zorunlu — ISO tarih. */
  laterAtIso?: string
  idempotencyKey?: string
  nowMs?: number
  /**
   * Yaşam döngüsü eylemlerinin kanıtı (mig 069). Kapılar DB tarafında,
   * transaction altında denetlenir — burada gevşetilemez.
   *   verify_signal    → { verified_at }
   *   compliance_check → { lawful_basis, suppression_status }
   *   send             → { approval_id, gmail_message_id }
   *   convert          → { conversion_kind: meeting|paid_entry|core|retainer }
   *   produce_case     → { client_consent: 'true' }
   */
  evidence?: Record<string, unknown>
}

export interface ApplyLeadActionResult {
  ok: boolean
  idempotentReplay?: boolean
  error?: string
  audit: 'recorded' | 'degraded'
  /** true → mig 058 RPC ile TEK transaction; false → legacy yol (bilinen crash penceresi). */
  atomic: boolean
  before?: { status: string; next_follow_up_at: string | null }
  after?: { status: string; next_follow_up_at: string | null }
}

/** RPC hiç yok (058 onay bekliyor) hata kodları — YALNIZ bunlar legacy'ye düşebilir. */
const RPC_MISSING_CODES = new Set(['PGRST202', '42883'])

/**
 * Mig 058 RPC yolu — tek transaction.
 * - RPC yok (058 canlı değil): LEAD_ACTION_RPC_REQUIRED=true ise FAIL-CLOSED
 *   (058 canlıya alındıktan sonra bu bayrak açılır; legacy yol devre dışı),
 *   değilse null → legacy yola düşülür (atomic:false görünür).
 * - Beklenmeyen RPC hatası: PRODUCTION'da FAIL-CLOSED (legacy'ye DÜŞMEZ —
 *   yarı-uygulanmış/replay-siz mutasyon riski alınmaz); dev/test'te legacy
 *   fallback loglanarak devam eder.
 */
async function tryAtomicRpc(input: ApplyLeadActionInput): Promise<ApplyLeadActionResult | null> {
  const { data, error } = await supabaseAdmin.rpc('apply_lead_action', {
    p_lead_id: input.leadId,
    p_action: input.action,
    p_actor: input.actor,
    p_channel: input.channel,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_note: input.note ?? null,
    p_later_at: input.laterAtIso ?? null,
    p_now: new Date(input.nowMs ?? Date.now()).toISOString(),
    // Mig 069. 068/069 uygulanmamış ortamda RPC 8 argümanlıdır ve fazladan
    // named parametre PGRST202 üretir → aşağıdaki "RPC yok" dalına düşer,
    // yaşam döngüsü eylemleri fail-closed olur. Mevcut 5 eylem legacy yolda
    // çalışmaya devam eder.
    p_evidence: input.evidence ?? {},
  })
  if (error) {
    if (RPC_MISSING_CODES.has(error.code ?? '')) {
      if (process.env.LEAD_ACTION_RPC_REQUIRED === 'true') {
        // 058 canlı olması GEREKEN ortamda RPC yok → fail-closed (yanlış deploy/rollback görünür olsun).
        console.error('[leadActions] apply_lead_action RPC zorunlu ama bulunamadı (LEAD_ACTION_RPC_REQUIRED)')
        return { ok: false, error: 'aksiyon servisi hazır değil — tekrar deneyin', audit: 'degraded', atomic: false }
      }
      return null // 058 onay bekliyor → legacy yol.
    }
    console.error('[leadActions] atomik RPC hatası', error.code ?? error.message)
    if (process.env.NODE_ENV === 'production') {
      // Beklenmeyen DB hatasında legacy'ye düşmek yarış/yarım-yazım riskini
      // İKİYE katlar → fail-closed; kullanıcı tekrar dener.
      return { ok: false, error: 'aksiyon uygulanamadı (geçici) — tekrar deneyin', audit: 'degraded', atomic: false }
    }
    return null
  }
  const r = data as {
    outcome: 'applied' | 'replayed' | 'rejected'
    error?: string
    before?: { status: string; next_follow_up_at: string | null }
    after?: { status: string; next_follow_up_at: string | null }
  }
  if (r.outcome === 'rejected') {
    return { ok: false, error: r.error ?? 'reddedildi', audit: 'recorded', atomic: true }
  }
  return {
    ok: true,
    idempotentReplay: r.outcome === 'replayed',
    audit: 'recorded',
    atomic: true,
    before: r.before,
    after: r.after,
  }
}

interface LeadStateRow {
  id: string
  status: string
  next_follow_up_at: string | null
  last_contact_at: string | null
  notes: string | null
}

function computePatch(
  action: LeadRowAction,
  lead: LeadStateRow,
  input: ApplyLeadActionInput,
  nowIso: string,
): { patch: Record<string, unknown>; error?: string } {
  const patch: Record<string, unknown> = { updated_at: nowIso }

  switch (action) {
    case 'called':
      if (lead.status === 'new') patch.status = 'contacted'
      patch.last_contact_at = nowIso
      patch.next_follow_up_at = new Date(
        Date.parse(nowIso) + (FOLLOW_UP_DAYS.called ?? 3) * 86_400_000,
      ).toISOString()
      break
    case 'no_answer':
      patch.last_contact_at = nowIso
      patch.next_follow_up_at = new Date(
        Date.parse(nowIso) + (FOLLOW_UP_DAYS.no_answer ?? 1) * 86_400_000,
      ).toISOString()
      break
    case 'meeting':
      patch.status = 'meeting'
      patch.last_contact_at = nowIso
      patch.next_follow_up_at = new Date(
        Date.parse(nowIso) + (FOLLOW_UP_DAYS.meeting ?? 1) * 86_400_000,
      ).toISOString()
      break
    case 'later': {
      if (!input.laterAtIso) return { patch, error: 'laterAtIso zorunlu' }
      const t = Date.parse(input.laterAtIso)
      if (!Number.isFinite(t)) return { patch, error: 'laterAtIso geçersiz tarih' }
      if (t <= Date.parse(nowIso)) return { patch, error: 'laterAtIso gelecekte olmalı' }
      patch.next_follow_up_at = new Date(t).toISOString()
      break
    }
    case 'note': {
      if (!input.note?.trim()) return { patch, error: 'note boş olamaz' }
      const stamp = nowIso.slice(0, 16).replace('T', ' ')
      const line = `[${stamp} ${input.channel}] ${input.note.trim()}`
      patch.notes = lead.notes ? `${lead.notes}\n${line}` : line
      break
    }
  }
  return { patch }
}

/**
 * Aksiyonu uygular. Sıra:
 * 1) lead'i oku, geçiş kuralını doğrula
 * 2) idempotency claim (audit tablosuna UNIQUE insert) — duplicate → replay, mutasyon yok
 * 3) leads UPDATE (status CAS'lı: okunan statüden değiştiyse yarış → hata)
 * 4) audit satırını before/after ile tamamla
 */
export async function applyLeadAction(input: ApplyLeadActionInput): Promise<ApplyLeadActionResult> {
  // Faz 0.2: önce atomik RPC (mig 058). Canlı değilse aşağıdaki legacy yol
  // (bilinen crash penceresiyle, atomic:false işaretli) devreye girer.
  const atomicResult = await tryAtomicRpc(input)
  if (atomicResult) return atomicResult

  // Yaşam döngüsü eylemleri legacy yola DÜŞEMEZ. Kanıt kapıları (onay kimliği,
  // müşteri izni, yasal dayanak) yalnız RPC içinde, satır kilidi altında
  // denetlenebilir. Burada taklit etmek, kapının kendisini kaldırmak olurdu.
  if (isLifecycleAction(input.action)) {
    return {
      ok: false,
      error: 'yaşam döngüsü eylemi için migration 069 gerekli — atomik yol yok',
      audit: 'degraded',
      atomic: false,
    }
  }

  const nowIso = new Date(input.nowMs ?? Date.now()).toISOString()

  const { data: lead, error: readErr } = await supabaseAdmin
    .from('leads')
    .select('id, status, next_follow_up_at, last_contact_at, notes')
    .eq('id', input.leadId)
    .maybeSingle()
  if (readErr) return { ok: false, error: readErr.message, audit: 'degraded', atomic: false }
  if (!lead) return { ok: false, error: 'lead bulunamadı', audit: 'degraded', atomic: false }

  const state = lead as unknown as LeadStateRow
  if (!ALLOWED_FROM[input.action].includes(state.status)) {
    return {
      ok: false,
      error: `geçersiz geçiş: ${state.status} → ${input.action}`,
      audit: 'degraded',
      atomic: false,
    }
  }

  const { patch, error: patchErr } = computePatch(input.action, state, input, nowIso)
  if (patchErr) return { ok: false, error: patchErr, audit: 'degraded', atomic: false }

  const before = { status: state.status, next_follow_up_at: state.next_follow_up_at }
  const after = {
    status: (patch.status as string) ?? state.status,
    next_follow_up_at:
      'next_follow_up_at' in patch
        ? (patch.next_follow_up_at as string)
        : state.next_follow_up_at,
  }

  // 2) Idempotency claim — audit tablosu üzerinden.
  let auditMode: 'recorded' | 'degraded' = 'degraded'
  let auditRowId: string | null = null
  const idemKey = input.idempotencyKey ?? null
  try {
    const { data: auditRow, error: auditErr } = await supabaseAdmin
      .from('lead_action_audit')
      .insert({
        lead_id: input.leadId,
        action: input.action,
        actor: input.actor,
        channel: input.channel,
        idempotency_key: idemKey,
        before_state: before,
        after_state: after,
        note: input.note ?? null,
      })
      .select('id')
      .single()
    if (!auditErr && auditRow) {
      auditMode = 'recorded'
      auditRowId = auditRow.id as string
    } else if (auditErr?.code === '23505') {
      // Aynı idempotency key daha önce claim edildi → replay; mutasyon TEKRARLANMAZ.
      return { ok: true, idempotentReplay: true, audit: 'recorded', atomic: false, before, after }
    } else if (auditErr && auditErr.code !== '42P01' && auditErr.code !== 'PGRST205') {
      console.error('[leadActions] audit insert hatası', auditErr.code ?? auditErr.message)
    }
  } catch {
    /* degraded — aksiyon yine uygulanır */
  }

  // 3) UPDATE — status CAS: okuduğumuz statüden değiştiyse (yarış) etkilenen satır 0 olur.
  const { data: updated, error: updErr } = await supabaseAdmin
    .from('leads')
    .update(patch)
    .eq('id', input.leadId)
    .eq('status', state.status)
    .select('id')
  if (updErr || !updated?.length) {
    // Yarış/başarısızlık: claim edilmiş audit satırını best-effort geri al.
    if (auditRowId) {
      await supabaseAdmin.from('lead_action_audit').delete().eq('id', auditRowId)
    }
    return {
      ok: false,
      error: updErr?.message ?? 'eşzamanlı değişiklik — tekrar deneyin',
      audit: auditMode,
      atomic: false,
    }
  }

  return { ok: true, audit: auditMode, atomic: false, before, after }
}
