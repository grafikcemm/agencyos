import { NextResponse } from 'next/server'
import { enforceSameOrigin } from '@/lib/api/guards'
import { scanLeads } from '@/lib/leads/scan'
import { requireApiAccess } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originError = enforceSameOrigin(req)
    if (originError) return originError

    // Gövde güvensizdir — alanları whitelist + clamp et.
    const body = await req.json()
    const sector = typeof body.sector === 'string' ? body.sector : ''
    const city = typeof body.city === 'string' ? body.city : ''
    const district = typeof body.district === 'string' ? body.district : ''
    const limitRaw = parseInt(String(body.limit ?? 10), 10)
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 10, 1), 60)
    const toFiniteNum = (v: unknown): number | undefined => {
      const n = Number(v)
      return Number.isFinite(n) ? n : undefined
    }
    const lat = toFiniteNum(body.lat)
    const lng = toFiniteNum(body.lng)
    const radiusNum = toFiniteNum(body.radius)
    const radius = radiusNum != null ? Math.min(Math.max(radiusNum, 100), 50000) : undefined

    const result = await scanLeads({ sector, city, district, limit, lat, lng, radius })

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
