import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  try {
    // Basic Vercel Cron Secret authentication
    const authHeader = req.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Gerçekte burada sıradaki şehri veya sektörü db'den bulup
    // /api/leads/scan endpointine benzer bir işlem yapılır.
    // Şimdilik mock bir logic koyalım:
    
    // 1. Hedefleri çek: "Bugün hangi şehirleri taramalıyız?"
    const sector = "Güzellik Salonu"
    const city = "İzmir"

    // 2. Google Places API Taraması (api/leads/scan logic benzeri)
    // Bu sadece simülasyon log'udur.
    console.log(`[CRON SCAN] Başladı: ${sector} - ${city}`)

    // 3. Supabase'e log atalım
    const { error } = await supabaseAdmin.from('settings').insert({
      key: `cron_last_scan_${Date.now()}`,
      value: { sector, city, result: '20 yeni lead eklendi (mock)' }
    })

    if (error) {
       console.error("Cron Database Error:", error)
    }

    return NextResponse.json({ success: true, message: `Cron scan executed for ${city} / ${sector}` })

  } catch (error) {
    console.error('Cron error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
