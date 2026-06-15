// GET /api/outreach/metrics — cold email KPI'ları (email kanalı).
// Open rate KULLANILMAZ; positive reply / bounce raporlanır. Status sayımlarını
// outreach_messages'tan çekip saf computeOutreachMetrics ile özetler.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'
import { computeOutreachMetrics, type OutreachCounts } from '@/lib/outreach/metrics'

const STATUSES: (keyof OutreachCounts)[] = ['draft', 'approved', 'sent', 'replied', 'failed']

export async function GET(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

    const counts: OutreachCounts = { draft: 0, approved: 0, sent: 0, replied: 0, failed: 0 }

    await Promise.all(
      STATUSES.map(async (status) => {
        const { count, error } = await supabaseAdmin
          .from('outreach_messages')
          .select('id', { count: 'exact', head: true })
          .eq('channel', 'email')
          .eq('status', status)
        if (error) throw error
        counts[status] = count ?? 0
      }),
    )

    const metrics = computeOutreachMetrics(counts)
    return NextResponse.json({ success: true, counts, metrics })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
