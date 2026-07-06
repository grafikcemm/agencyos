// GET|POST /api/cron/agent-tick
// Cron worker that drains the agent task queue. Picks up to 5 queued tasks
// (oldest first) and runs each through the task runner. Authenticated via
// CRON_SECRET bearer token.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { runTask } from '@/lib/agents/runner'
import { processDueSequences } from '@/lib/outreach/sequences'
import { guardCronEnv, notifyOps } from '@/lib/env'

// 5 sıralı LLM çağrısı + sequence promotion — platform default süresinde kesilir,
// yarıda kesilme 'working'de sıkışan satır üretir (aşağıdaki reclaim'in ana nedeni).
export const maxDuration = 300

// Bu süreden eski 'working' satırlar çökmüş/kesilmiş koşucudan kalmadır → geri al.
const STALE_WORKING_MINUTES = 15

export async function GET(req: Request) {
  return handleTick(req)
}

export async function POST(req: Request) {
  return handleTick(req)
}

async function handleTick(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      return NextResponse.json({ error: 'CRON_SECRET missing' }, { status: 500 })
    }

    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    const envGuard = await guardCronEnv('agent-tick', [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ])
    if (envGuard) return envGuard

    // KURTARMA: serverless kesintisi (timeout/OOM) 'working' satırı sonsuza dek
    // kilitler — runner'ın catch'i hiç çalışmaz. Eski 'working' satırları kuyruğa
    // geri al ki kuyruk sessizce ölmesin. (run_steps'teki lease reclaim'in
    // agent_tasks karşılığı.)
    const staleCutoff = new Date(Date.now() - STALE_WORKING_MINUTES * 60_000).toISOString()
    const { data: reclaimed } = await supabaseAdmin
      .from('agent_tasks')
      .update({ status: 'queued', started_at: null })
      .eq('status', 'working')
      .lt('started_at', staleCutoff)
      .select('id')
    const reclaimedCount = reclaimed?.length ?? 0

    // Promote any due follow-up sequences into queued tasks before draining,
    // so this tick can pick them up immediately.
    const { processed: sequencesPromoted } = await processDueSequences(10)

    const { data: tasks, error } = await supabaseAdmin
      .from('agent_tasks')
      .select('id, directive_id, agent_key, title, input, status')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(5)

    if (error) throw error

    if (!tasks || tasks.length === 0) {
      return NextResponse.json({ processed: 0, sequencesPromoted, reclaimed: reclaimedCount, message: 'Kuyruk boş' })
    }

    const results: Array<{ id: string; agent_key: string; ok: boolean }> = []
    for (const task of tasks) {
      const result = await runTask(task)
      results.push({ id: task.id, agent_key: task.agent_key, ok: result.ok })
    }

    return NextResponse.json({ processed: results.length, sequencesPromoted, reclaimed: reclaimedCount, results })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Bilinmeyen hata'
    console.error('Agent tick error:', msg)
    await notifyOps({
      source: 'agent-tick',
      level: 'error',
      message: `Agent görev kuyruğu çöktü: ${msg}`,
      detail: msg,
    })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
