import { resolveE2EDbEnv } from './env'

// Suite başlamadan (webServer dahil) fail-fast: E2E_* env eksikse ya da test
// DB ref'i production App DB ref'iyle aynıysa TEK bir test bile koşmaz.
export default async function globalSetup(): Promise<void> {
  const db = resolveE2EDbEnv()
  console.log(`[e2e] test DB doğrulandı: ref=${db.projectRef} (production ref DEĞİL)`)
}
