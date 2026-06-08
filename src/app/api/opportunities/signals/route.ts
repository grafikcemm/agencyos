import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/opportunities/signals
 * Returns recent trend signals, source health logs, and product references for the TrendRadar UI.
 */
export async function GET() {
  try {
    const access = await requireApiAccess()
    if ('response' in access) return access.response
    // 1. Fetch recent signals (last 30 days, top 100 by confidence)
    const { data: signals, error: sigError } = await supabaseAdmin
      .from('opportunity_trend_signals')
      .select('id, source, source_url, title, summary, confidence_score, relevance_score, linked_product_id, status, collected_at')
      .gte('collected_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('confidence_score', { ascending: false })
      .limit(100)

    if (sigError) {
      console.error('[signals-api] Select error:', sigError.message)
      return Response.json({ signals: [], products: [], sources: [], lastScan: null, error: sigError.message })
    }

    // 2. Fetch products for linking
    const { data: products } = await supabaseAdmin
      .from('opportunity_products')
      .select('id, title')
      .eq('is_active', true)

    // 3. Fetch source statuses
    const { data: sources } = await supabaseAdmin
      .from('opportunity_trend_sources')
      .select('id, name, type, is_active, trust_score, last_status, last_checked_at, notes')
      .eq('is_active', true)

    // 4. Fetch the last scanned time reference
    const { data: lastReport } = await supabaseAdmin
      .from('opportunity_intel_reports')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)

    return Response.json({
      signals: signals ?? [],
      products: products ?? [],
      sources: sources ?? [],
      lastScan: lastReport?.[0]?.created_at ?? null
    })
  } catch (err) {
    return Response.json({ signals: [], products: [], sources: [], lastScan: null, error: String(err) })
  }
}

/**
 * POST /api/opportunities/signals
 * Updates a trend signal's status or links it to a product.
 */
export async function POST(request: Request) {
  try {
    const access = await requireApiAccess(request)
    if ('response' in access) return access.response
    const { id, status, linked_product_id } = await request.json()
    if (!id || !status) {
      return Response.json({ success: false, error: 'id and status are required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('opportunity_trend_signals')
      .update({
        status,
        ...(linked_product_id !== undefined ? { linked_product_id } : {}),
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) {
      console.error('[signals-api] Update error:', error.message)
      return Response.json({ success: false, error: error.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    return Response.json({ success: false, error: String(err) }, { status: 500 })
  }
}
