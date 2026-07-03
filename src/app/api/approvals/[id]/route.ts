// POST /api/approvals/[id] — onay/red kararı. Durum-değiştirir → same-origin + auth.
// Onayda approved_digest = action_digest sabitlenir (yürütme eşleşme kilidi §13).
// GERÇEK yürütme burada YAPILMAZ (yalnız karar kaydı); yürütme lease worker + digest
// doğrulamasıyla ayrı olur → onaysız/yanlış eylem imkânsız.
import { NextResponse } from 'next/server'
import { requireApiAccess } from '@/lib/auth'
import { enforceSameOrigin } from '@/lib/api/guards'
import { decideApproval } from '@/lib/approvals/repo'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originErr = enforceSameOrigin(req)
    if (originErr) return originErr

    const { id } = await params
    const body = (await req.json().catch(() => ({}))) as { decision?: string; decidedBy?: string }
    const decision = body.decision
    if (decision !== 'approved' && decision !== 'rejected') {
      return NextResponse.json({ success: false, error: "decision 'approved'|'rejected' olmalı" }, { status: 400 })
    }

    const ok = await decideApproval(id, decision, body.decidedBy ?? 'operator')
    if (!ok) {
      return NextResponse.json({ success: false, error: 'karar uygulanamadı (bulunamadı ya da pending değil)' }, { status: 409 })
    }
    return NextResponse.json({ success: true, data: { id, decision } })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
