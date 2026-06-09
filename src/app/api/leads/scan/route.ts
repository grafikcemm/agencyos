import { NextResponse } from 'next/server'
import { scanLeads } from '@/lib/leads/scan'
import { requireApiAccess } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const { sector, city, district, limit = 10 } = await req.json()

    const result = await scanLeads({ sector, city, district, limit })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, message: result.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      count: result.count,
      insertedCount: result.insertedCount,
      updatedCount: result.updatedCount,
      skippedCount: result.skippedCount,
      message: result.message,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    console.error('Scan error:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
