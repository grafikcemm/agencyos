// POST /api/leads/[id]/cold-email — operatörün lead için soğuk e-posta taslağı
// üretmesi. Kullanıcı-tetikli tek taslak olduğundan SENKRON çalışır: lead'in acı
// noktalarıyla LLM'den gövde üretilir, imza bloğu settings'ten deterministik
// eklenir, outreach_messages'a draft yazılır ve UI'a anında döndürülür.
// GET — lead'in en son e-posta taslağını döndürür (drawer açılışında).
import { NextResponse } from 'next/server'
import { enforceSameOrigin } from '@/lib/api/guards'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'
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
} from '@/lib/coldEmail'
import { COLD_EMAIL_TEMPLATES, selectColdEmailTemplate } from '@/lib/coldEmailTemplates'
import { evaluateOutboundText } from '@/lib/outreach/outboundGate'
import { getApprovedStyleRules } from '@/lib/outreach/voiceDna'
import { resolveCanonicalRecipient } from '@/lib/contacts/contactService'
import { detectClaimsDetailed, type ClaimEvidenceEntry } from '@/lib/outreach/qualityLint'
import { persistMessageVersion, voiceRulesDigest } from '@/lib/outreach/claimEvidence'

// LLM çağrısı birkaç saniye sürebilir — serverless timeout'u yükselt.
export const maxDuration = 60

const LEAD_SELECT =
  'id, business_name, sector, district, rating, review_count, has_real_website, has_whatsapp, has_ads_signal, has_job_signal, instagram_as_site, website, pain_signals, proof_points, why_now, why_this_will_convert'

