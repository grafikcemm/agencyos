import { NextResponse } from 'next/server'
import { enforceSameOrigin } from '@/lib/api/guards'
import { requireApiAccess } from '@/lib/auth'
import { runPersonScan } from '@/lib/personLeads/scan'

// Manuel kişi taraması — operatör oturumu ile (UI "Kişi Tara" butonu).
// Cron muadili: /api/cron/person-scan (Bearer CRON_SECRET).

export async function POST(req: Request) {
  const access = await requireApiAccess(req)
  if ('response' in access) return access.response
  const originError = enforceSameOrigin(req)
  if (originError) return originError

  if (!process.env.APOLLO_API_KEY) {
    return NextResponse.json(
      { success: true, skipped: true, message: 'APOLLO_API_KEY tanımlı değil — kişi taraması atlandı.' },
    )
  }

  try {
    const outcome = await runPersonScan({ source: 'manual' })
    return NextResponse.json({
      success: true,
      inserted: outcome.totalInserted,
      rateLimited: outcome.rateLimited,
      results: outcome.results,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
