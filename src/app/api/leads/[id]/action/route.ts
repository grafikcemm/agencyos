// POST /api/leads/[id]/action — kokpit satır aksiyonları (Faz C1).
// Telegram komutlarıyla AYNI service katmanı (applyLeadAction): aynı geçiş
// kuralları, aynı audit, aynı idempotency. Server sonucu authoritative.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceSameOrigin, parseJsonBody, BadRequestError } from '@/lib/api/guards'
import { requireApiUser } from '@/lib/auth'
import { applyLeadAction } from '@/lib/cockpit/leadActions'

const ActionSchema = z
  .object({
    action: z.enum(['called', 'no_answer', 'meeting', 'later', 'note']),
    note: z.string().max(2000).optional(),
    laterAtIso: z.string().optional(),
    idempotencyKey: z.string().max(120).optional(),
  })
  .strict()

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiUser(req)
    if ('response' in auth) return auth.response
    const originError = enforceSameOrigin(req)
    if (originError) return originError

    const body = await parseJsonBody(req, ActionSchema)
    const { id } = await ctx.params

    const result = await applyLeadAction({
      leadId: id,
      action: body.action,
      actor: 'operator',
      channel: 'ui',
      note: body.note,
      laterAtIso: body.laterAtIso,
      idempotencyKey: body.idempotencyKey,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error, audit: result.audit }, { status: 409 })
    }
    return NextResponse.json({
      ok: true,
      idempotentReplay: result.idempotentReplay ?? false,
      audit: result.audit,
      // Faz 0.3: 058 canlı değilken UI degraded durumu görünür göstersin.
      atomic: result.atomic,
      before: result.before,
      after: result.after,
    })
  } catch (err) {
    if (err instanceof BadRequestError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const msg = err instanceof Error ? err.message : 'Sunucu hatası'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
