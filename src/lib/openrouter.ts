import { supabaseAdmin } from './supabase'
import { getMonthlyCapUsd } from './ai/caps'
import { logAiCostRow } from './ai/costLog'
import { LIVE_TOKEN_RATES_PER_M, ProviderPolicy, RoutePreset, allPresetModelIds } from './models/presets'
import {
  getPresetByKey,
  presetTierToModelTier,
  resolveOperationPreset,
  resolveOperationPresetStatic,
} from './models/registry'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const BASE_URL = 'https://openrouter.ai/api/v1'

type ModelTier = 'light' | 'medium' | 'heavy'

// Model routing artık merkezi preset registry'den çözülür
// (src/lib/models/presets.ts + registry.ts — 16-openrouter-routing.md §3-5).
// Ham model ID bu dosyada YAŞAMAZ; tek istisna legacy callAgentModel'in
// geriye-uyumlu raw-model yolu (agents registry'den gelen değer).

// Per-million-token maliyet oranları (USD) — TAHMİNDİR, sabit gerçek değil.
// Canlı katalog fiyatları models/presets.ts'ten gelir; settings tablosundaki
// 'ai_token_rates' JSON satırı bu default'ları model bazında ezebilir
// (deploy gerekmez). Gerçek harcama ai_cost_logs'tan izlenir.
export interface TokenRate {
  input: number
  output: number
}

const TOKEN_RATES_PER_M: Record<string, TokenRate> = LIVE_TOKEN_RATES_PER_M

const DEFAULT_RATE: TokenRate = { input: 0.5, output: 2.0 }

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

/** Geriye-uyumlu imza: operation → { model, tier }. Model artık preset'in
 *  primary'sidir (statik çözümleme). Self-heal fallback zinciri isteyen
 *  çağıranlar getRouteForOperation kullanmalı. */
export function getModel(operation: string): { model: string; tier: ModelTier } {
  const preset = resolveOperationPresetStatic(operation)
  return { model: preset.primary, tier: presetTierToModelTier(preset.tier) }
}

// Çözülmüş route — callOpenRouter'ın tek routing girdisi.
export interface ResolvedRoute {
  presetKey: string | null      // null = legacy raw-model yolu (callAgentModel)
  models: string[]              // [primary, ...fallbacks] — body.models self-heal
  provider?: ProviderPolicy
  timeoutMs: number
  maxRetries: number
  tier: ModelTier
  ceiling?: { prompt: number; completion: number }
}

function presetToRoute(preset: RoutePreset): ResolvedRoute {
  return {
    presetKey: preset.key,
    models: [preset.primary, ...preset.fallbacks],
    provider: preset.provider,
    timeoutMs: preset.timeoutMs,
    maxRetries: preset.maxRetries,
    tier: presetTierToModelTier(preset.tier),
    ceiling: preset.ceiling,
  }
}

/** Senkron route çözümleme (statik preset) — stream route gibi callOpenRouter
 *  dışı çağıranlar için: models[] + provider politikasını dışarı verir. */
export function getRouteForOperation(operation: string): ResolvedRoute {
  return presetToRoute(resolveOperationPresetStatic(operation))
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

// Multimodal içerik parçası (OpenRouter/OpenAI standart formatı).
// Design Critic screenshot'ı signed URL ile image_url parçası olarak alır.
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

// require_parameters'ın amacı fallback'in TOOL/VISION desteğini zorlamaktır
// (16 §4.5). Sampling paramlarına (temperature) uygulanırsa frontier reasoning
// modellerinin endpoint'leri (temperature desteklemez) filtrelenip 404
// "No endpoints found" doğurur — canlı doğrulanan davranış. Bu yüzden:
//   · require_parameters YALNIZ istek gerçekten tools/vision içeriyorsa gönderilir
//   · gönderildiğinde temperature body'den düşülür (filtre yalnız tool/vision'ı zorlar)
function buildProviderBody(route: ResolvedRoute, needsParams: boolean): Record<string, unknown> | undefined {
  const p = route.provider
  const body: Record<string, unknown> = {}
  // models[] gönderildiğinde self-heal için allow_fallbacks daima açık.
  if (route.models.length > 1) body.allow_fallbacks = p?.allowFallbacks ?? true
  if (p?.requireParameters && needsParams) body.require_parameters = true
  if (p?.dataCollection) body.data_collection = p.dataCollection
  if (p?.sort) body.sort = p.sort
  if (p?.zdr) body.zdr = true
  if (route.ceiling) {
    body.max_price = { prompt: route.ceiling.prompt, completion: route.ceiling.completion }
  }
  return Object.keys(body).length > 0 ? body : undefined
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
}

const RETRY_BACKOFF_MS = 300

// Tek fetch denemesi: AbortController timeout'lu. Başarıda parse edilmiş yanıt,
// retryable hatada throw (çağıran retry döngüsü devralır).
async function attemptOpenRouterFetch(
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<OpenRouterResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://grafikcem.agency',
        'X-Title': 'Grafikcem Agency OS'
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      let message = response.statusText
      try {
        const errorData = await response.json()
        message = errorData.error?.message || message
      } catch { /* gövde JSON değilse statusText yeter */ }
      const err = new Error(`OpenRouter API Hatası: ${message}`) as Error & { status?: number }
      err.status = response.status
      throw err
    }

    return (await response.json()) as OpenRouterResponse
  } finally {
    clearTimeout(timer)
  }
}

