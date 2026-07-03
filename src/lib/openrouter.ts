import { supabaseAdmin } from './supabase'
import { getMonthlyCapUsd } from './ai/caps'
import { logAiCostRow } from './ai/costLog'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const BASE_URL = 'https://openrouter.ai/api/v1'

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

  // Lead Intelligence v2 konseyi — hafif kritikler + haiku chair.
  // Design Critic multimodal (screenshot signed URL) alır; flash-lite vision destekler.
  lead_intel_design_critic:      { model: 'google/gemini-2.5-flash-lite', tier: 'light' },
  lead_intel_automation_analyst: { model: 'google/gemini-2.5-flash-lite', tier: 'light' },
  lead_intel_skeptic:            { model: 'google/gemini-2.5-flash-lite', tier: 'light' },
  lead_intel_chair:              { model: 'anthropic/claude-haiku-4-5',   tier: 'medium' },
}

// Per-million-token maliyet oranları (USD) — TAHMİNDİR, sabit gerçek değil.
// input/output ayrık; settings tablosundaki 'ai_token_rates' JSON satırı bu
// default'ları model bazında ezebilir (deploy gerekmez). Gerçek harcama
// ai_cost_logs'tan izlenir.
export interface TokenRate {
  input: number
  output: number
}

const TOKEN_RATES_PER_M: Record<string, TokenRate> = {
  'google/gemini-2.5-flash-lite': { input: 0.05, output: 0.05 },
  'anthropic/claude-haiku-4-5':   { input: 0.25, output: 0.25 },
  'deepseek/deepseek-v4-flash':   { input: 0.1,  output: 0.1 },
  'deepseek/deepseek-v4-pro':     { input: 0.5,  output: 0.5 },
}

const DEFAULT_RATE: TokenRate = { input: 0.1, output: 0.1 }

// settings.ai_token_rates override'ı — 5 dk cache'li, hata halinde sessizce default.
let rateOverrideCache: { rates: Record<string, TokenRate>; loadedAt: number } | null = null
const RATE_CACHE_TTL_MS = 5 * 60 * 1000

async function loadRateOverrides(): Promise<Record<string, TokenRate>> {
  if (rateOverrideCache && Date.now() - rateOverrideCache.loadedAt < RATE_CACHE_TTL_MS) {
    return rateOverrideCache.rates
  }
  try {
    const { data } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'ai_token_rates')
      .maybeSingle()
    const parsed = data?.value
    const rates: Record<string, TokenRate> = {}
    if (parsed && typeof parsed === 'object') {
      for (const [model, rate] of Object.entries(parsed as Record<string, unknown>)) {
        if (
          rate && typeof rate === 'object' &&
          typeof (rate as TokenRate).input === 'number' &&
          typeof (rate as TokenRate).output === 'number'
        ) {
          rates[model] = rate as TokenRate
        }
      }
    }
    rateOverrideCache = { rates, loadedAt: Date.now() }
    return rates
  } catch {
    rateOverrideCache = { rates: {}, loadedAt: Date.now() }
    return {}
  }
}

export async function getTokenRate(model: string): Promise<TokenRate> {
  const overrides = await loadRateOverrides()
  return overrides[model] ?? TOKEN_RATES_PER_M[model] ?? DEFAULT_RATE
}

export function getModel(operation: string): { model: string; tier: ModelTier } {
  return OPERATION_MODEL_MAP[operation] ?? { model: 'google/gemini-2.5-flash-lite', tier: 'light' }
}

interface OpenRouterResponse {
  id?: string
  choices: { message: { content: string; tool_calls?: ToolCall[] } }[]
  // usage.cost: OpenRouter'ın gerçek USD maliyeti (usage:{include:true} ile gelir).
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost?: number }
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

// Belirli tarihten bu yana (opsiyonel operation prefix filtreli) toplam harcama.
// Lead Intelligence günlük tavanı (budget.ts) 'lead_intel_' prefix'iyle kullanır.
export async function getSpendSince(sinceIso: string, operationPrefix?: string): Promise<number> {
  try {
    let query = supabaseAdmin
      .from('ai_cost_logs')
      .select('cost_usd')
      .gte('created_at', sinceIso)
    if (operationPrefix) query = query.like('operation', `${operationPrefix}%`)

    const { data } = await query
    return (data ?? []).reduce(
      (sum: number, row: { cost_usd: number }) => sum + (row.cost_usd ?? 0),
      0
    )
  } catch {
    return 0
  }
}

