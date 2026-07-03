// GET /api/approvals — bekleyen onay istekleri (redacted_preview ile). Faz 4 onay
// kartları besler. Operatöre YALNIZ maskeli önizleme gider (ham eylem/secret değil).
import { NextResponse } from 'next/server'
import { requireApiAccess } from '@/lib/auth'
import { listPendingApprovals } from '@/lib/approvals/repo'

export async function GET(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

    const pending = await listPendingApprovals()
    // Yalnız operatöre güvenli alanlar (action_digest/approved_digest sızdırılmaz).
    const safe = pending.map((a) => ({
      id: a.id,
      run_id: a.run_id,
      step_id: a.step_id,
      action: a.action,
      redacted_preview: a.redacted_preview,
      status: a.status,
      expires_at: a.expires_at,
    }))
    return NextResponse.json({ success: true, data: { approvals: safe } })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
