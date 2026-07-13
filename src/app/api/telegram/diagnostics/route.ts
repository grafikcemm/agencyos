// GET /api/telegram/diagnostics — READ-ONLY Telegram sağlık görünümü (Faz B7).
// Token/webhook secret ASLA dönmez. setWebhook çağrısı YOKTUR (webhook kaydı
// yalnız kullanıcının deploy sonrası açık onayıyla, ayrı bir adımda yapılır).
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiAccess, requireApiUser } from '@/lib/auth'
import { enforceSameOrigin } from '@/lib/api/guards'
import { getMe, getWebhookInfo } from '@/lib/telegram/client'
import { lifeSupabaseAdmin } from '@/lib/lifeSupabaseAdmin'
import { supabaseAdmin } from '@/lib/supabase'
import { sweepUnknownDeliveries, reconcileReminder } from '@/lib/assistant/reminderDispatch'

// ── Faz 5: readiness probe'ları — YAN ETKİSİZ ────────────────────────────────
// Statik health marker'ı hazırlık kanıtı DEĞİLDİR; gerçek hazırlık burada
// bileşen bileşen ölçülür. 006/058 canlı değilse overall 'ready' DENMEZ.

/** LIFE 006: claim_token kolonu + delivery ledger tablosu (yalnız SELECT probe). */
async function probeLife006(): Promise<{ claimStateReady: boolean; deliveryLedgerReady: boolean }> {
  const [claims, ledger] = await Promise.all([
    lifeSupabaseAdmin.from('telegram_update_claims').select('claim_token').limit(1),
    lifeSupabaseAdmin.from('telegram_outbound_deliveries').select('id').limit(1),
  ])
  return { claimStateReady: !claims.error, deliveryLedgerReady: !ledger.error }
}

/** App 058: apply_lead_action RPC varlığı — geçersiz aksiyonla probe:
 *  fonksiyon ilk kontrolde 'rejected' döner, HİÇBİR yazım yapmaz. */
async function probeApp058(): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('apply_lead_action', {
    p_lead_id: '00000000-0000-0000-0000-000000000000',
    p_action: '__probe__',
    p_actor: 'diagnostics',
    p_channel: 'ui',
    p_idempotency_key: null,
    p_note: null,
    p_later_at: null,
    p_now: new Date().toISOString(),
  })
  if (error) return false // PGRST202/42883 = RPC yok; diğer hatalar da hazır sayılmaz.
  return (data as { outcome?: string })?.outcome === 'rejected'
}

export async function GET(req: Request) {
  const access = await requireApiAccess(req)
  if ('response' in access) return access.response

  const [me, webhook, unknownSweep, life006, app058] = await Promise.all([
    getMe(),
    getWebhookInfo(),
    // Faz 0.2: stale 'sending' → 'unknown_delivery' (görünürlük; otomatik resend YOK).
    sweepUnknownDeliveries(),
    probeLife006().catch(() => ({ claimStateReady: false, deliveryLedgerReady: false })),
    probeApp058().catch(() => false),
  ])

  // Son başarılı inbound/outbound (LIFE telegram_conversations — salt okuma).
  let lastInbound: string | null = null
  let lastOutbound: string | null = null
  try {
    const { data } = await lifeSupabaseAdmin
      .from('telegram_conversations')
      .select('role, created_at')
      .order('created_at', { ascending: false })
      .limit(20)
    for (const row of data ?? []) {
      if (!lastInbound && row.role === 'user') lastInbound = row.created_at as string
      if (!lastOutbound && row.role === 'assistant') lastOutbound = row.created_at as string
      if (lastInbound && lastOutbound) break
    }
  } catch {
    /* LIFE erişilemedi — alanlar null kalır */
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? null
  const expectedWebhookUrl = appUrl ? `${appUrl.replace(/\/$/, '')}/api/telegram` : null
  const registeredUrl = webhook.ok ? webhook.info.url || null : null

  return NextResponse.json({
    bot: me.ok ? { id: me.bot.id, username: me.bot.username ?? null } : { error: me.error },
    webhook: webhook.ok
      ? {
          registered: Boolean(registeredUrl),
          url: registeredUrl,
          expectedUrl: expectedWebhookUrl,
          urlMatchesExpected:
            registeredUrl && expectedWebhookUrl ? registeredUrl === expectedWebhookUrl : null,
          pendingUpdateCount: webhook.info.pending_update_count,
          lastErrorMessage: webhook.info.last_error_message ?? null,
          lastErrorDate: webhook.info.last_error_date
            ? new Date(webhook.info.last_error_date * 1000).toISOString()
            : null,
        }
      : { error: webhook.error },
    lastSuccessfulInboundAt: lastInbound,
    lastSuccessfulOutboundAt: lastOutbound,
    // Faz 0.2: sonucu bilinmeyen reminder gönderimleri — karar operatörün.
    unknownDeliveries: {
      count: unknownSweep.unknown.length,
      sweptNow: unknownSweep.swept,
      rows: unknownSweep.unknown,
      error: unknownSweep.error,
    },
    env: {
      // Yalnız VAR/YOK — değer asla dönmez.
      botTokenConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      chatIdConfigured: Boolean(process.env.TELEGRAM_CHAT_ID),
      userIdConfigured: Boolean(process.env.TELEGRAM_USER_ID),
      webhookSecretConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    },
    // Faz 5: bileşen bazlı hazırlık — statik health marker'ı kanıt DEĞİLDİR.
    readiness: (() => {
      const envComplete =
        Boolean(process.env.TELEGRAM_BOT_TOKEN) &&
        Boolean(process.env.TELEGRAM_CHAT_ID) &&
        Boolean(process.env.TELEGRAM_USER_ID) &&
        Boolean(process.env.TELEGRAM_WEBHOOK_SECRET)
      const webhookRegisteredAndMatching = Boolean(
        registeredUrl && expectedWebhookUrl && registeredUrl === expectedWebhookUrl,
      )
      const overall =
        envComplete &&
        webhookRegisteredAndMatching &&
        life006.claimStateReady &&
        life006.deliveryLedgerReady &&
        app058
          ? 'ready'
          : 'degraded'
      return {
        envComplete,
        webhookRegisteredAndMatching,
        life006ClaimState: life006.claimStateReady,
        life006DeliveryLedger: life006.deliveryLedgerReady,
        app058LeadActionRpc: app058,
        // 006/058 canlı değilken 'ready' DENMEZ — degraded + eksikler yukarıda tek tek.
        overall,
      }
    })(),
  })
}

// ── Faz 0.2: unknown_delivery MANUEL reconcile (tek mutasyon; operatör kararı).
// 'retry_send' provider'ın ikinci kez çağrılmasına AÇIK insan onayıdır —
// otomatik hiçbir yol bunu yapamaz.
const ReconcileSchema = z.object({
  action: z.literal('reconcile_reminder'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reminderType: z.string().min(1).max(64),
  decision: z.enum(['assume_delivered', 'retry_send']),
})

export async function POST(req: Request) {
  const auth = await requireApiUser(req)
  if ('response' in auth) return auth.response
  const originErr = enforceSameOrigin(req)
  if (originErr) return originErr

  const parsed = ReconcileSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'geçersiz istek' }, { status: 400 })
  }
  const r = await reconcileReminder({
    date: parsed.data.date,
    reminderType: parsed.data.reminderType,
    decision: parsed.data.decision,
  })
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 409 })
  return NextResponse.json({ ok: true, decision: parsed.data.decision })
}
