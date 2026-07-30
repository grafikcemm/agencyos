import {
  TaskPatch, handleWrite, lifeSupabaseAdmin, numericId, taskColumns,
} from '@/lib/integrations/cemosLifeWrite'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handleWrite(req, 'life/tasks/:id', 'PATCH', TaskPatch, async (input) => {
    const taskId = numericId(id, 'görev kimliği')
    const { data, error } = await lifeSupabaseAdmin
      .from('active_tasks')
      .update(taskColumns(input))
      .eq('id', taskId)
      .select('id')
    if (error) throw new Error(error.message)
    // Var olmayan kimlik SESSIZ BASARI olmaz: Supabase update'i 0 satirla da
    // hatasiz doner; "guncellendi" demek yanlis olurdu.
    if (!data?.length) throw new Error(`Görev bulunamadı: ${taskId}`)
    return { summary: { updated: true, id: taskId, fields: Object.keys(input).length } }
  })
}
