import { defineConfig } from '@playwright/test'
import { resolveE2EDbEnv } from './e2e/env'

// E2E suite — PRODUCTION build'e karşı koşar (next start, port 3200).
//
// DB İZOLASYONU (Faz 7.1): test edilen sunucu DA seed/cleanup istemcisi DE
// yalnız E2E_* env'leriyle verilen AYRI test DB'sine bağlanır. Env eksikse ya
// da ref production App DB ref'iyle aynıysa suite fail-fast (globalSetup +
// buradaki çözümleme). Production service-role'a sessiz fallback YOKTUR.
//
// Auth env'leri test değerleridir (gerçek secret DEĞİL); LOCAL_OPERATOR_MODE
// .env.local'da true olsa bile NODE_ENV=production'da hükümsüz — suite bunu
// doğrular.

export const E2E_PASSWORD = 'e2e-parola-123'
export const E2E_SESSION_SECRET = 'e2e-oturum-secreti-en-az-32-karakter-uzun'
export const E2E_OPERATOR_TOKEN = 'e2e-operator-token-en-az-32-karakter-uzun'
// Telegram webhook auth E2E'si icin TEST degerleri (gercek secret DEGIL).
// Testler YALNIZ yetki-reddi yollarini surer (yanlis chat/user) - bu yollar
// hicbir DB'ye yazmadan doner; gecerli chat+user update'i ASLA gonderilmez.
export const E2E_TELEGRAM_SECRET = 'e2e-telegram-webhook-secreti'
export const E2E_TELEGRAM_CHAT_ID = '111111'
export const E2E_TELEGRAM_USER_ID = '222222'

// Config yükünde toleranslı çözümleme: eksik/yanlış env'in AÇIK hatasını
// globalSetup fırlatır (suite hiç başlamaz); burada placeholder bırakılır.
let e2eDb: { url: string; anonKey: string; serviceRoleKey: string } | null = null
try {
  e2eDb = resolveE2EDbEnv()
} catch {
  e2eDb = null
}

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3200',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npx next start -p 3200',
    url: 'http://localhost:3200/login',
    timeout: 240_000,
    reuseExistingServer: true,
    env: {
      ...process.env,
      APP_PASSWORD: E2E_PASSWORD,
      APP_SESSION_SECRET: E2E_SESSION_SECRET,
      OPERATOR_API_TOKEN: E2E_OPERATOR_TOKEN,
      GMAIL_SEND_ENABLED: 'false',
      TELEGRAM_WEBHOOK_SECRET: E2E_TELEGRAM_SECRET,
      TELEGRAM_CHAT_ID: E2E_TELEGRAM_CHAT_ID,
      TELEGRAM_USER_ID: E2E_TELEGRAM_USER_ID,
      // Bot token BILEREK bos - E2E'de dis Telegram cagrisi yapisal imkansiz.
      TELEGRAM_BOT_TOKEN: '',
      // Sunucu TEST DB'sine bağlanır — canlı App DB'ye yazım yapısal imkânsız.
      NEXT_PUBLIC_SUPABASE_URL: e2eDb?.url ?? 'https://e2e-env-eksik.invalid',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: e2eDb?.anonKey ?? 'e2e-env-eksik',
      SUPABASE_SERVICE_ROLE_KEY: e2eDb?.serviceRoleKey ?? 'e2e-env-eksik',
      // Faz 5: bos token + fake transport = success-path E2E (dis cagri sifir).
      TELEGRAM_FAKE_TRANSPORT: 'success',
      // Suite tek IP'den 10+ BASARILI login yapar (her spec ayri oturum) —
      // brute-force limiti YALNIZ bu izole ortamda yukseltilir (prod default 8).
      LOGIN_RATE_LIMIT: '100',
      // Faz 5: LIFE de IZOLE test DB'sine gider (telegram_* tablolari orada;
      // fingerprint fonksiyonu bu tablolari BILEREK dislar). Canli LIFE'a
      // E2E'den yazim yapisal imkansiz.
      NEXT_PUBLIC_LIFE_SUPABASE_URL: e2eDb?.url ?? 'https://e2e-env-eksik.invalid',
      LIFE_SUPABASE_SERVICE_ROLE_KEY: e2eDb?.serviceRoleKey ?? 'e2e-env-eksik',
    },
  },
})
