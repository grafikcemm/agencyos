// Lead scan engine — Google Places text search → details → evidence → scoring → upsert.
// Extracted from /api/leads/scan so JARVIS and cron can call it directly
// (no server-to-self HTTP fetch, no NEXT_PUBLIC_APP_URL/CRON_SECRET dependency).

import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { normalizeLocation, normalizeSector } from '@/lib/geo'
import { runEvidenceEngine } from '@/lib/evidenceEngine'
import { calculateLeadScoreV3 } from '@/lib/leadScoringV3'
import { runQualityEngine } from '@/lib/highQualityLeadEngine'

export interface ScanParams {
  sector: string
  city: string
  district?: string
  limit?: number
  /** Tarama kaynağı — scan_runs geçmişine yazılır. */
  source?: 'manual' | 'jarvis' | 'cron'
  /** Daire alan merkezi (enlem). lat+lng+radius birlikte verilirse Places location bias eklenir. */
  lat?: number
  /** Daire alan merkezi (boylam). */
  lng?: number
  /** Daire yarıçapı (metre). */
  radius?: number
}

export interface ScanOutcome {
  success: boolean
  /** Yeni eklenen lead sayısı (gerçek insert). */
  insertedCount: number
  /** Var olan kaydı güncellenen lead sayısı. */
  updatedCount: number
  /** Telefonsuz/detaysız atlanan sonuç sayısı. */
  skippedCount: number
  /** Geriye dönük uyumluluk: işlenen toplam (inserted + updated). */
  count: number
  error?: string
  message?: string
}

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place'

