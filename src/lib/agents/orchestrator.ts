import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { callAgentModel } from '@/lib/openrouter'
import { getAgent, getAgents, setAgentStatus, buildAgentSystemPrompt } from './registry'
import { runTask, type AgentTask } from './runner'
import { parsePlan, type PlanStep } from './planParser'

// Max tasks executed inline per directive. Serverless functions cap at ~300s, so
// a CEO plan is bounded here; overflow stays 'queued' for the agent-tick worker.
const MAX_INLINE_TASKS = 5

const CEO_KEY = 'ceo'

export interface DirectiveResult {
  directiveId: string
  status: 'done' | 'error'
  debrief: string
  taskCount: number
  error?: string
}

// Full directive lifecycle: persist → CEO decomposes into tasks → queue →
// execute inline (bounded) → CEO synthesizes an operator debrief → mark done.
export async function runDirective(operatorInput: string): Promise<DirectiveResult> {
  const trimmed = operatorInput?.trim()
  if (!trimmed) throw new Error('Operatör komutu boş olamaz.')

  const directiveId = await createDirective(trimmed)

  try {
    const ceo = await getAgent(CEO_KEY)
    if (!ceo) throw new Error('CEO ajanı registry\'de yok — migration 009 seed eksik.')

    await setDirectiveStatus(directiveId, 'planning')
    await setAgentStatus(CEO_KEY, 'working')

    const specialists = (await getAgents()).filter((a) => a.key !== CEO_KEY)
    const plan = await buildPlan(ceo, trimmed, specialists.map((a) => ({ key: a.key, role: a.role })))

    await supabaseAdmin.from('directives').update({ plan, status: 'running' }).eq('id', directiveId)

    const tasks = await queueTasks(directiveId, plan)
    const completed = await executeInline(tasks)

    const debrief = await buildDebrief(ceo, trimmed, completed)
    await supabaseAdmin
      .from('directives')
      .update({ status: 'done', debrief, finished_at: new Date().toISOString() })
      .eq('id', directiveId)

    await setAgentStatus(CEO_KEY, 'idle')
    return { directiveId, status: 'done', debrief, taskCount: tasks.length }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata'
    await supabaseAdmin
      .from('directives')
      .update({ status: 'error', error: message, finished_at: new Date().toISOString() })
      .eq('id', directiveId)
    await setAgentStatus(CEO_KEY, 'error')
    return { directiveId, status: 'error', debrief: '', taskCount: 0, error: message }
  }
}

async function createDirective(operatorInput: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('directives')
    .insert({ operator_input: operatorInput, status: 'queued' })
    .select('id')
    .single()

  if (error || !data) throw new Error(`Direktif kaydedilemedi: ${error?.message ?? 'bilinmeyen'}`)
  return data.id as string
}

async function setDirectiveStatus(id: string, status: string): Promise<void> {
  await supabaseAdmin.from('directives').update({ status }).eq('id', id)
}

// CEO decomposes the directive into a task list. Output is forced to a JSON
// array; we parse defensively and keep only steps targeting real specialists.
async function buildPlan(
  ceo: Awaited<ReturnType<typeof getAgent>>,
  operatorInput: string,
  specialists: { key: string; role: string }[]
): Promise<PlanStep[]> {
  if (!ceo) throw new Error('CEO ajanı yüklenemedi.')

  const roster = specialists.map((s) => `- ${s.key}: ${s.role}`).join('\n')
  const systemPrompt = await buildAgentSystemPrompt(
    ceo,
    `Uzman ajan kadrosu (yalnızca bu key'leri kullan):\n${roster}`
  )

  const planInstruction = `Operatör direktifi: "${operatorInput}"

Bu direktifi uzman ajanlara dağıtılacak ${MAX_INLINE_TASKS} veya daha az alt göreve böl.
SADECE geçerli JSON dizi döndür, başka metin yazma. Format:
[{"agent_key":"sales_rep","title":"kısa görev başlığı","input":{"brief":"ajana özel net talimat"}}]
Kurallar: agent_key yukarıdaki listeden olmalı. En değerli, paraya en yakın işleri öne al. Gereksiz görev ekleme.`

  const { content } = await callAgentModel({
    model: ceo.model,
    agentKey: ceo.key,
    systemPrompt,
    userPrompt: planInstruction,
    maxTokens: 900,
  })

  const validKeys = new Set(specialists.map((s) => s.key))
  const parsed = parsePlan(content).filter((step) => validKeys.has(step.agent_key))
  if (parsed.length === 0) throw new Error('CEO geçerli bir plan üretemedi (boş veya bilinmeyen ajan).')
  return parsed.slice(0, MAX_INLINE_TASKS)
}

async function queueTasks(directiveId: string, plan: PlanStep[]): Promise<AgentTask[]> {
  const rows = plan.map((step) => ({
    directive_id: directiveId,
    agent_key: step.agent_key,
    title: step.title,
    input: step.input,
    status: 'queued' as const,
  }))

  const { data, error } = await supabaseAdmin
    .from('agent_tasks')
    .insert(rows)
    .select('id, directive_id, agent_key, title, input, status')

  if (error || !data) throw new Error(`Görevler kuyruğa eklenemedi: ${error?.message ?? 'bilinmeyen'}`)
  return data as AgentTask[]
}

interface CompletedTask {
  title: string
  agentKey: string
  output: string
  ok: boolean
  error?: string
}

// Run tasks sequentially so per-agent status stays coherent and we surface a
// clear failure point. Bounded by MAX_INLINE_TASKS upstream.
async function executeInline(tasks: AgentTask[]): Promise<CompletedTask[]> {
  const completed: CompletedTask[] = []
  for (const task of tasks) {
    const result = await runTask(task)
    completed.push({
      title: task.title,
      agentKey: task.agent_key,
      output: result.output,
      ok: result.ok,
      error: result.error,
    })
  }
  return completed
}

// CEO synthesizes the operator-facing debrief from each task's output.
async function buildDebrief(
  ceo: Awaited<ReturnType<typeof getAgent>>,
  operatorInput: string,
  completed: CompletedTask[]
): Promise<string> {
  if (!ceo) return formatFallbackDebrief(completed)
  if (completed.length === 0) return 'Hiç görev çalıştırılmadı.'

  const results = completed
    .map(
      (c, i) =>
        `${i + 1}. [${c.agentKey}] ${c.title} — ${c.ok ? 'TAMAM' : 'HATA: ' + (c.error ?? '?')}\n${c.output || '(çıktı yok)'}`
    )
    .join('\n\n')

  try {
    const { content } = await callAgentModel({
      model: ceo.model,
      agentKey: ceo.key,
      systemPrompt: await buildAgentSystemPrompt(ceo),
      userPrompt: `Operatör direktifi: "${operatorInput}"

Uzman ajanların görev çıktıları:
${results}

Operatöre özet (debrief) yaz: ne yapıldı, en önemli bulgular, önerilen sonraki adım(lar). Kısa ve eyleme dönük. Operatör onayı gereken gönderimler varsa açıkça belirt.`,
      maxTokens: 800,
    })
    return content || formatFallbackDebrief(completed)
  } catch {
    return formatFallbackDebrief(completed)
  }
}

function formatFallbackDebrief(completed: CompletedTask[]): string {
  return completed
    .map((c) => `• [${c.agentKey}] ${c.title}: ${c.ok ? 'tamamlandı' : 'hata — ' + (c.error ?? '?')}`)
    .join('\n')
}
