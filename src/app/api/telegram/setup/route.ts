import { NextResponse } from 'next/server';

// Telegram setWebhook self-service: bu route'u tek çağırınca webhook KAYDOLUR.
// Outbound (cron) çalışsa bile inbound (kullanıcı yanıtı) için webhook'un Telegram'da
// secret_token ile kayıtlı olması ŞART — aksi halde /api/telegram'a hiçbir update gelmez.
//
// Auth: Authorization: Bearer <CRON_SECRET> (orchestrator route ile aynı desen).
// Dev'de ?secret=<CRON_SECRET> query de kabul edilir.

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';

function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const querySecret = new URL(req.url).searchParams.get('secret');
  const isProd = process.env.NODE_ENV === 'production';
  return Boolean(
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
      (!isProd && cronSecret && querySecret === cronSecret) ||
      (!isProd && !cronSecret),
  );
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!BOT_TOKEN) {
    return NextResponse.json(
      { ok: false, error: 'TELEGRAM_BOT_TOKEN eksik — webhook kaydedilemez.' },
      { status: 400 },
    );
  }

  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // Secret olmadan kayıt yapma: route.ts secret yoksa TÜM istekleri 401'liyor,
    // yani kayıt yine de işe yaramazdı. Önce secret ayarlanmalı.
    return NextResponse.json(
      {
        ok: false,
        error:
          'TELEGRAM_WEBHOOK_SECRET ayarlı değil. Önce Vercel ortam değişkenine güçlü rastgele bir değer ekle, redeploy et, sonra bu route\'u tekrar çağır.',
      },
      { status: 400 },
    );
  }

  // Webhook URL'yi istekten türet — preview/prod domain'ini otomatik yakalar.
  const webhookUrl = `${new URL(req.url).origin}/api/telegram`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ['message'],
        drop_pending_updates: false,
      }),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    return NextResponse.json(
      { ok: data.ok, webhookUrl, telegram: data },
      { status: data.ok ? 200 : 502 },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'setWebhook isteği başarısız' },
      { status: 502 },
    );
  }
}
