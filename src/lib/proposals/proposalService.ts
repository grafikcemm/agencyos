// ─────────────────────────────────────────────────────────────────────────────
// Teklif motoru v2 (Sprint-3 Faz 5) — durable + versiyonlu + onay-kapılı.
//
// - Oluşturma RPC-FIRST (mig 061 create_proposal_version_tx: proposal+version+
//   event TEK transaction). RPC yoksa GÜVENLİ SIRALI legacy: önce VERSION
//   insert, sonra current_version CAS — version yazılamazsa current_version
//   ASLA ilerlemez (Faz 5.3).
// - Geçerli durum geçiş grafı (Faz 5.4): draft→review→(approved|rejected)…;
//   'approved'a YALNIZ decideProposalApproval yolu geçebilir (Faz 5.5):
//   proposal_approvals satırı + doğru versiyon + content-digest birebir.
// - Metinler canonical outbound gate'ten geçmeden versiyon YAZILMAZ; alıcı
//   canonical resolver'dan; evidence id'leri versiyona bağlanır (Faz 5.8).
// - GÖNDERİM YOLU YOKTUR: GMAIL_SEND_ENABLED=false + HITL korunur; 'sent'
//   durumuna bu servisten geçilemez.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { buildProposal } from '@/lib/proposalBuilder'
import { evaluateOutboundText } from '@/lib/outreach/outboundGate'
import { resolveCanonicalRecipient } from '@/lib/contacts/contactService'

const SCHEMA_MISSING = new Set(['42P01', 'PGRST205'])
const RPC_MISSING = new Set(['PGRST202', '42883'])
const SCHEMA_ERR =
  'teklif şeması (mig 061) canlı değil — kullanıcı onayı bekliyor; kalıcı teklif yazılamaz'

export interface ProposalDraftResult {
  ok: boolean
  proposalId?: string
  version?: number
  error?: string
  /** true → mig 061 canlı değil; teklif KALICI DEĞİL (yalnız önizleme mümkün). */
  schemaMissing?: boolean
  /** true → RPC ile tek-transaction yazıldı; false → güvenli-sıralı legacy. */
  atomic?: boolean
  quality?: { ok: boolean; violations: Array<{ code: string; detail: string; fix: string }> }
}

/** Versiyon içeriği → onay dijesti (içerik + kalite + alıcı bağlı; değişirse onay geçersiz). */
export function computeProposalDigest(v: {
  emailSubject: string | null
  emailBody: string | null
  whatsappText: string | null
  qualityDigest: string | null
  contactId: string | null
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        s: v.emailSubject ?? '',
        b: v.emailBody ?? '',
        w: v.whatsappText ?? '',
        q: v.qualityDigest ?? '',
        c: v.contactId ?? 'lead-email',
      }),
    )
    .digest('hex')
}

/**
 * Yeni teklif taslağı (v1) veya mevcut teklifin yeni versiyonu.
 * Discovery notu + primary contact + sektör + offer'lar + evidence kullanılır.
 */
