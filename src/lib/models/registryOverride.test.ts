import { describe, it, expect, beforeEach, vi } from 'vitest'

// settings.ai_route_presets override yolu (deploy'suz model düzeltme):
// yalnız primary/fallbacks ezilebilir; bozuk/kısmi veri sessizce yok sayılır.

let settingsValue: unknown = null
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => {
      const api: Record<string, unknown> = {}
      Object.assign(api, {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({ data: settingsValue === null ? null : { value: settingsValue } }),
      })
      return api
    },
  },
}))

import { resolveOperationPreset, resolveOperationPresetStatic, resetPresetOverrideCache } from './registry'

const BASE = resolveOperationPresetStatic('draft_email') // agencyos-professional

beforeEach(() => {
  settingsValue = null
  resetPresetOverrideCache()
})

describe('resolveOperationPreset — settings override', () => {
  it('override yokken statik preset döner', async () => {
    const p = await resolveOperationPreset('draft_email')
    expect(p.primary).toBe(BASE.primary)
    expect(p.fallbacks).toEqual(BASE.fallbacks)
  })

  it('primary override uygulanır; policy/ceiling SABİT kalır', async () => {
    settingsValue = { [BASE.key]: { primary: 'x/override-model' } }
    const p = await resolveOperationPreset('draft_email')
    expect(p.primary).toBe('x/override-model')
    expect(p.fallbacks).toEqual(BASE.fallbacks)
    expect(p.ceiling).toEqual(BASE.ceiling)
    expect(p.provider).toEqual(BASE.provider)
  })

  it('fallbacks override uygulanır', async () => {
    settingsValue = { [BASE.key]: { fallbacks: ['x/f1', 'x/f2'] } }
    const p = await resolveOperationPreset('draft_email')
    expect(p.fallbacks).toEqual(['x/f1', 'x/f2'])
    expect(p.primary).toBe(BASE.primary)
  })

  it('JSON-string değer parse edilir', async () => {
    settingsValue = JSON.stringify({ [BASE.key]: { primary: 'x/json-model' } })
    const p = await resolveOperationPreset('draft_email')
    expect(p.primary).toBe('x/json-model')
  })

  it('bozuk yapı (string olmayan primary, karışık fallbacks) yok sayılır', async () => {
    settingsValue = { [BASE.key]: { primary: 42, fallbacks: ['ok', 7] } }
    const p = await resolveOperationPreset('draft_email')
    expect(p.primary).toBe(BASE.primary)
    expect(p.fallbacks).toEqual(BASE.fallbacks)
  })

  it('cache: ikinci çözümleme settings\'i tekrar OKUMAZ (5 dk TTL)', async () => {
    settingsValue = { [BASE.key]: { primary: 'x/cached' } }
    const p1 = await resolveOperationPreset('draft_email')
    expect(p1.primary).toBe('x/cached')
    settingsValue = { [BASE.key]: { primary: 'x/changed' } }
    const p2 = await resolveOperationPreset('draft_email')
    expect(p2.primary).toBe('x/cached') // hâlâ cache
    resetPresetOverrideCache()
    const p3 = await resolveOperationPreset('draft_email')
    expect(p3.primary).toBe('x/changed')
  })

  it('farklı preset\'in override\'ı bu preset\'i etkilemez', async () => {
    settingsValue = { 'agencyos-research': { primary: 'x/other' } }
    const p = await resolveOperationPreset('draft_email')
    expect(p.primary).toBe(BASE.primary)
  })
})
