import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Router policy davranış testleri (16 §4): models[] self-heal, görünür
// fallback logu, 429/timeout retry, imza parity. Ağsız/DB'siz: fetch +
// supabase + caps + costLog mock'lanır.

// OPENROUTER_API_KEY modül yüklenirken okunur — import'tan ÖNCE set edilmeli.
vi.hoisted(() => {
  process.env.OPENROUTER_API_KEY = 'test-key'
})

const costLogMock = vi.fn()
vi.mock('./ai/costLog', () => ({
  logAiCostRow: (...args: unknown[]) => costLogMock(...args),
}))

vi.mock('./ai/caps', () => ({
  getMonthlyCapUsd: async () => 100,
}))

// supabaseAdmin: getSpendSince (ai_cost_logs) + settings sorguları için
// zincirlenebilir, await edilebilir sorgu stub'ı.
function makeQuery(result: unknown) {
  const obj: Record<string, unknown> = {}
  const chain = () => obj
  Object.assign(obj, {
    select: chain, gte: chain, like: chain, eq: chain,
    maybeSingle: async () => result,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  })
  return obj
}
vi.mock('./supabase', () => ({
  supabaseAdmin: { from: () => makeQuery({ data: null }) },
}))

import { callWithOperation, callAgentModel, getModel, getRouteForOperation } from './openrouter'
import { resetPresetOverrideCache } from './models/registry'

function okResponse(model: string, overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      id: 'gen-123',
      model,
      choices: [{ message: { content: 'cevap' } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost: 0.0005 },
      ...overrides,
    }),
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  costLogMock.mockReset()
  resetPresetOverrideCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function sentBody(callIndex = 0): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[callIndex]
  return JSON.parse((init as { body: string }).body)
}

