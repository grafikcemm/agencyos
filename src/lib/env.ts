// Centralized environment validation + ops alerting.
//
// Deliberately dependency-free: it does NOT import `@/lib/supabase` or
// `server-only`. Two reasons:
//   1. It must run BEFORE any client (e.g. supabaseAdmin) that throws on a
//      missing env var, so it can turn a vague "X is required" crash into an
//      explicit, actionable response that names every missing variable at once.
//   2. Staying pure keeps it unit-testable under the node vitest runner.

export type EnvCheck = { ok: boolean; missing: string[] }

// Returns which of `names` are absent/blank in `source` (defaults to process.env).
export function checkEnv(
  names: string[],
  source: Record<string, string | undefined> = process.env,
): EnvCheck {
  const missing = names.filter((name) => {
    const value = source[name]
    return value === undefined || value === null || value.trim() === ''
  })
  return { ok: missing.length === 0, missing }
}

export type OpsAlert = {
  source: string // e.g. 'daily-scan'
  level: 'error' | 'warn'
  message: string
  detail?: unknown
}

// Best-effort ops alarm. NEVER throws — a broken alarm must not break the caller.
// Always emits a structured, greppable log line (`[OPS-ALERT] ...`) so failures
// surface in Vercel runtime logs. If ALERT_WEBHOOK_URL is set, it also POSTs a
// Slack/Discord/Telegram-compatible `{ text }` payload.
export async function notifyOps(alert: OpsAlert): Promise<void> {
  const line = `[OPS-ALERT] ${alert.level.toUpperCase()} source=${alert.source} :: ${alert.message}`

  if (alert.level === 'error') console.error(line, alert.detail ?? '')
  else console.warn(line, alert.detail ?? '')

  const url = process.env.ALERT_WEBHOOK_URL
  if (!url) return

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `🚨 AgencyOS ${line}` }),
    })
  } catch (error) {
    console.error(
      '[OPS-ALERT] webhook delivery failed:',
      error instanceof Error ? error.message : error,
    )
  }
}

// Guards a cron handler. If any required env var is missing it fires an ops alert
// and returns a ready 500 Response naming exactly what's missing. Returns null
// when env is complete, so the caller can proceed.
export async function guardCronEnv(
  source: string,
  required: string[],
): Promise<Response | null> {
  const { ok, missing } = checkEnv(required)
  if (ok) return null

  await notifyOps({
    source,
    level: 'error',
    message: `Eksik ortam değişkeni — cron çalışamadı: ${missing.join(', ')}`,
    detail: { missing },
  })

  return new Response(
    JSON.stringify({
      success: false,
      error: 'missing_env',
      missing,
      message: `Sunucuda eksik ortam değişkeni: ${missing.join(
        ', ',
      )}. Vercel → Settings → Environment Variables'a ekleyip yeniden deploy edin.`,
    }),
    { status: 500, headers: { 'content-type': 'application/json' } },
  )
}
