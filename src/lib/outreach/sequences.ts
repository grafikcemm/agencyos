import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'

const MS_PER_DAY = 24 * 60 * 60 * 1000

// Schedules the next follow-up step for a lead. due_at is computed from now.
export async function scheduleFollowUp(opts: {
  leadId: string
  step: number
  channel?: string
  dueInDays: number
  outreachMessageId?: string | null
}): Promise<void> {
  const dueAt = new Date(Date.now() + opts.dueInDays * MS_PER_DAY).toISOString()

  await supabaseAdmin.from('follow_up_sequences').insert({
    lead_id: opts.leadId,
    step: opts.step,
    channel: opts.channel ?? 'email',
    due_at: dueAt,
    outreach_message_id: opts.outreachMessageId ?? null,
  })
}

// Promotes due follow-ups into queued agent_tasks for the sales_rep agent, then
// marks each as done. Per-row try/catch so one failure never aborts the batch.
export async function processDueSequences(limit = 10): Promise<{ processed: number }> {
  const nowIso = new Date().toISOString()

  const { data: due, error } = await supabaseAdmin
    .from('follow_up_sequences')
    .select('id, lead_id, step, channel')
    .eq('done', false)
    .lte('due_at', nowIso)
    .order('due_at', { ascending: true })
    .limit(limit)

  if (error) throw error
  if (!due || due.length === 0) return { processed: 0 }

  let processed = 0

  for (const seq of due) {
    try {
      await supabaseAdmin.from('agent_tasks').insert({
        agent_key: 'sales_rep',
        title: 'Takip adımı ' + seq.step + ' — lead ' + seq.lead_id,
        input: { lead_id: seq.lead_id, sequence_step: seq.step, channel: seq.channel },
        status: 'queued',
        directive_id: null,
      })

      await supabaseAdmin.from('follow_up_sequences').update({ done: true }).eq('id', seq.id)

      processed += 1
    } catch (rowError: unknown) {
      const message = rowError instanceof Error ? rowError.message : 'Bilinmeyen hata'
      console.error('processDueSequences row error:', seq.id, message)
    }
  }

  return { processed }
}
