// Config health check — reports which integrations are actually configured.
// Returns only booleans; never echoes secret values.

import { NextResponse } from 'next/server'
import { requireApiAccess } from '@/lib/auth'
import { getPilotReadiness } from '@/lib/health/pilotReadiness'

interface ConfigCheck {
  key: string
  label: string
  configured: boolean
  required: boolean
}

const CHECKS: Array<{ env: string; label: string; required: boolean }> = [
  { env: 'NEXT_PUBLIC_SUPABASE_URL', label: 'Supabase URL', required: true },
  { env: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Supabase Service Role', required: true },
  { env: 'GOOGLE_MAPS_KEY', label: 'Google Maps API', required: true },
  { env: 'OPENROUTER_API_KEY', label: 'OpenRouter API', required: true },
  { env: 'CRON_SECRET', label: 'Cron Secret', required: true },
  { env: 'APOLLO_API_KEY', label: 'Apollo Enrichment', required: false },
  { env: 'FIRECRAWL_API_KEY', label: 'Firecrawl', required: false },
  { env: 'ALERT_WEBHOOK_URL', label: 'Ops Alert Webhook', required: false },
]

export async function GET(req: Request) {
  const access = await requireApiAccess(req)
  if ('response' in access) return access.response

  const checks: ConfigCheck[] = CHECKS.map(({ env, label, required }) => ({
    key: env,
    label,
    configured: Boolean(process.env[env] && process.env[env]!.trim().length > 0),
    required,
  }))

  const missingRequired = checks.filter(c => c.required && !c.configured).map(c => c.key)

  // FINAL PILOT BLOCKERS Faz 7: healthy YALNIZ GERÇEK pilot-ready ise true —
  // env-varlığı YETMEZ; Gmail/OAuth/scope/hesap/transport/ingest/LIFE006/uyum da
  // gerekir (audit bulgu #12). Env eksikse ya da pilot-readiness başarısızsa false.
  let readiness: Awaited<ReturnType<typeof getPilotReadiness>> | null = null
  try {
    readiness = await getPilotReadiness()
  } catch (err) {
    readiness = null
    console.error('[health] pilot-readiness hesaplanamadı:', err instanceof Error ? err.message : 'unknown')
  }
  const healthy = missingRequired.length === 0 && readiness !== null && readiness.healthy

  return NextResponse.json({
    success: true,
    healthy,
    missingRequired,
    checks,
    pilotReadiness: readiness,
  })
}
