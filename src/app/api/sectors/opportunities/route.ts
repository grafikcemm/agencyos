import { NextResponse } from 'next/server'
import { getSectorOpportunities } from '@/lib/sectorOpportunityEngine'
import { requireApiAccess } from '@/lib/auth'

export async function GET() {
  const access = await requireApiAccess()
  if ('response' in access) return access.response
  const sectors = getSectorOpportunities(10)
  return NextResponse.json({ success: true, sectors })
}