async function callOpenRouter(
  operation: string,
  route: ResolvedRoute,
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

  const primary = route.models[0]
  const hasTools = Boolean(tools && tools.length > 0)
  const hasVision = Array.isArray(userPrompt) && userPrompt.some((p) => p.type === 'image_url')
  const needsParams = hasTools || hasVision

  const body: Record<string, unknown> = {
    model: primary,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: maxTokens,
    // Gerçek USD maliyeti yanıt gövdesinde döndür (gözlem; cost_usd hâlâ tahmini).
    usage: { include: true }
  }
  // temperature yalnız require_parameters gönderilmeyecekse eklenir (yukarıdaki
  // buildProviderBody notu — endpoint filtresi 404'ünün canlı-doğrulanmış fixi).
  const willRequireParams = Boolean(route.provider?.requireParameters && needsParams)
  if (!willRequireParams) body.temperature = 0.7
  // Self-heal fallback dizisi: primary 404/5xx olursa OpenRouter otomatik
  // sonraki modele geçer (16 §4.1 — ölü-ID sorununun kalıcı çözümü).
  if (route.models.length > 1) body.models = route.models
  const providerBody = buildProviderBody(route, needsParams)
  if (providerBody) body.provider = providerBody

  if (hasTools && tools) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  // 1 retry (429/5xx/timeout/network) — kalıcı 4xx retry edilmez; onları
  // models[] zinciri sağlayıcı tarafında devralır (16 §4.3).
  let data: OpenRouterResponse | null = null
  let retryCount = 0
  let lastError: unknown = null
  const maxAttempts = Math.max(1, route.maxRetries + 1)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      data = await attemptOpenRouterFetch(body, route.timeoutMs)
      break
    } catch (err) {
      lastError = err
      const status = (err as { status?: number }).status
      const retryable = isAbortError(err) || (typeof status === 'number' && isRetryableStatus(status)) || status === undefined
      if (!retryable || attempt === maxAttempts - 1) throw err
      retryCount = attempt + 1
      console.warn(
        `[model.retry] operation=${operation} preset=${route.presetKey ?? 'raw'} attempt=${retryCount} reason=${err instanceof Error ? err.name + ':' + (status ?? '') : 'unknown'}`
      )
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * (attempt + 1)))
    }
  }
  if (!data) throw lastError instanceof Error ? lastError : new Error('OpenRouter isteği başarısız.')

  const message = data.choices[0]?.message
  const content = message?.content ?? ''
  const toolCalls = message?.tool_calls

  // Görünür fallback logu — sessiz düşüş YASAK (16 §4.4). data.model fiilen
  // yanıtlayan modeldir; primary'den farklıysa fallback devrededir.
  const servedModel = data.model || primary
  const fallbackUsed = servedModel !== primary
  if (fallbackUsed) {
    console.warn(
      `[model.fallback.used] operation=${operation} preset=${route.presetKey ?? 'raw'} primary=${primary} served=${servedModel} retryCount=${retryCount}`
    )
  }

  // input/output ayrık oranlarla maliyet (oranlar tahmindir; settings override edebilir).
  const rate = await getTokenRate(servedModel)
  const costUsd =
    (data.usage.prompt_tokens / 1_000_000) * rate.input +
    (data.usage.completion_tokens / 1_000_000) * rate.output

  // Gözlem: gerçek generation id + gerçek USD (varsa). cost_usd DEĞİŞMEZ (parity).
  const generationId = data.id ?? null
  const actualCostUsd = typeof data.usage.cost === 'number' ? data.usage.cost : null

  // cost_usd DAİMA tahmini (parity); gerçek OpenRouter maliyeti actual_cost_usd'ye.
  await logAiCostRow({
    operation,
    model_used: servedModel,
    model_tier: route.tier,
    input_tokens: data.usage.prompt_tokens,
    output_tokens: data.usage.completion_tokens,
    cost_usd: costUsd,
    cost_tl: costUsd * 38,
    agent_key: agentKey ?? null,
    related_lead_id: relatedLeadId ?? null,
    generation_id: generationId,
    actual_cost_usd: actualCostUsd,
    cost_source: 'estimated',
    preset_key: route.presetKey,
    fallback_used: fallbackUsed,
    retry_count: retryCount,
  })

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
  const preset = await resolveOperationPreset(operation)
  const result = await callOpenRouter(
    operation,
    presetToRoute(preset),
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
  const preset = await resolveOperationPreset(operation)
  return callOpenRouter(operation, presetToRoute(preset), systemPrompt, userPrompt, maxTokens, tools)
}

