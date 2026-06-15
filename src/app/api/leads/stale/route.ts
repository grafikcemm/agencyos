// GET /api/leads/stale — aşamasına göre soğumuş (takip gerektiren) açık lead'ler.
// Saf staleActionFor kuralıyla değerlendirilir; cron veya operatör paneli tüketebilir.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'
import { staleActionFor, STALE_ACTION_LABELS } from '@/lib/leads/staleDeals'

const OPEN_STATUSES = ['contacted', 'responded', 'meeting', 'proposal']

interface StaleRow {
  id: string
  business_name: string | null
  status: string | null
  last_contact_at: string | null
  stage_entered_at: string | null
  updated_at: string | null
  created_at: string | null
}

function lastActivityMs(row: StaleRow): number | null {
  const ts = row.last_contact_at ?? row.stage_entered_at ?? row.updated_at ?? row.created_at
  if (!ts) return null
  const ms = Date.parse(ts)
  return Number.isNaN(ms) ? null : ms
}

export async function GET(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('id, business_name, status, last_contact_at, stage_entered_at, updated_at, created_at')
      .in('status', OPEN_STATUSES)
      .limit(500)
    if (error) throw error

    const nowMs = Date.now()
    const stale = (data ?? [])
      .map((row: StaleRow) => {
        const action = staleActionFor({
          status: row.status,
          lastActivityMs: lastActivityMs(row),
          nowMs,
        })
        return action
          ? {
              id: row.id,
              business_name: row.business_name,
              status: row.status,
              action,
              action_label: STALE_ACTION_LABELS[action],
            }
          : null
      })
      .filter(Boolean)

    return NextResponse.json({ success: true, count: stale.length, leads: stale })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
