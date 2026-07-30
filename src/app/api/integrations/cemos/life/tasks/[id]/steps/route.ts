import {
  StepCreate, handleWrite, lifeSupabaseAdmin, numericId,
} from '@/lib/integrations/cemosLifeWrite'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handleWrite(req, 'life/tasks/:id/steps', 'POST', StepCreate, async (input) => {
    const taskId = numericId(id, 'görev kimliği')
    // Once gorevin VARLIGI dogrulanir: FK ihlali mesaji yerine acik hata.
    const { data: task, error: taskErr } = await lifeSupabaseAdmin
      .from('active_tasks').select('id').eq('id', taskId).maybeSingle()
    if (taskErr) throw new Error(taskErr.message)
    if (!task) throw new Error(`Görev bulunamadı: ${taskId}`)

    const { data, error } = await lifeSupabaseAdmin
      .from('active_task_steps')
      .insert({ task_id: taskId, title: input.title, sort_order: input.sortOrder ?? 0 })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return { summary: { created: true, taskId, stepId: data?.id ?? null } }
  })
}
