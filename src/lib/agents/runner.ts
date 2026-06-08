import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { callAgentModel } from '@/lib/openrouter'
import { getAgent, setAgentStatus, buildAgentSystemPrompt } from './registry'

export type TaskStatus = 'queued' | 'working' | 'done' | 'error'

// One row of the `agent_tasks` work queue (migration 009).
export interface AgentTask {
  id: string
  directive_id: string | null
  agent_key: string
  title: string
  input: Record<string, unknown>
  status: TaskStatus
}

export interface TaskResult {
  ok: boolean
  output: string
  tokensIn: number
  tokensOut: number
  error?: string
}

// Executes a single queued task end-to-end. Worker-ready: callable from the
// serverless tick OR a future persistent worker. Loads the agent, pulls
// deterministic context, calls the model, and records result + telemetry.
export async function runTask(task: AgentTask): Promise<TaskResult> {
  const agent = await getAgent(task.agent_key)
  if (!agent) {
    const error = `Ajan "${task.agent_key}" registry'de bulunamadı veya pasif.`
    await failTask(task.id, error)
    return { ok: false, output: '', tokensIn: 0, tokensOut: 0, error }
  }

  await Promise.all([
    setAgentStatus(agent.key, 'working'),
    supabaseAdmin
      .from('agent_tasks')
      .update({ status: 'working', started_at: new Date().toISOString() })
      .eq('id', task.id),
  ])

  try {
    const context = await gatherContext(task.agent_key, task.input)
    const systemPrompt = buildAgentSystemPrompt(agent, context)
    const userPrompt = buildUserPrompt(task)

    const { content, tokensIn, tokensOut } = await callAgentModel({
      model: agent.model,
      agentKey: agent.key,
      systemPrompt,
      userPrompt,
    })

    await supabaseAdmin
      .from('agent_tasks')
      .update({
        status: 'done',
        result: { output: content },
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        finished_at: new Date().toISOString(),
      })
      .eq('id', task.id)

    await setAgentStatus(agent.key, 'idle')
    return { ok: true, output: content, tokensIn, tokensOut }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata'
    await failTask(task.id, message)
    await setAgentStatus(agent.key, 'error')
    return { ok: false, output: '', tokensIn: 0, tokensOut: 0, error: message }
  }
}

async function failTask(taskId: string, error: string): Promise<void> {
  await supabaseAdmin
    .from('agent_tasks')
    .update({ status: 'error', error, finished_at: new Date().toISOString() })
    .eq('id', taskId)
}

function buildUserPrompt(task: AgentTask): string {
  const lines = [`Görev: ${task.title}`]
  const input = task.input ?? {}
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined || value === '') continue
    const rendered = typeof value === 'string' ? value : JSON.stringify(value)
    lines.push(`${key}: ${rendered}`)
  }
  lines.push('\nGörevi yukarıdaki güncel veriyi kullanarak tamamla. Çıktın doğrudan kullanılabilir olsun.')
  return lines.join('\n')
}

// --- Deterministic context: pull real data per agent and feed it to the model.
// v1 avoids live tool-calling; this is the data the agent reasons over. ---

async function gatherContext(agentKey: string, _input: Record<string, unknown>): Promise<string> {
  try {
    switch (agentKey) {
      case 'sales_rep':
        return await qualifiedLeadsContext()
      case 'researcher':
        return await researcherContext()
      case 'data_analyst':
        return await funnelContext()
      case 'cmo':
        return await sectorMixContext()
      default:
        return ''
    }
  } catch (error) {
    console.error(`gatherContext(${agentKey}) başarısız:`, error)
    return ''
  }
}

