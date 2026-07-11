import { NextResponse } from 'next/server'
import { guardCronEnv, notifyOps } from '@/lib/env'
import { fetchLiveCatalog, checkPresetDrift } from '@/lib/models/verify'
import { PRESETS } from '@/lib/models/presets'

// Nightly model drift kontrolü — 16-openrouter-routing.md §6.
// PRESETS'teki her model ID canlı OpenRouter kataloğuyla karşılaştırılır;
// drift'te system-health uyarısı (notifyOps). Kaybolan primary'de sistem
// models[] fallback sayesinde ayakta kalır — bu cron proaktif düzeltme içindir.
export const maxDuration = 60

function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const querySecret = new URL(req.url).searchParams.get('secret')
  const isProd = process.env.NODE_ENV === 'production'
  return Boolean(
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
      (!isProd && cronSecret && querySecret === cronSecret) ||
      (!isProd && !cronSecret),
  )
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }

  const envError = await guardCronEnv('model-health-check', [])
  if (envError) return envError

  try {
    const catalog = await fetchLiveCatalog()
    const issues = checkPresetDrift(catalog)
    const presetCount = Object.keys(PRESETS).length

    if (issues.length > 0) {
      await notifyOps({
        source: 'model-health-check',
        level: 'warn',
        message: `Model drift tespit edildi: ${issues.length} sorun (${presetCount} preset tarandı)`,
        detail: { issues },
      })
    }

    return NextResponse.json({
      success: true,
      presetCount,
      catalogSize: catalog.size,
      driftCount: issues.length,
      issues,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'unknown'
    await notifyOps({
      source: 'model-health-check',
      level: 'error',
      message: `Drift kontrolü çalışamadı: ${msg}`,
    })
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
