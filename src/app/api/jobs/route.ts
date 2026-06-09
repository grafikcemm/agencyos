// GET /api/jobs   — ilan listesi (fit skoruna göre), her ilana taslakları iliştirir.
// PATCH /api/jobs — operatör aksiyonu: ilanı 'dismissed' işaretler.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'
import type { JobApplicationDraft } from '@/lib/jobs/types'
import { classifyMarket } from '@/lib/jobs/market'

export async function GET(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const limit = Number(searchParams.get('limit')) || 200

    let query = supabaseAdmin
      .from('job_listings')
      .select('*')
      .order('fit_score', { ascending: false, nullsFirst: false })
      .order('scanned_at', { ascending: false })
      .limit(limit)

    if (status) query = query.eq('status', status)

    const { data: listings, error } = await query
    if (error) throw error

    const rows = listings ?? []
    const ids = rows.map((r: { id: string }) => r.id)

    let draftsByListing: Record<string, JobApplicationDraft[]> = {}
    if (ids.length > 0) {
      const { data: drafts } = await supabaseAdmin
        .from('job_application_drafts')
        .select('*')
        .in('listing_id', ids)
        .order('created_at', { ascending: false })
        .returns<JobApplicationDraft[]>()
      draftsByListing = (drafts ?? []).reduce((acc, d) => {
        ;(acc[d.listing_id] ??= []).push(d)
        return acc
      }, {} as Record<string, JobApplicationDraft[]>)
    }

    const withDrafts = rows.map((r: { id: string; source: string; location: string | null }) => ({
      ...r,
      market: classifyMarket(r.source, r.location),
      drafts: draftsByListing[r.id] ?? [],
    }))

    return NextResponse.json({ listings: withDrafts })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    console.error('Jobs list error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

    const body = await req.json()
    const { id, status } = body
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: 'Geçerli id (uuid) zorunludur' }, { status: 400 })
    }
    // Bu endpoint yalnızca operatörün ilanı listeden düşürmesine izin verir.
    if (status !== 'dismissed') {
      return NextResponse.json({ error: "Sadece 'dismissed' ayarlanabilir" }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('job_listings')
      .update({ status: 'dismissed', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error

    return NextResponse.json({ listing: data })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
