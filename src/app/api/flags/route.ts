// GET /api/flags — V2 feature flag durumları (Konsol yüzeyi okur).
// Yalnız boolean durum döner; env DEĞERİ hiçbir zaman dönmez.
import { NextResponse } from 'next/server'
import { requireApiAccess } from '@/lib/auth'
import { describeV2Flags } from '@/lib/outreach/flags'

export async function GET(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    return NextResponse.json({ success: true, data: { flags: describeV2Flags() } })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'unknown'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
