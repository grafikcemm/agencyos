// Backfill: city_slug + evidence + quality engine for existing leads.
// POST → up to 50 leads per call. Idempotent.

import { NextResponse } from 'next/server'
import { enforceSameOrigin } from '@/lib/api/guards'
import { supabaseAdmin } from '@/lib/supabase'
import { normalizeLocation, normalizeSector } from '@/lib/geo'
import { runEvidenceEngine } from '@/lib/evidenceEngine'
import { calculateLeadScoreV3 } from '@/lib/leadScoringV3'
import { runQualityEngine } from '@/lib/highQualityLeadEngine'
import { requireApiAccess } from '@/lib/auth'
import { isMissingCategoryColumnError, stripCategoryKeys } from '@/lib/leads/categoryPersist'
import type { WebsiteQualityBand } from '@/lib/types'

interface RawLead {
  id: string
  business_name: string
  sector: string | null
  normalized_sector: string | null
  city: string | null
  district: string | null
  city_slug: string | null
  district_slug: string | null
  website: string | null
  phone: string | null
  rating: number | null
  review_count: number
  enrichment_status: string | null
  why_now: string | null
  pain_signals: string[] | null
  proof_points: string[] | null
  recommended_offer_name: string | null
  recommended_offer_id: string | null
  expected_monthly_value_tl: number | null
  expected_offer_value_tl: number | null
  quality_score: number | null
  lead_tier: string | null
  last_quality_scored_at: string | null
  why_this_will_convert: string | null
  first_30_seconds_pitch: string | null
  latitude?: number | null
  longitude?: number | null
  has_real_website?: boolean
  has_whatsapp?: boolean
  has_form?: boolean
  has_online_booking?: boolean
  has_ads_signal?: boolean
  instagram_as_site?: boolean
  has_job_signal?: boolean
  website_quality_band?: string | null
  has_social_link?: boolean
  disqualification_reason?: string | null
  sales_angle?: string | null
  first_message?: string | null
  next_best_action?: string | null
  confidence?: number | null
  google_place_id?: string | null
  branch_count?: number | null
  email?: string | null
  behavioral_flags?: Record<string, boolean> | null
}

interface LeadState {
  evidence_pending: boolean
  quality_missing: boolean
  geo_dirty: boolean
  sector_dirty: boolean
  ready: boolean
}

function checkLeadState(lead: RawLead): LeadState {
  const cleanSector = normalizeSector(lead.sector)
  const loc = normalizeLocation(lead.city ?? '', lead.district ?? '')
  
  const cleanBusinessName = (lead.business_name ?? '')
    .replace(/g[uü\?\uFFFD\u00A0\u01E0\u01E1\u01EC\u01ED]*zellik/gi, 'Güzellik')
    .replace(/g\??zellik/gi, 'Güzellik')
    .replace(/[\?\uFFFD\u00A0]stanbul/gi, 'İstanbul')
    .replace(/[\?\uFFFD\u00A0]sk[\?\uFFFD\u00A0]dar/gi, 'Üsküdar')
    .replace(/[Ǭ\?\uFFFD\u00A0\u01E0\u01E1\u01EC\u01ED]/g, '')
    .trim()

  const evidence_pending = lead.enrichment_status === null || lead.enrichment_status === 'pending'
  
  const quality_missing = 
    lead.quality_score === null || 
    lead.quality_score === 0 || 
    lead.lead_tier === null || 
    lead.last_quality_scored_at === null ||
    !lead.why_now ||
    !lead.why_this_will_convert ||
    !lead.first_30_seconds_pitch ||
    !lead.google_place_id ||
    !lead.phone ||
    lead.latitude === null || lead.latitude === undefined ||
    lead.longitude === null || lead.longitude === undefined

  const geo_dirty = 
    lead.city_slug !== loc.citySlug || 
    lead.district_slug !== (loc.districtSlug || null) || 
    lead.city !== loc.city || 
    lead.district !== (loc.district || null)

  const sector_dirty = 
    !lead.normalized_sector || 
    (lead.sector !== null && lead.sector !== undefined && lead.sector !== cleanSector)

  const name_dirty = lead.business_name !== cleanBusinessName

  const ready = !evidence_pending && !quality_missing && !geo_dirty && !sector_dirty && !name_dirty

  return { evidence_pending, quality_missing, geo_dirty, sector_dirty, ready: ready }
}

