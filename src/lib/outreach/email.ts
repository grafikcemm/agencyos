import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'

// Manual-dispatch model — YALNIZ gerçekten manuel kanallar (WhatsApp,
// Instagram, telefon vb.): operatör mesajı kendisi iletir, bu fonksiyon yalnız
// kaydı 'sent' işaretler. EMAIL KANALI BURADAN GEÇEMEZ (Faz 3, audit bulgu #3):
// email için tek yürütme yolu sendGmailMessage + at-most-once state machine —
// aksi hâlde onaysız/HITL'siz bir satır 'sent' olur ve Gmail yolu alreadySent
// no-op'una düşerdi.

// Marks an outreach_messages row as sent after the operator has dispatched it
// by hand. Idempotent: a row already 'sent' is a no-op success.
export async function markMessageSent(
  messageId: string
): Promise<{ ok: boolean; error?: string; blocked?: boolean }> {
  const { data: row, error: rowError } = await supabaseAdmin
    .from('outreach_messages')
    .select('id, status, channel')
    .eq('id', messageId)
    .single()

  if (rowError || !row) {
    return { ok: false, error: 'Mesaj bulunamadı' }
  }

  // Kanal DB satırından doğrulanır (istemci beyanı DEĞİL).
  if (row.channel === 'email') {
    return {
      ok: false,
      blocked: true,
      error:
        'Email kanalı manuel olarak sent işaretlenemez — Gmail HITL akışını kullanın (onay iste → onayla → gönder).',
    }
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
