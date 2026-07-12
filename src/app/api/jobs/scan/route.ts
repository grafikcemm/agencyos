// POST /api/jobs/scan — operatörün manuel iş ilanı taraması tetiklemesi.
// (Cron versiyonu: /api/cron/job-scan, CRON_SECRET ile.)
import { NextResponse } from 'next/server'
import { enforceSameOrigin } from '@/lib/api/guards'
import { requireApiAccess } from '@/lib/auth'
import { runJobScan } from '@/lib/jobs/scan'

export async function POST(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originError = enforceSameOrigin(req)
    if (originError) return originError

    const stats = await runJobScan()
    return NextResponse.json({ success: true, ...stats })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    console.error('Manual job scan error:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