// Sales Rep: top A/B leads with pitch material.
async function qualifiedLeadsContext(): Promise<string> {
  const { data: leads } = await supabaseAdmin
    .from('leads')
    .select(
      'business_name, sector, city, district, phone, lead_tier, quality_score, conversion_probability, why_this_will_convert, conversion_angle, expected_monthly_value_tl'
    )
    .in('lead_tier', ['A', 'B'])
    .is('disqualification_reason', null)
    .in('status', ['new', 'contacted'])
    .order('quality_score', { ascending: false })
    .limit(10)

  if (!leads || leads.length === 0) return 'Nitelikli (A/B tier) lead bulunmuyor. Önce tarama yapılmalı.'

  const lines = leads.map((l, i) => {
    const val = l.expected_monthly_value_tl ? `₺${l.expected_monthly_value_tl}/ay` : 'değer belirsiz'
    return `${i + 1}. ${l.business_name} [${l.lead_tier}] (${l.sector ?? '?'}, ${l.city ?? ''}/${l.district ?? ''}) — Kalite ${l.quality_score ?? 0} | Dönüşüm %${l.conversion_probability ?? 0} | ${val}
   Açı: ${l.conversion_angle ?? '—'} | Neden dönüşür: ${l.why_this_will_convert ?? '—'} | Tel: ${l.phone ?? 'YOK'}`
  })
  return `NİTELİKLİ LEAD'LER (A/B tier, en yüksek kalite):\n${lines.join('\n')}`
}

// Researcher: best sectors to scan + recent high-confidence trend signals.
async function researcherContext(): Promise<string> {
  const { getSectorOpportunities } = await import('@/lib/sectorOpportunityEngine')
  const sectors = getSectorOpportunities(5)
  const sectorLines = sectors.map(
    (s, i) =>
      `${i + 1}. ${s.displayName} (skor ${s.sector_opportunity_score}) — ${s.reason_to_target_now} | En iyi teklif: ${s.best_offer}`
  )

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: signals } = await supabaseAdmin
    .from('opportunity_trend_signals')
    .select('source, title, confidence_score, status')
    .gte('collected_at', sevenDaysAgo)
    .gte('confidence_score', 30)
    .order('confidence_score', { ascending: false })
    .limit(8)

  const signalLines =
    signals && signals.length > 0
      ? signals.map((s, i) => `${i + 1}. [${s.source}] ${s.title} — güven ${s.confidence_score}/100 (${s.status})`)
      : ['Son 7 günde kayda değer sinyal yok.']

  return `FIRSAT SEKTÖRLERİ:\n${sectorLines.join('\n')}\n\nSON 7 GÜN TREND SİNYALLERİ:\n${signalLines.join('\n')}`
}

// Data Analyst: lead funnel counts by status.
async function funnelContext(): Promise<string> {
  const { data: leads } = await supabaseAdmin.from('leads').select('status, lead_tier').limit(2000)
  if (!leads || leads.length === 0) return 'Funnel için lead verisi yok.'

  const byStatus = countBy(leads, (l) => (l.status as string) ?? 'unknown')
  const byTier = countBy(leads, (l) => (l.lead_tier as string) ?? 'unrated')

  const { data: projects } = await supabaseAdmin.from('projects').select('status, monthly_fee').limit(500)
  const activeProjects = (projects ?? []).filter((p) => p.status === 'active')
  const mrr = activeProjects.reduce((sum, p) => sum + ((p.monthly_fee as number) ?? 0), 0)

  return `LEAD FUNNEL (toplam ${leads.length}):
Durum: ${formatCounts(byStatus)}
Tier: ${formatCounts(byTier)}
PROJELER: ${activeProjects.length} aktif | Aylık tekrarlayan gelir (MRR): ₺${mrr}`
}

// CMO: which sectors dominate the qualified pipeline (content targeting).
async function sectorMixContext(): Promise<string> {
  const { data: leads } = await supabaseAdmin
    .from('leads')
    .select('sector')
    .in('lead_tier', ['A', 'B'])
    .is('disqualification_reason', null)
    .limit(1000)

  if (!leads || leads.length === 0) return 'Nitelikli lead sektör dağılımı için veri yok.'
  const bySector = countBy(leads, (l) => (l.sector as string) ?? 'Bilinmeyen')
  return `NİTELİKLİ PIPELINE SEKTÖR DAĞILIMI (A/B tier):\n${formatCounts(bySector)}`
}

function countBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = keyOf(row)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function formatCounts(counts: Map<string, number>): string {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => `${key}: ${n}`)
    .join(' | ')
}
