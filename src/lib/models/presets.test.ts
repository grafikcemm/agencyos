import { describe, it, expect } from 'vitest'
import { PRESETS, allPresetModelIds, resolveJudgePreset, LIVE_TOKEN_RATES_PER_M, MODEL_VERIFIED_AT } from './presets'
import {
  OPERATION_PRESET_MAP,
  resolvePresetKey,
  resolveOperationPresetStatic,
  presetTierToModelTier,
  DEFAULT_PRESET_KEY,
} from './registry'
import { checkPresetDrift, CatalogModel } from './verify'

// 16-openrouter-routing.md §1-2: üretimde patlayan üç ölü ID + rate tablosundaki
// dördüncü — hiçbir preset zincirinde geçemez.
const DEAD_MODEL_IDS = [
  'google/gemini-2.5-flash-lite',
  'anthropic/claude-haiku-4-5',
  'deepseek/deepseek-v4-pro',
  'deepseek/deepseek-v4-flash',
]

describe('PRESETS katalog (16 §3 sözleşme sadakati)', () => {
  it('hiçbir preset zincirinde ölü model ID yok', () => {
    const ids = allPresetModelIds()
    for (const dead of DEAD_MODEL_IDS) {
      expect(ids).not.toContain(dead)
    }
  })

  it('her preset: fallback zinciri dolu, timeout/retry/verifiedAt tanımlı', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(preset.fallbacks.length, `${preset.key} fallback`).toBeGreaterThanOrEqual(1)
      expect(preset.timeoutMs).toBeGreaterThan(0)
      expect(preset.maxRetries).toBeGreaterThanOrEqual(1)
      expect(preset.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(preset.ceiling.prompt).toBeGreaterThan(0)
      expect(preset.ceiling.completion).toBeGreaterThan(0)
    }
  })

  it('Tier 3-4 (+judge/memory) preset\'leri data_collection deny taşır (T16)', () => {
    for (const preset of Object.values(PRESETS)) {
      if (preset.tier >= 3) {
        expect(preset.provider?.dataCollection, `${preset.key} dataCollection`).toBe('deny')
      }
    }
  })

  it('yalnız premium-deal HITL onayı gerektirir (Tier 4)', () => {
    for (const preset of Object.values(PRESETS)) {
      if (preset.key === 'agencyos-premium-deal') {
        expect(preset.requiresApproval).toBe(true)
        expect(preset.provider?.zdr).toBe(true)
      } else {
        expect(preset.requiresApproval, preset.key).toBe(false)
      }
    }
  })

  it('opus-4.8 hiçbir preset\'te primary/fallback değil — yalnız escalationOnly', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(preset.primary).not.toBe('anthropic/claude-opus-4.8')
      expect(preset.fallbacks).not.toContain('anthropic/claude-opus-4.8')
    }
    expect(PRESETS['agencyos-premium-deal'].escalationOnly).toContain('anthropic/claude-opus-4.8')
  })

  it('tüm preset modellerinin canlı fiyat kaydı var (TOKEN_RATES beslemesi)', () => {
    for (const id of allPresetModelIds()) {
      expect(LIVE_TOKEN_RATES_PER_M[id], id).toBeDefined()
    }
  })

  it('judge üst-anahtarı: Tier 4 üretici → premium-judge; diğerleri → routine-judge', () => {
    expect(resolveJudgePreset(4).key).toBe('agencyos-premium-judge')
    expect(resolveJudgePreset(3).key).toBe('agencyos-routine-judge')
    expect(resolveJudgePreset(1).key).toBe('agencyos-routine-judge')
  })
})

describe('operation → preset çözümleme (16 §5 migration path)', () => {
  it('tüm eski OPERATION_MODEL_MAP anahtarları bir preset\'e çözülür', () => {
    const legacyOperations = [
      'jarvis_chat', 'session_briefing', 'read_knowledge', 'wrap_session', 'build_visual_prompt',
      'analyze_lead', 'batch_enrichment',
      'generate_briefing', 'draft_email', 'build_carousel_brief', 'intent_detection',
      'draft_proposal',
      'lead_intel_design_critic', 'lead_intel_automation_analyst', 'lead_intel_skeptic', 'lead_intel_chair',
    ]
    for (const op of legacyOperations) {
      const key = resolvePresetKey(op)
      expect(PRESETS[key], `${op} → ${key}`).toBeDefined()
    }
  })

  it('bilinmeyen operasyon fast-extract\'e düşer (ölü default fix)', () => {
    expect(resolvePresetKey('hic_olmayan_operasyon')).toBe(DEFAULT_PRESET_KEY)
    expect(resolveOperationPresetStatic('hic_olmayan_operasyon').primary).toBe('qwen/qwen3.6-flash')
  })

  it('legacy generic tier\'lar doğru preset\'e gider; heavy premium DEĞİL', () => {
    expect(resolvePresetKey('light_generic')).toBe('agencyos-fast-extract')
    expect(resolvePresetKey('medium_generic')).toBe('agencyos-professional')
    expect(resolvePresetKey('heavy_generic')).toBe('agencyos-professional')
  })

  it('draft_proposal default professional (premium yalnız explicit escalation)', () => {
    expect(resolvePresetKey('draft_proposal')).toBe('agencyos-professional')
  })

  it('haritadaki her preset_key katalogda mevcut', () => {
    for (const key of Object.values(OPERATION_PRESET_MAP)) {
      expect(PRESETS[key], key).toBeDefined()
    }
  })

  it('presetTierToModelTier: 1-2 light, 3/5 medium, 4 heavy', () => {
    expect(presetTierToModelTier(1)).toBe('light')
    expect(presetTierToModelTier(2)).toBe('light')
    expect(presetTierToModelTier(3)).toBe('medium')
    expect(presetTierToModelTier(5)).toBe('medium')
    expect(presetTierToModelTier(4)).toBe('heavy')
  })
})

describe('checkPresetDrift (16 §6 nightly verification)', () => {
  const fullCatalog = (): Map<string, CatalogModel> => {
    const map = new Map<string, CatalogModel>()
    for (const [id, rate] of Object.entries(LIVE_TOKEN_RATES_PER_M)) {
      map.set(id, { id, promptPerM: rate.input, completionPerM: rate.output })
    }
    return map
  }
  const now = new Date(`${MODEL_VERIFIED_AT}T12:00:00Z`)

  it('tam katalog + taze verifiedAt → sıfır drift', () => {
    expect(checkPresetDrift(fullCatalog(), now)).toEqual([])
  })

  it('katalogtan kaybolan model → model_missing', () => {
    const catalog = fullCatalog()
    catalog.delete('qwen/qwen3.6-flash')
    const issues = checkPresetDrift(catalog, now)
    expect(issues.some((i) => i.kind === 'model_missing' && i.modelId === 'qwen/qwen3.6-flash')).toBe(true)
  })

  it('ceiling üstü fiyat → price_over_ceiling', () => {
    const catalog = fullCatalog()
    catalog.set('qwen/qwen3.6-flash', { id: 'qwen/qwen3.6-flash', promptPerM: 99, completionPerM: 99 })
    const issues = checkPresetDrift(catalog, now)
    expect(issues.some((i) => i.kind === 'price_over_ceiling')).toBe(true)
  })

  it('30 günden eski verifiedAt → stale_verification', () => {
    const later = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000)
    const issues = checkPresetDrift(fullCatalog(), later)
    expect(issues.some((i) => i.kind === 'stale_verification')).toBe(true)
  })
})
