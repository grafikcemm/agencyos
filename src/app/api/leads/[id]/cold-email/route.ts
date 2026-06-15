// POST /api/leads/[id]/cold-email — operatörün lead için soğuk e-posta taslağı
// üretmesi. Kullanıcı-tetikli tek taslak olduğundan SENKRON çalışır: lead'in acı
// noktalarıyla LLM'den gövde üretilir, imza bloğu settings'ten deterministik
// eklenir, outreach_messages'a draft yazılır ve UI'a anında döndürülür.
// GET — lead'in en son e-posta taslağını döndürür (drawer açılışında).
import { NextResponse } from 'next/server'
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
} from '@/lib/coldEmail'
import { COLD_EMAIL_TEMPLATES, selectColdEmailTemplate } from '@/lib/coldEmailTemplates'

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

    const { content } = await callWithOperation(
      'draft_email',
      buildColdEmailSystemPrompt(),
      buildColdEmailUserPrompt(lead, template),
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

    return NextResponse.json({ success: true, draft })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

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
