// GET /api/outreach/[id]/send-status — taslağın Gmail gönderim durumu:
// onay (varsa), gönderildi mi, dry-run modu. LeadDrawer Gmail bloğu okur.
import { NextResponse } from 'next/server'
import { requireApiAccess } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { findSendApproval, getSendAttempt } from '@/lib/outreach/gmail'
import { isGmailSendEnabled } from '@/lib/outreach/flags'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

    const { id } = await params
    if (!id) return NextResponse.json({ success: false, error: 'id zorunludur' }, { status: 400 })

    const { data: row } = await supabaseAdmin
      .from('outreach_messages')
      .select('id, status, sent_at, gmail_message_id, error')
      .eq('id', id)
      .maybeSingle()
    if (!row) return NextResponse.json({ success: false, error: 'Taslak bulunamadı' }, { status: 404 })

    const approval = row.sent_at ? null : await findSendApproval(id)
    const attempt = await getSendAttempt(id)
    return NextResponse.json({
      success: true,
      data: {
        sent: Boolean(row.sent_at) || row.status === 'sent',
        gmailMessageId: row.gmail_message_id,
        lastError: row.error,
        approval: approval ? { id: approval.id, status: approval.status, expiresAt: approval.expires_at } : null,
        // At-most-once state machine görünürlüğü (mig 054): unknown →
        // reconciliation gerekir; sending/claimed → başka istek yürütüyor.
        attempt: attempt
          ? {
              state: attempt.state,
              attemptCount: attempt.attempt_count,
              finalized: attempt.finalized,
              lastError: attempt.last_error,
            }
          : null,
        dryRunMode: !isGmailSendEnabled(),
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