async function getMonthlySpend(): Promise<number> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  return getSpendSince(startOfMonth)
}

async function logAiCost(
  operation: string,
  modelUsed: string,
  tier: ModelTier,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
  agentKey?: string,
  relatedLeadId?: string | null,
  generationId?: string | null,
  actualCostUsd?: number | null
) {
  // cost_usd DAİMA tahmini (parity); gerçek OpenRouter maliyeti actual_cost_usd'ye.
  await logAiCostRow({
    operation,
    model_used: modelUsed,
    model_tier: tier,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: costUsd,
    cost_tl: costUsd * 38,
    agent_key: agentKey ?? null,
    related_lead_id: relatedLeadId ?? null,
    generation_id: generationId ?? null,
    actual_cost_usd: actualCostUsd ?? null,
    cost_source: 'estimated',
  })
}

// Multimodal içerik parçası (OpenRouter/OpenAI standart formatı).
// Design Critic screenshot'ı signed URL ile image_url parçası olarak alır.
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

async function callOpenRouter(
  operation: string,
  tier: ModelTier,
  model: string,
  systemPrompt: string,
  userPrompt: string | ContentPart[],
  maxTokens: number = 1000,
  tools?: JarvisTool[],
  agentKey?: string,
  relatedLeadId?: string | null
): Promise<{ content: string; toolCalls?: ToolCall[]; usage: { promptTokens: number; completionTokens: number }; costUsd: number }> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY ortam değişkeni ayarlanmamış.')
  }

  const monthlyCapUsd = await getMonthlyCapUsd()
  const monthlySpend = await getMonthlySpend()
  if (monthlySpend >= monthlyCapUsd) {
    throw new Error(
      `Aylık AI maliyet limiti aşıldı ($${monthlyCapUsd}). Ay sıfırlanana kadar AI kullanılamaz.`
    )
  }

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: maxTokens,
    temperature: 0.7,
    // Gerçek USD maliyeti yanıt gövdesinde döndür (gözlem; cost_usd hâlâ tahmini).
    usage: { include: true }
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

  // input/output ayrık oranlarla maliyet (oranlar tahmindir; settings override edebilir).
  const rate = await getTokenRate(model)
  const costUsd =
    (data.usage.prompt_tokens / 1_000_000) * rate.input +
    (data.usage.completion_tokens / 1_000_000) * rate.output

  // Gözlem: gerçek generation id + gerçek USD (varsa). cost_usd DEĞİŞMEZ (parity).
  const generationId = data.id ?? null
  const actualCostUsd = typeof data.usage.cost === 'number' ? data.usage.cost : null

  await logAiCost(
    operation,
    data.model,
    tier,
    data.usage.prompt_tokens,
    data.usage.completion_tokens,
    costUsd,
    agentKey,
    relatedLeadId,
    generationId,
    actualCostUsd
  )

  return {
    content,
    toolCalls,
    usage: {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
    },
    costUsd,
  }
}

// Multimodal operation-aware call — Lead Intelligence konseyi için.
// parts: metin + opsiyonel image_url (private bucket signed URL). Dönen content
// çağıran tarafta zod ile parse edilir; burada serbest metin karar verisi DEĞİLDİR.
// meta.agentKey sabit ajan kimliğidir; meta.relatedLeadId maliyet kaydını lead'e bağlar.
// costUsd dönüşü: assessment-düzeyi gerçek maliyet muhasebesi (retry'lar dahil edilsin
// diye çağıran taraf her çağrının maliyetini toplar).
export async function callWithOperationMultimodal(
  operation: string,
  systemPrompt: string,
  parts: ContentPart[],
  maxTokens: number = 1200,
  meta: { agentKey?: string; relatedLeadId?: string | null } = {}
): Promise<{ content: string; usage: { promptTokens: number; completionTokens: number }; costUsd: number }> {
  const { model, tier } = getModel(operation)
  const result = await callOpenRouter(
    operation,
    tier,
    model,
    systemPrompt,
    parts,
    maxTokens,
    undefined,
    meta.agentKey,
    meta.relatedLeadId
  )
  return { content: result.content, usage: result.usage, costUsd: result.costUsd }
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
  const capUsd = await getMonthlyCapUsd()
  return {
    spentUsd,
    capUsd,
    percentUsed: capUsd > 0 ? Math.round((spentUsd / capUsd) * 100) : 0
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
