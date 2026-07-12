import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Faz 5 (audit bulgu #4): asistan/mentor yolu artık merkezi preset registry
// üstünden — OPENROUTER_MODEL ham env'i OKUNMAZ; models[] self-heal + retry +
// görünür fallback logu + preset_key'li cost log bu yolda da geçerli.

const costLogMock = vi.fn()
vi.mock('./costLog', () => ({
  logAiCostRow: (...args: unknown[]) => costLogMock(...args),
}))

vi.mock('./caps', () => ({
  getMonthlyCapUsd: async () => 100,
}))

vi.mock('../openrouter', () => ({
  getSpendSince: async () => 0,
  getTokenRate: async () => ({ input: 0.5, output: 2.0 }),
}))

// registry'nin settings override sorgusu için boş supabase stub'ı.
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => {
      const api: Record<string, unknown> = {}
      Object.assign(api, {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({ data: null }),
      })
      return api
    },
  },
}))

import { gatewayChat } from './gateway'
import { callOpenRouter } from '../assistant/llm'
import { resetPresetOverrideCache, resolveOperationPresetStatic } from '../models/registry'

const RESEARCH = resolveOperationPresetStatic('assistant_chat')

function okResponse(model: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      id: 'gen-gw-1',
      model,
      choices: [{ message: { content: 'mentor cevabı' } }],
      usage: { prompt_tokens: 50, completion_tokens: 20, cost: 0.0002 },
    }),
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  costLogMock.mockReset()
  resetPresetOverrideCache()
  vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
  // Kanıt: ham env modeli artık OKUNMUYOR — kasıtlı yasaklı değer.
  vi.stubEnv('OPENROUTER_MODEL', 'deepseek/deepseek-v4-pro')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function sentBody(i = 0): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[i]
  return JSON.parse((init as { body: string }).body)
}

describe('gatewayChat — preset routing (assistant_chat)', () => {
  it('model preset primary\'sidir; OPENROUTER_MODEL env\'i OKUNMAZ', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(RESEARCH.primary))
    const r = await gatewayChat([{ role: 'user', content: 'selam' }])
    expect(r.content).toBe('mentor cevabı')
    const body = sentBody()
    expect(body.model).toBe(RESEARCH.primary)
    expect(body.model).not.toBe('deepseek/deepseek-v4-pro')
    expect(body.models).toEqual([RESEARCH.primary, ...RESEARCH.fallbacks])
    const provider = body.provider as Record<string, unknown>
    expect(provider.allow_fallbacks).toBe(true)
    expect(provider.max_price).toEqual({ prompt: RESEARCH.ceiling.prompt, completion: RESEARCH.ceiling.completion })
  })

  it('cost log preset_key + fallback_used taşır', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(RESEARCH.primary))
    await gatewayChat([{ role: 'user', content: 'selam' }])
    const row = costLogMock.mock.calls[0][0]
    expect(row.preset_key).toBe(RESEARCH.key)
    expect(row.fallback_used).toBe(false)
    expect(row.operation).toBe('assistant_chat')
    expect(row.actual_cost_usd).toBe(0.0002)
  })

  it('fallback devrede → görünür [model.fallback.used] logu + fallback_used:true', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock.mockResolvedValueOnce(okResponse(RESEARCH.fallbacks[0]))
    await gatewayChat([{ role: 'user', content: 'selam' }])
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('[model.fallback.used]'))).toBe(true)
    expect(costLogMock.mock.calls[0][0].fallback_used).toBe(true)
    warnSpy.mockRestore()
  })

  it('429 → 1 retry sonra başarı; retry_count loglanır', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
      .mockResolvedValueOnce(okResponse(RESEARCH.primary))
    const r = await gatewayChat([{ role: 'user', content: 'selam' }])
    expect(r.content).toBe('mentor cevabı')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(costLogMock.mock.calls[0][0].retry_count).toBe(1)
    warnSpy.mockRestore()
  })

  it('kalıcı hata → content:null döner, THROW ETMEZ (statik fallback korunur)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({}) })
    const r = await gatewayChat([{ role: 'user', content: 'selam' }])
    expect(r.content).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1) // 4xx retry edilmez
    errSpy.mockRestore()
  })

  it('açık model override → tek model, preset atlanır (legacy imza)', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('anthropic/claude-sonnet-5'))
    await gatewayChat([{ role: 'user', content: 'selam' }], { model: 'anthropic/claude-sonnet-5' })
    const body = sentBody()
    expect(body.model).toBe('anthropic/claude-sonnet-5')
    expect(body.models).toBeUndefined()
    expect(costLogMock.mock.calls[0][0].preset_key).toBeNull()
  })

  it('API key yoksa null (fail-soft, asistan karartılmaz)', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await gatewayChat([{ role: 'user', content: 'selam' }])
    expect(r.content).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('assistant/llm.ts callOpenRouter — gateway delegasyonu', () => {
  it('her zaman gateway üstünden preset primary ile çağırır', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(RESEARCH.primary))
    const content = await callOpenRouter([{ role: 'user', content: 'selam' }])
    expect(content).toBe('mentor cevabı')
    expect(sentBody().model).toBe(RESEARCH.primary)
    // Maliyet artık HER ZAMAN loglanır (önceden takipsizdi).
    expect(costLogMock).toHaveBeenCalledTimes(1)
  })
})