export async function createProposalDraft(opts: {
  leadId: string
  offerIds: string[]
  nowMs?: number
}): Promise<ProposalDraftResult> {
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .select('id, business_name, sector, pain_points, notes')
    .eq('id', opts.leadId)
    .maybeSingle()
  if (leadErr) return { ok: false, error: leadErr.message }
  if (!lead) return { ok: false, error: 'lead bulunamadı' }

  const recipient = await resolveCanonicalRecipient(opts.leadId)

  // Faz 5.8: sektör/rol/itiraz bağlamı builder'a; evidence versiyona bağlanır.
  const built = buildProposal({
    lead: {
      id: lead.id as string,
      business_name: (lead.business_name as string) ?? '—',
      sector: (lead.sector as string) ?? undefined,
      pain_points: (lead.pain_points as string[]) ?? undefined,
    },
    offerIds: opts.offerIds,
  })
  const { data: evidenceRows, error: evErr } = await supabaseAdmin
    .from('lead_evidence')
    .select('id')
    .eq('lead_id', opts.leadId)
    .limit(20)
  if (evErr) return { ok: false, error: `kanıt listesi okunamadı: ${evErr.message}` }
  const evidenceIds = (evidenceRows ?? []).map((e) => e.id as string)

  // Kalite kapısı — geçmeyen içerik KALICI teklif olamaz (Voice DNA yasakları dahil).
  const emailSubject = `Teklif — ${lead.business_name ?? ''}`
  const [wa, em] = await Promise.all([
    evaluateOutboundText({
      leadId: opts.leadId,
      businessName: (lead.business_name as string) ?? '',
      subject: null,
      body: built.whatsappText,
      kind: 'proposal_whatsapp',
      contactName: recipient.contactName,
    }),
    evaluateOutboundText({
      leadId: opts.leadId,
      businessName: (lead.business_name as string) ?? '',
      subject: emailSubject,
      body: built.emailText,
      kind: 'proposal_email',
      contactName: recipient.contactName,
    }),
  ])
  if (!wa.ok || !em.ok) {
    const violations = [...wa.violations, ...em.violations]
    return { ok: false, error: 'kalite kapısı geçilmedi', quality: { ok: false, violations } }
  }

  const nowIso = new Date(opts.nowMs ?? Date.now()).toISOString()
  const offerSummary = {
    offerIds: opts.offerIds,
    services: built.services,
    setupPrice: built.setupPrice,
    monthlyPrice: built.monthlyPrice,
    timeline: built.timeline,
  }
  const rationale = `sektör=${lead.sector ?? '—'}; alıcı=${recipient.source}; kanıt=${evidenceIds.length}`

  // 1) Atomik RPC (mig 061 v2).
  const rpc = await supabaseAdmin.rpc('create_proposal_version_tx', {
    p_lead_id: opts.leadId,
    p_contact_id: recipient.contactId,
    p_offer_summary: offerSummary,
    p_whatsapp_text: built.whatsappText,
    p_email_subject: emailSubject,
    p_email_body: built.emailText,
    p_quality_digest: em.digest,
    p_evidence_ids: evidenceIds,
    p_rationale: rationale,
    p_now: nowIso,
  })
  if (!rpc.error) {
    const r = rpc.data as { ok: boolean; proposal_id?: string; version?: number }
    if (r?.ok) {
      return {
        ok: true,
        proposalId: r.proposal_id,
        version: r.version,
        atomic: true,
        quality: { ok: true, violations: [] },
      }
    }
    return { ok: false, error: 'teklif transaction reddetti', atomic: true }
  }
  if (SCHEMA_MISSING.has(rpc.error.code ?? '')) {
    return { ok: false, schemaMissing: true, error: SCHEMA_ERR }
  }
  if (!RPC_MISSING.has(rpc.error.code ?? '')) {
    return { ok: false, error: rpc.error.message }
  }

  // 2) Legacy (061'in RPC'siz eski hâli) — GÜVENLİ SIRA: version önce.
  const { data: existing, error: exErr } = await supabaseAdmin
    .from('proposals')
    .select('id, current_version, status')
    .eq('lead_id', opts.leadId)
    .in('status', ['draft', 'review', 'approved'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (exErr) {
    if (SCHEMA_MISSING.has(exErr.code ?? '')) return { ok: false, schemaMissing: true, error: SCHEMA_ERR }
    return { ok: false, error: exErr.message }
  }

  let proposalId: string
  let version: number
  let prevVersion: number | null = null
  if (existing) {
    proposalId = existing.id as string
    prevVersion = (existing.current_version as number) ?? 1
    version = prevVersion + 1
  } else {
    const { data: created, error } = await supabaseAdmin
      .from('proposals')
      .insert({ lead_id: opts.leadId, contact_id: recipient.contactId, status: 'draft', current_version: 1 })
      .select('id')
      .single()
    if (error || !created) {
      if (SCHEMA_MISSING.has(error?.code ?? '')) return { ok: false, schemaMissing: true, error: SCHEMA_ERR }
      return { ok: false, error: error?.message ?? 'teklif oluşturulamadı' }
    }
    proposalId = created.id as string
    version = 1
  }

  // VERSION ÖNCE — yazılamazsa current_version İLERLEMEZ (yeni proposal ise telafi silinir).
  const { error: verErr } = await supabaseAdmin.from('proposal_versions').insert({
    proposal_id: proposalId,
    version,
    offer_summary: offerSummary,
    whatsapp_text: built.whatsappText,
    email_subject: emailSubject,
    email_body: built.emailText,
    quality_digest: em.digest,
    evidence_ids: evidenceIds,
    rationale,
  })
  if (verErr) {
    if (!existing) {
      await supabaseAdmin.from('proposals').delete().eq('id', proposalId)
    }
    return { ok: false, error: `versiyon yazılamadı (current_version ilerlemedi): ${verErr.message}` }
  }

  if (existing) {
    const { data: bumped, error: bumpErr } = await supabaseAdmin
      .from('proposals')
      .update({ current_version: version, status: 'draft', contact_id: recipient.contactId, updated_at: nowIso })
      .eq('id', proposalId)
      .eq('current_version', prevVersion as number) // CAS — eşzamanlı revize yarışı
      .select('id')
    if (bumpErr || !bumped?.length) {
      return {
        ok: false,
        error: 'versiyon yazıldı ama current_version güncellenemedi (yarış/DB) — tekrar deneyin',
        atomic: false,
      }
    }
  }

  const { error: evtErr } = await supabaseAdmin.from('proposal_events').insert({
    proposal_id: proposalId,
    version,
    event: version === 1 ? 'created' : 'revised',
    metadata: { recipientSource: recipient.source, atomic: false },
  })
  if (evtErr) console.error('[proposal] event yazılamadı:', evtErr.message)

  return { ok: true, proposalId, version, atomic: false, quality: { ok: true, violations: [] } }
}

// ── Durum geçiş grafı (Faz 5.4) ──────────────────────────────────────────────
// 'approved' bu haritada YOK — ona yalnız decideProposalApproval geçirir.
// 'sent' de YOK — gönderim yolu bu serviste yoktur (HITL + ayrı inceleme şartı).
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['review', 'expired'],
  review: ['draft', 'rejected', 'expired'],
  approved: ['accepted', 'rejected', 'expired'],
  sent: ['accepted', 'rejected', 'expired'],
  accepted: [],
  rejected: [],
  expired: [],
}

export async function transitionProposal(opts: {
  proposalId: string
  to: 'review' | 'draft' | 'accepted' | 'rejected' | 'expired'
  nowMs?: number
}): Promise<{ ok: boolean; error?: string }> {
  const nowIso = new Date(opts.nowMs ?? Date.now()).toISOString()
  const { data: current, error: curErr } = await supabaseAdmin
    .from('proposals')
    .select('id, status, current_version')
    .eq('id', opts.proposalId)
    .maybeSingle()
  if (curErr) return { ok: false, error: curErr.message }
  if (!current) return { ok: false, error: 'teklif bulunamadı' }

  const from = current.status as string
  if (!(VALID_TRANSITIONS[from] ?? []).includes(opts.to)) {
    return { ok: false, error: `geçersiz geçiş: ${from} → ${opts.to}` }
  }

  // CAS: durum okuduğumuz durumdan değiştiyse geçiş uygulanmaz (yarış).
  const { data: updated, error } = await supabaseAdmin
    .from('proposals')
    .update({ status: opts.to, updated_at: nowIso })
    .eq('id', opts.proposalId)
    .eq('status', from)
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!updated?.length) return { ok: false, error: 'durum değişti (yarış) — tekrar deneyin' }

  const { error: evtErr } = await supabaseAdmin.from('proposal_events').insert({
    proposal_id: opts.proposalId,
    version: current.current_version as number,
    // Audit (Faz 5.7): acceptance/rejection/expiry izi event'te.
    event: opts.to === 'review' || opts.to === 'draft' ? 'revised' : opts.to,
    metadata: { from, to: opts.to },
  })
  if (evtErr) console.error('[proposal] transition event yazılamadı:', evtErr.message)
  return { ok: true }
}

