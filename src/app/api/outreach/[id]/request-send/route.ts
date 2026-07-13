// POST /api/outreach/[id]/request-send — Gmail gönderimi için HITL onay isteği.
// Opsiyonel { subject, finalBody } düzenlemesi persist edilir; digest düzenleme
// SONRASI içeriğe + kalite dijestine bağlanır (Faz 1.3). Kalite lint'i artık
// BLOCKING ve requestSendApproval İÇİNDE, approval yaratılmadan ÖNCE koşar;
// lint servisi hata verirse fail-closed (onay kartı doğmaz).
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiAccess } from '@/lib/auth'
import { enforceSameOrigin, parseJsonBody, BadRequestError } from '@/lib/api/guards'
import { requestSendApproval } from '@/lib/outreach/gmail'

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
    return NextResponse.json({
      success: true,
      data: { approvalId: result.approvalId, status: result.status, quality: result.quality ?? null },
    })
  } catch (error: unknown) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