// Map an arbitrary model id to a cost tier (used only for logging classification).
function getTierForModel(model: string): ModelTier {
  if (model.includes('pro') || model.includes('opus') || model.includes('gpt-5')) return 'heavy'
  if (model.includes('haiku') || model.includes('sonnet') || model.includes('flash-lite')) return 'medium'
  return 'light'
}

// Agent-scoped call: runs a specific model (from the agents registry), tags the
// cost log with the agent key, and returns token usage for task telemetry.
// Geriye-uyumlu raw-model yolu (16 §5): agents registry ham model taşıyabilir;
// tercih preset'e kayar ama bu yol kırılmaz. Timeout+retry yine uygulanır.
export async function callAgentModel(opts: {
  model: string
  agentKey: string
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  tools?: JarvisTool[]
}): Promise<{ content: string; toolCalls?: ToolCall[]; tokensIn: number; tokensOut: number }> {
  // Faz 5 (audit bulgu #4): DB'den gelen model ID doğrulanır. Preset
  // kataloğunda olmayan (drift'e açık) bir ID'ye professional zincirinden
  // fallback eklenir — ID katalogdan düşerse çağrı sessizce 404'e gömülmez,
  // self-heal + görünür log devreye girer. Timeout/retry/cost-log zaten
  // ortak callOpenRouter yolunda.
  const knownIds = allPresetModelIds()
  const isKnown = knownIds.includes(opts.model)
  let models = [opts.model]
  if (!isKnown) {
    const professional = getPresetByKey('agencyos-professional')
    const fallbacks = [professional.primary, ...professional.fallbacks].filter((m) => m !== opts.model)
    models = [opts.model, ...fallbacks]
    console.warn(
      `[model.unverified] agent=${opts.agentKey} model=${opts.model} preset kataloğunda yok — professional fallback zinciri eklendi`
    )
  }
  const route: ResolvedRoute = {
    presetKey: null,
    models,
    ...(models.length > 1 ? { provider: { allowFallbacks: true } } : {}),
    timeoutMs: 45_000,
    maxRetries: 1,
    tier: getTierForModel(opts.model),
  }
  const result = await callOpenRouter(
    `agent:${opts.agentKey}`,
    route,
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

// Legacy tier-based calls — kept for backward compatibility with existing routes.
// İçleri preset çözümlemesine yönlendirildi (16 §5.4); ham model ID yok.
export async function callLight(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 1000
): Promise<string> {
  const preset = await resolveOperationPreset('light_generic')
  const result = await callOpenRouter('light_generic', presetToRoute(preset), systemPrompt, userPrompt, maxTokens)
  return result.content
}

export async function callMedium(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 1000
): Promise<string> {
  const preset = await resolveOperationPreset('medium_generic')
  const result = await callOpenRouter('medium_generic', presetToRoute(preset), systemPrompt, userPrompt, maxTokens)
  return result.content
}

export async function callHeavy(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 1000
): Promise<string> {
  // heavy_generic → professional; premium-deal yalnız explicit escalation (16 §5).
  const preset = await resolveOperationPreset('heavy_generic')
  const result = await callOpenRouter('heavy_generic', presetToRoute(preset), systemPrompt, userPrompt, maxTokens)
  return result.content
}
