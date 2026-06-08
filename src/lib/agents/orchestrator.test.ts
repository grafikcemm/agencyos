import { describe, it, expect } from 'vitest'
// parsePlan lives in the pure planParser module to avoid the server-only/supabase
// import chain that orchestrator.ts pulls in (which can't load under node vitest).
import { parsePlan } from './planParser'

describe('parsePlan', () => {
  it('parses a clean JSON array of steps', () => {
    const raw = JSON.stringify([
      { agent_key: 'sales_rep', title: 'Lead analizi', input: { brief: 'analiz et' } },
      { agent_key: 'researcher', title: 'Pazar araştırması', input: { brief: 'araştır' } },
    ])

    const result = parsePlan(raw)

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      agent_key: 'sales_rep',
      title: 'Lead analizi',
      input: { brief: 'analiz et' },
    })
    expect(result[1].agent_key).toBe('researcher')
  })

  it('strips ```json fences and parses', () => {
    const raw = '```json\n[{"agent_key":"cmo","title":"İçerik üret","input":{}}]\n```'

    const result = parsePlan(raw)

    expect(result).toHaveLength(1)
    expect(result[0].agent_key).toBe('cmo')
    expect(result[0].title).toBe('İçerik üret')
  })

  it('strips bare ``` fences and parses', () => {
    const raw = '```\n[{"agent_key":"cmo","title":"X","input":{}}]\n```'

    const result = parsePlan(raw)

    expect(result).toHaveLength(1)
    expect(result[0].agent_key).toBe('cmo')
  })

  it('extracts the array when surrounded by prose', () => {
    const raw =
      'İşte plan: [{"agent_key":"data_analyst","title":"Funnel","input":{"x":1}}] umarım yardımcı olur.'

    const result = parsePlan(raw)

    expect(result).toHaveLength(1)
    expect(result[0].agent_key).toBe('data_analyst')
    expect(result[0].input).toEqual({ x: 1 })
  })

  it('returns [] on garbage', () => {
    expect(parsePlan('bu sadece düz metin, dizi yok')).toEqual([])
  })

  it('returns [] on invalid JSON inside brackets', () => {
    expect(parsePlan('[{not valid json}]')).toEqual([])
  })

  it('returns [] when the parsed value is not an array', () => {
    expect(parsePlan('{"agent_key":"ceo"}')).toEqual([])
  })

  it('returns [] on empty string', () => {
    expect(parsePlan('')).toEqual([])
  })

  it("defaults missing title to 'Adsız görev'", () => {
    const raw = '[{"agent_key":"sales_rep","input":{}}]'

    const result = parsePlan(raw)

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Adsız görev')
  })

  it('drops steps with an empty or missing agent_key', () => {
    const raw = JSON.stringify([
      { agent_key: '', title: 'boş key', input: {} },
      { title: 'key yok', input: {} },
      { agent_key: 'researcher', title: 'geçerli', input: {} },
    ])

    const result = parsePlan(raw)

    expect(result).toHaveLength(1)
    expect(result[0].agent_key).toBe('researcher')
  })

  it('defaults non-object input to an empty object', () => {
    const raw = '[{"agent_key":"cmo","title":"X","input":"not-an-object"}]'

    const result = parsePlan(raw)

    expect(result[0].input).toEqual({})
  })
})
