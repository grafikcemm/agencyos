// POST /api/outreach/[id]/reconcile — belirsiz ('unknown'/bayat 'sending')
// gönderim denemesini çözer: Gmail'de deterministik Message-ID araması →
// bulunursa reconciled+finalize, bulunamazsa 'failed' (yeniden denenebilir).
// KÖR RETRY'IN ALTERNATİFİ — provider'a yeni send çağrısı YAPMAZ.
import { NextResponse } from 'next/server'
import { requireApiAccess } from '@/lib/auth'
import { enforceSameOrigin } from '@/lib/api/guards'
import { reconcileOutreachSend } from '@/lib/outreach/gmail'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originErr = enforceSameOrigin(req)
    if (originErr) return originErr

    const { id } = await params
    if (!id) return NextResponse.json({ success: false, error: 'id zorunludur' }, { status: 400 })

    const result = await reconcileOutreachSend(id)
    if (!result.ok) {
      return NextResponse.json({ success: false, ...result }, { status: 409 })
    }
    return NextResponse.json({ success: true, data: { outcome: result.outcome } })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
