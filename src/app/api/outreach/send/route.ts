// POST /api/outreach/send
// Manual-dispatch confirmation — operator session ONLY (requireApiUser).
// There is NO automated email delivery. The operator sends every message by hand
// (email / WhatsApp / Instagram) so the final touch comes from a real person,
// then calls this endpoint to record the message as 'sent'.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiUser } from '@/lib/auth'
import { enforceSameOrigin, parseJsonBody, BadRequestError } from '@/lib/api/guards'
import { markMessageSent } from '@/lib/outreach/email'

const SendSchema = z.object({ message_id: z.string().uuid() }).strict()

export async function POST(req: Request) {
  try {
    const auth = await requireApiUser(req)
    if ('response' in auth) return auth.response
    const originErr = enforceSameOrigin(req)
    if (originErr) return originErr

    const { message_id } = await parseJsonBody(req, SendSchema)

    const result = await markMessageSent(message_id)
    // blocked = politika reddi (email kanalı bu endpoint'ten sent olamaz) → 422.
    const status = result.ok ? 200 : result.blocked ? 422 : 500
    return NextResponse.json(result, { status })
  } catch (error: unknown) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
