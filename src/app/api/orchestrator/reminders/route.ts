import { NextRequest, NextResponse } from 'next/server'
import { requireApiAccess } from '@/lib/auth'
import { lifeSupabaseAdmin } from '@/lib/lifeSupabaseAdmin'

// GET /api/orchestrator/reminders?date=YYYY-MM-DD
// OrchestratorPage'in beklediği günlük hatırlatma listesi (assistant_reminders).
// Eksikti → panel 404 alıyordu (M4).
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
      .from('assistant_reminders')
      .select('date, reminder_type, sent_at, status')
      .eq('date', date)
      .order('sent_at', { ascending: true })

    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('[orchestrator/reminders]', (err as Error)?.message)
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
