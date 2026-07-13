// Telegram webhook kaydı — TEK seferlik operatör aracı (Faz 0.6 sertleştirmesi).
// Kullanım:
//   APP_URL=https://<prod-domain> node scripts/telegram-register-webhook.mjs [--check]
//   (APP_URL .env.local'a da yazılabilir. Hardcoded URL YOK.)
//   --check : yalnız mevcut durumu gösterir (kayıt YAPMAZ)
//
// Preflight (kayıttan önce, --check hariç hepsi zorunlu):
//   1) TELEGRAM_BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET + TELEGRAM_USER_ID env'de var
//   2) GET {APP_URL}/api/telegram/health → 200 + webhook:'v2-fail-closed'
//      (yeni fail-closed kod gerçekten yayında mı kanıtı)
// Token/secret ASLA yazdırılmaz.
import { readFileSync } from 'node:fs'

const env = { ...Object.fromEntries(
  (() => { try { return readFileSync('.env.local', 'utf8') } catch { return '' } })()
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
), ...process.env }

const checkOnly = process.argv.includes('--check')
const appUrl = (env.APP_URL ?? '').replace(/\/$/, '')
const token = env.TELEGRAM_BOT_TOKEN
const secret = env.TELEGRAM_WEBHOOK_SECRET

if (!token) { console.error('HATA: TELEGRAM_BOT_TOKEN gerekli.'); process.exit(1) }

const api = (method, body) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }).then((r) => r.json())

const info = await api('getWebhookInfo')
console.log('Mevcut webhook:', {
  url: info.result?.url || '(BOŞ — inbound İŞLENMİYOR)',
  pending: info.result?.pending_update_count ?? 0,
  last_error: info.result?.last_error_message ?? null,
})
if (checkOnly) process.exit(0)

// ── Preflight ────────────────────────────────────────────────────────────────
if (!appUrl || !/^https:\/\//.test(appUrl)) {
  console.error('HATA: APP_URL zorunlu (https://…). Örn: APP_URL=https://agencyos-zeta-ashen.vercel.app node scripts/telegram-register-webhook.mjs')
  process.exit(1)
}
if (!secret) { console.error('HATA: TELEGRAM_WEBHOOK_SECRET gerekli.'); process.exit(1) }
if (!env.TELEGRAM_USER_ID) {
  console.error('HATA: TELEGRAM_USER_ID gerekli — yeni webhook fail-closed; bu env olmadan hiçbir mesaj işlenmez.')
  process.exit(1)
}
try {
  const h = await fetch(`${appUrl}/api/telegram/health`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
  if (h?.webhook !== 'v2-fail-closed') throw new Error(`beklenmeyen health cevabı: ${JSON.stringify(h)}`)
  console.log('Preflight OK: yeni fail-closed webhook kodu yayında.')
} catch (err) {
  console.error(`HATA: ${appUrl}/api/telegram/health preflight başarısız (${err.message}). Önce yeni kodu deploy et.`)
  process.exit(1)
}

const res = await api('setWebhook', {
  url: `${appUrl}/api/telegram`,
  secret_token: secret,
  allowed_updates: ['message'],
})
console.log('setWebhook:', { ok: res.ok, description: res.description })
if (!res.ok) process.exit(1)

const after = await api('getWebhookInfo')
console.log('Yeni webhook:', { url: after.result?.url, pending: after.result?.pending_update_count })
console.log('\nTest: bota Telegram’dan "/bugun" yaz — satış özeti dönmeli.')
