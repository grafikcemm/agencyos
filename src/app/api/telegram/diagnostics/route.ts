// GET /api/telegram/diagnostics — READ-ONLY Telegram sağlık görünümü (Faz B7).
// Token/webhook secret ASLA dönmez. setWebhook çağrısı YOKTUR (webhook kaydı
// yalnız kullanıcının deploy sonrası açık onayıyla, ayrı bir adımda yapılır).
import { NextResponse } from 'next/server'
import { requireApiAccess } from '@/lib/auth'
import { getMe, getWebhookInfo } from '@/lib/telegram/client'
import { lifeSupabaseAdmin } from '@/lib/lifeSupabaseAdmin'

export async function GET(req: Request) {
  const access = await requireApiAccess(req)
  if ('response' in access) return access.response

  const [me, webhook] = await Promise.all([getMe(), getWebhookInfo()])

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
    env: {
      // Yalnız VAR/YOK — değer asla dönmez.
      botTokenConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      chatIdConfigured: Boolean(process.env.TELEGRAM_CHAT_ID),
      userIdConfigured: Boolean(process.env.TELEGRAM_USER_ID),
      webhookSecretConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    },
  })
}
