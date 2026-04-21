import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: Request) {
  try {
    const { sector, city, limit = 10 } = await req.json()
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY

    // Mock response for missing API KEY case to keep app running
    if (!apiKey || apiKey === 'your_google_maps_key') {
      console.warn("GOOGLE MAPS API KEY NOT SET. Using mock data.")
      return NextResponse.json({ success: true, count: 0, message: "API key eksik, tarama atlandı." })
    }

    // 1. Text Search
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(`${sector} ${city}`)}&key=${apiKey}&language=tr&region=tr`
    const searchRes = await fetch(searchUrl)
    const searchData = await searchRes.json()

    if (!searchData.results) {
      return NextResponse.json({ success: false, error: 'No results found' }, { status: 404 })
    }

    const places = searchData.results.slice(0, limit)
    let addedCount = 0

    // 2. Place Details
    for (const place of places) {
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_phone_number,website,formatted_address,geometry,rating,user_ratings_total&key=${apiKey}&language=tr`
      const detailsRes = await fetch(detailsUrl)
      const detailsData = await detailsRes.json()
      
      const d = detailsData.result
      if (!d || !d.formatted_phone_number) continue // Telefon zorunlu

      // 3. Score & Priority calculation
      const hasWebsite = !!d.website
      const score = hasWebsite ? 50 : 80
      const priority = (!d.website || d.website === '') && (d.formatted_phone_number && d.formatted_phone_number !== '')
        ? 'high'
        : (!d.formatted_phone_number || d.formatted_phone_number === '')
        ? 'low'
        : 'normal'

      // 4. Supabase Upsert
      const { error } = await supabase.from('leads').upsert(
        {
          google_place_id: place.place_id,
          business_name: d.name,
          sector: sector,
          city: city,
          phone: d.formatted_phone_number,
          website: d.website || null,
          has_website: hasWebsite,
          priority: priority,
          latitude: d.geometry?.location?.lat || null,
          longitude: d.geometry?.location?.lng || null,
          rating: d.rating || null,
          review_count: d.user_ratings_total || 0,
          potential_score: score,
          status: 'new',
          ai_analysis: null,
          pitch: null
        },
        { onConflict: 'google_place_id' }
      )

      if (!error) addedCount++
    }

    return NextResponse.json({ success: true, count: addedCount })

  } catch (error) {
    console.error('Scan Error:', error)
    return NextResponse.json({ success: false, error: 'Sunucu hatası.' }, { status: 500 })
  }
}
