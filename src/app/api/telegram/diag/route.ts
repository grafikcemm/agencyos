import { NextResponse } from 'next/server';

// Telegram webhook teşhisi: getWebhookInfo + zorunlu env varlık kontrolü.
// "Asistan cevap vermiyor" sorununu tek çağrıyla görünür kılar:
//   - last_error_message "Wrong response from the webhook: 401" → secret uyuşmuyor
//   - url boş → webhook hiç kaydedilmemiş (önce /api/telegram/setup çağır)
//   - pending_update_count yüksek → update'ler geliyor ama işlenemiyor
//
// Auth: Authorization: Bearer <CRON_SECRET>. Dev'de ?secret= query kabul edilir.
// Güvenlik: env DEĞERLERİ DÖNMEZ — yalnızca set mi (boolean).

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

interface WebhookInfo {
  url?: string;
  pending_update_count?: number;
  last_error_message?: string;
  last_error_date?: number;
  has_custom_certificate?: boolean;
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const env = {
    TELEGRAM_BOT_TOKEN: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    TELEGRAM_CHAT_ID: Boolean(process.env.TELEGRAM_CHAT_ID),
    TELEGRAM_WEBHOOK_SECRET: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    ORCHESTRATOR_START_DATE: Boolean(process.env.ORCHESTRATOR_START_DATE),
  };

  if (!BOT_TOKEN) {
    return NextResponse.json({ ok: false, env, error: 'TELEGRAM_BOT_TOKEN eksik — getWebhookInfo çağrılamaz.' });
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    const data = (await res.json()) as { ok: boolean; result?: WebhookInfo };
    const info = data.result ?? {};
    return NextResponse.json({
      ok: data.ok,
      env,
      webhook: {
        url: info.url ?? null,
        registered: Boolean(info.url),
        pending_update_count: info.pending_update_count ?? 0,
        last_error_message: info.last_error_message ?? null,
        last_error_date: info.last_error_date ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, env, error: err instanceof Error ? err.message : 'getWebhookInfo isteği başarısız' },
      { status: 502 },
    );
  }
}
