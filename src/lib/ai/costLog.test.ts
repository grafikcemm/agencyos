import { describe, it, expect, vi, beforeEach } from 'vitest'

// Kademeli strip-retry testi: 052 uygulanmamış ortamda yalnız eksik kolonlar
// düşer; 039 alanları (generation_id, actual_cost_usd) KORUNUR.

const insertMock = vi.fn()
vi.mock('../supabase', () => ({
  supabaseAdmin: { from: () => ({ insert: (row: Record<string, unknown>) => insertMock(row) }) },
}))

import { logAiCostRow } from './costLog'

const ROW = {
  operation: 'draft_email',
  model_used: 'openai/gpt-5.6-luna',
  model_tier: 'medium',
  input_tokens: 100,
  output_tokens: 50,
  cost_usd: 0.001,
  cost_tl: 0.038,
  generation_id: 'gen-1',
  actual_cost_usd: 0.0009,
  preset_key: 'agencyos-professional',
  fallback_used: false,
  retry_count: 0,
} as const

function missingColumnError(column: string) {
  return {
    error: {
      code: 'PGRST204',
      message: `Could not find the '${column}' column of 'ai_cost_logs' in the schema cache`,
    },
  }
}

beforeEach(() => insertMock.mockReset())

describe('logAiCostRow — kademeli strip-retry (PGRST204)', () => {
  it('tam şema: tek insert, tüm alanlar gider', async () => {
    insertMock.mockResolvedValueOnce({ error: null })
    await logAiCostRow({ ...ROW })
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertMock.mock.calls[0][0].preset_key).toBe('agencyos-professional')
    expect(insertMock.mock.calls[0][0].generation_id).toBe('gen-1')
  })

  it('052 yok: preset kolonları tek tek düşer, 039 alanları KORUNUR', async () => {
    insertMock
      .mockResolvedValueOnce(missingColumnError('preset_key'))
      .mockResolvedValueOnce(missingColumnError('fallback_used'))
      .mockResolvedValueOnce(missingColumnError('retry_count'))
      .mockResolvedValueOnce({ error: null })

    await logAiCostRow({ ...ROW })
    expect(insertMock).toHaveBeenCalledTimes(4)
    const lastPayload = insertMock.mock.calls[3][0]
    expect(lastPayload.preset_key).toBeUndefined()
    expect(lastPayload.fallback_used).toBeUndefined()
    expect(lastPayload.retry_count).toBeUndefined()
    // 039 gözlem alanları hâlâ payload'da
    expect(lastPayload.generation_id).toBe('gen-1')
    expect(lastPayload.actual_cost_usd).toBe(0.0009)
    expect(lastPayload.cost_usd).toBe(0.001)
  })

  it('kolon adı çözülemezse base satıra düşer (eski davranış)', async () => {
    insertMock
      .mockResolvedValueOnce({ error: { code: 'PGRST204', message: 'schema cache mismatch' } })
      .mockResolvedValueOnce({ error: null })

    await logAiCostRow({ ...ROW })
    expect(insertMock).toHaveBeenCalledTimes(2)
    const basePayload = insertMock.mock.calls[1][0]
    expect(basePayload.generation_id).toBeUndefined()
    expect(basePayload.operation).toBe('draft_email')
  })

  it('kolon-dışı hata: tek deneme + error log, throw yok', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    insertMock.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } })
    await expect(logAiCostRow({ ...ROW })).resolves.toBeUndefined()
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
