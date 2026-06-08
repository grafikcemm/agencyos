import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'

// Manual-dispatch model: the operator sends every outreach message themselves
// (email, WhatsApp, Instagram) so the final touch always comes from a real
// person. The system only DRAFTS messages and records that the operator has
// dispatched them. There is no automated delivery and no Resend integration.

// Marks an outreach_messages row as sent after the operator has dispatched it by
// hand. Channel-agnostic. Idempotent: a row already 'sent' is a no-op success.
export async function markMessageSent(messageId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: row, error: rowError } = await supabaseAdmin
    .from('outreach_messages')
    .select('id, status')
    .eq('id', messageId)
    .single()

  if (rowError || !row) {
    return { ok: false, error: 'Mesaj bulunamadı' }
  }

  if (row.status === 'sent') {
    return { ok: true }
  }

  const { error: updateError } = await supabaseAdmin
    .from('outreach_messages')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', messageId)

  if (updateError) {
    return { ok: false, error: updateError.message }
  }

  return { ok: true }
}