describe('callWithOperation — models[] self-heal + policy (16 §4)', () => {
  it('body.models = [primary, ...fallbacks] + provider politikası gönderilir', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('openai/gpt-5.6-luna'))
    const result = await callWithOperation('draft_email', 'sys', 'user')

    expect(result.content).toBe('cevap')
    const body = sentBody()
    expect(body.model).toBe('openai/gpt-5.6-luna')
    expect(body.models).toEqual(['openai/gpt-5.6-luna', 'anthropic/claude-sonnet-5'])
    const provider = body.provider as Record<string, unknown>
    expect(provider.allow_fallbacks).toBe(true)
    expect(provider.data_collection).toBe('deny')
    // tools/vision YOK → require_parameters gönderilmez (aksi frontier
    // modellerde temperature filtresiyle 404 doğurur — canlı doğrulandı)
    expect(provider.require_parameters).toBeUndefined()
    expect(body.temperature).toBe(0.7)
    expect(provider.max_price).toEqual({ prompt: 3.0, completion: 12.0 })
    expect(body.usage).toEqual({ include: true })
  })

  it('tools VARSA require_parameters gönderilir, temperature düşülür (16 §4.5)', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('openai/gpt-5.6-luna'))
    await callWithOperation('draft_email', 'sys', 'user', 500, [
      { type: 'function', function: { name: 'f', description: 'd', parameters: {} } },
    ])
    const body = sentBody()
    const provider = body.provider as Record<string, unknown>
    expect(provider.require_parameters).toBe(true)
    expect(body.temperature).toBeUndefined()
    expect(body.tools).toBeDefined()
  })

  it('fallback devrede: data.model ≠ primary → fallback_used:true + görünür log', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock.mockResolvedValueOnce(okResponse('anthropic/claude-sonnet-5'))

    await callWithOperation('draft_email', 'sys', 'user')

    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('[model.fallback.used]'))).toBe(true)
    const row = costLogMock.mock.calls[0][0]
    expect(row.model_used).toBe('anthropic/claude-sonnet-5')
    expect(row.fallback_used).toBe(true)
    expect(row.preset_key).toBe('agencyos-professional')
    warnSpy.mockRestore()
  })

  it('primary yanıtladı → fallback_used:false, preset_key loglanır', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('openai/gpt-5.6-luna'))
    await callWithOperation('draft_email', 'sys', 'user')

    const row = costLogMock.mock.calls[0][0]
    expect(row.fallback_used).toBe(false)
    expect(row.retry_count).toBe(0)
    expect(row.preset_key).toBe('agencyos-professional')
    expect(row.actual_cost_usd).toBe(0.0005)
    expect(row.generation_id).toBe('gen-123')
  })

  it('429 → 1 retry sonra başarı; retry_count loglanır', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests', json: async () => ({ error: { message: 'rate limited' } }) })
      .mockResolvedValueOnce(okResponse('openai/gpt-5.6-luna'))

    const result = await callWithOperation('draft_email', 'sys', 'user')
    expect(result.content).toBe('cevap')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(costLogMock.mock.calls[0][0].retry_count).toBe(1)
    warnSpy.mockRestore()
  })

  it('timeout (AbortError) → retry → başarı; süresiz bekleme yok', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const abortErr = new Error('The operation was aborted')
    abortErr.name = 'AbortError'
    fetchMock
      .mockRejectedValueOnce(abortErr)
      .mockResolvedValueOnce(okResponse('openai/gpt-5.6-luna'))

    const result = await callWithOperation('draft_email', 'sys', 'user')
    expect(result.content).toBe('cevap')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    warnSpy.mockRestore()
  })

  it('kalıcı 4xx (400) retry edilmez → tek deneme + throw', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, statusText: 'Bad Request', json: async () => ({ error: { message: 'bad param' } }) })

    await expect(callWithOperation('draft_email', 'sys', 'user')).rejects.toThrow('bad param')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retry tükenince son hata fırlatılır (Senaryo 6: düzgün hata)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({ error: { message: 'provider down' } }) })

    await expect(callWithOperation('draft_email', 'sys', 'user')).rejects.toThrow('provider down')
    expect(fetchMock).toHaveBeenCalledTimes(2) // 1 deneme + 1 retry
    warnSpy.mockRestore()
  })

  it('AbortController: her denemede fetch signal taşır', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('openai/gpt-5.6-luna'))
    await callWithOperation('draft_email', 'sys', 'user')
    const [, init] = fetchMock.mock.calls[0]
    expect((init as { signal?: unknown }).signal).toBeDefined()
  })
})

describe('imza parity (16 §5 kırılmama garantisi)', () => {
  it('callWithOperation dönüşü { content, toolCalls } şeklini korur', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('qwen/qwen3.6-flash'))
    const result = await callWithOperation('analyze_lead', 'sys', 'user', 500)
    expect(typeof result.content).toBe('string')
    expect('toolCalls' in result).toBe(true)
  })

  it('getModel(operation) geriye-uyumlu { model, tier } döner', () => {
    const jarvis = getModel('jarvis_chat')
    expect(jarvis.model).toBe('google/gemini-3.1-flash-lite')
    expect(jarvis.tier).toBe('light')
    const proposal = getModel('draft_proposal')
    expect(proposal.model).toBe('openai/gpt-5.6-luna')
  })

  it('getRouteForOperation stream route için models[] verir', () => {
    const route = getRouteForOperation('jarvis_chat')
    expect(route.models.length).toBeGreaterThan(1)
    expect(route.presetKey).toBe('agencyos-research')
  })

  it('callAgentModel raw-model yolu geriye-uyumlu (tek model, preset_key null)', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('anthropic/claude-sonnet-5'))
    const result = await callAgentModel({
      model: 'anthropic/claude-sonnet-5',
      agentKey: 'test-agent',
      systemPrompt: 'sys',
      userPrompt: 'user',
    })
    expect(result.tokensIn).toBe(100)
    expect(result.tokensOut).toBe(50)
    const body = sentBody()
    expect(body.model).toBe('anthropic/claude-sonnet-5')
    expect(body.models).toBeUndefined()
    expect(costLogMock.mock.calls[0][0].preset_key).toBeNull()
  })
})
