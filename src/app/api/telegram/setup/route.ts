// POST /api/telegram/setup — webhook kaydı (Faz 0.6 sertleştirmesi).
//
// ESKİ HÂL (kaldırıldı): GET + CRON_SECRET → MUTASYON. Cron secret'ı tek başına
// webhook mutation yetkisi OLAMAZ; GET mutasyon yapamaz.
//
// YENİ: yalnız POST + operatör auth (requireApiUser) + same-origin. Ortak
// telegram client kullanılır (timeout + redaction). URL istekten türetilir
// (same-origin zorunlu olduğundan origin = yayınlanan uygulamanın kendisi).
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { enforceSameOrigin } from '@/lib/api/guards'
import { setWebhook, getWebhookInfo } from '@/lib/telegram/client'

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requireApiUser(req)
  if ('response' in auth) return auth.response
  const originErr = enforceSameOrigin(req)
  if (originErr) return originErr

  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!webhookSecret) {
    return NextResponse.json(
      { ok: false, error: 'TELEGRAM_WEBHOOK_SECRET ayarlı değil — önce env, sonra kayıt.' },
      { status: 400 },
    )
  }
  if (!process.env.TELEGRAM_USER_ID) {
    // Fail-closed webhook bu env olmadan hiçbir mesajı işlemez — kayıt anlamsız olur.
    return NextResponse.json(
      { ok: false, error: 'TELEGRAM_USER_ID ayarlı değil — webhook fail-closed çalışır, önce env.' },
      { status: 400 },
    )
  }

  const webhookUrl = `${new URL(req.url).origin}/api/telegram`
  const result = await setWebhook(webhookUrl, webhookSecret)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, webhookUrl }, { status: 502 })
  }
  const info = await getWebhookInfo()
  return NextResponse.json({
    ok: true,
    webhookUrl,
    registeredUrl: info.ok ? info.info.url : null,
    pendingUpdateCount: info.ok ? info.info.pending_update_count : null,
  })
}

// Eski GET çağrıları açık hata alsın (sessizce mutasyon YOK).
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'GET kaldırıldı — webhook kaydı yalnız operatör oturumuyla POST /api/telegram/setup.' },
    { status: 405 },
  )
}
