// ─────────────────────────────────────────────────────────────────────────────
// Pilot-readiness sağlık kapısı (FINAL PILOT BLOCKERS Faz 7).
//
// /api/health/config yalnız 8 env kontrol ediyordu ve Gmail/OAuth/scope/aktif-
// hesap/gerçek-transport/ingest-cron/son-ingest/Telegram-webhook/Voice-DNA/
// uyum EKSİKKEN de healthy:true dönebiliyordu (audit bulgu #12). Bu modül
// GERÇEK pilot-ready koşulunu deterministik hesaplar: healthy YALNIZ tüm
// zorunlu (required) kontroller geçince true olur. HİÇBİR secret/değer dönmez.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { getGmailStatus } from '@/lib/gmail/status'
import { getWebhookInfo } from '@/lib/telegram/client'
import { CRON_REQUIRES_SUB_DAILY_SCHEDULER } from '@/lib/cron/manifest'

export interface ReadinessCheck {
  key: string
  label: string
  ok: boolean
  required: boolean
  /** Kısa, secret'sız açıklama (eksikse ne yapılmalı). */
  detail: string
}

export interface PilotReadiness {
  /** Yalnız tüm required kontroller geçerse true (gerçek pilot-ready). */
  healthy: boolean
  checks: ReadinessCheck[]
  failedRequired: string[]
}

function env(name: string): boolean {
  const v = process.env[name]
  return typeof v === 'string' && v.trim().length > 0
}

/** cron manifestinde gmail-ingest kayıtlı mı (vercel.json ile parity garantili). */
async function ingestCronRegistered(): Promise<boolean> {
  try {
    const { CRON_MANIFEST } = await import('@/lib/cron/manifest')
    return CRON_MANIFEST.some((c) => c.path === '/api/cron/enrichment' || c.path === '/api/cron/gmail-ingest')
      && CRON_MANIFEST.some((c) => c.path === '/api/cron/gmail-ingest')
  } catch {
    return false
  }
}

/** En son BAŞARILI inbound ingest zamanı (settings'e route yazarsa) — yoksa null. */
async function lastIngestOk(): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.from('settings').select('value').eq('key', 'gmail_last_ingest_ok').maybeSingle()
    if (error || !data?.value) return false
    const timestamp = Date.parse(data.value as string)
    // Manifest cadence'i 3 saat; 12 saatten eski heartbeat gerçek otomasyon
    // kanıtı değildir. Saat kayması/tek geçici hata için 4 cadence toleransı.
    return Number.isFinite(timestamp) && Date.now() - timestamp <= 12 * 60 * 60 * 1000
  } catch {
    return false
  }
}

/** Gelir döngüsünün kanonik App şeması canlı mı. Yalnız read-only SELECT probe;
 * tablo yok/erişilemiyorsa hazır sayılmaz. */
async function revenueSchemaReady(): Promise<boolean> {
  try {
    const probes = await Promise.all([
      supabaseAdmin.from('proposals').select('id').limit(1),
      supabaseAdmin.from('outreach_message_versions').select('id').limit(1),
      supabaseAdmin.from('gmail_oauth_states').select('nonce').limit(1),
      supabaseAdmin.from('gmail_inbound_quarantine').select('gmail_message_id').limit(1),
    ])
    return probes.every((p) => !p.error)
  } catch {
    return false
  }
}

/** Telegram env varlığı değil, provider'daki kayıtlı webhook URL eşleşmesi. */
async function telegramWebhookReady(): Promise<boolean> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL
  const envReady =
    env('TELEGRAM_BOT_TOKEN') &&
    env('TELEGRAM_CHAT_ID') &&
    env('TELEGRAM_USER_ID') &&
    env('TELEGRAM_WEBHOOK_SECRET') &&
    Boolean(appUrl)
  if (!envReady) return false
  try {
    const webhook = await getWebhookInfo()
    if (!webhook.ok) return false
    const expected = `${appUrl!.replace(/\/$/, '')}/api/telegram`
    return webhook.info.url === expected
  } catch {
    return false
  }
}

/** Manifest sub-daily işler içerdiği için Vercel Pro veya eşdeğer harici
 * scheduler doğrulanmadan otomasyon hazır denemez. Bayraklar yalnız gerçek
 * schedule deploy edilip korumalı endpoint başarıyla çalıştırıldıktan sonra
 * açılır. */
function schedulerReady(): boolean {
  return !CRON_REQUIRES_SUB_DAILY_SCHEDULER
    || process.env.VERCEL_PRO_PLAN_CONFIRMED === 'true'
    || process.env.EXTERNAL_CRON_SCHEDULER_CONFIRMED === 'true'
}

/** Onaylı Voice DNA kuralı var mı (kalibrasyon) — settings.voice_dna. */
async function voiceCalibrated(): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin.from('settings').select('value').eq('key', 'voice_dna').maybeSingle()
    if (!data?.value) return false
    const parsed = JSON.parse(data.value as string) as { positive?: unknown[]; negative?: unknown[] }
    return (parsed.positive?.length ?? 0) > 0 || (parsed.negative?.length ?? 0) > 0
  } catch {
    return false
  }
}

