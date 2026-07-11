// POST /api/outreach/[id]/request-send — Gmail gönderimi için HITL onay isteği.
// Opsiyonel { subject, finalBody } düzenlemesi persist edilir; digest düzenleme
// SONRASI içeriğe bağlanır. Suppression/uyum bloke ise onay kartı doğmaz.
import { NextResponse } from 'next/server'
import { requireApiAccess } from '@/lib/auth'
import { enforceSameOrigin } from '@/lib/api/guards'
import { requestSendApproval } from '@/lib/outreach/gmail'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originErr = enforceSameOrigin(req)
    if (originErr) return originErr

    const { id } = await params
    if (!id) return NextResponse.json({ success: false, error: 'id zorunludur' }, { status: 400 })

    const body = (await req.json().catch(() => ({}))) as { subject?: string; finalBody?: string }
    const result = await requestSendApproval(id, {
      subject: typeof body.subject === 'string' ? body.subject : undefined,
      finalBody: typeof body.finalBody === 'string' ? body.finalBody : undefined,
    })

    if (!result.ok) {
      const status = result.blockedReasons ? 422 : 400
      return NextResponse.json({ success: false, ...result }, { status })
    }
    return NextResponse.json({ success: true, data: { approvalId: result.approvalId, status: result.status } })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
