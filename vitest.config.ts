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
      include: ['src/lib/**/*.ts', 'src/app/api/telegram/route.ts'],
      exclude: ['src/lib/**/*.test.ts', 'src/lib/migrations/**', 'src/lib/types.ts'],
      // Kritik modül eşikleri (Faz 6 + Sprint-3 Faz 1): gönderim güvenliği +
      // model routing + Telegram teslimat doğruluğu gerileyemez — tam suite
      // `--coverage` ile altına düşerse FAIL.
      thresholds: {
        'src/lib/outreach/gmail.ts': { statements: 90, lines: 90, branches: 85 },
        'src/lib/outreach/sendMachine.ts': { statements: 90, lines: 90, branches: 80 },
        'src/lib/outreach/auditCompliance.ts': { statements: 90, lines: 90, branches: 85 },
        'src/lib/models/**/*.ts': { statements: 90, branches: 80 },
        'src/lib/ai/toolCostLog.ts': { statements: 90, branches: 85 },
        // Sprint-3 Faz 2 — follow-up queue dayanıklılığı:
        'src/lib/outreach/sequences.ts': { lines: 90, branches: 85 },
        // Sprint-3 Faz 5 — teklif motoru:
        'src/lib/proposals/proposalService.ts': { lines: 90, branches: 85 },
        // Sprint-3 Faz 1 — Telegram teslimat zinciri (≥90 line / ≥85 branch):
        'src/app/api/telegram/route.ts': { lines: 90, branches: 85 },
        'src/lib/telegram/replyDelivery.ts': { lines: 90, branches: 85 },
        'src/lib/telegram/salesHandlers.ts': { lines: 90, branches: 85 },
        'src/lib/telegram/updateClaims.ts': { lines: 90, branches: 85 },
        'src/lib/telegram/client.ts': { lines: 90, branches: 85 },
        // FINALIZATION Faz 1 — kanıt/kalite çekirdeği (gelir akışının kapısı):
        'src/lib/outreach/outboundGate.ts': { lines: 90, branches: 85 },
        'src/lib/outreach/claimEvidence.ts': { lines: 90, branches: 85 },
        'src/lib/outreach/qualityLint.ts': { lines: 90, branches: 85 },
        'src/lib/coldEmail.ts': { lines: 90, branches: 85 },
        // FINALIZATION Faz 2 — Voice DNA + persuasion çekirdeği:
        'src/lib/outreach/voiceDna.ts': { lines: 90, branches: 85 },
        'src/lib/outreach/persuasionEval.ts': { lines: 90, branches: 85 },
        'src/lib/outreach/persuasionJudge.ts': { lines: 85, branches: 80 },
        'src/lib/outreach/persuasionMatrix.ts': { lines: 90, branches: 85 },
      },
    },
  },
})
