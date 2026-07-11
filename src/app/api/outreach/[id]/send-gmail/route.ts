// POST /api/outreach/[id]/send-gmail — onaylı Gmail gönderimini yürütür.
// Gönderim TEK fonksiyondan (sendGmailMessage) geçer; onaysız/digest-uyuşmasız/
// suppress'li istek yapısal olarak yürümez (T5/T6/T8).
import { NextResponse } from 'next/server'
import { requireApiAccess } from '@/lib/auth'
import { enforceSameOrigin } from '@/lib/api/guards'
import { sendGmailMessage } from '@/lib/outreach/gmail'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originErr = enforceSameOrigin(req)
    if (originErr) return originErr

    const { id } = await params
    const body = (await req.json().catch(() => ({}))) as { approvalId?: string }
    if (!id || !body.approvalId) {
      return NextResponse.json({ success: false, error: 'id ve approvalId zorunludur' }, { status: 400 })
    }

    const result = await sendGmailMessage({ outreachMessageId: id, approvalId: body.approvalId })
    if (!result.ok) {
      const status = result.blockedReasons ? 422 : 409
      return NextResponse.json({ success: false, ...result }, { status })
    }
    return NextResponse.json({ success: true, data: result })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
