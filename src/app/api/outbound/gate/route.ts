// POST /api/outbound/gate — canonical outbound kalite/kanıt kapısı (Faz 1.1).
// SALT DEĞERLENDİRME (mutasyon yok): drawer/liste/pipeline copy + wa.me prefill
// butonları metni ancak bu kapı ok dediyse kullanabilir. Client evidence
// doğrulayamaz → doğrulama BURADA (server) yapılır.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiAccess } from '@/lib/auth'
import { enforceSameOrigin, parseJsonBody, BadRequestError } from '@/lib/api/guards'
import { supabaseAdmin } from '@/lib/supabase'
import { evaluateOutboundText, type OutboundKind } from '@/lib/outreach/outboundGate'

const GateSchema = z
  .object({
    leadId: z.string().uuid(),
    items: z
      .array(
        z
          .object({
            key: z.string().min(1).max(64),
            kind: z.enum(['first_message', 'pitch', 'cold_email', 'proposal_whatsapp', 'proposal_email']),
            text: z.string().min(1).max(50_000),
            subject: z.string().max(500).nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict()

export async function POST(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originErr = enforceSameOrigin(req)
    if (originErr) return originErr

    const body = await parseJsonBody(req, GateSchema)

    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .select('id, business_name')
      .eq('id', body.leadId)
      .maybeSingle()
    if (error) {
      // Fail-closed: lead okunamıyorsa hiçbir metin 'gönderilebilir' sayılmaz.
      return NextResponse.json({ success: false, error: 'kapı değerlendirilemedi' }, { status: 503 })
    }
    if (!lead) return NextResponse.json({ success: false, error: 'lead bulunamadı' }, { status: 404 })

    const results: Record<string, { ok: boolean; violations: Array<{ code: string; detail: string; fix: string }> }> = {}
    for (const item of body.items) {
      const verdict = await evaluateOutboundText({
        leadId: body.leadId,
        businessName: (lead.business_name as string) ?? '',
        subject: item.subject ?? null,
        body: item.text,
        kind: item.kind as OutboundKind,
      })
      results[item.key] = { ok: verdict.ok, violations: verdict.violations }
    }
    return NextResponse.json({ success: true, results })
  } catch (err) {
    if (err instanceof BadRequestError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    }
    // Fail-closed: değerlendirme hatası → client raw metni KULLANAMAZ.
    return NextResponse.json({ success: false, error: 'kapı değerlendirilemedi' }, { status: 503 })
  }
}
