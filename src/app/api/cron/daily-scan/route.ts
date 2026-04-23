import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  return handleScan(req)
}

export async function POST(req: Request) {
  return handleScan(req)
}

async function handleScan(req: Request) {
  try {
    console.log(`[DAILY CRON] Request method: ${req.method}`)
    
    // Auth check (optional if secret not set)
    const authHeader = req.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.warn("[DAILY CRON] Unauthorized access attempt")
      return new Response('Unauthorized', { status: 401 })
    }

    const SECTORS = [
      // KIRMIZI — En yüksek öncelik (ağırlıklı taransın)
      'güzellik salonu',
      'estetik merkezi',
      'kuaför salonu',
      'nail art studio',
      'butik mağaza',
      'kafe',
      'kahve dükkanı',
      'diş kliniği',
      'özel klinik',
      // SARI — Orta öncelik
      'hukuk bürosu',
      'mali müşavir',
      'muhasebe bürosu',
      'özel kurs merkezi',
      'dil okulu',
      'emlak ofisi',
      'eczane',
    ]

    const getDailySector = () => {
      const day = new Date().getDate()
      if (day % 10 < 7) {
        return SECTORS[day % 9]  // ilk 9 — yüksek öncelik
      }
      return SECTORS[9 + (day % 8)]  // son 8 — orta öncelik
    }

    const sector = getDailySector()
    const city = "İstanbul"
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY

    console.log(`[DAILY CRON] Scanning for: ${sector} - ${city}`)

    if (!apiKey || apiKey === 'your_google_maps_key') {
      console.error("[DAILY CRON] GOOGLE MAPS API KEY NOT SET")
      return NextResponse.json({ success: false, error: "Google Maps API Key eksik." }, { status: 500 })
    }

    // 1. Text Search
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(`${sector} ${city}`)}&key=${apiKey}&language=tr`
    console.log(`[DAILY CRON] Calling Google Maps Search API...`)
    
    const searchRes = await fetch(searchUrl)
    const searchData = await searchRes.json()

    console.log("[DAILY CRON] Google API Status:", searchData.status)
    if (searchData.error_message) {
      console.error("[DAILY CRON] Google API Error Message:", searchData.error_message)
    }

    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
      return NextResponse.json({ 
        success: false, 
        error: searchData.status, 
        message: searchData.error_message 
      }, { status: 400 })
    }

    if (searchData.status === 'ZERO_RESULTS' || !searchData.results) {
      return NextResponse.json({ success: true, count: 0, message: "Sonuç bulunamadı." })
    }

    const places = searchData.results.slice(0, 5) // Limit for cron to avoid hitting limits
    let addedCount = 0

    console.log(`[DAILY CRON] Found ${searchData.results.length} places, processing top ${places.length}`)

    // 2. Place Details
    for (const place of places) {
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_phone_number,website,geometry,rating,user_ratings_total&key=${apiKey}&language=tr`
      const detailsRes = await fetch(detailsUrl)
      const detailsData = await detailsRes.json()
      
      const d = detailsData.result
      if (!d || !d.formatted_phone_number) {
        console.log(`[DAILY CRON] Skipping ${d?.name || 'unknown'} (no phone number)`)
        continue
      }

      const YUKSEK_ONCELIK_SEKTORLER = [
        'güzellik salonu', 'estetik merkezi', 'kuaför salonu',
        'nail art studio', 'butik mağaza', 'kafe', 'kahve dükkanı',
        'diş kliniği', 'özel klinik'
      ]

      // 3. Priority calculation
      const website = d.website
      const phone = d.formatted_phone_number
      let potentialScore = 50
      let priority = 'normal'

      if (!website && phone && YUKSEK_ONCELIK_SEKTORLER.includes(sector.toLowerCase())) {
        potentialScore = 90
        priority = 'high'
      }
      else if (website && phone) {
        potentialScore = 60
        priority = 'normal'
      }
      else if (!phone) {
        potentialScore = 20
        priority = 'low'
      }

      // 4. Supabase Upsert
      const { error } = await supabaseAdmin.from('leads').upsert(
        {
          google_place_id: place.place_id,
          business_name: d.name,
          sector: sector,
          city: city,
          phone: d.formatted_phone_number,
          website: d.website || null,
          has_website: !!d.website,
          priority: priority,
          latitude: d.geometry?.location?.lat || null,
          longitude: d.geometry?.location?.lng || null,
          rating: d.rating || null,
          review_count: d.user_ratings_total || 0,
          potential_score: potentialScore,
          status: 'new'
        },
        { onConflict: 'google_place_id' }
      )

      if (!error) {
        addedCount++
        console.log(`[DAILY CRON] Added/Updated lead: ${d.name}`)
      } else {
        console.error(`[DAILY CRON] Supabase Error for ${d.name}:`, error)
      }
    }

    // Log the cron execution in settings
    await supabaseAdmin.from('settings').upsert({
      key: 'last_daily_scan',
      value: JSON.stringify({
        date: new Date().toISOString(),
        sector,
        city,
        added: addedCount,
        status: 'success'
      })
    }, { onConflict: 'key' })

    return NextResponse.json({ 
      success: true, 
      count: addedCount,
      google_status: searchData.status 
    })

  } catch (error: any) {
    console.error('[DAILY CRON] Fatal Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