/** İYS/KVKK uyum footer alanları dolu mu (ticaret unvanı + MERSİS). */
async function complianceReady(): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin.from('settings').select('key, value').in('key', ['ticaret_unvani', 'mersis_no'])
    const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]))
    return Boolean(map.get('ticaret_unvani')?.trim()) && Boolean(map.get('mersis_no')?.trim())
  } catch {
    return false
  }
}

/** LIFE 006 (telegram_pending_actions.code) canlı mı — Telegram imzalı aksiyon
 *  ve reply ledger için gerekli. Kolon yoksa/erişilemezse false. */
async function life006Ready(): Promise<boolean> {
  try {
    const { lifeSupabaseAdmin } = await import('@/lib/lifeSupabaseAdmin')
    const { error } = await lifeSupabaseAdmin.from('telegram_pending_actions').select('code').limit(1)
    return !error
  } catch {
    return false
  }
}

export async function getPilotReadiness(): Promise<PilotReadiness> {
  const gmail = await getGmailStatus().catch(() => null)
  const [ingestCron, ingestOk, voice, compliance, life006, schema, telegram] = await Promise.all([
    ingestCronRegistered(),
    lastIngestOk(),
    voiceCalibrated(),
    complianceReady(),
    life006Ready(),
    revenueSchemaReady(),
    telegramWebhookReady(),
  ])

  const checks: ReadinessCheck[] = [
    { key: 'core_env', label: 'Çekirdek env (Supabase/OpenRouter/Cron)', ok: env('SUPABASE_SERVICE_ROLE_KEY') && env('OPENROUTER_API_KEY') && env('CRON_SECRET'), required: true, detail: 'Zorunlu API anahtarları .env/Vercel’de olmalı.' },
    { key: 'revenue_schema', label: 'Gelir motoru canlı DB şeması', ok: schema, required: true, detail: 'Onaylı App migration paketi (058–064) canlıya uygulanmalı.' },
    { key: 'gmail_oauth', label: 'Gmail OAuth yapılandırması', ok: Boolean(gmail?.oauthConfigured), required: true, detail: 'GOOGLE_CLIENT_ID/SECRET/redirect (kullanıcı aksiyonu: Google Cloud).' },
    { key: 'gmail_account', label: 'Bağlı + doğrulanmış Gmail hesabı', ok: Boolean(gmail?.connected && gmail?.verifiedEmail), required: true, detail: 'Ayarlar → Gmail Bağla (getProfile doğrulaması).' },
    { key: 'gmail_scopes', label: 'Zorunlu izinler (send + readonly)', ok: Boolean(gmail?.requiredScopesOk), required: true, detail: 'İki scope da gerekli; eksikse yeniden bağla.' },
    { key: 'gmail_transport', label: 'Gerçek gönderim transport’u hazır', ok: Boolean(gmail?.realSendTransportReady), required: true, detail: 'Bağlı hesap + scope + OAuth env üçü de gerekli.' },
    { key: 'send_flag', label: 'Gerçek Gmail gönderim bayrağı', ok: Boolean(gmail?.sendEnabled), required: true, detail: 'Gerçek pilot açılışında GMAIL_SEND_ENABLED=true yapılmalı; HITL yine zorunludur.' },
    { key: 'ingest_flag', label: 'Gmail cevap ingest bayrağı', ok: Boolean(gmail?.ingestEnabled), required: true, detail: 'GMAIL_INGEST_ENABLED=true olmadan cevaplar takip edilmez.' },
    { key: 'gmail_cursor', label: 'Gmail history cursor', ok: Boolean(gmail?.hasHistoryCursor), required: true, detail: 'İlk gerçek ingest başarıyla çalışıp cursor yazmalı.' },
    { key: 'ingest_cron', label: 'Gmail ingest cron kayıtlı', ok: ingestCron, required: true, detail: 'GitHub Actions workflow + manifest parity.' },
    { key: 'scheduler_plan', label: 'Sub-daily otomasyon scheduler’ı', ok: schedulerReady(), required: true, detail: 'Vercel Pro veya doğrulanmış harici scheduler gerekli (EXTERNAL_CRON_SCHEDULER_CONFIRMED=true).' },
    { key: 'last_ingest', label: 'Son başarılı inbound ingest', ok: ingestOk, required: true, detail: 'Son 12 saat içinde gerçek Gmail ingest heartbeat’i olmalı.' },
    { key: 'life006', label: 'LIFE 006 (Telegram imzalı aksiyon + ledger)', ok: life006, required: true, detail: 'LIFE mig 006 (code kolonu) canlı olmalı.' },
    { key: 'telegram_webhook', label: 'Telegram webhook gerçek kaydı', ok: telegram, required: true, detail: 'Token/chat/user/secret/APP_URL tam ve provider webhook URL’i birebir eşleşmeli.' },
    { key: 'voice_dna', label: 'Voice DNA kalibrasyonu', ok: voice, required: true, detail: 'Üst düzey kişiselleştirme için en az bir onaylı stil kuralı gerekli.' },
    { key: 'compliance', label: 'İYS/KVKK uyum bilgisi', ok: compliance, required: true, detail: 'Ticaret unvanı + MERSİS (yasal footer).' },
  ]

  const failedRequired = checks.filter((c) => c.required && !c.ok).map((c) => c.key)
  return { healthy: failedRequired.length === 0, checks, failedRequired }
}
