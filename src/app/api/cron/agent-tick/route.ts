// GET|POST /api/cron/agent-tick
// Cron worker that drains the agent task queue. Picks up to 5 queued tasks
// (oldest first) and runs each through the task runner. Authenticated via
// CRON_SECRET bearer token.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { runTask } from '@/lib/agents/runner'
import { processDueSequences } from '@/lib/outreach/sequences'
import { guardCronEnv, notifyOps } from '@/lib/env'

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
      return NextResponse.json({ processed: 0, sequencesPromoted, message: 'Kuyruk boş' })
    }

    const results: Array<{ id: string; agent_key: string; ok: boolean }> = []
    for (const task of tasks) {
      const result = await runTask(task)
      results.push({ id: task.id, agent_key: task.agent_key, ok: result.ok })
    }

    return NextResponse.json({ processed: results.length, sequencesPromoted, results })
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
