import { supabaseAdmin } from './supabase'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const BASE_URL = 'https://openrouter.ai/api/v1'

type ModelTier = 'light' | 'medium' | 'heavy'

interface OpenRouterResponse {
  choices: {
    message: {
      content: string
    }
  }[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  model: string
}

async function logAiCost(
  operation: string,
  modelUsed: string,
  tier: ModelTier,
  inputTokens: number,
  outputTokens: number,
  costUsd: number
) {
  const costTl = costUsd * 38

  try {
    await supabaseAdmin.from('ai_cost_logs').insert({
      operation,
      model_used: modelUsed,
      model_tier: tier,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      cost_tl: costTl,
      created_at: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error logging AI cost:', error)
  }
}

async function callOpenRouter(
  tier: ModelTier,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 1000
): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured in environment variables.')
  }

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://grafikcem.agency', // Optional
        'X-Title': 'Grafikcem Agency OS' // Optional
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: maxTokens,
        temperature: 0.7
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`OpenRouter API Error: ${errorData.error?.message || response.statusText}`)
    }

    const data: OpenRouterResponse = await response.json()
    const content = data.choices[0]?.message?.content || ''

    // Calculate approximate cost (This is a simplified calculation as prices vary by model)
    // For production, you might want to fetch current pricing or use model-specific rates.
    // Here we use a placeholder cost calculation if OpenRouter doesn't return it directly in usage.
    // OpenRouter usage usually doesn't include cost in the standard response, so we might need a lookup table.
    
    // Simple placeholder rates (per 1M tokens) for logging:
    // deepseek-v4-flash: ~$0.1
    // claude-haiku-4-5: ~$0.25 (estimated)
    // deepseek-v4-pro: ~$0.5
    const rates: Record<ModelTier, number> = {
      light: 0.1 / 1000000,
      medium: 0.25 / 1000000,
      heavy: 0.5 / 1000000
    }

    const costUsd = (data.usage.total_tokens) * rates[tier]

    await logAiCost(
      'AI_GENERATION',
      data.model,
      tier,
      data.usage.prompt_tokens,
      data.usage.completion_tokens,
      costUsd
    )

    return content
  } catch (error: any) {
    console.error(`OpenRouter ${tier} call failed:`, error.message)
    throw new Error(`AI Servisi Hatası (${tier}): ${error.message}`)
  }
}

export async function callLight(systemPrompt: string, userPrompt: string, maxTokens: number = 1000) {
  return callOpenRouter('light', 'deepseek/deepseek-v4-flash', systemPrompt, userPrompt, maxTokens)
}

export async function callMedium(systemPrompt: string, userPrompt: string, maxTokens: number = 1000) {
  return callOpenRouter('medium', 'anthropic/claude-haiku-4-5', systemPrompt, userPrompt, maxTokens)
}

export async function callHeavy(systemPrompt: string, userPrompt: string, maxTokens: number = 1000) {
  return callOpenRouter('heavy', 'deepseek/deepseek-v4-pro', systemPrompt, userPrompt, maxTokens)
}
