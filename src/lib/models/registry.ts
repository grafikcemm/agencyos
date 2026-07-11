// ─────────────────────────────────────────────────────────────────────────────
// Operation → preset çözümleme — 16-openrouter-routing.md §5 migration path.
// Operasyon anahtarları AYNEN korunur (çağıran-kırılmama garantisi); yalnız
// hedef artık model ID değil preset_key. Bilinmeyen operasyon fast-extract'e
// düşer (ölü default sorununun çözümü).
//
// settings.ai_route_presets override'ı: caps.ts deseni (5 dk cache, never-throw)
// — model drift'inde SQL Editor'dan deploy'suz primary/fallback düzeltme kanalı.
// Beklenen JSON şekli: { "<preset_key>": { "primary"?: string, "fallbacks"?: string[] } }
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '../supabase'
import { PRESETS, RoutePreset } from './presets'

export const DEFAULT_PRESET_KEY = 'agencyos-fast-extract'

export const OPERATION_PRESET_MAP: Record<string, string> = {
  // Tier 1 — çıkarım/sinyal/konsey kritikleri (Design Critic vision dahil)
  analyze_lead:                  'agencyos-fast-extract',
  batch_enrichment:              'agencyos-fast-extract',
  lead_intel_design_critic:      'agencyos-fast-extract',
  lead_intel_automation_analyst: 'agencyos-fast-extract',
  lead_intel_skeptic:            'agencyos-fast-extract',

  // Tier 2 — konuşma/özet/bilgi yolları
  jarvis_chat:         'agencyos-research',
  session_briefing:    'agencyos-research',
  read_knowledge:      'agencyos-research',
  wrap_session:        'agencyos-research',
  build_visual_prompt: 'agencyos-research',

  // Tier 3 — profesyonel yazım
  generate_briefing:    'agencyos-professional',
  draft_email:          'agencyos-professional',
  build_carousel_brief: 'agencyos-professional',
  intent_detection:     'agencyos-professional',
  lead_intel_chair:     'agencyos-professional',
  // premium-deal'a geçiş yalnız explicit escalation + HITL ile (16 §5)
  draft_proposal:       'agencyos-professional',

  // Legacy generic tier'lar (callLight/Medium/Heavy iç yönlendirmesi).
  // heavy_generic premium DEĞİL — premium escalation-only (16 §5).
  light_generic:  'agencyos-fast-extract',
  medium_generic: 'agencyos-professional',
  heavy_generic:  'agencyos-professional',
}

export function resolvePresetKey(operation: string): string {
  return OPERATION_PRESET_MAP[operation] ?? DEFAULT_PRESET_KEY
}

export function getPresetByKey(key: string): RoutePreset {
  return PRESETS[key] ?? PRESETS[DEFAULT_PRESET_KEY]
}

/** Senkron statik çözümleme (settings override'sız) — stream route gibi
 *  senkron çağıranlar için. */
export function resolveOperationPresetStatic(operation: string): RoutePreset {
  return getPresetByKey(resolvePresetKey(operation))
}

// ── settings.ai_route_presets override (5 dk cache, hata halinde sessizce boş) ──

interface PresetOverride {
  primary?: string
  fallbacks?: string[]
}

let overrideCache: { overrides: Record<string, PresetOverride>; loadedAt: number } | null = null
const OVERRIDE_CACHE_TTL_MS = 5 * 60 * 1000

async function loadPresetOverrides(): Promise<Record<string, PresetOverride>> {
  if (overrideCache && Date.now() - overrideCache.loadedAt < OVERRIDE_CACHE_TTL_MS) {
    return overrideCache.overrides
  }
  try {
    const { data } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'ai_route_presets')
      .maybeSingle()
    let parsed: unknown = data?.value
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed) } catch { parsed = null }
    }
    const overrides: Record<string, PresetOverride> = {}
    if (parsed && typeof parsed === 'object') {
      for (const [key, raw] of Object.entries(parsed as Record<string, unknown>)) {
        if (!raw || typeof raw !== 'object') continue
        const o = raw as Record<string, unknown>
        const entry: PresetOverride = {}
        if (typeof o.primary === 'string' && o.primary.length > 0) entry.primary = o.primary
        if (Array.isArray(o.fallbacks) && o.fallbacks.every((f) => typeof f === 'string')) {
          entry.fallbacks = o.fallbacks as string[]
        }
        if (entry.primary || entry.fallbacks) overrides[key] = entry
      }
    }
    overrideCache = { overrides, loadedAt: Date.now() }
    return overrides
  } catch {
    overrideCache = { overrides: {}, loadedAt: Date.now() }
    return {}
  }
}

/** Asenkron çözümleme: statik preset + settings.ai_route_presets override.
 *  Override yalnız primary/fallbacks'i ezebilir; policy/timeout/ceiling sabit. */
export async function resolveOperationPreset(operation: string): Promise<RoutePreset> {
  const base = resolveOperationPresetStatic(operation)
  const overrides = await loadPresetOverrides()
  const override = overrides[base.key]
  if (!override) return base
  return {
    ...base,
    primary: override.primary ?? base.primary,
    fallbacks: override.fallbacks ?? base.fallbacks,
  }
}

/** Test/manuel sıfırlama (cache temizliği). */
export function resetPresetOverrideCache(): void {
  overrideCache = null
}

/** Cost-log sınıflandırması: preset tier → mevcut model_tier alanı.
 *  (ai_cost_logs.model_tier şeması değişmez; yalnız sınıflandırma.) */
export function presetTierToModelTier(tier: RoutePreset['tier']): 'light' | 'medium' | 'heavy' {
  if (tier <= 2) return 'light'
  if (tier === 4) return 'heavy'
  return 'medium'
}
