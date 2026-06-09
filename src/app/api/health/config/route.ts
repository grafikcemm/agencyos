// Config health check — reports which integrations are actually configured.
// Returns only booleans; never echoes secret values.

import { NextResponse } from 'next/server'
import { requireApiAccess } from '@/lib/auth'

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

  return NextResponse.json({
    success: true,
    healthy: missingRequired.length === 0,
    missingRequired,
    checks,
  })
}
