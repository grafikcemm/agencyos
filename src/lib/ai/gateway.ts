// AI Gateway (Faz 0) — tek yönlendirilmiş LLM çağrı yüzeyi.
//
// Amaç: assistant/llm.ts'in ÖNCEDEN TAKİPSİZ/TAVANSIZ olan mentor+reminder
// harcamasını tek bir yerden loglamak + aylık tavana tabi kılmak. Bu yol yalnız
// AI_GATEWAY_ENABLED=true iken devreye girer (varsayılan KAPALI → llm.ts eski
// davranışını birebir korur). Lead-Intel/JARVIS canlı yolu openrouter.ts'te kalır
// (council parity için cost_usd orada tahmini kalır); gateway yalnız mentor yolunu
// kapattığı için burada cost_usd = GERÇEK (usage.cost) olabilir — parity etkilenmez.

import { getSpendSince, getTokenRate } from '../openrouter'
import { getMonthlyCapUsd } from './caps'
import { logAiCostRow } from './costLog'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const BASE_URL = 'https://openrouter.ai/api/v1'

export interface GatewayMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GatewayOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  operation?: string
}

export interface GatewayResult {
  content: string | null
  generationId: string | null
  costUsd: number
  costSource: 'actual' | 'estimated'
  usage: { promptTokens: number; completionTokens: number }
  capExceeded?: boolean
}

const EMPTY: GatewayResult = {
  content: null,
  generationId: null,
  costUsd: 0,
  costSource: 'estimated',
  usage: { promptTokens: 0, completionTokens: 0 },
}

let warnedMissingConfig = false

function tierForModel(model: string): 'light' | 'medium' | 'heavy' {
  if (model.includes('pro') || model.includes('opus') || model.includes('gpt-5')) return 'heavy'
  if (model.includes('haiku') || model.includes('sonnet') || model.includes('flash-lite')) return 'medium'
  return 'light'
}

async function getMonthlySpend(): Promise<number> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  return getSpendSince(startOfMonth)
}

// Mentor/asistan sohbeti — message-array imzası (llm.ts'in üst kümesi).
// Başarısızlıkta content:null döner (throw ETMEZ) → llm.ts null-fallback semantiği korunur.
export async function gatewayChat(
  messages: GatewayMessage[],
  options: GatewayOptions = {}
): Promise<GatewayResult> {
  const model = options.model ?? process.env.OPENROUTER_MODEL
  if (!OPENROUTER_API_KEY || !model) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true
      console.warn('[gateway] OPENROUTER_API_KEY veya model tanımlı değil — null fallback.')
    }
    return EMPTY
  }

  const {
    temperature = 0.3,
    maxTokens = 800,
    timeoutMs = 25000,
    operation = 'assistant_chat',
  } = options

  // Aylık tavan (soft): aşımda throw yerine null (mentor yolu tarihsel olarak throw etmez).
  try {
    const cap = await getMonthlyCapUsd()
    const spend = await getMonthlySpend()
    if (spend >= cap) {
      console.warn(`[gateway] aylık tavan aşıldı ($${cap}) → mentor yanıtı atlandı`)
      return { ...EMPTY, capExceeded: true }
    }
  } catch {
    // tavan okunamazsa çağrıyı engelleme (mentor'u karartma) — devam et.
  }

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://agencyos.app',
        'X-Title': 'Grafikcem Agency OS',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        include_reasoning: false,
        reasoning: { exclude: true },
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!response.ok) {
      console.error('[gateway] non-OK response', response.status, model)
      return EMPTY
    }

    const data = await response.json()
    const msg = data?.choices?.[0]?.message
    let content: string | null = msg?.content ?? null
    if (content) content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

    const promptTokens = data?.usage?.prompt_tokens ?? 0
    const completionTokens = data?.usage?.completion_tokens ?? 0
    const generationId: string | null = data?.id ?? null

    const realCost = typeof data?.usage?.cost === 'number' ? data.usage.cost : null
    const rate = await getTokenRate(model)
    const estimated = (promptTokens / 1_000_000) * rate.input + (completionTokens / 1_000_000) * rate.output
    const costUsd = realCost ?? estimated
    const costSource: 'actual' | 'estimated' = realCost != null ? 'actual' : 'estimated'

    // Önceden takipsiz mentor harcamasını artık logla.
    await logAiCostRow({
      operation,
      model_used: data?.model ?? model,
      model_tier: tierForModel(model),
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      cost_usd: costUsd,
      cost_tl: costUsd * 38,
      generation_id: generationId,
      actual_cost_usd: realCost,
      cost_source: costSource,
    })

    if (!content) {
      console.warn('[gateway] empty content', { finish_reason: data?.choices?.[0]?.finish_reason, model })
      return { content: null, generationId, costUsd, costSource, usage: { promptTokens, completionTokens } }
    }

    return { content, generationId, costUsd, costSource, usage: { promptTokens, completionTokens } }
  } catch (err) {
    console.error('[gateway] request failed', err instanceof Error ? err.name : 'unknown')
    return EMPTY
  }
}

// Faz 0 bayrağı — varsayılan KAPALI. true iken assistant/llm.ts gateway'e delege eder.
export function isGatewayEnabled(): boolean {
  return process.env.AI_GATEWAY_ENABLED === 'true'
}
