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
  parseColdEmailOutput,
  SIGNATURE_SETTING_KEYS,
  type ColdEmailLead,
} from '@/lib/coldEmail'

// LLM çağrısı birkaç saniye sürebilir — serverless timeout'u yükselt.
export const maxDuration = 60

const LEAD_SELECT =
  'id, business_name, sector, district, rating, review_count, has_real_website, has_whatsapp, website, pain_signals, proof_points, why_now, why_this_will_convert'

async function loadSignatureLinks(): Promise<Record<string, string>> {
  const links: Record<string, string> = {}
  const { data } = await supabaseAdmin
    .from('settings')
    .select('key, value')
    .in('key', [...SIGNATURE_SETTING_KEYS])

  for (const row of data ?? []) {
    if (row.key && row.value) links[row.key] = row.value
  }
  return links
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

    const { content } = await callWithOperation(
      'draft_email',
      buildColdEmailSystemPrompt(),
      buildColdEmailUserPrompt(lead),
      700,
    )

    const parsed = parseColdEmailOutput(content)
    if (!parsed) {
      return NextResponse.json(
        { success: false, error: 'Model taslak üretemedi, tekrar deneyin.' },
        { status: 502 },
      )
    }

    const signatureLinks = await loadSignatureLinks()
    const fullBody = `${parsed.body.trim()}\n\n${buildSignatureBlock(signatureLinks)}`

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
