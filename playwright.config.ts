import { defineConfig } from '@playwright/test'

// E2E suite — PRODUCTION build'e karşı koşar (next start, port 3200).
// Auth env'leri test değerleridir (gerçek secret DEĞİL); LOCAL_OPERATOR_MODE
// .env.local'da true olsa bile NODE_ENV=production'da hükümsüz — suite tam
// da bunu doğrular. Testler canlı App DB'ye kendi seed'ini yazar ve
// afterAll'da SİLER (artık bırakmama kuralı).

export const E2E_PASSWORD = 'e2e-parola-123'
export const E2E_SESSION_SECRET = 'e2e-oturum-secreti-en-az-32-karakter-uzun'
export const E2E_OPERATOR_TOKEN = 'e2e-operator-token-en-az-32-karakter-uzun'

export default defineConfig({
  testDir: './e2e',
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
    },
  },
})
