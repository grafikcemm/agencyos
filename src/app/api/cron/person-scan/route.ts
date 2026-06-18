import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { guardCronEnv, notifyOps } from '@/lib/env'
import { runPersonScan } from '@/lib/personLeads/scan'

// Kişi/pozisyon lead taraması (Apollo People Search). daily-scan'den BAĞIMSIZ cron.
// GET = cron (Bearer CRON_SECRET); POST = manuel (idempotency bypass).

export async function GET(req: Request) {
  return handle(req)
}

export async function POST(req: Request) {
  return handle(req)
}

async function handle(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      return NextResponse.json({ error: 'CRON_SECRET environment variable is missing on the server.' }, { status: 500 })
    }
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    const envGuard = await guardCronEnv('person-scan', [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ])
    if (envGuard) return envGuard

    const { searchParams } = new URL(req.url)
    const isManual = searchParams.get('manual') === 'true' || req.method === 'POST'

    // Apollo anahtarı yoksa: 200 + soft uyarı (cron'u kırma).
    if (!process.env.APOLLO_API_KEY) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: 'APOLLO_API_KEY tanımlı değil — kişi taraması atlandı. .env.local\'a ekleyince aktifleşir.',
      })
    }

    // Idempotency: günde bir kez (Europe/Istanbul), manuel hariç.
    const now = new Date()
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now)

    if (!isManual) {
      const { data: lastSetting } = await supabaseAdmin
        .from('settings').select('value').eq('key', 'last_person_scan').maybeSingle()
      if (lastSetting?.value) {
        try {
          const last = JSON.parse(lastSetting.value)
          if (last?.date === todayStr) {
            return NextResponse.json({ success: true, skipped: true, message: `Bugün (${todayStr}) kişi taraması zaten yapıldı.` })
          }
        } catch { /* parse hatası — devam */ }
      }
    }

    const outcome = await runPersonScan({ source: isManual ? 'manual' : 'cron' })

    await supabaseAdmin.from('settings').upsert({
      key: 'last_person_scan',
      value: JSON.stringify({
        date: todayStr,
        inserted: outcome.totalInserted,
        rateLimited: outcome.rateLimited,
        timestamp: now.toISOString(),
      }),
    }, { onConflict: 'key' })

    return NextResponse.json({
      success: true,
      inserted: outcome.totalInserted,
      rateLimited: outcome.rateLimited,
      results: outcome.results,
      date: todayStr,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown fatal error'
    console.error('[PERSON-SCAN] Fatal crash:', msg)
    await notifyOps({ source: 'person-scan', level: 'error', message: `Kişi lead taraması çöktü: ${msg}`, detail: msg })
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
