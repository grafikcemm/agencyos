import { describe, it, expect, beforeEach, vi } from 'vitest'

// tool_cost_logs yazıcısı (mig 052): never-throws + birim maliyet çarpımı +
// tablo-yok durumunda TEK uyarı.

const insertMock = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: () => ({ insert: (...args: unknown[]) => insertMock(...args) }) },
}))

import { logToolCostRow, resetToolCostWarn, TOOL_UNIT_COST_USD } from './toolCostLog'

beforeEach(() => {
  insertMock.mockReset()
  insertMock.mockResolvedValue({ error: null })
  resetToolCostWarn()
})

describe('logToolCostRow', () => {
  it('birim maliyet × units hesaplar (textsearch)', async () => {
    await logToolCostRow({ tool: 'google_places', operation: 'textsearch', units: 3 })
    const row = insertMock.mock.calls[0][0]
    expect(row.cost_usd).toBeCloseTo(0.032 * 3)
    expect(row.units).toBe(3)
    expect(row.tool).toBe('google_places')
  })

  it('units verilmezse 1 sayılır; details birim fiyatı doğru', async () => {
    await logToolCostRow({ tool: 'google_places', operation: 'details' })
    expect(insertMock.mock.calls[0][0].cost_usd).toBeCloseTo(TOOL_UNIT_COST_USD['google_places:details'])
  })

  it('açık costUsd birim tablosunu ezer', async () => {
    await logToolCostRow({ tool: 'google_places', operation: 'details', units: 5, costUsd: 0.99 })
    expect(insertMock.mock.calls[0][0].cost_usd).toBe(0.99)
  })

  it('bilinmeyen araç → 0 maliyetle yine loglanır (ölçüm kaybolmaz)', async () => {
    await logToolCostRow({ tool: 'pagespeed', operation: 'audit' })
    expect(insertMock.mock.calls[0][0].cost_usd).toBe(0)
  })

  it('meta/runId/lead alanları taşınır', async () => {
    await logToolCostRow({
      tool: 'google_places', operation: 'textsearch',
      runId: 'run-1', relatedLeadId: 'lead-1', meta: { city: 'istanbul' },
    })
    const row = insertMock.mock.calls[0][0]
    expect(row.run_id).toBe('run-1')
    expect(row.related_lead_id).toBe('lead-1')
    expect(row.meta).toEqual({ city: 'istanbul' })
  })

  it('insert hatasında THROW ETMEZ ve yalnız TEK uyarı basar', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    insertMock.mockResolvedValue({ error: { message: 'relation "tool_cost_logs" does not exist' } })
    await logToolCostRow({ tool: 'google_places', operation: 'textsearch' })
    await logToolCostRow({ tool: 'google_places', operation: 'details' })
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })

  it('insert THROW ederse de yutar (akış kırılmaz)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    insertMock.mockRejectedValue(new Error('network down'))
    await expect(logToolCostRow({ tool: 'google_places', operation: 'textsearch' })).resolves.toBeUndefined()
    warnSpy.mockRestore()
  })
})
