import { NextResponse } from 'next/server'
import {
  authErrorResponse, envelope, istanbulDate, requireCemosAuth, writeAudit,
} from '@/lib/integrations/cemosLifeAuth'
import { readHabitLogs, readHabits, type LifeWarnings } from '@/lib/integrations/cemosLifeData'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    requireCemosAuth(req, 'read')
    const warnings: LifeWarnings = []
    const today = istanbulDate()
    const [habits, logs] = await Promise.all([readHabits(warnings), readHabitLogs(warnings)])
    const bugun = new Set(logs.filter((l) => l.date === today && (l.value ?? 0) > 0).map((l) => l.habit_key))
    await writeAudit({ route: 'life/habits', method: 'GET', scope: 'read', status: 200, responseSummary: { count: habits.length } })
    return NextResponse.json(envelope('life/habits', {
      date: today,
      habits: habits.map((h) => ({ ...h, loggedToday: bugun.has(h.key as string) })),
      log30d: logs,
    }, warnings, habits.length ? 'ok' : 'empty'))
  } catch (e) {
    return authErrorResponse(e)
  }
}
