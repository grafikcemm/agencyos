// GET /api/services — merge edilmiş kanonik katalog (kod default + DB override),
// domain → aile gruplu. UI client-side merge YAPMAZ; tek otorite bu endpoint.
import { NextResponse } from 'next/server'
import { requireApiAccess } from '@/lib/auth'
import { getCatalog } from '@/lib/services/catalogOverrides'
import { SERVICE_FAMILIES } from '@/lib/services/catalog'

export async function GET(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

    const packages = await getCatalog()
    return NextResponse.json({
      success: true,
      data: { families: SERVICE_FAMILIES, packages },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
