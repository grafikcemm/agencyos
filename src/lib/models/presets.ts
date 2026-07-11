// ─────────────────────────────────────────────────────────────────────────────
// Central Model Registry — docs/agencyos-v2-planning/16-openrouter-routing.md §3
// birebir. Ham model ID'leri SADECE bu dosyada yaşar; tüm çağıranlar preset_key
// üzerinden gider. Hiçbir model ID canlı GET /api/v1/models ile doğrulanmadan
// buraya yazılmaz (verifiedAt alanı audit izidir; nightly drift kontrolü
// verify.ts). Fiyatlar $/M token, 2026-07-11 canlı katalog anlığı.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderPolicy {
  allowFallbacks?: boolean        // → provider.allow_fallbacks (models[] için AÇIK)
  requireParameters?: boolean     // → provider.require_parameters (tool/vision zorlar)
  dataCollection?: 'allow' | 'deny'
  sort?: 'price' | 'throughput' | 'latency'
  zdr?: boolean                   // zero-data-retention endpoint
}

export interface RoutePreset {
  key: string
  tier: 0 | 1 | 2 | 3 | 4 | 5
  primary: string
  fallbacks: string[]             // → body.models = [primary, ...fallbacks]
  /** Yalnız explicit escalation ile seçilebilir; otomatik zincire GİRMEZ. */
  escalationOnly?: string[]
  provider?: ProviderPolicy
  timeoutMs: number
  maxRetries: number
  requiresApproval: boolean       // Tier 4 → HITL (mig 043 approvals)
  ceiling: { prompt: number; completion: number }  // $/M — provider.max_price ile hizalı
  verifiedAt: string              // 'YYYY-MM-DD' — canlı katalog doğrulama tarihi
}

export const MODEL_VERIFIED_AT = '2026-07-11'

export const PRESETS: Record<string, RoutePreset> = {
  // Tier 1 — ultra-ekonomik, vision (zincirdeki üç model de vision destekler)
  'agencyos-fast-extract': {
    key: 'agencyos-fast-extract',
    tier: 1,
    primary: 'qwen/qwen3.6-flash',
    fallbacks: ['google/gemini-3.1-flash-lite', 'qwen/qwen3.7-plus'],
    provider: { allowFallbacks: true, requireParameters: true, sort: 'price' },
    timeoutMs: 20_000,
    maxRetries: 1,
    requiresApproval: false,
    ceiling: { prompt: 0.5, completion: 2.0 },
    verifiedAt: MODEL_VERIFIED_AT,
  },
  // Tier 2 — ekonomik araştırma / konuşma-özeti yolları
  'agencyos-research': {
    key: 'agencyos-research',
    tier: 2,
    primary: 'google/gemini-3.1-flash-lite',
    fallbacks: ['openai/gpt-5.6-luna'],
    provider: { allowFallbacks: true, requireParameters: true, sort: 'price' },
    timeoutMs: 25_000,
    maxRetries: 1,
    requiresApproval: false,
    ceiling: { prompt: 1.5, completion: 8.0 },
    verifiedAt: MODEL_VERIFIED_AT,
  },
  // Tier 3 — ana profesyonel yazım (outreach/teklif taslağı). Kalite çıpası
  // sonnet-5 fallback; opus-4.8 bu tier'a GİRMEZ (escalation-only kural).
  'agencyos-professional': {
    key: 'agencyos-professional',
    tier: 3,
    primary: 'openai/gpt-5.6-luna',
    fallbacks: ['anthropic/claude-sonnet-5'],
    provider: { allowFallbacks: true, requireParameters: true, dataCollection: 'deny' },
    timeoutMs: 45_000,
    maxRetries: 1,
    requiresApproval: false,
    ceiling: { prompt: 3.0, completion: 12.0 },
    verifiedAt: MODEL_VERIFIED_AT,
  },
  // Tier 4 — yüksek-değerli lead; HITL zorunlu; opus yalnız explicit escalation
  'agencyos-premium-deal': {
    key: 'agencyos-premium-deal',
    tier: 4,
    primary: 'anthropic/claude-sonnet-5',
    fallbacks: ['openai/gpt-5.6-terra'],
    escalationOnly: ['anthropic/claude-opus-4.8'],
    provider: { allowFallbacks: true, dataCollection: 'deny', zdr: true },
    timeoutMs: 60_000,
    maxRetries: 1,
    requiresApproval: true,
    ceiling: { prompt: 6.0, completion: 28.0 },
    verifiedAt: MODEL_VERIFIED_AT,
  },
  // Tier 5 — rutin çıktı denetimi (★MVP review-outreach dahil)
  'agencyos-routine-judge': {
    key: 'agencyos-routine-judge',
    tier: 5,
    primary: 'google/gemini-3.5-flash',
    fallbacks: ['qwen/qwen3.7-plus'],
    provider: { allowFallbacks: true, dataCollection: 'deny' },
    timeoutMs: 30_000,
    maxRetries: 1,
    requiresApproval: false,
    ceiling: { prompt: 2.0, completion: 10.0 },
    verifiedAt: MODEL_VERIFIED_AT,
  },
  // Tier 5 — premium-deal çıktı denetimi; çapraz-aile kural (GPT üretti →
  // Claude değerlendirir ve tersi) çağıran tarafta seçilir; statik default
  // sonnet-5-sınıfı. opus-4.8 burada da escalation-only.
  // Not: doc 16 ceiling'i 6/28 der ama zincirdeki gpt-5.6-sol $30/M çıktı —
  // ceiling "zincirin en pahalısını kapsayan koruma tavanı" [ASSUMPTION,
  // kalibre edilebilir] olduğundan completion 32'ye çekildi (doküman sapması
  // sprint raporunda kayıtlı).
  'agencyos-premium-judge': {
    key: 'agencyos-premium-judge',
    tier: 5,
    primary: 'anthropic/claude-sonnet-5',
    fallbacks: ['openai/gpt-5.6-terra', 'openai/gpt-5.6-sol'],
    escalationOnly: ['anthropic/claude-opus-4.8'],
    provider: { allowFallbacks: true, dataCollection: 'deny' },
    timeoutMs: 45_000,
    maxRetries: 1,
    requiresApproval: false,
    ceiling: { prompt: 6.0, completion: 32.0 },
    verifiedAt: MODEL_VERIFIED_AT,
  },
  // Relationship memory (scoped) — extract ekonomisi + risk artışında zincir
  // yukarı (consolidate/high-risk alt-yol seçimi Sprint 4'te; şimdilik zincir).
  'agencyos-memory': {
    key: 'agencyos-memory',
    tier: 3,
    primary: 'qwen/qwen3.6-flash',
    fallbacks: ['openai/gpt-5.6-luna', 'anthropic/claude-sonnet-5'],
    provider: { allowFallbacks: true, requireParameters: true, dataCollection: 'deny' },
    timeoutMs: 30_000,
    maxRetries: 1,
    requiresApproval: false,
    ceiling: { prompt: 3.0, completion: 12.0 },
    verifiedAt: MODEL_VERIFIED_AT,
  },
}

