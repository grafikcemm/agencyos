// POST /api/outreach/[id]/request-send — Gmail gönderimi için HITL onay isteği.
// Opsiyonel { subject, finalBody } düzenlemesi persist edilir; digest düzenleme
// SONRASI içeriğe bağlanır. Suppression/uyum bloke ise onay kartı doğmaz.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiAccess } from '@/lib/auth'
import { enforceSameOrigin, parseJsonBody, BadRequestError } from '@/lib/api/guards'
import { requestSendApproval } from '@/lib/outreach/gmail'
import { lintOutreachDraft, type QualityLintResult } from '@/lib/outreach/qualityLint'
import { getBannedPhrases, recordVoiceDelta } from '@/lib/outreach/voiceDna'
import { supabaseAdmin } from '@/lib/supabase'

/** Deterministik kalite lint'i (Faz D3) — şimdilik ADVISORY: sonuç response'ta
 *  döner, onay kartında görünür; blocking gate Voice DNA kalibrasyonundan sonra
 *  açılır (mevcut taslak stoğunu kilitlememek için bilinçli karar). */
async function lintDraft(draftId: string, overrides: { subject?: string; finalBody?: string }): Promise<QualityLintResult | null> {
  try {
    const { data: draft } = await supabaseAdmin
      .from('outreach_messages')
      .select('subject, body, channel, lead_id, leads(business_name)')
      .eq('id', draftId)
      .maybeSingle()
    if (!draft) return null

    // Voice DNA v0 (Faz D1): operatör gövdeyi düzenlediyse SİLİNENLERİ öğren
    // (aday sayacı; otomatik yasaklama yok — onay operatörde). Best-effort.
    const originalBody = (draft.body as string) ?? ''
    if (overrides.finalBody && overrides.finalBody !== originalBody) {
      await recordVoiceDelta(originalBody, overrides.finalBody)
    }

    const { data: evidence } = await supabaseAdmin
      .from('lead_evidence')
      .select('id')
      .eq('lead_id', draft.lead_id as string)
      .limit(1)
    // Onaylı yasak ifadeler settings key/value deposundan (kolon değil).
    const banned = await getBannedPhrases()
    return lintOutreachDraft({
      subject: overrides.subject ?? (draft.subject as string | null),
      body: overrides.finalBody ?? ((draft.body as string) ?? ''),
      businessName:
        (draft as { leads?: { business_name?: string } }).leads?.business_name ?? '',
      evidenceIds: (evidence ?? []).map((e) => e.id as string),
      bannedPhrases: banned,
      channel: ((draft.channel as string) === 'email' ? 'email' : 'whatsapp') as 'email' | 'whatsapp',
    })
  } catch {
    return null // lint hesaplanamadı — onay akışını düşürmez (advisory)
  }
}

const RequestSendSchema = z
  .object({
    subject: z.string().min(1).max(500).optional(),
    finalBody: z.string().min(1).max(50_000).optional(),
  })
  .strict()

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originErr = enforceSameOrigin(req)
    if (originErr) return originErr

    const { id } = await params
    if (!id) return NextResponse.json({ success: false, error: 'id zorunludur' }, { status: 400 })

    const body = await parseJsonBody(req, RequestSendSchema)
    const result = await requestSendApproval(id, {
      subject: body.subject,
      finalBody: body.finalBody,
    })

    if (!result.ok) {
      const status = result.blockedReasons ? 422 : 400
      return NextResponse.json({ success: false, ...result }, { status })
    }
    const quality = await lintDraft(id, { subject: body.subject, finalBody: body.finalBody })
    return NextResponse.json({
      success: true,
      data: { approvalId: result.approvalId, status: result.status, quality },
    })
  } catch (error: unknown) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
