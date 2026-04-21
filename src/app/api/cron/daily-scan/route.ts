import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    const sector = "Restoran"
    const city = "İstanbul"

    console.log(`[DAILY CRON] Scanning for: ${sector} - ${city}`)

    // Log the cron execution
    await supabase.from('settings').insert({
      key: `cron_daily_scan_${new Date().toISOString()}`,
      value: { sector, city, status: 'mock_executed' }
    })

    return NextResponse.json({ success: true, message: `Daily scan simulated for ${city} ${sector}` })
  } catch (error) {
    console.error('Cron error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
