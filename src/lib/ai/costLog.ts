// ai_cost_logs merkezi yazıcı — hem openrouter.ts (canlı yol) hem gateway.ts
// (mentor delege yolu) buraya yazar. Faz 0'da eklenen gözlem sütunları
// (generation_id, actual_cost_usd, cost_source) migration 039 uygulanmadan
// önce yoksa strip-retry ile base satır yine de yazılır (migration-sırası güvenliği).
//
// ÖNEMLİ (council parity): canlı yolda cost_usd DAİMA tahmini oranla hesaplanır
// (leadIntel/budget.ts günlük tavanı bunu toplar). Gerçek OpenRouter maliyeti
// yalnız actual_cost_usd gözlem sütununa yazılır; karar/parity etkilenmez.
// Yalnız gateway'in kapattığı (önceden takipsiz) mentor yolunda cost_usd = gerçek olabilir.

import { supabaseAdmin } from '../supabase'

export interface CostRow {
  operation: string
  model_used: string
  model_tier: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  cost_tl: number
  agent_key?: string | null
  related_lead_id?: string | null
  generation_id?: string | null
  actual_cost_usd?: number | null
  cost_source?: 'actual' | 'estimated'
  // Preset routing gözlem alanları (16 §4.7) — migration'sız ortamda strip-retry
  // ile düşer, base satır yine yazılır.
  preset_key?: string | null
  fallback_used?: boolean
  retry_count?: number
}

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === 'PGRST204' || error.code === '42703') return true
  return /column .* does not exist|could not find the .* column/i.test(error.message ?? '')
}

// PGRST204/42703 mesajından eksik kolon adını çıkarır (bulunamazsa null).
function extractMissingColumn(message: string | undefined): string | null {
  if (!message) return null
  const m =
    /could not find the '([^']+)' column/i.exec(message) ??
    /column "?([a-z_]+)"? .*does not exist/i.exec(message)
  return m?.[1] ?? null
}

export async function logAiCostRow(row: CostRow): Promise<void> {
  const base: Record<string, unknown> = {
    operation: row.operation,
    model_used: row.model_used,
    model_tier: row.model_tier,
    input_tokens: row.input_tokens,
    output_tokens: row.output_tokens,
    cost_usd: row.cost_usd,
    cost_tl: row.cost_tl,
    agent_key: row.agent_key ?? null,
    related_lead_id: row.related_lead_id ?? null,
    created_at: new Date().toISOString(),
  }
  const extra: Record<string, unknown> = {
    generation_id: row.generation_id ?? null,
    actual_cost_usd: row.actual_cost_usd ?? null,
    cost_source: row.cost_source ?? 'estimated',
    preset_key: row.preset_key ?? null,
    fallback_used: row.fallback_used ?? false,
    retry_count: row.retry_count ?? 0,
  }

  // Kademeli strip-retry: eksik kolon hatasında YALNIZ o kolonu düşür ve
  // yeniden dene (039 uygulanmış ama 052 uygulanmamış ortamda generation_id
  // gibi mevcut gözlem alanları kaybolmasın). Kolon adı çözülemezse tüm
  // extra'sız base satıra düş (eski davranış).
  try {
    const payload = { ...base, ...extra }
    const extraKeys = Object.keys(extra)
    for (let attempt = 0; attempt <= extraKeys.length; attempt++) {
      const { error } = await supabaseAdmin.from('ai_cost_logs').insert(payload)
      if (!error) return
      if (!isMissingColumn(error)) {
        console.error('[costLog] insert failed:', error.message)
        return
      }
      const missing = extractMissingColumn(error.message)
      if (missing && missing in payload && !(missing in base)) {
        delete payload[missing]
        continue
      }
      // Kolon adı çözülemedi → tüm extra'ları at, base ile son deneme.
      const { error: e2 } = await supabaseAdmin.from('ai_cost_logs').insert(base)
      if (e2) console.error('[costLog] base insert failed:', e2.message)
      return
    }
  } catch (err) {
    console.error('[costLog] insert threw:', err)
  }
}
