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
import type { ClaimEvidenceEntry } from '@/lib/outreach/qualityLint'

const SCHEMA_MISSING = new Set(['42P01', 'PGRST205'])

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

    // Faz 3.1: iddia→kanıt bağının KALICI izi (mig 062). Şema canlı değilse
    // yazılamaz — bu durum GİZLENMEZ (claimPersisted:false döner); doğrulama
    // zaten gate'te authoritative olduğundan güvenlik kaybı yoktur.
    let claimPersisted = false
    if (parsed.claims.length > 0) {
      const evidenceMeta = new Map(
        (evidenceRows ?? []).map((e) => [e.id as string, { kind: e.kind as string | null, source: e.source as string | null }]),
      )
      const validRows = parsed.claims
        .filter((c) => evidenceMeta.has(c.evidenceId))
        .map((c) => ({
          outreach_message_id: draft.id,
          claim_text: c.text,
          evidence_id: c.evidenceId,
          evidence_type: evidenceMeta.get(c.evidenceId)?.kind ?? null,
          evidence_source: evidenceMeta.get(c.evidenceId)?.source ?? null,
        }))
      if (validRows.length > 0) {
        const { error: ceErr } = await supabaseAdmin.from('outreach_claim_evidence').insert(validRows)
        if (!ceErr) claimPersisted = true
        else if (SCHEMA_MISSING.has(ceErr.code ?? '')) {
          console.warn('[cold-email] outreach_claim_evidence şeması canlı değil (mig 062 onay bekliyor) — iz yazılamadı')
        } else {
          console.error('[cold-email] claim_evidence izi yazılamadı:', ceErr.message)
        }
      }
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
