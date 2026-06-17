import { describe, it, expect, vi, beforeEach } from 'vitest'

// callLight tek noktadan mock'lanır (LLM tie-breaker için).
const callLight = vi.fn()
vi.mock('@/lib/openrouter', () => ({
  callLight: (...args: unknown[]) => callLight(...args),
}))

import { classifyQuestion } from './classifyQuestion'

describe('classifyQuestion', () => {
  beforeEach(() => {
    callLight.mockReset()
  })

  it('net iş sorusunu kurula yönlendirir (LLM çağırmadan)', async () => {
    const res = await classifyQuestion('bugün hangi müşterileri aramalıyım?')
    expect(res.route).toBe('business_deliberate')
    expect(res.reason).toContain('keyword:business')
    expect(callLight).not.toHaveBeenCalled()
  })

  it('net hayat sorusunu hızlı mentora yönlendirir (LLM çağırmadan)', async () => {
    const res = await classifyQuestion('akşam ne yiyeyim?')
    expect(res.route).toBe('life_quick')
    expect(res.reason).toContain('keyword:life')
    expect(callLight).not.toHaveBeenCalled()
  })

  it('belirsiz mesajda LLM tie-breaker çağrılır ve BUSINESS parse edilir', async () => {
    callLight.mockResolvedValue('BUSINESS')
    const res = await classifyQuestion('bunu bana açıklar mısın')
    expect(callLight).toHaveBeenCalledTimes(1)
    expect(res.route).toBe('business_deliberate')
    expect(res.reason).toBe('llm_tiebreaker')
  })

  it('tie-breaker LIFE dönerse hayat yoluna gider', async () => {
    callLight.mockResolvedValue('LIFE cevabı')
    const res = await classifyQuestion('selam nasılsın')
    expect(res.route).toBe('life_quick')
    expect(res.reason).toBe('llm_tiebreaker')
  })

  it('tie-breaker hata fırlatırsa güvenli default life_quick döner (asla throw)', async () => {
    callLight.mockRejectedValue(new Error('OPENROUTER_API_KEY yok'))
    const res = await classifyQuestion('anlamsız bir şey')
    expect(res.route).toBe('life_quick')
    expect(res.reason).toBe('default')
  })

  it('Türkçe karakterli iş kelimesini (satış) normalize edip yakalar', async () => {
    const res = await classifyQuestion('bu haftaki satış planım ne?')
    expect(res.route).toBe('business_deliberate')
    expect(callLight).not.toHaveBeenCalled()
  })

  it('tie-breaker tanınmayan metin dönerse (BUSINESS/LIFE yok) default life_quick', async () => {
    callLight.mockResolvedValue('bilmiyorum')
    const res = await classifyQuestion('falan filan')
    expect(callLight).toHaveBeenCalledTimes(1)
    expect(res.route).toBe('life_quick')
    expect(res.reason).toBe('default')
  })

  it('hem iş hem hayat kelimesi geçince (belirsiz) tie-breaker tetiklenir', async () => {
    callLight.mockResolvedValue('BUSINESS')
    // "lead" (iş) + "enerji" (hayat) → ikisi de >0 → LLM tie-breaker.
    const res = await classifyQuestion('lead takibi için enerjim yok')
    expect(callLight).toHaveBeenCalledTimes(1)
    expect(res.reason).toBe('llm_tiebreaker')
    expect(res.route).toBe('business_deliberate')
  })
})
