// POST /api/outreach/[id]/reconcile — belirsiz ('unknown'/bayat 'sending')
// gönderim denemesini çözer: Gmail'de deterministik Message-ID araması →
// bulunursa reconciled+finalize, bulunamazsa 'failed' (yeniden denenebilir).
// KÖR RETRY'IN ALTERNATİFİ — provider'a yeni send çağrısı YAPMAZ.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiAccess } from '@/lib/auth'
import { enforceSameOrigin, parseJsonBody, BadRequestError } from '@/lib/api/guards'
import { reconcileOutreachSend } from '@/lib/outreach/gmail'

// confirmNotFound: yeterli arama sonrası 'failed' kararının AÇIK operatör onayı.
const ReconcileSchema = z.object({ confirmNotFound: z.boolean().optional() }).strict()

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originErr = enforceSameOrigin(req)
    if (originErr) return originErr

    const { id } = await params
    if (!id) return NextResponse.json({ success: false, error: 'id zorunludur' }, { status: 400 })

    const body = await parseJsonBody(req, ReconcileSchema)
    const result = await reconcileOutreachSend(id, { confirmNotFound: body.confirmNotFound })
    if (!result.ok) {
      return NextResponse.json({ success: false, ...result }, { status: 409 })
    }
    return NextResponse.json({ success: true, data: { outcome: result.outcome } })
  } catch (error: unknown) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
