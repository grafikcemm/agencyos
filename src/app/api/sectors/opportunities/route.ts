import { NextResponse } from 'next/server'
import { getSectorOpportunities } from '@/lib/sectorOpportunityEngine'

export async function GET() {
  const sectors = getSectorOpportunities(10)
  return NextResponse.json({ success: true, sectors })
}
