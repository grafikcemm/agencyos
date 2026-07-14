// GET /api/outreach/metrics — cold email KPI'ları (email kanalı).
// Open rate KULLANILMAZ. Gerçek Gmail ledger'ı + reply FSM kullanılır; dry-run,
// auto-reply ve opt-out pozitif yanıt sayılmaz.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'
import { computeOutreachMetrics, countsFromEmailLedger } from '@/lib/outreach/metrics'

export async function GET(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

    const [draftQ, approvedQ, ledgerQ, failedQ] = await Promise.all([
      supabaseAdmin
        .from('outreach_messages')
        .select('id', { count: 'exact', head: true })
        .eq('channel', 'email')
        .eq('status', 'draft'),
      supabaseAdmin
        .from('outreach_messages')
        .select('id', { count: 'exact', head: true })
        .eq('channel', 'email')
        .eq('status', 'approved'),
      supabaseAdmin
        .from('email_messages')
        .select('direction, outreach_message_id, gmail_message_id, body')
        .not('outreach_message_id', 'is', null)
        .limit(20_000),
      supabaseAdmin
        .from('outreach_send_attempts')
        .select('outreach_message_id')
        .eq('state', 'failed')
        .limit(20_000),
    ])
    for (const q of [draftQ, approvedQ, ledgerQ, failedQ]) {
      if (q.error) throw q.error
    }

    const counts = countsFromEmailLedger(
      (ledgerQ.data ?? []).map((row) => ({
        direction: String(row.direction ?? ''),
        outreach_message_id: (row.outreach_message_id as string | null) ?? null,
        gmail_message_id: (row.gmail_message_id as string | null) ?? null,
        body: (row.body as string | null) ?? null,
      })),
      {
        draft: draftQ.count ?? 0,
        approved: approvedQ.count ?? 0,
        failedOutreachIds: (failedQ.data ?? []).map((row) => String(row.outreach_message_id)),
      },
    )

    const metrics = computeOutreachMetrics(counts)
    return NextResponse.json({ success: true, counts, metrics })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