// İmza linkleri + İYS/KVKK uyum ayarlarını tek sorguda yükler.
async function loadEmailSettings(): Promise<Record<string, string>> {
  const settings: Record<string, string> = {}
  const { data } = await supabaseAdmin
    .from('settings')
    .select('key, value')
    .in('key', [...SIGNATURE_SETTING_KEYS, ...COMPLIANCE_SETTING_KEYS])

  for (const row of data ?? []) {
    if (row.key && row.value) settings[row.key] = row.value
  }
  return settings
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originError = enforceSameOrigin(req)
    if (originError) return originError

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id zorunludur' }, { status: 400 })

    const { data: lead, error: leadErr } = await supabaseAdmin
      .from('leads')
      .select(LEAD_SELECT)
      .eq('id', id)
      .maybeSingle<ColdEmailLead>()
    if (leadErr) throw leadErr
    if (!lead) return NextResponse.json({ error: 'Lead bulunamadı' }, { status: 404 })

    const templateId = selectColdEmailTemplate({
      hasAdsSignal: lead.has_ads_signal,
      hasJobSignal: lead.has_job_signal,
      instagramAsSite: lead.instagram_as_site,
      hasRealWebsite: lead.has_real_website,
      rating: lead.rating,
    })
    const template = COLD_EMAIL_TEMPLATES[templateId]

    // Faz 4.5/4.6: kişiselleştirme CANONICAL resolver'dan — YALNIZ primary
    // contact (deterministik, en yeni primary); primary yoksa keyfi "en eski
    // contact" SEÇİLMEZ (işletme-genel çerçeve kullanılır). Alıcı adresi de
    // aynı resolver'dan gelir → request-send/approval digest'iyle tutarlı.
    let contact: { fullName: string; role: ContactRole } | undefined
    const recipient = await resolveCanonicalRecipient(id)
    if (recipient.source === 'primary_contact' && recipient.contactId && recipient.contactName) {
      const { data: primaryRow, error: roleErr } = await supabaseAdmin
        .from('contacts')
        .select('role')
        .eq('id', recipient.contactId)
        .maybeSingle()
      if (roleErr) throw new Error(`contact rolü okunamadı: ${roleErr.message}`)
      contact = { fullName: recipient.contactName, role: ((primaryRow?.role as ContactRole) ?? 'other') }
    }

    // Sprint-3 Faz 3.2: kanıt listesi prompt'a girer — iddialar YALNIZ bunlara
    // dayanabilir; model her iddiayı claims[] içinde evidence id ile döner.
    const { data: evidenceRows, error: evErr } = await supabaseAdmin
      .from('lead_evidence')
      .select('id, summary, kind, source')
      .eq('lead_id', id)
      .limit(20)
    if (evErr) throw new Error(`kanıt listesi okunamadı: ${evErr.message}`)
    const evidence = (evidenceRows ?? []).map((e) => ({
      id: e.id as string,
      summary: String(e.summary ?? ''),
    }))

    // Faz 3.7: ONAYLI Voice DNA kuralları üretime enjekte edilir. Okunamazsa
    // hata YUTULMAZ: üretim kuralsız devam eder ama degraded bayrağı görünür.
    let voiceRules: { positive: string[]; negative: string[] } | undefined
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
      return NextResponse.json(
        { success: false, error: 'Model taslak üretemedi, tekrar deneyin.' },
        { status: 502 },
      )
    }

    const emailSettings = await loadEmailSettings()
    const footer = buildComplianceFooter(emailSettings)
    const fullBody = [
      parsed.body.trim(),
      buildSignatureBlock(emailSettings),
      footer,
    ]
      .filter(Boolean)
      .join('\n\n')

    // Faz 3.3/3.4: yapısal claims → gate'in claimEvidence girdisi. Eşlenmemiş
    // quantified/observational iddialar gate'te FAIL-CLOSED bloklanır.
    const claimEvidence: ClaimEvidenceEntry[] = parsed.claims.map((c) => ({
      claim: c.text,
      evidenceIds: [c.evidenceId],
    }))
    const quality = await evaluateOutboundText({
      leadId: id,
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
        lead_id: id,
        channel: 'email',
        status: 'draft',
        subject: parsed.subject,
        body: fullBody,
        sequence_step: 0,
        created_by: 'agent:cold_email',
      })
      .select('id, subject, body, created_at')
      .single()
    if (insertErr) throw insertErr

    // FINALIZATION Faz 1: canonical artifact — versiyon 1 + iddia bağları TEK
    // serviste yazılır (outreach_message_versions + outreach_claim_evidence,
    // mig 062 v2). Şema canlı değilse iz yazılamaz — GİZLENMEZ (claimPersisted:
    // false döner); onay/gönderim kapısı kayıtlı bağları okuyup remap ettiğinden
    // iz olmayan taslağın iddiaları orada FAIL-CLOSED bloklanır.
    let claimPersisted = false
    try {
      const evidenceMeta = new Map(
        (evidenceRows ?? []).map((e) => [e.id as string, { kind: (e.kind as string | null) ?? null, source: (e.source as string | null) ?? null }]),
      )
      const persist = await persistMessageVersion({
        outreachMessageId: draft.id,
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
        console.warn('[cold-email] canonical artifact şeması canlı değil (mig 062 onay bekliyor) — versiyon izi yazılamadı')
      } else {
        claimPersisted = true
      }
    } catch (err) {
      console.error('[cold-email] canonical artifact yazılamadı:', err instanceof Error ? err.message : 'unknown')
    }

    return NextResponse.json({
      success: true,
      draft,
      quality: { ok: quality.ok, violations: quality.violations },
      claims: parsed.claims,
      claimPersisted,
      ...(voiceDegraded ? { voiceDegraded: true } : {}),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originError = enforceSameOrigin(req)
    if (originError) return originError

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id zorunludur' }, { status: 400 })

    const { data: draft, error } = await supabaseAdmin
      .from('outreach_messages')
      .select('id, subject, body, created_at')
      .eq('lead_id', id)
      .eq('channel', 'email')
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error

    return NextResponse.json({ success: true, draft: draft ?? null })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
