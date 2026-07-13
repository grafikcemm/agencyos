// Telegram webhook kaydı — TEK seferlik operatör aracı.
// Kullanım:  node scripts/telegram-register-webhook.mjs [--check]
//   --check : yalnız mevcut webhook durumunu gösterir (kayıt YAPMAZ)
// Token/secret .env.local'dan okunur ve ASLA yazdırılmaz.
import { readFileSync } from 'node:fs'

const PROD_WEBHOOK_URL = 'https://agencyos-zeta-ashen.vercel.app/api/telegram'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
)

const token = env.TELEGRAM_BOT_TOKEN
const secret = env.TELEGRAM_WEBHOOK_SECRET
if (!token || !secret) {
  console.error('HATA: .env.local içinde TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET gerekli.')
  process.exit(1)
}

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

if (process.argv.includes('--check')) process.exit(0)

const res = await api('setWebhook', {
  url: PROD_WEBHOOK_URL,
  secret_token: secret,
  allowed_updates: ['message'],
})
console.log('setWebhook:', { ok: res.ok, description: res.description })
if (!res.ok) process.exit(1)

const after = await api('getWebhookInfo')
console.log('Yeni webhook:', { url: after.result?.url, pending: after.result?.pending_update_count })
console.log('\nTest: bota Telegram’dan "/bugun" yaz — satış özeti dönmeli.')
