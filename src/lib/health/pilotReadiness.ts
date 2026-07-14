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
    const { data } = await supabaseAdmin.from('settings').select('value').eq('key', 'gmail_last_ingest_ok').maybeSingle()
    return Boolean(data?.value)
  } catch {
    return false
  }
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
  const [ingestCron, ingestOk, voice, compliance, life006] = await Promise.all([
    ingestCronRegistered(),
    lastIngestOk(),
    voiceCalibrated(),
    complianceReady(),
    life006Ready(),
  ])

  const checks: ReadinessCheck[] = [
    { key: 'core_env', label: 'Çekirdek env (Supabase/OpenRouter/Cron)', ok: env('SUPABASE_SERVICE_ROLE_KEY') && env('OPENROUTER_API_KEY') && env('CRON_SECRET'), required: true, detail: 'Zorunlu API anahtarları .env/Vercel’de olmalı.' },
    { key: 'gmail_oauth', label: 'Gmail OAuth yapılandırması', ok: Boolean(gmail?.oauthConfigured), required: true, detail: 'GOOGLE_CLIENT_ID/SECRET/redirect (kullanıcı aksiyonu: Google Cloud).' },
    { key: 'gmail_account', label: 'Bağlı + doğrulanmış Gmail hesabı', ok: Boolean(gmail?.connected && gmail?.verifiedEmail), required: true, detail: 'Ayarlar → Gmail Bağla (getProfile doğrulaması).' },
    { key: 'gmail_scopes', label: 'Zorunlu izinler (send + readonly)', ok: Boolean(gmail?.requiredScopesOk), required: true, detail: 'İki scope da gerekli; eksikse yeniden bağla.' },
    { key: 'gmail_transport', label: 'Gerçek gönderim transport’u hazır', ok: Boolean(gmail?.realSendTransportReady), required: true, detail: 'Bağlı hesap + scope + OAuth env üçü de gerekli.' },
    { key: 'ingest_cron', label: 'Gmail ingest cron kayıtlı', ok: ingestCron, required: true, detail: 'vercel.json + manifest parity (Faz 3).' },
    { key: 'last_ingest', label: 'Son başarılı inbound ingest', ok: ingestOk, required: false, detail: 'İlk gerçek ingest sonrası dolar.' },
    { key: 'life006', label: 'LIFE 006 (Telegram imzalı aksiyon + ledger)', ok: life006, required: true, detail: 'LIFE mig 006 (code kolonu) canlı olmalı.' },
    { key: 'telegram_webhook', label: 'Telegram webhook secret', ok: env('TELEGRAM_WEBHOOK_SECRET') && env('TELEGRAM_BOT_TOKEN'), required: false, detail: 'Webhook kaydı + bot token (deploy sonrası).' },
    { key: 'voice_dna', label: 'Voice DNA kalibrasyonu', ok: voice, required: false, detail: 'En az bir onaylı stil kuralı (onboarding).' },
    { key: 'compliance', label: 'İYS/KVKK uyum bilgisi', ok: compliance, required: true, detail: 'Ticaret unvanı + MERSİS (yasal footer).' },
    { key: 'send_flag', label: 'Gönderim bayrağı (pilot)', ok: process.env.GMAIL_SEND_ENABLED === 'true', required: false, detail: 'Pilot açılışında AÇILIR (varsayılan dry-run).' },
  ]

  const failedRequired = checks.filter((c) => c.required && !c.ok).map((c) => c.key)
  return { healthy: failedRequired.length === 0, checks, failedRequired }
}
