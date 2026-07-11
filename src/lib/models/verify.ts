// ─────────────────────────────────────────────────────────────────────────────
// Model drift kontrolü — 16-openrouter-routing.md §6 nightly verification.
// PRESETS'teki her model ID canlı /api/v1/models kataloğuyla karşılaştırılır.
// Alarm koşulları: (a) model katalogtan kaybolmuş, (b) fiyat ceiling üstünde,
// (c) verifiedAt > 30 gün eski. Saf kontrol fonksiyonu testlenebilir; fetch ayrı.
// ─────────────────────────────────────────────────────────────────────────────

import { PRESETS, RoutePreset } from './presets'

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
export const VERIFIED_AT_MAX_AGE_DAYS = 30

export interface CatalogModel {
  id: string
  promptPerM: number
  completionPerM: number
}

export interface DriftIssue {
  presetKey: string
  modelId: string | null
  kind: 'model_missing' | 'price_over_ceiling' | 'stale_verification'
  detail: string
}

/** Canlı OpenRouter kataloğunu çeker (per-token fiyatlar $/M'e çevrilir). */
export async function fetchLiveCatalog(fetchImpl: typeof fetch = fetch): Promise<Map<string, CatalogModel>> {
  const res = await fetchImpl(OPENROUTER_MODELS_URL, {
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`OpenRouter katalog isteği başarısız: HTTP ${res.status}`)
  }
  const json = (await res.json()) as { data?: Array<{ id?: string; pricing?: { prompt?: string; completion?: string } }> }
  const catalog = new Map<string, CatalogModel>()
  for (const entry of json.data ?? []) {
    if (!entry.id) continue
    const promptPerTok = Number(entry.pricing?.prompt ?? NaN)
    const completionPerTok = Number(entry.pricing?.completion ?? NaN)
    catalog.set(entry.id, {
      id: entry.id,
      promptPerM: Number.isFinite(promptPerTok) ? promptPerTok * 1_000_000 : NaN,
      completionPerM: Number.isFinite(completionPerTok) ? completionPerTok * 1_000_000 : NaN,
    })
  }
  return catalog
}

function checkModelAgainstCatalog(
  preset: RoutePreset,
  modelId: string,
  catalog: Map<string, CatalogModel>,
  issues: DriftIssue[]
): void {
  const live = catalog.get(modelId)
  if (!live) {
    issues.push({
      presetKey: preset.key,
      modelId,
      kind: 'model_missing',
      detail: `${modelId} canlı katalogta yok (404 drift)`,
    })
    return
  }
  if (
    (Number.isFinite(live.promptPerM) && live.promptPerM > preset.ceiling.prompt) ||
    (Number.isFinite(live.completionPerM) && live.completionPerM > preset.ceiling.completion)
  ) {
    issues.push({
      presetKey: preset.key,
      modelId,
      kind: 'price_over_ceiling',
      detail: `${modelId} canlı fiyat (${live.promptPerM}/${live.completionPerM} $/M) preset ceiling (${preset.ceiling.prompt}/${preset.ceiling.completion}) üstünde`,
    })
  }
}

/** Saf drift kontrolü — test edilebilir; fetch içermez. */
export function checkPresetDrift(
  catalog: Map<string, CatalogModel>,
  now: Date = new Date(),
  presets: Record<string, RoutePreset> = PRESETS
): DriftIssue[] {
  const issues: DriftIssue[] = []
  const maxAgeMs = VERIFIED_AT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000

  for (const preset of Object.values(presets)) {
    // Not: escalationOnly modelleri de kontrol edilir — escalation anında ölü
    // modele düşmek istemeyiz.
    const chain = [preset.primary, ...preset.fallbacks, ...(preset.escalationOnly ?? [])]
    for (const modelId of chain) {
      checkModelAgainstCatalog(preset, modelId, catalog, issues)
    }

    const verified = Date.parse(preset.verifiedAt)
    if (!Number.isFinite(verified) || now.getTime() - verified > maxAgeMs) {
      issues.push({
        presetKey: preset.key,
        modelId: null,
        kind: 'stale_verification',
        detail: `verifiedAt=${preset.verifiedAt} ${VERIFIED_AT_MAX_AGE_DAYS} günden eski`,
      })
    }
  }
  return issues
}
