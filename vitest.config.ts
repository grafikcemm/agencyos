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
    },
  },
})
