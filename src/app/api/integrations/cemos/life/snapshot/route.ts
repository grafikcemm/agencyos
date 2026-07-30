import { NextResponse } from 'next/server'
import {
  authErrorResponse, envelope, istanbulDate, requireCemosAuth, writeAudit,
} from '@/lib/integrations/cemosLifeAuth'
import {
  capacitySignal, readCommitments, readDaily, readHabitLogs, readHabits,
  readReminders, readSteps, readTasks, type LifeWarnings,
} from '@/lib/integrations/cemosLifeData'

export const dynamic = 'force-dynamic'

/**
 * GrafikcemOS Hayat Merkezi'nin TEK okuma çağrısı.
 *
 * Panel açılışında dokuz ayrı istek yerine tek anlık görüntü: kısmi yüklenmiş
 * bir ekran, hangi parçanın bayat olduğunu kullanıcıya söyleyemez. Eksik parça
 * `warnings` ile AÇIKÇA raporlanır; sessizce boş dönmez.
 */
export async function GET(req: Request) {
  const date = istanbulDate()
  try {
    const { clientId } = requireCemosAuth(req, 'read')
    const warnings: LifeWarnings = []

    const [tasks, habits, habitLogs, daily, reminders, commitments] = await Promise.all([
      readTasks(warnings),
      readHabits(warnings),
      readHabitLogs(warnings),
      readDaily(date, warnings),
      readReminders(date, warnings),
      readCommitments(warnings),
    ])
    const steps = await readSteps(tasks.filter((t) => !t.is_done).map((t) => t.id as number), warnings)

    const loggedToday = new Set(
      habitLogs.filter((l) => l.date === date && (l.value ?? 0) > 0).map((l) => l.habit_key),
    )

    const body = envelope(
      'life',
      {
        date,
        tasks,
        steps,
        habits: habits.map((h) => ({ ...h, loggedToday: loggedToday.has(h.key as string) })),
        habitLog30d: habitLogs,
        dailyMood: daily,
        reminders,
        capacitySignal: capacitySignal(tasks, daily, date),
        commitmentsRedCount: commitments.filter((c) => c.status && c.status !== 'done').length,
      },
      warnings,
      tasks.length || habits.length ? 'ok' : 'empty',
    )

    // Denetim: sayaçlar evet, içerik hayır.
    await writeAudit({
      route: 'life/snapshot', method: 'GET', scope: 'read', status: 200,
      responseSummary: { clientId, tasks: tasks.length, habits: habits.length, warnings: warnings.length },
    })
    return NextResponse.json(body)
  } catch (e) {
    const res = authErrorResponse(e)
    await writeAudit({
      route: 'life/snapshot', method: 'GET', scope: 'read', status: res.status,
      error: String((e as Error)?.message ?? e).slice(0, 200),
    })
    return res
  }
}
