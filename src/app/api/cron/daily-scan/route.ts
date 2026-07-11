import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { normalizeLocation, normalizeSector } from '@/lib/geo'
import { runQualityEngine } from '@/lib/highQualityLeadEngine'
import { runEvidenceEngine } from '@/lib/evidenceEngine'
import { guardCronEnv, notifyOps } from '@/lib/env'
import { loadSectorEngagement } from '@/lib/sectorRotation'
import { buildDailyTargetPlan, loadCityEngagement } from '@/lib/cityTargeting'
import { isMissingCategoryColumnError, stripCategoryKeys } from '@/lib/leads/categoryPersist'
import { getLeadIntelMode } from '@/lib/leadIntel/flag'
import { runLeadIntelPipeline, PoolCandidate } from '@/lib/leadIntel/pipeline'
import { logToolCostRow } from '@/lib/ai/toolCostLog'

// Lead Intelligence v2: PSI audit'leri (aday başına 10-60sn) aynı koşuda çalışır.
// Hobby planda 300sn ancak Fluid Compute ile mümkün — deploy öncesi proje ayarını doğrula.
export const maxDuration = 300

export async function GET(req: Request) {
  return handleScan(req)
}

export async function POST(req: Request) {
  return handleScan(req)
}

async function handleScan(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      console.error("[DAILY CRON] CRON_SECRET environment variable is missing!")
      return NextResponse.json({ error: 'CRON_SECRET environment variable is missing on the server.' }, { status: 500 })
    }

    // Auth check
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      console.warn("[DAILY CRON] Unauthorized access attempt")
      return new Response('Unauthorized', { status: 401 })
    }

    // Env guard: fail loudly with the exact missing vars BEFORE any client that
    // throws on a missing key (supabaseAdmin), so a misconfigured deploy produces
    // an actionable alert instead of a silent generic 500.
    const envGuard = await guardCronEnv('daily-scan', [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'GOOGLE_MAPS_KEY',
    ])
    if (envGuard) return envGuard

    const { searchParams } = new URL(req.url)
    const isDryRun = searchParams.get('dryRun') === 'true'
    const isManual = searchParams.get('manual') === 'true' || req.method === 'POST'

    // Standby check: automatic scan starts on June 1st, 2026 (Europe/Istanbul)
    const now = new Date()
    const startDate = new Date('2026-06-01T00:00:00+03:00') // June 1st, 2026 Turkey

    if (now < startDate && !isDryRun && !isManual) {
      console.log(`[DAILY CRON] Standby Mode. Automatic scanning will start on June 1st, 2026. Current time: ${now.toISOString()}`)
      return NextResponse.json({
        success: true,
        status: 'standby',
        message: 'Tarama sistemi 1 Haziran 2026 Pazartesi günü otomatik olarak başlayacaktır.',
        current_time: now.toISOString(),
        start_date: startDate.toISOString()
      })
    }

    // Timezone check: Europe/Istanbul Date for Idempotency
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now)

    // Check if daily scan already executed today (if not dry run)
    if (!isDryRun) {
      const { data: lastScanSetting } = await supabaseAdmin
        .from('settings')
        .select('value')
        .eq('key', 'last_daily_scan')
        .maybeSingle()

      if (lastScanSetting && lastScanSetting.value) {
        try {
          const lastScan = JSON.parse(lastScanSetting.value)
          if (lastScan && lastScan.date === todayStr) {
            console.log(`[DAILY CRON] Scan already executed today (${todayStr}). Skipping to avoid duplication.`)
            return NextResponse.json({
              success: true,
              message: `Bugün (${todayStr}) için günlük otomatik tarama zaten tamamlandı. Yeniden çalıştırılmadı.`,
              skipped: true
            })
          }
        } catch (e) {
          // ignore parse errors and proceed
        }
      }
    }

    const apiKey = process.env.GOOGLE_MAPS_KEY
    if (!apiKey) {
      console.error("[DAILY CRON] GOOGLE_MAPS_KEY is missing!")
      return NextResponse.json({ error: 'GOOGLE_MAPS_KEY is missing on the server.' }, { status: 500 })
    }

    // Calculate daily sequence index since 2026-06-01
    const msDiff = now.getTime() - startDate.getTime()
    const daySequence = Math.floor(msDiff / (24 * 60 * 60 * 1000))
    // dayOffset: dryRun ile rotasyon simülasyonu için (örn. ?dryRun=true&dayOffset=3)
    const dayOffset = parseInt(searchParams.get('dayOffset') || '0', 10) || 0
    const baseIndex = (daySequence >= 0 ? daySequence : 0) + (isDryRun ? dayOffset : 0)

    // Çok-şehirli şehir×sektör hedefleme planı (deep-research fırsat matrisi + öğrenme döngüsü).
    // sectorStats: sektör çarpanı (013 view). cityStats: şehir×sektör çarpanı (025 view; boşsa nötr).
    // Plan günlük deterministiktir; opportunityScore × bandWeight × learnedSector × learnedCity × jitter.
    const sectorStats = await loadSectorEngagement()
    const cityStats = await loadCityEngagement()
    const targetPlan = buildDailyTargetPlan(baseIndex, sectorStats, cityStats)

    // Günlük hedef: 2 lead — SADECE A-tier. "Gerçekten para kazandıran, boş kayıt yok."
    const DAILY_TARGET = 2

    const acceptedLeads: Array<{
      id: string
      name: string
      sector: string
      district: string
      tier: string
      score: number
      why_now: string | null
      pitch: string | null
      action: string
      pain_signals?: string[]
      proof_points?: string[]
    }> = []
    
    const rejectedLeads: Array<{
      name: string
      reason: string
    }> = []

    let skippedDuplicates = 0
    const scannedQueries: string[] = []

    // Lead Intelligence v2 aday havuzu: dedup'u geçen, detayları çekilmiş HER aday
    // (eski kapının kabul VE red ettikleri). Shadow modda v2 bu havuzu bağımsız
    // değerlendirir; active modda kabul edilenler v2 seçiminde yarışır.
    const v2Pool: PoolCandidate[] = []

    let attempts = 0
    const maxAttempts = 40 // API/sonsuz döngü koruması; geniş şehir×sektör rotasyonuna izin ver
    const PER_CANDIDATE_BUDGET = 4 // bir şehir×sektör adayı en çok bu kadar ilçe denemesi tüketir
    // Places maliyet sayaçları (mig 052 tool_cost_logs)
    let textsearchCalls = 0
    let detailsCalls = 0

    // Şehir×sektör adayları üzerinde dön: her aday için ilçe rotasyonu + sektör query'leri.
    for (const candidate of targetPlan) {
      if (acceptedLeads.length >= DAILY_TARGET || attempts >= maxAttempts) break

      const sector = candidate.sector
      const cleanSector = normalizeSector(sector.displayName)
      const districtList = candidate.districts.length ? candidate.districts : ['']
      // İlçe başlangıcını günlük kaydır → her gün farklı ilçeden başla (deterministik).
      const startD = ((baseIndex % districtList.length) + districtList.length) % districtList.length
      let candidateAttempts = 0

      for (let di = 0; di < districtList.length; di++) {
        if (acceptedLeads.length >= DAILY_TARGET || attempts >= maxAttempts || candidateAttempts >= PER_CANDIDATE_BUDGET) break
        const district = districtList[(startD + di) % districtList.length]
        const loc = normalizeLocation(candidate.city, district || null)
        attempts++
        candidateAttempts++

        // Bu aday için sektör query'lerini tara
        for (const query of sector.queries) {
          if (acceptedLeads.length >= DAILY_TARGET) break

          const searchQuery = `${query} ${loc.googleQuery}`
        scannedQueries.push(searchQuery)
        console.log(`[DAILY CRON] Running query: "${searchQuery}" (Attempt ${attempts}, Accepted: ${acceptedLeads.length})`)

        const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}&language=tr&region=tr`
        textsearchCalls++
        const searchRes = await fetch(searchUrl)
        const searchData = await searchRes.json()

        if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
          console.error(`[DAILY CRON] Google Place search failed: ${searchData.status}`)
          continue
        }

        if (searchData.status === 'ZERO_RESULTS' || !searchData.results) {
          continue
        }

        const places = searchData.results

        // Process place results
        for (const place of places) {
          if (acceptedLeads.length >= DAILY_TARGET) break

          const placeId = place.place_id
          if (!placeId) continue

          // Duplicate Check 1: Google Place ID
          const { data: byPlaceId } = await supabaseAdmin
            .from('leads')
            .select('id')
            .eq('google_place_id', placeId)
            .maybeSingle()

          if (byPlaceId) {
            skippedDuplicates++
            continue
          }

          // Fetch Place Details
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_phone_number,website,geometry,rating,user_ratings_total&key=${apiKey}&language=tr`
          detailsCalls++
          const detailsRes = await fetch(detailsUrl)
          const detailsData = await detailsRes.json()

          const d = detailsData.result
          if (!d) continue

          const phone = d.formatted_phone_number ? d.formatted_phone_number.trim() : null
          const lat = d.geometry?.location?.lat || null
          const lng = d.geometry?.location?.lng || null

          // Strict Requirements: phone, coordinates, google_place_id must exist
          if (!phone || lat === null || lng === null) {
            rejectedLeads.push({
              name: d.name || 'Bilinmeyen',
              reason: 'Eksik bilgi (Telefon numarası veya koordinat eksik)'
            })
            continue
          }

          // Duplicate Check 2: Phone
          const { data: byPhone } = await supabaseAdmin
            .from('leads')
            .select('id')
            .eq('phone', phone)
            .maybeSingle()

          if (byPhone) {
            skippedDuplicates++
            continue
          }

          // Duplicate Check 3: Business Name + District
          const { data: byName } = await supabaseAdmin
            .from('leads')
            .select('id, business_name, district')
            .ilike('business_name', `%${d.name}%`)

          if (byName && byName.some((b: { district: string | null }) => b.district && b.district.toLowerCase().trim() === district.toLowerCase().trim())) {
            skippedDuplicates++
            continue
          }

          // cleanSector + loc aday/ilçe döngüsünde hesaplandı (çok-şehirli hedefleme).

          // Call runEvidenceEngine to fetch/verify website signals dynamically
          const evidence = await runEvidenceEngine({
            website: d.website || null,
            sector: cleanSector,
            businessName: d.name,
            rating: d.rating || null,
            reviewCount: d.user_ratings_total || 0,
          })

          const qr = runQualityEngine({
            lead: {
              business_name: d.name,
              sector: cleanSector,
              city: loc.city,
              phone,
              website: d.website || null,
              rating: d.rating || null,
              review_count: d.user_ratings_total || 0,
              google_place_id: placeId,
            },
            evidence
          })

          // v2 havuzuna ekle (kabul/red fark etmeksizin) — leadId kabulde doldurulur.
          const poolEntry: PoolCandidate = {
            placeId,
            businessName: d.name,
            sector: cleanSector,
            city: loc.city,
            district: loc.district,
            phone,
            website: d.website || null,
            rating: d.rating || null,
            reviewCount: d.user_ratings_total || 0,
            qualityScore: qr.quality_score,
            leadId: null,
            acceptedByLegacyGate: false,
          }
          v2Pool.push(poolEntry)

          // Exclude disqualified or low tier
          if (qr.disqualification_reason) {
            rejectedLeads.push({
              name: d.name,
              reason: `Diskalifiye: ${qr.disqualification_reason}`
            })
            continue
          }

          // Strict Quality Gate: acceptedLeads must have pain_signals.length > 0
          const painSignalsList = evidence.pain_signals || []
          const proofPointsList = evidence.proof_points || []

          if (painSignalsList.length === 0) {
            rejectedLeads.push({
              name: d.name,
              reason: 'Doğrulanmış acil problem sinyali yok.'
            })
            continue
          }

          const why_now = evidence.why_now

          // If evidence.why_now is generic (contains 'sağlam bir temele sahip' or similar), reject the lead
          if (!why_now || why_now.includes('sağlam bir temele sahip') || why_now.includes('AI çözümü değerlendirebilir')) {
            rejectedLeads.push({
              name: d.name,
              reason: 'Doğrulanmış acil problem sinyali yok.'
            })
            continue
          }

          let finalTier = qr.lead_tier
          let finalLabel = qr.quality_label
          let finalAction = qr.next_action_priority

          if (finalTier !== 'A') {
            rejectedLeads.push({
              name: d.name,
              reason: `A-tier değil — reddedildi (Tier: ${finalTier || 'C/D'})`
            })
            continue
          }

          // Complete Clean Payload
          const leadData = {
            google_place_id: placeId,
            business_name: d.name,
            sector: cleanSector,
            normalized_sector: qr.normalized_sector,
            city: loc.city,
            district: loc.district,
            city_slug: loc.citySlug,
            district_slug: loc.districtSlug || null,
            phone,
            website: d.website || null,
            has_website: !!d.website,
            priority: qr.quality_score >= 70 ? 'high' : 'normal',
            latitude: lat,
            longitude: lng,
            rating: d.rating || null,
            review_count: d.user_ratings_total || 0,
            potential_score: qr.quality_score,
            quality_score: qr.quality_score,
            conversion_probability: qr.conversion_probability,
            lead_tier: finalTier,
            quality_label: finalLabel,
            why_this_will_convert: qr.why_this_will_convert,
            why_now,
            pain_signals: painSignalsList,
            proof_points: proofPointsList,
            next_action_priority: finalAction,
            conversion_angle: qr.conversion_angle,
            first_30_seconds_pitch: qr.first_30_seconds_pitch,
            expected_monthly_value_tl: qr.expected_monthly_value_tl,
            expected_offer_value_tl: qr.expected_offer_value_tl,
            status: 'new',
            enrichment_status: 'done',
            last_quality_scored_at: new Date().toISOString(),
            last_enriched_at: new Date().toISOString(),
            // Kategori-odaklı teklif (sabit "Web Tasarım / AI Entegrasyon" yerine).
            recommended_offer_name: qr.recommended_service_name,
            recommended_offer_id: qr.recommended_offer_id,
            // Müşteri (ihtiyaç) kategorisi + web kalite bandı (migration 031).
            customer_category: qr.customer_category,
            website_quality_band: qr.website_quality_band,
            category_reasons: qr.category_reasons,
            has_social_link: evidence.has_social_link,
          }

          if (!isDryRun) {
            let { data: inserted, error: insertErr } = await supabaseAdmin
              .from('leads')
              .insert(leadData)
              .select('id')
              .single()

            // Migration 031 yoksa kategori kolonları PGRST204 verir → atıp tekrar dene.
            if (insertErr && isMissingCategoryColumnError(insertErr)) {
              console.warn('[DAILY CRON] kategori kolonları yok (migration 031 bekliyor) — onlarsız yazılıyor.')
              const retry = await supabaseAdmin
                .from('leads')
                .insert(stripCategoryKeys(leadData))
                .select('id')
                .single()
              inserted = retry.data
              insertErr = retry.error
            }

            if (insertErr) {
              console.error(`[DAILY CRON] DB Insert error for ${d.name}:`, insertErr.message)
              rejectedLeads.push({
                name: d.name,
                reason: `Veritabanı kayıt hatası: ${insertErr.message}`
              })
              continue
            }

            poolEntry.leadId = inserted!.id
            poolEntry.acceptedByLegacyGate = true

            acceptedLeads.push({
              // insertErr guard'ı (continue) geçildi → inserted garanti non-null.
              id: inserted!.id,
              name: d.name,
              sector: cleanSector,
              district: loc.district,
              tier: finalTier,
              score: qr.quality_score,
              why_now: why_now,
              pitch: qr.first_30_seconds_pitch,
              action: finalAction === 'call_now' ? 'Bugün ara' : 'Mini audit gönder',
              pain_signals: painSignalsList,
              proof_points: proofPointsList
            })
          } else {
            acceptedLeads.push({
              id: 'DRY-RUN-ID',
              name: d.name,
              sector: cleanSector,
              district: loc.district,
              tier: finalTier,
              score: qr.quality_score,
              why_now: why_now,
              pitch: qr.first_30_seconds_pitch,
              action: finalAction === 'call_now' ? 'Bugün ara' : 'Mini audit gönder',
              pain_signals: painSignalsList,
              proof_points: proofPointsList
            })
          }
        }
        }
      }
    }

    // Save scan outcome to settings
    if (!isDryRun && acceptedLeads.length > 0) {
      await supabaseAdmin.from('settings').upsert({
        key: 'last_daily_scan',
        value: JSON.stringify({
          date: todayStr,
          status: 'success',
          scanned: scannedQueries,
          added: acceptedLeads.length,
          targetPlan: targetPlan.map(t => `${t.cityId}:${t.sector.id}`),
          timestamp: new Date().toISOString()
        })
      }, { onConflict: 'key' })
    }

    // Lead Intelligence v2 (settings-yönetimli; env kill-switch yalnız kapatır).
    // off → hiç koşmaz (bugünkü davranış bit-bit aynı). shadow → yalnız gözlemler.
    // active → seçilen kabul edilmiş lead'lere v2 kolonları yazılır. Asla cron'u düşürmez.
    let leadIntelSummary: Record<string, unknown> | null = null
    if (!isDryRun) {
      try {
        const mode = await getLeadIntelMode()
        if (mode !== 'off') {
          const result = await runLeadIntelPipeline({ pool: v2Pool, runDate: todayStr, mode })
          leadIntelSummary = { ...result }
          console.log(`[DAILY CRON] Lead Intelligence v2 (${mode}): stage=${result.stage}, assessed=${result.assessed}, selected=${result.selected.join(', ') || 'yok'}, cost=$${result.costUsd.toFixed(4)}`)
        }
      } catch (e) {
        console.warn('[DAILY CRON] Lead Intelligence v2 hatası (yut):', e instanceof Error ? e.message : e)
      }
    }

    const responsePayload: Record<string, any> = {
      date: todayStr,
      targetPlan: targetPlan.map(t => `${t.cityId}:${t.sector.id}`),
      scannedQueries,
      skippedDuplicates,
      acceptedLeads,
      rejectedLeads,
      leadIntel: leadIntelSummary,
      nextRun: 'Yarın Sabah 08:00 (TR)'
    }

    if (acceptedLeads.length < DAILY_TARGET) {
      responsePayload.accepted = acceptedLeads.length
      responsePayload.target = DAILY_TARGET
      responsePayload.reason = 'A-tier kalite kapısı korunarak yeterli lead bulunamadı.'
    }

    if (isDryRun) {
      responsePayload.wouldInsertCount = acceptedLeads.length
      responsePayload.dryRun = true
    } else {
      responsePayload.insertedCount = acceptedLeads.length
    }

    // Places maliyeti (mig 052) — never-throws, cron cevabını geciktirmez/kırmaz.
    if (textsearchCalls > 0) {
      await logToolCostRow({
        tool: 'google_places', operation: 'textsearch', units: textsearchCalls,
        meta: { source: 'daily-scan-cron' },
      })
    }
    if (detailsCalls > 0) {
      await logToolCostRow({
        tool: 'google_places', operation: 'details', units: detailsCalls,
        meta: { source: 'daily-scan-cron' },
      })
    }

    return NextResponse.json(responsePayload)

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown fatal error'
    console.error('[DAILY CRON] Fatal cron execution crash:', msg)
    await notifyOps({
      source: 'daily-scan',
      level: 'error',
      message: `Günlük lead taraması çöktü: ${msg}`,
      detail: msg,
    })
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
