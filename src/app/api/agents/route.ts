// GET /api/agents
// Returns the agent registry enriched with per-agent telemetry aggregated from
// agent_tasks (task counts, token usage) and ai_cost_logs (USD cost).
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'
import { getAgents } from '@/lib/agents/registry'

interface AgentTelemetry {
  taskCount: number
  doneCount: number
  errorCount: number
  tokensIn: number
  tokensOut: number
  costUsd: number
}

export async function GET(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

    const agents = await getAgents()

    const telemetry = new Map<string, AgentTelemetry>()
    const ensure = (key: string): AgentTelemetry => {
      let entry = telemetry.get(key)
      if (!entry) {
        entry = { taskCount: 0, doneCount: 0, errorCount: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 }
        telemetry.set(key, entry)
      }
      return entry
    }

    const { data: tasks } = await supabaseAdmin
      .from('agent_tasks')
      .select('agent_key, status, tokens_in, tokens_out')
      .limit(5000)

    for (const task of tasks ?? []) {
      const key = task.agent_key as string
      if (!key) continue
      const entry = ensure(key)
      entry.taskCount++
      if (task.status === 'done') entry.doneCount++
      if (task.status === 'error') entry.errorCount++
      entry.tokensIn += (task.tokens_in as number) ?? 0
      entry.tokensOut += (task.tokens_out as number) ?? 0
    }

    const { data: costs } = await supabaseAdmin
      .from('ai_cost_logs')
      .select('agent_key, cost_usd')
      .limit(5000)

    for (const log of costs ?? []) {
      const key = log.agent_key as string
      if (!key) continue
      const entry = ensure(key)
      entry.costUsd += (log.cost_usd as number) ?? 0
    }

    const zero: AgentTelemetry = { taskCount: 0, doneCount: 0, errorCount: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 }

    return NextResponse.json({
      agents: agents.map(a => ({ ...a, telemetry: telemetry.get(a.key) ?? zero }))
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Bilinmeyen hata'
    console.error('Agents registry error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
