import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // `server-only` Next.js'in client-import guard'ı; node test ortamında çözülemez.
    // No-op stub'a yönlendir ki server modüllerinin saf export'ları test edilebilsin.
    alias: {
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './test-results/coverage',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.test.ts', 'src/lib/migrations/**', 'src/lib/types.ts'],
      // Kritik modül eşikleri (Faz 6): gönderim güvenliği + model routing
      // gerileyemez — tam suite `--coverage` ile altına düşerse FAIL.
      thresholds: {
        'src/lib/outreach/gmail.ts': { statements: 90, lines: 90, branches: 85 },
        'src/lib/outreach/sendMachine.ts': { statements: 90, lines: 90, branches: 80 },
        'src/lib/outreach/auditCompliance.ts': { statements: 90, lines: 90, branches: 85 },
        'src/lib/models/**/*.ts': { statements: 90, branches: 80 },
        'src/lib/ai/toolCostLog.ts': { statements: 90, branches: 85 },
      },
    },
  },
})
