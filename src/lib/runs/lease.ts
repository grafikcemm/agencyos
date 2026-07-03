// ADR-001 durable execution — lease/retry SAF çekirdeği (§15). DB'siz → test edilebilir.
// Worker (agent-tick genişlemesi) bu mantıkla adım claim eder, backoff'la retry eder.
// Postgres tek-SoT: tüm yürütme durumu agent_tasks'ta (Vercel Workflow'a çıkmaz).

export const LEASE_TTL_MS = 5 * 60 * 1000 // 5 dk: bir claim bu kadar geçerli
const BACKOFF_BASE_MS = 30 * 1000 // ilk retry ~30sn
const BACKOFF_MAX_MS = 15 * 60 * 1000 // tavan 15dk

export interface LeasableStep {
  id: string
  status: string
  attempts: number
  maxAttempts: number
  nextRunAtMs: number | null
  leaseExpiresAtMs: number | null
}

// Exponential backoff (attempt 1 → base, 2 → 2×, …) tavana kadar.
export function computeBackoffMs(attempts: number, baseMs = BACKOFF_BASE_MS, maxMs = BACKOFF_MAX_MS): number {
  const exp = baseMs * Math.pow(2, Math.max(0, attempts - 1))
  return Math.min(exp, maxMs)
}

export function leaseExpiresAt(nowMs: number, ttlMs = LEASE_TTL_MS): number {
  return nowMs + ttlMs
}

export function isLeaseStale(leaseExpiresAtMs: number | null, nowMs: number): boolean {
  if (leaseExpiresAtMs === null) return true
  return nowMs >= leaseExpiresAtMs
}

// Claim edilebilir: (queued + next_run_at hazır) VEYA (working + lease bayat = crash).
// blocked_on_approval / done / error hariç.
export function isClaimable(step: LeasableStep, nowMs: number): boolean {
  if (step.status === 'queued') {
    return step.nextRunAtMs === null || nowMs >= step.nextRunAtMs
  }
  if (step.status === 'working') {
    return isLeaseStale(step.leaseExpiresAtMs, nowMs) // bayat lease yeniden claim
  }
  return false
}

// Bir sonraki claim partisi (≤ limit). Deterministik: id sırasıyla stabil.
export function selectClaimable(steps: LeasableStep[], nowMs: number, limit: number): LeasableStep[] {
  return steps
    .filter((s) => isClaimable(s, nowMs))
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit))
}

export type RetryOutcome =
  | { status: 'queued'; attempts: number; nextRunAtMs: number; lastError: string }
  | { status: 'error'; attempts: number; nextRunAtMs: null; lastError: string }

// Hata sonrası: attempts++; kalan hak varsa queued+backoff, yoksa kalıcı error.
export function retryDecision(
  step: Pick<LeasableStep, 'attempts' | 'maxAttempts'>,
  errorMsg: string,
  nowMs: number
): RetryOutcome {
  const attempts = step.attempts + 1
  if (attempts < step.maxAttempts) {
    return { status: 'queued', attempts, nextRunAtMs: nowMs + computeBackoffMs(attempts), lastError: errorMsg }
  }
  return { status: 'error', attempts, nextRunAtMs: null, lastError: errorMsg }
}
