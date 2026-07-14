// ─────────────────────────────────────────────────────────────────────────────
// Canonical cold-email ÜRETİM servisi (FINALIZATION Faz 5) — UI'dan BAĞIMSIZ.
//
// Web route'u (/api/leads/[id]/cold-email) VE Telegram "cold email hazırla"
// komutu AYNI fonksiyonu çağırır: structured LLM çıktısı (claims→evidenceId)
// + Voice DNA enjeksiyonu + canonical alıcı + gate + immutable versiyon izi.
// Legacy first_message/pitch_draft yolu YOKTUR.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { callWithOperation } from '@/lib/openrouter'
import {
  buildColdEmailSystemPrompt,
  buildColdEmailUserPrompt,
  buildSignatureBlock,
  buildComplianceFooter,
  parseColdEmailOutput,
  SIGNATURE_SETTING_KEYS,
  COMPLIANCE_SETTING_KEYS,
  type ColdEmailLead,
  type ContactRole,
  type VoiceRuleSet,
} from '@/lib/coldEmail'
import { COLD_EMAIL_TEMPLATES, selectColdEmailTemplate } from '@/lib/coldEmailTemplates'
import { evaluateOutboundText } from '@/lib/outreach/outboundGate'
import { getApprovedStyleRules } from '@/lib/outreach/voiceDna'
import { resolveCanonicalRecipient } from '@/lib/contacts/contactService'
import { detectClaimsDetailed, type ClaimEvidenceEntry } from '@/lib/outreach/qualityLint'
import { persistMessageVersion, voiceRulesDigest } from '@/lib/outreach/claimEvidence'

const LEAD_SELECT =
  'id, business_name, sector, district, rating, review_count, has_real_website, has_whatsapp, has_ads_signal, has_job_signal, instagram_as_site, website, pain_signals, proof_points, why_now, why_this_will_convert'

// İmza linkleri + İYS/KVKK uyum ayarlarını tek sorguda yükler. Sorgu hatası
// SESSİZCE yutulmaz — footer/uyum bilgisi eksik gitmesin (İYS/KVKK yasal
// zorunluluk); hata üste taşınır ve servis fail-closed reddeder.
async function loadEmailSettings(): Promise<{ settings: Record<string, string>; error?: string }> {
  const settings: Record<string, string> = {}
  const { data, error } = await supabaseAdmin
    .from('settings')
    .select('key, value')
    .in('key', [...SIGNATURE_SETTING_KEYS, ...COMPLIANCE_SETTING_KEYS])
  if (error) return { settings, error: error.message }
  for (const row of data ?? []) {
    if (row.key && row.value) settings[row.key] = row.value
  }
  return { settings }
}

export interface ColdEmailGenerateResult {
  ok: boolean
  /** 404 ayrımı için: lead yok (DB hatası DEĞİL). */
  notFound?: boolean
  /** 502 ayrımı için: model çıktısı parse edilemedi. */
  modelFailed?: boolean
  error?: string
  draft?: { id: string; subject: string | null; body: string; created_at: string | null }
  quality?: { ok: boolean; violations: Array<{ code: string; detail: string; fix: string }> }
  claims?: Array<{ text: string; evidenceId: string }>
  claimPersisted?: boolean
  voiceDegraded?: boolean
  /** Canonical şema canlı değil (mig 062 onay bekliyor) — beklenen; onay/gönderim
   *  kapısı iddiaları yine de bloklar (fail-closed downstream). */
  canonicalPending?: boolean
  /** Canonical versiyon izi BEKLENMEDİK hata ile yazılamadı (şema-eksik değil) —
   *  görünür; taslak vardır ama izlenebilirlik zedelendi. */
  canonicalError?: string
}

