// POST /api/outreach/send
// Manual-dispatch confirmation — operator session ONLY (requireApiUser).
// There is NO automated email delivery. The operator sends every message by hand
// (email / WhatsApp / Instagram) so the final touch comes from a real person,
// then calls this endpoint to record the message as 'sent'.
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { markMessageSent } from '@/lib/outreach/email'

export async function POST(req: Request) {
  try {
    const auth = await requireApiUser()
    if ('response' in auth) return auth.response

    const body = await req.json()
    const { message_id } = body

    if (!message_id) {
      return NextResponse.json({ error: 'message_id zorunludur.' }, { status: 400 })
    }

    const result = await markMessageSent(message_id)
    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
