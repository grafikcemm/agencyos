import { NextResponse } from 'next/server'
import {
  authErrorResponse, envelope, istanbulDate, requireCemosAuth, writeAudit,
} from '@/lib/integrations/cemosLifeAuth'
import { readReminders, type LifeWarnings } from '@/lib/integrations/cemosLifeData'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    requireCemosAuth(req, 'read')
    const warnings: LifeWarnings = []
    const url = new URL(req.url)
    const istenen = url.searchParams.get('date')
    // Serbest tarih girisi kabul edilmez: bicim disi bir deger sorguyu degil,
    // istegin kendisini dusurur.
    if (istenen && !/^\d{4}-\d{2}-\d{2}$/.test(istenen)) {
      return NextResponse.json({ error: 'Geçersiz tarih biçimi.', code: 'bad_request' }, { status: 400 })
    }
    const date = istenen ?? istanbulDate()
    const reminders = await readReminders(date, warnings)
    await writeAudit({ route: 'life/reminders', method: 'GET', scope: 'read', status: 200, responseSummary: { count: reminders.length } })
    return NextResponse.json(envelope('life/reminders', { date, reminders }, warnings, reminders.length ? 'ok' : 'empty'))
  } catch (e) {
    return authErrorResponse(e)
  }
}