/** Lead için canonical cold-email taslağı üretir (LLM + gate + versiyon izi). */
export async function generateColdEmailDraft(leadId: string): Promise<ColdEmailGenerateResult> {
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .select(LEAD_SELECT)
    .eq('id', leadId)
    .maybeSingle<ColdEmailLead>()
  if (leadErr) return { ok: false, error: leadErr.message }
  if (!lead) return { ok: false, notFound: true, error: 'Lead bulunamadı' }

  const templateId = selectColdEmailTemplate({
    hasAdsSignal: lead.has_ads_signal,
    hasJobSignal: lead.has_job_signal,
    instagramAsSite: lead.instagram_as_site,
    hasRealWebsite: lead.has_real_website,
    rating: lead.rating,
  })
  const template = COLD_EMAIL_TEMPLATES[templateId]

  // Kişiselleştirme CANONICAL resolver'dan — YALNIZ primary contact.
  let contact: { fullName: string; role: ContactRole } | undefined
  const recipient = await resolveCanonicalRecipient(leadId)
  if (recipient.source === 'primary_contact' && recipient.contactId && recipient.contactName) {
    const { data: primaryRow, error: roleErr } = await supabaseAdmin
      .from('contacts')
      .select('role')
      .eq('id', recipient.contactId)
      .maybeSingle()
    if (roleErr) return { ok: false, error: `contact rolü okunamadı: ${roleErr.message}` }
    contact = { fullName: recipient.contactName, role: ((primaryRow?.role as ContactRole) ?? 'other') }
  }

  // Kanıt listesi prompt'a girer — iddialar YALNIZ bunlara dayanabilir.
  const { data: evidenceRows, error: evErr } = await supabaseAdmin
    .from('lead_evidence')
    .select('id, summary, kind, source')
    .eq('lead_id', leadId)
    .limit(20)
  if (evErr) return { ok: false, error: `kanıt listesi okunamadı: ${evErr.message}` }
  const evidence = (evidenceRows ?? []).map((e) => ({
    id: e.id as string,
    summary: String(e.summary ?? ''),
  }))

  // ONAYLI Voice DNA kuralları enjekte edilir; okunamazsa degraded GÖRÜNÜR.
  let voiceRules: VoiceRuleSet | undefined
  let voiceDegraded = false
  try {
    voiceRules = await getApprovedStyleRules()
  } catch (err) {
    voiceDegraded = true
    console.error('[cold-email] Voice DNA kuralları okunamadı:', err instanceof Error ? err.message : 'unknown')
  }

  const { content } = await callWithOperation(
    'draft_email',
    buildColdEmailSystemPrompt(voiceRules),
    buildColdEmailUserPrompt(lead, template, contact, evidence),
    700,
  )

  const parsed = parseColdEmailOutput(content)
  if (!parsed) {
    return { ok: false, modelFailed: true, error: 'Model taslak üretemedi, tekrar deneyin.' }
  }

  // Uyum/İmza ayarları — sorgu hatası fail-closed (footer eksik gitmesin).
  const { settings: emailSettings, error: settingsErr } = await loadEmailSettings()
  if (settingsErr) {
    return { ok: false, error: `ayar (imza/uyum) okunamadı: ${settingsErr}` }
  }
  const footer = buildComplianceFooter(emailSettings)
  const fullBody = [parsed.body.trim(), buildSignatureBlock(emailSettings), footer]
    .filter(Boolean)
    .join('\n\n')

  // Yapısal claims → gate'in claimEvidence girdisi (eşlenmemişler fail-closed).
  const claimEvidence: ClaimEvidenceEntry[] = parsed.claims.map((c) => ({
    claim: c.text,
    evidenceIds: [c.evidenceId],
  }))
  const quality = await evaluateOutboundText({
    leadId,
    businessName: lead.business_name,
    subject: parsed.subject,
    body: fullBody,
    kind: 'cold_email',
    contactName: contact?.fullName ?? null,
    claimEvidence,
  })

  const { data: draft, error: insertErr } = await supabaseAdmin
    .from('outreach_messages')
    .insert({
      lead_id: leadId,
      channel: 'email',
      status: 'draft',
      subject: parsed.subject,
      body: fullBody,
      sequence_step: 0,
      created_by: 'agent:cold_email',
    })
    .select('id, subject, body, created_at')
    .single()
  if (insertErr || !draft) return { ok: false, error: insertErr?.message ?? 'taslak yazılamadı' }

  // Canonical artifact — versiyon 1 + iddia bağları. Şema canlı değilse iz
  // yazılamaz (claimPersisted:false GÖRÜNÜR); onay/gönderim kapısı kayıtlı
  // bağları okuduğundan iz olmayan taslağın iddiaları orada bloklanır.
  let claimPersisted = false
  let canonicalPending = false
  let canonicalError: string | undefined
  try {
    const evidenceMeta = new Map(
      (evidenceRows ?? []).map((e) => [
        e.id as string,
        { kind: (e.kind as string | null) ?? null, source: (e.source as string | null) ?? null },
      ]),
    )
    const persist = await persistMessageVersion({
      outreachMessageId: draft.id as string,
      channel: 'email',
      recipient: {
        kind: recipient.source === 'primary_contact' ? 'primary_contact' : recipient.email ? 'lead_email' : 'none',
        contactId: recipient.contactId,
        email: recipient.email,
      },
      subject: parsed.subject,
      body: fullBody,
      voiceDigest: voiceRulesDigest(voiceRules ?? null, []),
      gate: {
        ok: quality.ok,
        digest: quality.digest,
        violations: quality.violations.map((v) => ({ code: v.code, detail: v.detail })),
      },
      source: 'generator:cold_email',
      claims: parsed.claims
        .filter((c) => evidenceMeta.has(c.evidenceId))
        .map((c) => ({
          text: c.text,
          category: detectClaimsDetailed(c.text)[0]?.category ?? null,
          evidenceId: c.evidenceId,
          evidenceType: evidenceMeta.get(c.evidenceId)?.kind ?? null,
          evidenceSource: evidenceMeta.get(c.evidenceId)?.source ?? null,
        })),
      createdBy: 'agent:cold_email',
    })
    if (persist.schemaMissing) {
      // BEKLENEN pre-migration durumu — draft kullanılabilir; onay/gönderim
      // kapısı iddiaları kayıtlı-bağ yokluğunda bloklar (fail-closed downstream).
      canonicalPending = true
      console.warn('[cold-email] canonical artifact şeması canlı değil (mig 062 onay bekliyor) — versiyon izi yazılamadı')
    } else {
      claimPersisted = true
    }
  } catch (err) {
    // BEKLENMEDİK hata (şema-eksik değil) → GÖRÜNÜR; draft var ama iz zedeli.
    canonicalError = err instanceof Error ? err.message : 'canonical yazım hatası'
    console.error('[cold-email] canonical artifact yazılamadı:', canonicalError)
  }

  return {
    ok: true,
    draft: draft as ColdEmailGenerateResult['draft'],
    quality: { ok: quality.ok, violations: quality.violations },
    claims: parsed.claims,
    claimPersisted,
    ...(canonicalPending ? { canonicalPending: true } : {}),
    ...(canonicalError ? { canonicalError } : {}),
    ...(voiceDegraded ? { voiceDegraded: true } : {}),
  }
}
