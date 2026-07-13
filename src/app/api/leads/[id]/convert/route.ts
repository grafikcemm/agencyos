// POST /api/leads/[id]/convert — Projeye Dönüştür (Faz 3.1).
// Sonuç authoritative: proje oluşmadan "dönüştü" denmez; UI hatada kapanmaz.
import { NextResponse } from 'next/server'
import { enforceSameOrigin } from '@/lib/api/guards'
import { requireApiUser } from '@/lib/auth'
import { convertLeadToProject } from '@/lib/leads/convertLead'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiUser(req)
    if ('response' in auth) return auth.response
    const originErr = enforceSameOrigin(req)
    if (originErr) return originErr

    const { id } = await ctx.params
    const result = await convertLeadToProject({ leadId: id, actor: 'operator', channel: 'ui' })
    if (!result.ok) {
      return NextResponse.json({ error: result.error, atomic: result.atomic }, { status: 409 })
    }
    return NextResponse.json({
      ok: true,
      outcome: result.outcome,
      projectId: result.projectId,
      atomic: result.atomic,
      auditRecorded: result.auditRecorded ?? null,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sunucu hatası' }, { status: 500 })
  }
}
