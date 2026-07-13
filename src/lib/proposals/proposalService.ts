// ─────────────────────────────────────────────────────────────────────────────
// Teklif motoru (Faz 3.2) — durable + versiyonlu + onay-kapılı.
//
// Client-memory Proposal (buildProposal) yalnız ÖNİZLEMEDİR; kalıcı teklif bu
// servisten geçer. Şema (mig 061) CANLI DEĞİLKEN yazma denemeleri açık hatayla
// reddedilir (fail-closed) — sessizce memory'e düşülmez.
//
// Kurallar:
// - Metinler canonical outbound gate'ten geçmeden versiyon YAZILMAZ.
// - Alıcı canonical resolver'dan (primary contact → lead.email).
// - Gönderim yolu YOKTUR: approval 'approved' olmadan hiçbir kanal bu içeriği
//   gönderemez; gerçek gönderim ayrı güvenlik incelemesi + kullanıcı onayı ister.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '@/lib/supabase'
import { buildProposal } from '@/lib/proposalBuilder'
import { evaluateOutboundText } from '@/lib/outreach/outboundGate'
import { resolveCanonicalRecipient } from '@/lib/contacts/contactService'

const SCHEMA_MISSING = new Set(['42P01', 'PGRST205'])

export interface ProposalDraftResult {
  ok: boolean
  proposalId?: string
  version?: number
  error?: string
  /** true → mig 061 canlı değil; teklif KALICI DEĞİL (yalnız önizleme mümkün). */
  schemaMissing?: boolean
  quality?: { ok: boolean; violations: Array<{ code: string; detail: string; fix: string }> }
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

  const built = buildProposal({
    lead: {
      id: lead.id as string,
      business_name: (lead.business_name as string) ?? '—',
      sector: (lead.sector as string) ?? undefined,
      pain_points: (lead.pain_points as string[]) ?? undefined,
    },
    offerIds: opts.offerIds,
  })

  // Kalite kapısı — geçmeyen içerik KALICI teklif olamaz.
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
      subject: `Teklif — ${lead.business_name ?? ''}`,
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

  // Mevcut açık teklif varsa yeni VERSİYON; yoksa yeni teklif.
  const { data: existing, error: exErr } = await supabaseAdmin
    .from('proposals')
    .select('id, current_version, status')
    .eq('lead_id', opts.leadId)
    .in('status', ['draft', 'review', 'approved'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (exErr) {
    if (SCHEMA_MISSING.has(exErr.code ?? '')) {
      return { ok: false, schemaMissing: true, error: 'teklif şeması (mig 061) canlı değil — kullanıcı onayı bekliyor; kalıcı teklif yazılamaz' }
    }
    return { ok: false, error: exErr.message }
  }

  let proposalId: string
  let version: number
  if (existing) {
    proposalId = existing.id as string
    version = ((existing.current_version as number) ?? 1) + 1
    const { error } = await supabaseAdmin
      .from('proposals')
      .update({ current_version: version, status: 'draft', contact_id: recipient.contactId, updated_at: nowIso })
      .eq('id', proposalId)
    if (error) return { ok: false, error: error.message }
  } else {
    const { data: created, error } = await supabaseAdmin
      .from('proposals')
      .insert({ lead_id: opts.leadId, contact_id: recipient.contactId, status: 'draft', current_version: 1 })
      .select('id')
      .single()
    if (error || !created) {
      if (SCHEMA_MISSING.has(error?.code ?? '')) {
        return { ok: false, schemaMissing: true, error: 'teklif şeması (mig 061) canlı değil — kullanıcı onayı bekliyor; kalıcı teklif yazılamaz' }
      }
      return { ok: false, error: error?.message ?? 'teklif oluşturulamadı' }
    }
    proposalId = created.id as string
    version = 1
  }

  const { error: verErr } = await supabaseAdmin.from('proposal_versions').insert({
    proposal_id: proposalId,
    version,
    offer_summary: {
      offerIds: opts.offerIds,
      services: built.services,
      setupPrice: built.setupPrice,
      monthlyPrice: built.monthlyPrice,
      timeline: built.timeline,
    },
    whatsapp_text: built.whatsappText,
    email_subject: `Teklif — ${lead.business_name ?? ''}`,
    email_body: built.emailText,
    quality_digest: em.digest,
    rationale: `sektör=${lead.sector ?? '—'}; alıcı=${recipient.source}`,
  })
  if (verErr) return { ok: false, error: verErr.message }

  await supabaseAdmin.from('proposal_events').insert({
    proposal_id: proposalId,
    version,
    event: version === 1 ? 'created' : 'revised',
    metadata: { recipientSource: recipient.source },
  })

  return { ok: true, proposalId, version, quality: { ok: true, violations: [] } }
}

/** Durum geçişleri — accepted/rejected/expired izleri attribution için event'e yazılır. */
export async function transitionProposal(opts: {
  proposalId: string
  to: 'review' | 'approved' | 'accepted' | 'rejected' | 'expired'
  nowMs?: number
}): Promise<{ ok: boolean; error?: string }> {
  const nowIso = new Date(opts.nowMs ?? Date.now()).toISOString()
  const { data, error } = await supabaseAdmin
    .from('proposals')
    .update({ status: opts.to, updated_at: nowIso })
    .eq('id', opts.proposalId)
    .select('id, current_version')
  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: 'teklif bulunamadı' }
  await supabaseAdmin.from('proposal_events').insert({
    proposal_id: opts.proposalId,
    version: data[0].current_version as number,
    event: opts.to === 'review' ? 'revised' : opts.to,
    metadata: {},
  })
  return { ok: true }
}
