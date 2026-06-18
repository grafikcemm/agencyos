import { NextRequest, NextResponse } from 'next/server'
import { requireApiAccess } from '@/lib/auth'
import { lifeSupabaseAdmin } from '@/lib/lifeSupabaseAdmin'

// GET /api/orchestrator/state?date=YYYY-MM-DD
// OrchestratorPage'in beklediği günlük durum (assistant_daily_state). Eksikti → panel
// 404 alıyordu (M4). Service-role ile okur; oturum guard'ı erişimi korur.
export async function GET(req: NextRequest) {
  const access = await requireApiAccess(req)
  if ('response' in access) return access.response

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Geçersiz tarih.' }, { status: 400 })
  }

  try {
    const { data } = await lifeSupabaseAdmin
      .from('assistant_daily_state')
      .select('date, agency_load, energy, mode, today_plan_json')
      .eq('date', date)
      .maybeSingle()

    return NextResponse.json(
      data ?? { date, agency_load: 'normal', energy: 'medium', mode: 'denge', today_plan_json: null },
    )
  } catch (err) {
    console.error('[orchestrator/state]', (err as Error)?.message)
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
