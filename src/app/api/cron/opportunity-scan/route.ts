import { type NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import {
  runOpportunityScan,
  type OpportunityProduct,
  type WatchTopic,
  type ScoredSignal
} from '@/lib/opportunityIntelligenceEngine'
import { guardCronEnv, notifyOps } from '@/lib/env'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/opportunity-scan
 * Weekly opportunity trend scan.
 * ?dryRun=true → preview without saving
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Enforce OPPORTUNITY_SCAN_ENABLED check
    if (process.env.OPPORTUNITY_SCAN_ENABLED === 'false') {
      return Response.json({
        success: false,
        error: 'Opportunity scan is disabled'
      }, { status: 503 })
    }

    // 2. Enforce CRON_SECRET validation
    const authHeader = request.headers.get('Authorization')
    const cronSecretHeader = request.headers.get('x-cron-secret')
    // CRON_SECRET only via Authorization: Bearer or x-cron-secret header — never a
    // ?secret= query param (it would leak into Vercel/CDN access logs).
    
    let providedSecret = ''
    if (authHeader && authHeader.startsWith('Bearer ')) {
      providedSecret = authHeader.substring(7)
    } else if (cronSecretHeader) {
      providedSecret = cronSecretHeader
    }

    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret || providedSecret !== cronSecret) {
      return Response.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 })
    }

    const envGuard = await guardCronEnv('opportunity-scan', [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ])
    if (envGuard) return envGuard

    const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true'

    // 3. Fetch products and watch topics from DB
    const [productsRes, topicsRes] = await Promise.all([
      supabaseAdmin.from('opportunity_products').select('id, title, category, action_tier, priority_order, description').eq('is_active', true),
      supabaseAdmin.from('opportunity_watch_topics').select('id, topic, keywords, linked_product_id').eq('is_active', true)
    ])

    const products: OpportunityProduct[] = productsRes.data ?? []
    const watchTopics: WatchTopic[] = topicsRes.data ?? []

    if (products.length === 0) {
      return Response.json({
        success: false,
        error: 'No products found. Run npm run opportunity:seed first.',
        hint: 'seed_required'
      }, { status: 400 })
    }

    // 4. Run the scan
    const { scoredSignals, report, sourceResults } = await runOpportunityScan(products, watchTopics)

    // 5. If dry-run, return preview with candidates count (wouldInsertCount / candidateCount)
    if (dryRun) {
      const actionable = scoredSignals.filter(s => s.status === 'actionable')
      const parked = scoredSignals.filter(s => s.status === 'parked')

      return Response.json({
        success: true,
        mode: 'dry_run',
        total_signals: scoredSignals.length,
        candidateCount: scoredSignals.length,
        wouldInsertCount: scoredSignals.length,
        actionable_count: actionable.length,
        parked_count: parked.length,
        top_actionable: actionable.slice(0, 5).map(s => ({
          source: s.source,
          title: s.title,
          confidence: s.confidence_score,
          linked_product: products.find(p => p.id === s.linked_product_id)?.title ?? null
        })),
        sources: Object.fromEntries(
          sourceResults.map(r => [r.source, { enabled: r.enabled, count: r.signals.length, error: r.error }])
        ),
        report_summary: report.summary,
        recommendations: report.recommendations
      })
    }

    // 6. Save signals to DB with deduplication (ON CONFLICT signal_hash DO NOTHING)
    const signalsToInsert = scoredSignals.map((s: ScoredSignal) => ({
      source: s.source,
      source_url: s.source_url,
      title: s.title,
      summary: s.summary,
      relevance_score: s.relevance_score,
      confidence_score: s.confidence_score,
      linked_product_id: s.linked_product_id,
      matched_topic_id: s.matched_topic_id,
      status: s.status,
      raw_data: s.raw_data,
      signal_hash: s.signal_hash
    }))

    let insertedCount = 0
    if (signalsToInsert.length > 0) {
      // Batch upsert in chunks of 50 using ignoreDuplicates: true
      for (let i = 0; i < signalsToInsert.length; i += 50) {
        const chunk = signalsToInsert.slice(i, i + 50)
        const { data: insertedRows, error } = await supabaseAdmin
          .from('opportunity_trend_signals')
          .upsert(chunk, { onConflict: 'signal_hash', ignoreDuplicates: true })
          .select('id')
          
        if (!error && insertedRows) {
          insertedCount += insertedRows.length
        } else if (error) {
          console.error('[opportunity-scan] Insert error:', error.message)
        }
      }
    }

    // 7. Save weekly report
    const { error: reportError } = await supabaseAdmin.from('opportunity_intel_reports').insert({
      report_type: 'weekly',
      period_start: report.period_start,
      period_end: report.period_end,
      total_signals: report.total_signals,
      actionable_signals: report.actionable_signals,
      parked_signals: report.parked_signals,
      top_products: report.top_products,
      summary: report.summary,
      recommendations: report.recommendations,
      sources_status: report.sources_status
    })

    if (reportError) {
      console.error('[opportunity-scan] Report insert error:', reportError.message)
    }

    // 8. Log and upsert sources status in opportunity_trend_sources table
    const sourcesToUpsert = sourceResults.map(r => ({
      id: r.source,
      name: r.source === 'product_hunt' ? 'Product Hunt' :
            r.source === 'hacker_news' ? 'Hacker News' :
            r.source === 'reddit' ? 'Reddit' :
            r.source === 'google_trends' ? 'Google Trends' :
            r.source === 'turkey_gap' ? 'Türkiye Fırsat Açığı' : r.source,
      type: r.source === 'product_hunt' ? 'rss' :
            r.source === 'hacker_news' ? 'api' :
            r.source === 'reddit' ? 'json_feed' :
            r.source === 'google_trends' ? 'api' : 'static',
      is_active: r.enabled,
      trust_score: r.source === 'turkey_gap' ? 100 : r.source === 'google_trends' ? 80 : 70,
      last_status: r.last_status || (r.error ? 'error' : r.signals.length === 0 ? 'no_data' : 'ok'),
      last_checked_at: new Date().toISOString(),
      notes: r.error || `Successfully scanned ${r.signals.length} signals.`
    }))

    for (const src of sourcesToUpsert) {
      const { error: srcError } = await supabaseAdmin
        .from('opportunity_trend_sources')
        .upsert(src, { onConflict: 'id' })
      if (srcError) {
        console.error('[opportunity-scan] Source upsert error:', srcError.message)
      }
    }

    return Response.json({
      success: true,
      mode: 'live',
      total_signals: scoredSignals.length,
      inserted_count: insertedCount,
      actionable_count: scoredSignals.filter(s => s.status === 'actionable').length,
      parked_count: scoredSignals.filter(s => s.status === 'parked').length,
      report_saved: !reportError,
      report_summary: report.summary,
      sources: Object.fromEntries(
        sourceResults.map(r => [r.source, { enabled: r.enabled, count: r.signals.length, error: r.error }])
      ),
      nextRun: 'Gelecek Pazartesi 09:00 (TR)'
    })
  } catch (err) {
    console.error('[opportunity-scan] Fatal error:', err)
    await notifyOps({
      source: 'opportunity-scan',
      level: 'error',
      message: `Fırsat taraması çöktü: ${String(err)}`,
      detail: String(err),
    })
    return Response.json({
      success: false,
      error: 'Opportunity scan failed',
      detail: String(err)
    }, { status: 500 })
  }
}
