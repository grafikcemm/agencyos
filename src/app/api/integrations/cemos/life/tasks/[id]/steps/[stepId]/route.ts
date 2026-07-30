import {
  StepPatch, handleWrite, lifeSupabaseAdmin, numericId, stepColumns,
} from '@/lib/integrations/cemosLifeWrite'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; stepId: string }> }) {
  const { id, stepId } = await ctx.params
  return handleWrite(req, 'life/tasks/:id/steps/:stepId', 'PATCH', StepPatch, async (input) => {
    const taskId = numericId(id, 'görev kimliği')
    const sId = numericId(stepId, 'adım kimliği')
    // `task_id` KOSULU sart: yalniz adim kimligiyle guncellemek, baska bir
    // gorevin adimini yanlislikla degistirmeye acik kapi birakirdi.
    const { data, error } = await lifeSupabaseAdmin
      .from('active_task_steps')
      .update(stepColumns(input))
      .eq('id', sId)
      .eq('task_id', taskId)
      .select('id')
    if (error) throw new Error(error.message)
    if (!data?.length) throw new Error(`Adım bulunamadı: görev ${taskId} / adım ${sId}`)
    return { summary: { updated: true, taskId, stepId: sId, fields: Object.keys(input).length } }
  })
}
