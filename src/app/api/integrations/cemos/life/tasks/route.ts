import { NextResponse } from 'next/server'
import {
  authErrorResponse, envelope, requireCemosAuth, writeAudit,
} from '@/lib/integrations/cemosLifeAuth'
import { readSteps, readTasks, type LifeWarnings } from '@/lib/integrations/cemosLifeData'
import {
  TaskCreate, handleWrite, lifeSupabaseAdmin, taskColumns,
} from '@/lib/integrations/cemosLifeWrite'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    requireCemosAuth(req, 'read')
    const warnings: LifeWarnings = []
    const tasks = await readTasks(warnings)
    const steps = await readSteps(tasks.filter((t) => !t.is_done).map((t) => t.id as number), warnings)
    await writeAudit({ route: 'life/tasks', method: 'GET', scope: 'read', status: 200, responseSummary: { count: tasks.length } })
    return NextResponse.json(envelope('life/tasks', { tasks, steps }, warnings, tasks.length ? 'ok' : 'empty'))
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function POST(req: Request) {
  return handleWrite(req, 'life/tasks', 'POST', TaskCreate, async (input) => {
    const { data, error } = await lifeSupabaseAdmin
      .from('active_tasks')
      .insert(taskColumns(input))
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    // Ozet YALNIZ kimlik tasir — baslik ya da not denetim kaydina GIRMEZ.
    return { summary: { created: true, id: data?.id ?? null } }
  })
}
