// Apollo enrichment — manual/pilot only. Never runs automatically.
// Requires APOLLO_API_KEY env var. Returns 503 if not configured.
// Note: requires 005_apollo_enrichments.sql migration before first use.

import { NextResponse } from 'next/server'
import { enforceSameOrigin } from '@/lib/api/guards'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'
import { redactForLog } from '@/lib/redact'

const APOLLO_API_KEY = process.env.APOLLO_API_KEY

export async function GET() {
  const access = await requireApiAccess()
  if ('response' in access) return access.response
  return NextResponse.json({ configured: !!APOLLO_API_KEY })
}

export async function POST(req: Request) {
  const access = await requireApiAccess(req)
  if ('response' in access) return access.response
  const originError = enforceSameOrigin(req)
  if (originError) return originError
  if (!APOLLO_API_KEY) {
    return NextResponse.json(
      { error: 'Apollo enrichment not configured. Add APOLLO_API_KEY to .env.local to enable.' },
      { status: 503 }
    )
  }

  try {
    const { lead_id } = await req.json()
    if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

    // 1. Cache Check: See if apollo_enrichments has a record for this lead already
    const { data: cached } = await supabaseAdmin
      .from('apollo_enrichments')
      .select('*')
      .eq('lead_id', lead_id)
      .maybeSingle()

    if (cached && cached.enriched_at) {
      console.log(`[APOLLO] Returning cached enrichment for lead: ${lead_id}`)
      return NextResponse.json({
        success: true,
        lead_id,
        domain: cached.domain,
        org_name: cached.org_name || 'Bilinmiyor',
        industry: cached.org_industry || 'Belirtilmemiş',
        employees: cached.org_employee_count || 'Bilinmiyor',
        linkedin: cached.org_linkedin || null,
        cached: true
      })
    }

    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id, business_name, website, phone, sector, city')
      .eq('id', lead_id)
      .single()

    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const rawUrl = lead?.website as string | null
    if (!rawUrl) {
      return NextResponse.json({ error: 'No website/domain to enrich', lead_id }, { status: 400 })
    }

    let domain: string
    try {
      const normalized = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`
      domain = new URL(normalized).hostname.replace(/^www\./, '')
    } catch {
      return NextResponse.json({ error: 'Invalid website URL', lead_id }, { status: 400 })
    }

    const url = `https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`
    console.log(`[APOLLO] Fetching fresh enrichment for domain: ${domain}`)

    // 2. Timeout: 15-second AbortController on fetch to Apollo
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      const orgRes = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Api-Key': APOLLO_API_KEY,
          'accept': 'application/json',
        },
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!orgRes.ok) {
        const status = orgRes.status
        const headersStr = JSON.stringify({
          'content-type': orgRes.headers.get('content-type'),
          'x-rate-limit-limit': orgRes.headers.get('x-rate-limit-limit'),
          'x-rate-limit-remaining': orgRes.headers.get('x-rate-limit-remaining'),
          'x-rate-limit-reset': orgRes.headers.get('x-rate-limit-reset'),
        })
        const errBody = await orgRes.text().catch(() => '')
        // Ensure API key is NEVER log-printed by never referencing APOLLO_API_KEY in logs.
        // Body redacted/truncated — sağlayıcı yanıtı org/PII detayı içerebilir.
        console.error(`Apollo API Error: status=${status}, endpoint=https://api.apollo.io/api/v1/organizations/enrich, headers=${headersStr}, body=${redactForLog(errBody)}`)
        return NextResponse.json({
          error: 'Apollo API error',
          status,
          message: `Apollo response failed with status ${status}. Check rate limits or permissions.`
        }, { status: 502 })
      }

      const orgData = await orgRes.json()
      const org = orgData.organization ?? {}

      // Store raw enrichment for pilot ROI analysis
      await supabaseAdmin.from('apollo_enrichments').upsert({
        lead_id,
        domain,
        org_name: org.name ?? null,
        org_industry: org.industry ?? null,
        org_employee_count: org.estimated_num_employees ?? null,
        org_linkedin: org.linkedin_url ?? null,
        raw_org: org,
        enriched_at: new Date().toISOString(),
      }, { onConflict: 'lead_id' })

      return NextResponse.json({
        success: true,
        lead_id,
        domain,
        org_name: org.name ?? null,
        industry: org.industry ?? null,
        employees: org.estimated_num_employees ?? null,
        linkedin: org.linkedin_url ?? null,
        cached: false
      })

    } catch (fetchErr: unknown) {
      clearTimeout(timeoutId)
      const errName = fetchErr instanceof Error ? fetchErr.name : ''
      if (errName === 'AbortError') {
        console.error(`[APOLLO] Time out after 15s for domain: ${domain}`)
        return NextResponse.json({
          error: 'Apollo Timeout',
          message: 'Apollo enrichment endpoint timed out. Request aborted after 15 seconds.'
        }, { status: 504 })
      }
      throw fetchErr
    }

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
