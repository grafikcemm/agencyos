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
  action: LeadRowAction
  actor: string
  channel: 'ui' | 'telegram'
  note?: string
  /** action='later' için zorunlu — ISO tarih. */
  laterAtIso?: string
  idempotencyKey?: string
  nowMs?: number
}

export interface ApplyLeadActionResult {
  ok: boolean
  idempotentReplay?: boolean
  error?: string
  audit: 'recorded' | 'degraded'
  /** true → mig 058 RPC ile TEK transaction (crash penceresi yok). */
  atomic?: boolean
  before?: { status: string; next_follow_up_at: string | null }
  after?: { status: string; next_follow_up_at: string | null }
}

/** Mig 058 RPC yolu — tek transaction. RPC yoksa null döner (legacy yola düşülür). */
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
  })
  if (error) {
    // RPC henüz canlı değil (onay bekliyor) → legacy yol. Diğer hatalar da
    // legacy'ye düşer ama loglanır (görünürlük).
    if (error.code !== 'PGRST202' && error.code !== '42883') {
      console.error('[leadActions] atomik RPC hatası — legacy yola düşülüyor', error.code ?? error.message)
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

  const nowIso = new Date(input.nowMs ?? Date.now()).toISOString()

  const { data: lead, error: readErr } = await supabaseAdmin
    .from('leads')
    .select('id, status, next_follow_up_at, last_contact_at, notes')
    .eq('id', input.leadId)
    .maybeSingle()
  if (readErr) return { ok: false, error: readErr.message, audit: 'degraded' }
  if (!lead) return { ok: false, error: 'lead bulunamadı', audit: 'degraded' }

  const state = lead as unknown as LeadStateRow
  if (!ALLOWED_FROM[input.action].includes(state.status)) {
    return {
      ok: false,
      error: `geçersiz geçiş: ${state.status} → ${input.action}`,
      audit: 'degraded',
    }
  }

  const { patch, error: patchErr } = computePatch(input.action, state, input, nowIso)
  if (patchErr) return { ok: false, error: patchErr, audit: 'degraded' }

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
      return { ok: true, idempotentReplay: true, audit: 'recorded', before, after }
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
    }
  }

  return { ok: true, audit: auditMode, before, after }
}
