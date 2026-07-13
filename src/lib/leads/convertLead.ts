// ─────────────────────────────────────────────────────────────────────────────
// "Projeye Dönüştür" servisi (Faz 3.1) — proje OLUŞMADAN "dönüştü" DENMEZ.
//
// - RPC (mig 060) canlıysa: project INSERT + leads.status + audit TEK
//   transaction; eşzamanlı iki tık partial-unique-index sayesinde TEK proje.
// - RPC yoksa (onay bekliyor) legacy yol: önce-mevcut-proje-kontrolü →
//   insert → deterministik yarış çözümü (aynı lead'e iki insert oluştuysa
//   en eski kazanır; kaybeden kendi satırını siler ve 'already' döner) →
//   lead update → audit best-effort. atomic:false görünür.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '@/lib/supabase'

const RPC_MISSING = new Set(['PGRST202', '42883'])

export interface ConvertResult {
  ok: boolean
  outcome?: 'created' | 'already'
  projectId?: string
  error?: string
  atomic: boolean
}

export async function convertLeadToProject(opts: {
  leadId: string
  actor: string
  channel?: 'ui' | 'telegram'
  nowMs?: number
}): Promise<ConvertResult> {
  const nowIso = new Date(opts.nowMs ?? Date.now()).toISOString()

  // 1) Atomik RPC (mig 060).
  const { data, error } = await supabaseAdmin.rpc('convert_lead_to_project', {
    p_lead_id: opts.leadId,
    p_actor: opts.actor,
    p_channel: opts.channel ?? 'ui',
    p_now: nowIso,
  })
  if (!error) {
    const r = data as { outcome: string; project_id?: string; error?: string }
    if (r.outcome === 'created' || r.outcome === 'already') {
      return { ok: true, outcome: r.outcome, projectId: r.project_id, atomic: true }
    }
    return { ok: false, error: r.error ?? 'reddedildi', atomic: true }
  }
  if (!RPC_MISSING.has(error.code ?? '')) {
    console.error('[convertLead] RPC hatası', error.code ?? error.message)
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, error: 'dönüşüm uygulanamadı (geçici) — tekrar deneyin', atomic: false }
    }
  }

  // 2) Legacy yol (060 onay bekliyor).
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .select('id, business_name, status, expected_monthly_value_tl')
    .eq('id', opts.leadId)
    .maybeSingle()
  if (leadErr) return { ok: false, error: leadErr.message, atomic: false }
  if (!lead) return { ok: false, error: 'lead bulunamadı', atomic: false }
  if (['lost', 'archived'].includes(lead.status as string)) {
    return { ok: false, error: `geçersiz geçiş: ${lead.status} → convert`, atomic: false }
  }

  const { data: existing, error: exErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('lead_id', opts.leadId)
    .limit(1)
    .maybeSingle()
  if (exErr) return { ok: false, error: exErr.message, atomic: false }
  if (existing) return { ok: true, outcome: 'already', projectId: existing.id as string, atomic: false }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('projects')
    .insert({
      lead_id: opts.leadId,
      business_name: (lead.business_name as string) ?? '—',
      client_name: lead.business_name ?? null,
      status: 'active',
      monthly_fee: lead.expected_monthly_value_tl ?? null,
      currency: 'TRY',
      start_date: nowIso.slice(0, 10),
      notes: 'Lead dönüşümü (kokpit)',
    })
    .select('id')
    .single()
  if (insErr || !inserted) return { ok: false, error: insErr?.message ?? 'proje oluşturulamadı', atomic: false }

  // Yarış çözümü: aynı anda iki insert olduysa EN ESKİ satır kazanır (deterministik).
  const { data: all } = await supabaseAdmin
    .from('projects')
    .select('id, created_at')
    .eq('lead_id', opts.leadId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if ((all?.length ?? 0) > 1 && all![0].id !== inserted.id) {
    await supabaseAdmin.from('projects').delete().eq('id', inserted.id)
    return { ok: true, outcome: 'already', projectId: all![0].id as string, atomic: false }
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('leads')
    .update({ status: 'converted', updated_at: nowIso })
    .eq('id', opts.leadId)
    .select('id')
  if (updErr || !updated?.length) {
    // Proje oluştu ama lead güncellenemedi → görünür hata; proje SİLİNMEZ
    // (veri kaybı yerine tutarsızlık görünür kalır, retry idempotent: 'already').
    console.error('[convertLead] lead update hatası (proje oluştu)', updErr?.code ?? '0rows')
    return { ok: false, error: 'proje oluştu ama lead güncellenemedi — tekrar deneyin', atomic: false }
  }

  // Audit (best-effort; 057 CHECK 'convert' içermiyorsa degraded loglanır).
  const { error: auditErr } = await supabaseAdmin.from('lead_action_audit').insert({
    lead_id: opts.leadId,
    action: 'convert',
    actor: opts.actor,
    channel: opts.channel ?? 'ui',
    before_state: { status: lead.status },
    after_state: {
      status: 'converted',
      project_id: inserted.id,
      expected_monthly_value_tl: lead.expected_monthly_value_tl ?? null,
    },
  })
  if (auditErr) console.error('[convertLead] audit degraded', auditErr.code ?? auditErr.message)

  return { ok: true, outcome: 'created', projectId: inserted.id as string, atomic: false }
}