// ── Onay akışı (Faz 5.5): approved YALNIZ buradan ───────────────────────────

async function loadVersionForDigest(proposalId: string, version: number) {
  const [{ data: v, error: vErr }, { data: p, error: pErr }] = await Promise.all([
    supabaseAdmin
      .from('proposal_versions')
      .select('email_subject, email_body, whatsapp_text, quality_digest')
      .eq('proposal_id', proposalId)
      .eq('version', version)
      .maybeSingle(),
    supabaseAdmin.from('proposals').select('id, status, current_version, contact_id').eq('id', proposalId).maybeSingle(),
  ])
  if (vErr) throw new Error(vErr.message)
  if (pErr) throw new Error(pErr.message)
  return { versionRow: v, proposalRow: p }
}

/** Onay İSTEĞİ: mevcut current_version içeriğine digest'li pending satır açar. */
export async function requestProposalApproval(opts: {
  proposalId: string
  nowMs?: number
}): Promise<{ ok: boolean; version?: number; error?: string }> {
  const { data: p, error: pErr } = await supabaseAdmin
    .from('proposals')
    .select('id, status, current_version, contact_id')
    .eq('id', opts.proposalId)
    .maybeSingle()
  if (pErr) return { ok: false, error: pErr.message }
  if (!p) return { ok: false, error: 'teklif bulunamadı' }
  if (!['draft', 'review'].includes(p.status as string)) {
    return { ok: false, error: `bu durumda onay istenemez: ${p.status}` }
  }
  const version = p.current_version as number
  let digest: string
  try {
    const { versionRow } = await loadVersionForDigest(opts.proposalId, version)
    if (!versionRow) return { ok: false, error: `versiyon ${version} bulunamadı — onay bağlanamaz` }
    digest = computeProposalDigest({
      emailSubject: versionRow.email_subject as string | null,
      emailBody: versionRow.email_body as string | null,
      whatsappText: versionRow.whatsapp_text as string | null,
      qualityDigest: versionRow.quality_digest as string | null,
      contactId: (p.contact_id as string | null) ?? null,
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'digest hesaplanamadı' }
  }

  const { error } = await supabaseAdmin.from('proposal_approvals').insert({
    proposal_id: opts.proposalId,
    version,
    decision: 'pending',
    action_digest: digest,
  })
  if (error) {
    // (proposal_id, version) unique → aynı versiyona ikinci istek idempotent kabul.
    if (error.code === '23505') return { ok: true, version }
    return { ok: false, error: error.message }
  }
  // Review'a taşı (draft ise) — onay bekleyen teklif draft'ta kalmaz.
  if (p.status === 'draft') await transitionProposal({ proposalId: opts.proposalId, to: 'review', nowMs: opts.nowMs })
  return { ok: true, version }
}

/**
 * Onay KARARI: approved'a geçiş YALNIZ burada — approval satırı + doğru
 * versiyon (hâlâ current) + content digest birebir eşleşmesi şart.
 */
export async function decideProposalApproval(opts: {
  proposalId: string
  version: number
  decision: 'approved' | 'rejected'
  nowMs?: number
}): Promise<{ ok: boolean; error?: string }> {
  const nowIso = new Date(opts.nowMs ?? Date.now()).toISOString()
  const { data: approval, error: aErr } = await supabaseAdmin
    .from('proposal_approvals')
    .select('id, decision, action_digest, version')
    .eq('proposal_id', opts.proposalId)
    .eq('version', opts.version)
    .maybeSingle()
  if (aErr) return { ok: false, error: aErr.message }
  if (!approval) return { ok: false, error: 'onay kaydı yok — onaysız approved geçişi yapılamaz' }
  if (approval.decision !== 'pending') {
    return { ok: false, error: `onay zaten karara bağlı: ${approval.decision}` }
  }

  interface ProposalRowLite {
    status?: string
    current_version?: number
    contact_id?: string | null
  }
  let proposalRow: ProposalRowLite | null = null
  try {
    const { versionRow, proposalRow: p } = await loadVersionForDigest(opts.proposalId, opts.version)
    proposalRow = p as ProposalRowLite | null
    if (!versionRow || !p) return { ok: false, error: 'teklif/versiyon bulunamadı' }
    if ((p.current_version as number) !== opts.version) {
      return { ok: false, error: `onay ${opts.version}. versiyona ait; teklif ${p.current_version}. versiyonda — YENİDEN onay gerekir` }
    }
    const digest = computeProposalDigest({
      emailSubject: versionRow.email_subject as string | null,
      emailBody: versionRow.email_body as string | null,
      whatsappText: versionRow.whatsapp_text as string | null,
      qualityDigest: versionRow.quality_digest as string | null,
      contactId: (p.contact_id as string | null) ?? null,
    })
    if (digest !== approval.action_digest) {
      return { ok: false, error: 'içerik/alıcı onaydan sonra değişti (digest uyuşmazlığı) — YENİDEN onay gerekir' }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'digest doğrulanamadı' }
  }

  // Approval kararı CAS (pending → decision).
  const { data: decided, error: dErr } = await supabaseAdmin
    .from('proposal_approvals')
    .update({ decision: opts.decision, decided_at: nowIso })
    .eq('id', approval.id)
    .eq('decision', 'pending')
    .select('id')
  if (dErr) return { ok: false, error: dErr.message }
  if (!decided?.length) return { ok: false, error: 'onay yarışta karara bağlandı — durumu yenileyin' }

  const targetStatus = opts.decision === 'approved' ? 'approved' : 'rejected'
  const { error: sErr } = await supabaseAdmin
    .from('proposals')
    .update({ status: targetStatus, updated_at: nowIso })
    .eq('id', opts.proposalId)
    .eq('status', proposalRow?.status ?? 'review')
  if (sErr) return { ok: false, error: sErr.message }

  const { error: evtErr } = await supabaseAdmin.from('proposal_events').insert({
    proposal_id: opts.proposalId,
    version: opts.version,
    event: targetStatus,
    metadata: { via: 'proposal_approval' },
  })
  if (evtErr) console.error('[proposal] approval event yazılamadı:', evtErr.message)
  return { ok: true }
}