// `agencyos-judge` üst-anahtarı somut preset değildir; Tier'a göre çözülür.
export function resolveJudgePreset(producerTier: RoutePreset['tier']): RoutePreset {
  return producerTier === 4 ? PRESETS['agencyos-premium-judge'] : PRESETS['agencyos-routine-judge']
}

// Canlı katalog fiyatları ($/M, 2026-07-11) — TOKEN_RATES_PER_M bu tablodan
// beslenir; settings.ai_token_rates override deseni openrouter.ts'te korunur.
export const LIVE_TOKEN_RATES_PER_M: Record<string, { input: number; output: number }> = {
  'qwen/qwen3.6-flash':           { input: 0.1875, output: 1.125 },
  'google/gemini-3.1-flash-lite': { input: 0.25,   output: 1.5 },
  'qwen/qwen3.7-plus':            { input: 0.32,   output: 1.28 },
  'x-ai/grok-4.3':                { input: 1.25,   output: 2.5 },
  'google/gemini-3.5-flash':      { input: 1.5,    output: 9.0 },
  'openai/gpt-5.6-luna':          { input: 1.0,    output: 6.0 },
  'anthropic/claude-sonnet-5':    { input: 2.0,    output: 10.0 },
  'openai/gpt-5.6-terra':         { input: 2.5,    output: 15.0 },
  'anthropic/claude-opus-4.8':    { input: 5.0,    output: 25.0 },
  'openai/gpt-5.6-sol':           { input: 5.0,    output: 30.0 },
}

/** PRESETS'te geçen tüm model ID'leri (drift kontrolü + testler için). */
export function allPresetModelIds(): string[] {
  const ids = new Set<string>()
  for (const preset of Object.values(PRESETS)) {
    ids.add(preset.primary)
    preset.fallbacks.forEach((m) => ids.add(m))
    preset.escalationOnly?.forEach((m) => ids.add(m))
  }
  return [...ids]
}
