import { supabaseAdmin } from './supabase'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const BASE_URL = 'https://openrouter.ai/api/v1'
const MONTHLY_COST_CAP_USD = 20

type ModelTier = 'light' | 'medium' | 'heavy'

// Per-operation routing table — every JARVIS tool calls getModel() to pick the right tier
const OPERATION_MODEL_MAP: Record<string, { model: string; tier: ModelTier }> = {
  // Light: conversational, briefing summaries, quick intent detection
  jarvis_chat:         { model: 'google/gemini-2.5-flash-lite', tier: 'light' },
  session_briefing:    { model: 'google/gemini-2.5-flash-lite', tier: 'light' },
  read_knowledge:      { model: 'google/gemini-2.5-flash-lite', tier: 'light' },
  wrap_session:        { model: 'google/gemini-2.5-flash-lite', tier: 'light' },
  build_visual_prompt: { model: 'google/gemini-2.5-flash-lite', tier: 'light' },
  analyze_lead:        { model: 'google/gemini-2.5-flash-lite', tier: 'light' },
  batch_enrichment:    { model: 'google/gemini-2.5-flash-lite', tier: 'light' },

  // Medium: structured generation, cold email, briefing reports
  generate_briefing:   { model: 'anthropic/claude-haiku-4-5', tier: 'medium' },
  draft_email:         { model: 'anthropic/claude-haiku-4-5', tier: 'medium' },
  build_carousel_brief:{ model: 'anthropic/claude-haiku-4-5', tier: 'medium' },
  intent_detection:    { model: 'anthropic/claude-haiku-4-5', tier: 'medium' },

  // Heavy: full proposals only — explicit user approval required before any send
  draft_proposal:      { model: 'deepseek/deepseek-v4-pro', tier: 'heavy' },
}

// Per-million-token cost rates (USD) for accurate cost logging
const TOKEN_RATES_PER_M: Record<string, number> = {
  'google/gemini-2.5-flash-lite': 0.05,
  'anthropic/claude-haiku-4-5':   0.25,
  'deepseek/deepseek-v4-flash':   0.1,
  'deepseek/deepseek-v4-pro':     0.5,
}

export function getModel(operation: string): { model: string; tier: ModelTier } {
  return OPERATION_MODEL_MAP[operation] ?? { model: 'google/gemini-2.5-flash-lite', tier: 'light' }
}

interface OpenRouterResponse {
  choices: { message: { content: string; tool_calls?: ToolCall[] } }[]
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  model: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface JarvisTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

async function getMonthlySpend(): Promise<number> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  try {
    const { data } = await supabaseAdmin
      .from('ai_cost_logs')
      .select('cost_usd')
      .gte('created_at', startOfMonth)

    return (data ?? []).reduce(
      (sum: number, row: { cost_usd: number }) => sum + (row.cost_usd ?? 0),
      0
    )
  } catch {
    return 0
  }
}

async function logAiCost(
  operation: string,
  modelUsed: string,
  tier: ModelTier,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
  agentKey?: string
) {
  try {
    await supabaseAdmin.from('ai_cost_logs').insert({
      operation,
      model_used: modelUsed,
      model_tier: tier,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      cost_tl: costUsd * 38,
      agent_key: agentKey ?? null,
      created_at: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error logging AI cost:', error)
  }
}

async function callOpenRouter(
  operation: string,
  tier: ModelTier,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 1000,
  tools?: JarvisTool[],
  agentKey?: string
): Promise<{ content: string; toolCalls?: ToolCall[]; usage: { promptTokens: number; completionTokens: number } }> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY ortam değişkeni ayarlanmamış.')
  }

  const monthlySpend = await getMonthlySpend()
  if (monthlySpend >= MONTHLY_COST_CAP_USD) {
    throw new Error(
      `Aylık AI maliyet limiti aşıldı ($${MONTHLY_COST_CAP_USD}). Ay sıfırlanana kadar AI kullanılamaz.`
    )
  }

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: maxTokens,
    temperature: 0.7
  }

  if (tools && tools.length > 0) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://grafikcem.agency',
      'X-Title': 'Grafikcem Agency OS'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(`OpenRouter API Hatası: ${errorData.error?.message || response.statusText}`)
  }

  const data: OpenRouterResponse = await response.json()
  const message = data.choices[0]?.message
  const content = message?.content ?? ''
  const toolCalls = message?.tool_calls

  const ratePerM = TOKEN_RATES_PER_M[model] ?? 0.1
  const costUsd = (data.usage.total_tokens / 1_000_000) * ratePerM

  await logAiCost(
    operation,
    data.model,
    tier,
    data.usage.prompt_tokens,
    data.usage.completion_tokens,
    costUsd,
    agentKey
  )

  return {
    content,
    toolCalls,
    usage: {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
    },
  }
}

// Operation-aware call — preferred entry point for all JARVIS tools
export async function callWithOperation(
  operation: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 1000,
  tools?: JarvisTool[]
): Promise<{ content: string; toolCalls?: ToolCall[] }> {
  const { model, tier } = getModel(operation)
  return callOpenRouter(operation, tier, model, systemPrompt, userPrompt, maxTokens, tools)
}

// Map an arbitrary model id to a cost tier (used only for logging classification).
function getTierForModel(model: string): ModelTier {
  if (model.includes('pro') || model.includes('opus') || model.includes('gpt-5')) return 'heavy'
  if (model.includes('haiku') || model.includes('sonnet') || model.includes('flash-lite')) return 'medium'
  return 'light'
}

// Agent-scoped call: runs a specific model (from the agents registry), tags the
// cost log with the agent key, and returns token usage for task telemetry.
export async function callAgentModel(opts: {
  model: string
  agentKey: string
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  tools?: JarvisTool[]
}): Promise<{ content: string; toolCalls?: ToolCall[]; tokensIn: number; tokensOut: number }> {
  const tier = getTierForModel(opts.model)
  const result = await callOpenRouter(
    `agent:${opts.agentKey}`,
    tier,
    opts.model,
    opts.systemPrompt,
    opts.userPrompt,
    opts.maxTokens ?? 1200,
    opts.tools,
    opts.agentKey
  )
  return {
    content: result.content,
    toolCalls: result.toolCalls,
    tokensIn: result.usage.promptTokens,
    tokensOut: result.usage.completionTokens,
  }
}

// Monthly spend stats — used by dashboard cost widget
export async function getMonthlyAiStats(): Promise<{
  spentUsd: number
  capUsd: number
  percentUsed: number
}> {
  const spentUsd = await getMonthlySpend()
  return {
    spentUsd,
    capUsd: MONTHLY_COST_CAP_USD,
    percentUsed: Math.round((spentUsd / MONTHLY_COST_CAP_USD) * 100)
  }
}

// Legacy tier-based calls — kept for backward compatibility with existing routes
export async function callLight(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 1000
): Promise<string> {
  const result = await callOpenRouter(
    'light_generic',
    'light',
    'google/gemini-2.5-flash-lite',
    systemPrompt,
    userPrompt,
    maxTokens
  )
  return result.content
}

export async function callMedium(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 1000
): Promise<string> {
  const result = await callOpenRouter(
    'medium_generic',
    'medium',
    'anthropic/claude-haiku-4-5',
    systemPrompt,
    userPrompt,
    maxTokens
  )
  return result.content
}

export async function callHeavy(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 1000
): Promise<string> {
  const result = await callOpenRouter(
    'heavy_generic',
    'heavy',
    'deepseek/deepseek-v4-pro',
    systemPrompt,
    userPrompt,
    maxTokens
  )
  return result.content
}
