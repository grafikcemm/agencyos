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
}

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === 'PGRST204' || error.code === '42703') return true
  return /column .* does not exist|could not find the .* column/i.test(error.message ?? '')
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
  }

  try {
    const { error } = await supabaseAdmin.from('ai_cost_logs').insert({ ...base, ...extra })
    if (error && isMissingColumn(error)) {
      // 039 henüz uygulanmamış → yeni sütunlar olmadan yeniden dene.
      const { error: e2 } = await supabaseAdmin.from('ai_cost_logs').insert(base)
      if (e2) console.error('[costLog] base insert failed:', e2.message)
    } else if (error) {
      console.error('[costLog] insert failed:', error.message)
    }
  } catch (err) {
    console.error('[costLog] insert threw:', err)
  }
}