export async function scanLeads(params: ScanParams): Promise<ScanOutcome> {
  const { sector, city, district = '', limit = 10, source = 'manual', lat, lng, radius } = params
  const apiKey = process.env.GOOGLE_MAPS_KEY

  const empty: ScanOutcome = { success: true, insertedCount: 0, updatedCount: 0, skippedCount: 0, count: 0 }

  if (!apiKey) {
    return { ...empty, message: 'GOOGLE_MAPS_KEY eksik, tarama atlandı.' }
  }

  const loc = normalizeLocation(city ?? '', district ?? '')
  const cleanSector = normalizeSector(sector)
  const searchQuery = `${cleanSector} ${loc.googleQuery}`

  // Daire alan aracı: lat+lng+radius birlikte ve geçerliyse Places text search'e
  // &location=lat,lng&radius=m eklenir (alan bias'ı). Yoksa URL eskisiyle birebir aynı kalır.
  const hasCircle =
    Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(radius) && (radius as number) > 0
  const searchBase = `${PLACES_BASE}/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}&language=tr&region=tr`
  const buildSearchUrl = (pagetoken?: string): string =>
    searchBase +
    (hasCircle ? `&location=${lat},${lng}&radius=${Math.round(radius as number)}` : '') +
    (pagetoken ? `&pagetoken=${pagetoken}` : '')

  // Places legacy text search sayfa başına ~20 sonuç döner; daha fazlası için next_page_token
  // ile en çok 3 sayfa (60 sonuç). Token bir sonraki istekte geçerli olmadan önce ~2sn gecikme
  // ister. NOT: serverless deploy'da bu gecikme fonksiyon timeout'una yaklaşabilir → MAX_PAGES=3.
  // limit ≤ ilk sayfa boyutu olduğunda döngü page 0'da kırılır → gecikme yok, çıktı eskiyle özdeş.
  const MAX_PAGES = 3
  const collected: Record<string, unknown>[] = []
  let pagetoken: string | undefined
  let firstStatus: string | null = null
  let firstErrorMessage: string | undefined

  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    const res = await fetch(buildSearchUrl(pagetoken))
    const data = await res.json()
    if (page === 0) {
      firstStatus = data.status as string
      firstErrorMessage = data.error_message as string | undefined
    }

    if (data.status === 'OK' && Array.isArray(data.results)) {
      collected.push(...(data.results as Record<string, unknown>[]))
      pagetoken = data.next_page_token as string | undefined
    } else if (data.status === 'INVALID_REQUEST' && pagetoken) {
      // Token henüz hazır değil — bir kez daha kısa bekleyip tekrar dene, sonra bırak.
      await new Promise(resolve => setTimeout(resolve, 2000))
      const retry = await fetch(buildSearchUrl(pagetoken))
      const retryData = await retry.json()
      if (retryData.status === 'OK' && Array.isArray(retryData.results)) {
        collected.push(...(retryData.results as Record<string, unknown>[]))
        pagetoken = retryData.next_page_token as string | undefined
      } else {
        // Sonraki sayfa retry'i başarısız — page 0 sonuçları best-effort döndürülür; sessiz kalma.
        if (retryData.status !== 'ZERO_RESULTS') {
          console.warn(`scanLeads: next_page_token retry başarısız (${retryData.status as string})`)
        }
        break
      }
    } else {
      // ZERO_RESULTS veya sert hata — döngüyü kır; ilk sayfa semantiği aşağıda firstStatus ile korunur.
      // Sonraki sayfadaki hata page 0 sonuçlarını engellemez (best-effort) ama yine de loglanır.
      if (page > 0 && data.status !== 'ZERO_RESULTS') {
        console.warn(`scanLeads: sayfa ${page} durdu (${data.status as string})`)
      }
      break
    }

    if (collected.length >= limit || !pagetoken) break
  }

  // Hata/boş semantiği ESKİSİYLE AYNI: ilk sayfa status'una göre değerlendir.
  if (firstStatus && firstStatus !== 'OK' && firstStatus !== 'ZERO_RESULTS') {
    return { ...empty, success: false, error: firstStatus, message: firstErrorMessage }
  }
  if (collected.length === 0) {
    return empty
  }

  const places = collected.slice(0, limit)

  // Pre-check which place ids already exist → true insert vs update counts,
  // and avoid overwriting a manually curated e-mail.
  const placeIds = places.map(p => p.place_id as string).filter(Boolean)
  const { data: existingRows } = await supabaseAdmin
    .from('leads')
    .select('google_place_id, email')
    .in('google_place_id', placeIds)
  const existingById = new Map(
    (existingRows ?? []).map((r: { google_place_id: string; email: string | null }) => [r.google_place_id, r])
  )

  let insertedCount = 0
  let updatedCount = 0
  let skippedCount = 0

  for (const place of places) {
    const placeId = place.place_id as string
    const detailsUrl = `${PLACES_BASE}/details/json?place_id=${placeId}&fields=name,formatted_phone_number,website,formatted_address,geometry,rating,user_ratings_total&key=${apiKey}&language=tr`
    const detailsRes = await fetch(detailsUrl)
    const detailsData = await detailsRes.json()
    const d = detailsData.result as Record<string, unknown> | null

    if (!d || !d.formatted_phone_number) { skippedCount++; continue }

    const evidence = await runEvidenceEngine({
      website: (d.website as string) ?? null,
      sector: cleanSector,
      businessName: d.name as string,
      rating: (d.rating as number) ?? null,
      reviewCount: (d.user_ratings_total as number) ?? 0,
    })

    const scoreResult = calculateLeadScoreV3({
      sector: cleanSector,
      city: loc.city,
      rating: (d.rating as number) ?? null,
      reviewCount: (d.user_ratings_total as number) ?? 0,
      phone: d.formatted_phone_number as string,
      evidence,
      email: evidence.found_email,
    })

    const qualityResult = runQualityEngine({
      lead: {
        business_name: d.name as string,
        sector: cleanSector,
        city: loc.city,
        google_place_id: placeId,
        phone: d.formatted_phone_number as string,
        website: (d.website as string) ?? null,
        email: evidence.found_email,
        rating: (d.rating as number) ?? null,
        review_count: (d.user_ratings_total as number) ?? 0,
        has_whatsapp: evidence.has_whatsapp,
      },
      evidence,
    })

    const existing = existingById.get(placeId)

    const geometry = d.geometry as { location?: { lat?: number; lng?: number } } | null
    const payload: Record<string, unknown> = {
      google_place_id: placeId,
      business_name: d.name as string,
      sector: cleanSector,
      normalized_sector: qualityResult.normalized_sector,
      city: loc.city,
      district: loc.district || null,
      city_slug: loc.citySlug,
      district_slug: loc.districtSlug || null,
      phone: d.formatted_phone_number as string,
      website: (d.website as string) ?? null,
      has_website: evidence.has_real_website || !!(d.website),
      latitude: geometry?.location?.lat ?? null,
      longitude: geometry?.location?.lng ?? null,
      rating: (d.rating as number) ?? null,
      review_count: (d.user_ratings_total as number) ?? 0,
      status: 'new',
      // V3 scores
      potential_score: scoreResult.potential_score,
      base_score: scoreResult.base_score,
      risk_score: scoreResult.risk_score,
      risk_reasons: scoreResult.risk_reasons,
      route: scoreResult.route,
      evidence_score: scoreResult.evidence_score,
      fit_score: scoreResult.fit_score,
      urgency_score: scoreResult.urgency_score,
      money_score: scoreResult.money_score,
      contactability_score: scoreResult.contactability_score,
      priority: scoreResult.priority,
      score_reasons: scoreResult.score_reasons,
      // Evidence signals
      has_real_website: evidence.has_real_website,
      has_whatsapp: evidence.has_whatsapp,
      has_form: evidence.has_form,
      has_online_booking: evidence.has_online_booking,
      has_ads_signal: evidence.has_ads_signal,
      instagram_as_site: evidence.instagram_as_site,
      has_job_signal: evidence.has_job_signal,
      has_social_link: evidence.has_social_link,
      // Müşteri (ihtiyaç) kategorisi + web kalite bandı (migration 031)
      customer_category: qualityResult.customer_category,
      website_quality_band: qualityResult.website_quality_band,
      category_reasons: qualityResult.category_reasons,
      // Evidence intelligence
      why_now: evidence.why_now,
      pain_signals: evidence.pain_signals,
      proof_points: evidence.proof_points,
      recommended_offer_id: evidence.recommended_offer_id,
      recommended_offer_name: evidence.recommended_offer_name,
      sales_angle: evidence.sales_angle,
      first_message: evidence.first_message,
      next_best_action: evidence.next_best_action,
      confidence: evidence.confidence,
      // Quality engine
      quality_score: qualityResult.quality_score,
      conversion_probability: qualityResult.conversion_probability,
      money_potential_score: qualityResult.money_potential_score,
      pain_intensity_score: qualityResult.pain_intensity_score,
      agency_fit_score: qualityResult.agency_fit_score,
      confidence_score: qualityResult.confidence_score,
      lead_tier: qualityResult.lead_tier,
      quality_label: qualityResult.quality_label,
      disqualification_reason: qualityResult.disqualification_reason,
      qualification_reasons: qualityResult.qualification_reasons,
      conversion_angle: qualityResult.conversion_angle,
      why_this_will_convert: qualityResult.why_this_will_convert,
      expected_offer_value_tl: qualityResult.expected_offer_value_tl,
      expected_monthly_value_tl: qualityResult.expected_monthly_value_tl,
      best_channel: qualityResult.best_channel,
      first_30_seconds_pitch: qualityResult.first_30_seconds_pitch,
      objection_risks: qualityResult.objection_risks,
      next_action_priority: qualityResult.next_action_priority,
      last_quality_scored_at: new Date().toISOString(),
      // Lifecycle
      enrichment_status: 'done',
      last_enriched_at: new Date().toISOString(),
    }

    // Website'den e-posta bulunduysa ve mevcut kayıtta e-posta yoksa yaz.
    if (evidence.found_email && !existing?.email) {
      payload.email = evidence.found_email
    }

    const { error } = await supabaseAdmin
      .from('leads')
      .upsert(payload, { onConflict: 'google_place_id', ignoreDuplicates: false })

    if (!error) {
      if (existing) updatedCount++
      else insertedCount++
    } else {
      skippedCount++
      console.error('Scan upsert error:', error.message)
    }
  }

  // Tarama geçmişi — trend/verim analizi için (tablo yoksa sessizce atla;
  // migration 012 uygulanana kadar taramayı bloklamasın).
  try {
    const { error: runError } = await supabaseAdmin.from('scan_runs').insert({
      sector: cleanSector,
      city: loc.city,
      district: loc.district || null,
      source,
      inserted_count: insertedCount,
      updated_count: updatedCount,
      skipped_count: skippedCount,
    })
    if (runError) console.warn('scan_runs kaydı yazılamadı:', runError.message)
  } catch (e) {
    console.warn('scan_runs kaydı yazılamadı:', e instanceof Error ? e.message : e)
  }

  return {
    success: true,
    insertedCount,
    updatedCount,
    skippedCount,
    count: insertedCount + updatedCount,
  }
}
