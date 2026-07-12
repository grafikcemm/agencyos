// GET /api/leads/daily-opportunities — "Bugünün 2 Fırsatı" verisi.
// Assessment + hizmet eşleşmeleri + kanıtlar (screenshot'lar kısa ömürlü signed URL)
// tek yanıtta; filtreler server-side: date, domain, family, minConfidence, evidenceCoverage.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiUser } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { signedUrlFor } from '@/lib/leadIntel/evidenceStore'
import { findServiceBySlug, domainOfPackage, findFamilyById } from '@/lib/services/catalog'

const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  domain: z.enum(['tasarim', 'ai_otomasyon', 'hibrit']).optional(),
  family: z.string().max(64).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  evidenceCoverage: z.coerce.number().int().min(0).max(20).optional(), // min doğrulanmış kanıt
  all: z.coerce.boolean().optional(), // true → yalnız seçilenler değil, günün tüm değerlendirmeleri
})

interface EvidenceOut {
  id: string
  kind: string
  source: string
  url: string | null
  summary: string | null
  confidence: number
  verified: boolean
  collected_at: string
  screenshot_url: string | null
}

export async function GET(req: Request) {
  try {
    const auth = await requireApiUser(req)
    if ('response' in auth) return auth.response

    const { searchParams } = new URL(req.url)
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams.entries()))
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Geçersiz sorgu', issues: parsed.error.issues }, { status: 400 })
    }
    const q = parsed.data
    const date = q.date ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())

    let assessQuery = supabaseAdmin
      .from('lead_assessments')
      .select('id, lead_id, candidate, run_date, mode, shadow, selected, design_score, ai_score, evidence_count, verified_evidence_count, chair_verdict, council, created_at')
      .eq('run_date', date)
      .order('created_at', { ascending: false })
    if (!q.all) assessQuery = assessQuery.eq('selected', true)

    const { data: assessments, error } = await assessQuery
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return NextResponse.json({ success: true, data: { date, opportunities: [], note: 'Migration 033 henüz uygulanmadı.' } })
      }
      throw error
    }

    const rows = assessments ?? []
    const assessmentIds = rows.map((a) => a.id)
    const leadIds = rows.map((a) => a.lead_id).filter(Boolean) as string[]

    const [matchesRes, evidenceRes, leadsRes] = await Promise.all([
      assessmentIds.length > 0
        ? supabaseAdmin.from('lead_service_matches').select('*').in('assessment_id', assessmentIds).order('rank')
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
      leadIds.length > 0
        ? supabaseAdmin.from('lead_evidence').select('id, lead_id, kind, source, url, storage_path, summary, confidence, verified, collected_at').in('lead_id', leadIds).order('collected_at', { ascending: false })
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
      leadIds.length > 0
        ? supabaseAdmin.from('leads').select('id, business_name, sector, city, district, phone, website, status').in('id', leadIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    ])

    const matches = (matchesRes.data ?? []) as Array<Record<string, unknown>>
    const evidence = (evidenceRes.data ?? []) as Array<Record<string, unknown>>
    const leads = new Map(((leadsRes.data ?? []) as Array<{ id: string }>).map((l) => [l.id, l]))

    const opportunities = await Promise.all(
      rows.map(async (a) => {
        const chair = (a.chair_verdict ?? {}) as Record<string, unknown>
        const primarySlug = typeof chair.primary_service_slug === 'string' ? chair.primary_service_slug : null
        const pkg = primarySlug ? findServiceBySlug(primarySlug) : undefined
        const domain = pkg ? domainOfPackage(pkg) : null
        const familyName = pkg ? findFamilyById(pkg.familyId)?.name ?? null : null

        // Server-side filtreler.
        if (q.domain && domain !== q.domain) return null
        if (q.family && familyName !== q.family && pkg?.familyId !== q.family) return null
        if (q.evidenceCoverage !== undefined && (a.verified_evidence_count ?? 0) < q.evidenceCoverage) return null

        let evidenceOut: EvidenceOut[] = []
        if (a.lead_id) {
          const leadEvidence = evidence.filter((e) => e.lead_id === a.lead_id)
          evidenceOut = await Promise.all(
            leadEvidence.map(async (e) => ({
              id: e.id as string,
              kind: e.kind as string,
              source: e.source as string,
              url: (e.url as string) ?? null,
              summary: (e.summary as string) ?? null,
              confidence: Number(e.confidence ?? 0),
              verified: Boolean(e.verified),
              collected_at: e.collected_at as string,
              screenshot_url: e.storage_path ? await signedUrlFor(e.storage_path as string) : null,
            }))
          )
          if (q.minConfidence !== undefined) {
            evidenceOut = evidenceOut.filter((e) => e.confidence >= q.minConfidence!)
          }
        }

        const candidateSnapshot = (a.candidate ?? {}) as Record<string, unknown>
        const lead = a.lead_id ? leads.get(a.lead_id) : null

        return {
          assessment_id: a.id,
          lead_id: a.lead_id,
          business_name: (lead as { business_name?: string } | null)?.business_name ?? (candidateSnapshot.businessName as string) ?? 'bilinmeyen',
          sector: (lead as { sector?: string } | null)?.sector ?? (candidateSnapshot.sector as string) ?? null,
          city: (lead as { city?: string } | null)?.city ?? (candidateSnapshot.city as string) ?? null,
          district: (lead as { district?: string } | null)?.district ?? (candidateSnapshot.district as string) ?? null,
          phone: (lead as { phone?: string } | null)?.phone ?? (candidateSnapshot.phone as string) ?? null,
          website: (lead as { website?: string } | null)?.website ?? (candidateSnapshot.website as string) ?? null,
          selected: a.selected,
          shadow: a.shadow,
          mode: a.mode,
          design_score: a.design_score,
          ai_score: a.ai_score,
          verified_evidence_count: a.verified_evidence_count,
          chair: {
            decision: chair.decision ?? null,
            primary_service_slug: primarySlug,
            primary_service_name: pkg?.name ?? null,
            secondary_service_slug: chair.secondary_service_slug ?? null,
            secondary_service_name:
              typeof chair.secondary_service_slug === 'string'
                ? findServiceBySlug(chair.secondary_service_slug)?.name ?? null
                : null,
            oversell_warning: Boolean(chair.oversell_warning),
            oversell_note: chair.oversell_note ?? null,
          },
          domain,
          family: familyName,
          matches: matches
            .filter((m) => m.assessment_id === a.id)
            .map((m) => ({
              id: m.id,
              service_slug: m.service_slug,
              service_name: findServiceBySlug(m.service_slug as string)?.name ?? m.service_slug,
              rank: m.rank,
              score: m.score,
              reasons: m.reasons,
              evidence_refs: m.evidence_refs,
            })),
          evidence: evidenceOut,
        }
      })
    )

    return NextResponse.json({
      success: true,
      data: { date, opportunities: opportunities.filter(Boolean) },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
