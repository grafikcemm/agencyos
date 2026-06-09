// GET|POST /api/cron/job-scan
// İş ilanı tarama cron'u: kaynakları tarar, filtreler, dedup eder, yeni ilanları
// yazar ve job_evaluator task'leri kuyruğa atar. LLM YOK (agent-tick boru hattını
// drene eder). CRON_SECRET bearer token ile kimlik doğrular.
import { NextResponse } from 'next/server'
import { runJobScan } from '@/lib/jobs/scan'
import { guardCronEnv, notifyOps } from '@/lib/env'

export async function GET(req: Request) {
  return handleScan(req)
}

export async function POST(req: Request) {
  return handleScan(req)
}

async function handleScan(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      return NextResponse.json({ error: 'CRON_SECRET missing' }, { status: 500 })
    }

    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    const envGuard = await guardCronEnv('job-scan', [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ])
    if (envGuard) return envGuard

    const stats = await runJobScan()
    return NextResponse.json({ success: true, ...stats })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Bilinmeyen hata'
    console.error('Job scan error:', msg)
    await notifyOps({
      source: 'job-scan',
      level: 'error',
      message: `İş ilanı taraması çöktü: ${msg}`,
      detail: msg,
    })
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