export async function POST(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originError = enforceSameOrigin(req)
    if (originError) return originError
    let force = false
    let dryRun = false

    // Parse params from URL and body
    const { searchParams } = new URL(req.url)
    force = searchParams.get('force') === 'true'
    dryRun = searchParams.get('dryRun') === 'true'

    try {
      const body = await req.json()
      if (body?.force !== undefined) force = body.force === true
      if (body?.dryRun !== undefined) dryRun = body.dryRun === true
    } catch { /* no body */ }

    const { data: leads, error: fetchErr } = await supabaseAdmin
      .from('leads')
      .select('*')
      .order('last_enriched_at', { ascending: true, nullsFirst: true })

    if (fetchErr) throw fetchErr
    if (!leads || leads.length === 0)
      return NextResponse.json({ success: true, processed: 0, message: 'Veritabanında lead bulunamadı.' })

    const targets = leads.filter((lead: unknown) => {
      if (force) return true
      const state = checkLeadState(lead as RawLead)
      return state.evidence_pending || state.quality_missing || state.geo_dirty || state.sector_dirty
    })

    const toProcess = targets.slice(0, 50)

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        total_dirty_or_missing: targets.length,
        processing_batch_size: toProcess.length,
        leads_to_process: (toProcess as RawLead[]).map(l => ({ id: l.id, name: l.business_name }))
      })
    }

    let processed = 0
    const errors: string[] = []

    for (const rawLead of toProcess) {
      const lead = rawLead as RawLead
      try {
        const cleanSector = normalizeSector(lead.sector)
        const loc = normalizeLocation(lead.city ?? '', lead.district ?? '')
        
        // Clean business name of any replacement/mojibake characters (e.g. GǬzellik -> Güzellik)
        const cleanBusinessName = lead.business_name
          .replace(/g[uü\?\uFFFD\u00A0\u01E0\u01E1\u01EC\u01ED]*zellik/gi, 'Güzellik')
          .replace(/g\??zellik/gi, 'Güzellik')
          .replace(/[\?\uFFFD\u00A0]stanbul/gi, 'İstanbul')
          .replace(/[\?\uFFFD\u00A0]sk[\?\uFFFD\u00A0]dar/gi, 'Üsküdar')
          .replace(/[Ǭ\?\uFFFD\u00A0\u01E0\u01E1\u01EC\u01ED]/g, '')
          .trim()

        // Evidence Optimization Check: Skip fetch if evidence already exists in DB
        const hasExistingEvidence = 
          lead.why_now && 
          lead.pain_signals && lead.pain_signals.length > 0 &&
          lead.recommended_offer_name

        let evidence
        if (hasExistingEvidence && !force) {
          evidence = {
            has_real_website: lead.has_real_website ?? (!!lead.website),
            has_whatsapp: lead.has_whatsapp ?? false,
            has_form: lead.has_form ?? false,
            has_online_booking: lead.has_online_booking ?? false,
            has_ads_signal: lead.has_ads_signal ?? false,
            instagram_as_site: lead.instagram_as_site ?? false,
            has_job_signal: lead.has_job_signal ?? false,
            is_slow_or_dead: false,
            // Cached: site bu turda yeniden ölçülmedi. Stored band varsa kullan; yoksa
            // gerçek site → 'ok' (web_yok'a yanlış düşmesin), aksi halde 'none'.
            website_quality_band: (lead.website_quality_band as WebsiteQualityBand) ??
              ((lead.has_real_website ?? !!lead.website) && !(lead.instagram_as_site ?? false) ? 'ok' : 'none'),
            has_social_link: lead.has_social_link ?? false,
            why_now: lead.why_now!,
            pain_signals: lead.pain_signals!,
            proof_points: lead.proof_points || [],
            disqualification_reason: lead.disqualification_reason || null,
            recommended_offer_id: lead.recommended_offer_id || 'review_engine',
            recommended_offer_name: lead.recommended_offer_name!,
            sales_angle: lead.sales_angle || '',
            first_message: lead.first_message || '',
            next_best_action: lead.next_best_action || '',
            confidence: lead.confidence ?? 0.8,
            // Cached DB evidence: site HTML'i bu turda doğrulanmadı.
            evidence_verified: false,
            found_email: null,
          }
        } else {
          evidence = await runEvidenceEngine({
            website: lead.website,
            sector: cleanSector,
            businessName: cleanBusinessName, // Use cleaned business name
            rating: lead.rating,
            reviewCount: lead.review_count ?? 0,
          })
        }

        const scoreResult = calculateLeadScoreV3({
          sector: cleanSector,
          city: loc.city,
          rating: lead.rating,
          reviewCount: lead.review_count ?? 0,
          phone: lead.phone,
          evidence,
          email: evidence.found_email ?? lead.email ?? null,
          behavioralFlags: lead.behavioral_flags ?? undefined,
        })

        const qualityResult = runQualityEngine({
          lead: {
            business_name: cleanBusinessName,
            sector: cleanSector,
            city: loc.city,
            phone: lead.phone,
            website: lead.website,
            rating: lead.rating,
            review_count: lead.review_count ?? 0,
            has_whatsapp: evidence.has_whatsapp,
            google_place_id: lead.google_place_id ?? undefined,
            branch_count: lead.branch_count ?? undefined,
          },
          evidence,
        })

        const updatePayload = {
          business_name: cleanBusinessName,
          city: loc.city || lead.city,
          sector: cleanSector || lead.sector,
          city_slug: loc.citySlug,
          district_slug: loc.districtSlug || null,
          district: loc.district || lead.district || null,
          normalized_sector: qualityResult.normalized_sector,
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
          why_now: evidence.why_now,
          pain_signals: evidence.pain_signals,
          proof_points: evidence.proof_points,
          recommended_offer_id: lead.recommended_offer_id || evidence.recommended_offer_id,
          recommended_offer_name: lead.recommended_offer_name || evidence.recommended_offer_name,
          sales_angle: evidence.sales_angle,
          first_message: evidence.first_message,
          next_best_action: evidence.next_best_action,
          confidence: evidence.confidence,
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
          enrichment_status: 'done',
          last_enriched_at: new Date().toISOString(),
        }
        let { error: updateErr } = await supabaseAdmin.from('leads').update(updatePayload).eq('id', lead.id)

        // Migration 031 yoksa kategori kolonları PGRST204 verir → atıp tekrar dene.
        if (updateErr && isMissingCategoryColumnError(updateErr)) {
          console.warn(`Backfill: kategori kolonları yok (migration 031 bekliyor) — ${lead.id} onlarsız yazılıyor.`)
          const retry = await supabaseAdmin.from('leads').update(stripCategoryKeys(updatePayload)).eq('id', lead.id)
          updateErr = retry.error
        }

        if (updateErr) errors.push(`${lead.id}: ${updateErr.message}`)
        else processed++
      } catch (e) {
        errors.push(`${lead.id}: ${e instanceof Error ? e.message : 'unknown'}`)
      }
    }

    return NextResponse.json({ success: true, processed, total_batch: toProcess.length, total_remaining: targets.length - processed, errors: errors.length ? errors : undefined })
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Hata' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const access = await requireApiAccess()
    if ('response' in access) return access.response
    const { data: leads, error: fetchErr } = await supabaseAdmin
      .from('leads')
      .select('id, business_name, sector, normalized_sector, city, district, city_slug, district_slug, website, phone, rating, review_count, enrichment_status, why_now, pain_signals, proof_points, recommended_offer_name, recommended_offer_id, expected_monthly_value_tl, expected_offer_value_tl, quality_score, lead_tier, last_quality_scored_at, why_this_will_convert, first_30_seconds_pitch, google_place_id, latitude, longitude')

    if (fetchErr) throw fetchErr
    if (!leads) return NextResponse.json({ total: 0, evidence_pending: 0, quality_missing: 0, geo_dirty: 0, sector_dirty: 0, ready: 0 })

    let evidence_pending = 0
    let quality_missing = 0
    let geo_dirty = 0
    let sector_dirty = 0
    let ready = 0

    for (const lead of leads) {
      const state = checkLeadState(lead as RawLead)
      if (state.evidence_pending) evidence_pending++
      if (state.quality_missing) quality_missing++
      if (state.geo_dirty) geo_dirty++
      if (state.sector_dirty) sector_dirty++
      if (state.ready) ready++
    }

    return NextResponse.json({
      total: leads.length,
      evidence_pending,
      quality_missing,
      geo_dirty,
      sector_dirty,
      ready
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Hata' }, { status: 500 })
  }
}
