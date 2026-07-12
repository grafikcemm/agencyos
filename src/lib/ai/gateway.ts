// AI Gateway — asistan/mentor LLM çağrılarının TEK yönlendirilmiş yüzeyi.
//
// Faz 5 (audit bulgu #4): model artık OPENROUTER_MODEL ham env'inden DEĞİL,
// merkezi preset registry'den gelir (operation → preset → models[] self-heal).
// Bu yol böylece openrouter.ts ile aynı korumaları taşır: görünür fallback
// logu, 1 retry (429/5xx/timeout), max_price ceiling, preset_key'li cost log,
// aylık tavan. Başarısızlıkta content:null döner (throw ETMEZ) → asistanın
// statik-fallback semantiği korunur.

import { getSpendSince, getTokenRate } from '../openrouter'
import { resolveOperationPreset } from '../models/registry'
import { getMonthlyCapUsd } from './caps'
import { logAiCostRow } from './costLog'

const BASE_URL = 'https://openrouter.ai/api/v1'

export interface GatewayMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GatewayOptions {
  /** Açık model override — verilirse preset atlanır (legacy çağıranlar). */
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

const RETRY_BACKOFF_MS = 300

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
}

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
// Başarısızlıkta content:null döner (throw ETMEZ).
export async function gatewayChat(
  messages: GatewayMessage[],
  options: GatewayOptions = {}
): Promise<GatewayResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true
      console.warn('[gateway] OPENROUTER_API_KEY tanımlı değil — null fallback.')
    }
    return EMPTY
  }

  const {
    temperature = 0.3,
    maxTokens = 800,
    timeoutMs = 25000,
    operation = 'assistant_chat',
  } = options

  // Model çözümlemesi: açık override yoksa merkezi preset (self-heal models[]).
  let models: string[]
  let presetKey: string | null
  let ceiling: { prompt: number; completion: number } | undefined
  if (options.model) {
    models = [options.model]
    presetKey = null
  } else {
    const preset = await resolveOperationPreset(operation)
    models = [preset.primary, ...preset.fallbacks]
    presetKey = preset.key
    ceiling = preset.ceiling
  }
  const primary = models[0]

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

  const body: Record<string, unknown> = {
    model: primary,
    messages,
    temperature,
    max_tokens: maxTokens,
    include_reasoning: false,
    reasoning: { exclude: true },
    usage: { include: true },
  }
  if (models.length > 1) {
    body.models = models
    body.provider = {
      allow_fallbacks: true,
      ...(ceiling ? { max_price: { prompt: ceiling.prompt, completion: ceiling.completion } } : {}),
    }
  }

  const maxAttempts = 2 // 1 deneme + 1 retry (429/5xx/timeout)
  let retryCount = 0
  let response: Response | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://agencyos.app',
          'X-Title': 'Grafikcem Agency OS',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      if (isAbortError(err) && attempt < maxAttempts) {
        retryCount = attempt
        console.warn(`[gateway] timeout (deneme ${attempt}) → retry`)
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS))
        continue
      }
      console.error('[gateway] request failed', err instanceof Error ? err.name : 'unknown')
      return EMPTY
    }
    if (!response.ok && isRetryableStatus(response.status) && attempt < maxAttempts) {
      retryCount = attempt
      console.warn(`[gateway] HTTP ${response.status} (deneme ${attempt}) → retry`)
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS))
      continue
    }
    break
  }

  if (!response || !response.ok) {
    console.error('[gateway] non-OK response', response?.status ?? 'yok', primary)
    return EMPTY
  }

  try {
    const data = await response.json()
    const msg = data?.choices?.[0]?.message
    let content: string | null = msg?.content ?? null
    if (content) content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

    const servedModel: string = data?.model ?? primary
    const fallbackUsed = servedModel !== primary
    if (fallbackUsed) {
      // Sessiz düşüş YASAK (16 §4 / 26 Senaryo 6) — görünür log.
      console.warn(`[model.fallback.used] operation=${operation} primary=${primary} served=${servedModel}`)
    }

    const promptTokens = data?.usage?.prompt_tokens ?? 0
    const completionTokens = data?.usage?.completion_tokens ?? 0
    const generationId: string | null = data?.id ?? null

    const realCost = typeof data?.usage?.cost === 'number' ? data.usage.cost : null
    const rate = await getTokenRate(servedModel)
    const estimated = (promptTokens / 1_000_000) * rate.input + (completionTokens / 1_000_000) * rate.output
    const costUsd = realCost ?? estimated
    const costSource: 'actual' | 'estimated' = realCost != null ? 'actual' : 'estimated'

    await logAiCostRow({
      operation,
      model_used: servedModel,
      model_tier: tierForModel(servedModel),
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      cost_usd: costUsd,
      cost_tl: costUsd * 38,
      generation_id: generationId,
      actual_cost_usd: realCost,
      cost_source: costSource,
      preset_key: presetKey,
      fallback_used: fallbackUsed,
      retry_count: retryCount,
    })

    if (!content) {
      console.warn('[gateway] empty content', { finish_reason: data?.choices?.[0]?.finish_reason, model: servedModel })
      return { content: null, generationId, costUsd, costSource, usage: { promptTokens, completionTokens } }
    }

    return { content, generationId, costUsd, costSource, usage: { promptTokens, completionTokens } }
  } catch (err) {
    console.error('[gateway] response parse failed', err instanceof Error ? err.name : 'unknown')
    return EMPTY
  }
}

// Geriye-uyum: eski AI_GATEWAY_ENABLED bayrağı — Faz 5'ten itibaren asistan
// yolu HER ZAMAN gateway'den geçer (bayrak yalnız tarihsel çağıranlar için
// true döner; kapatma anahtarı değildir).
export function isGatewayEnabled(): boolean {
  return true
}
