// tool_cost_logs merkezi yazıcı (mig 052) — LLM-dışı araç maliyetleri
// (Google Places textsearch/details, ileride PageSpeed vb.) ilk kez ölçülür.
// Never-throws: log yazılamazsa çağıran akış KIRILMAZ (costLog.ts deseni);
// tablo henüz yoksa (052 elle uygulanmadan) sessizce tek console.warn düşer.

import { supabaseAdmin } from '../supabase'

// Tahmini birim maliyetler (USD) — Google Places fiyat sayfası 2026-07 sınıfı;
// ölçüm amaçlıdır, fatura gerçeği değildir. Gerçek maliyet Google Cloud
// faturasından izlenir; bu log hacim × birim tahmin toplar.
export const TOOL_UNIT_COST_USD: Record<string, number> = {
  'google_places:textsearch': 0.032,
  'google_places:details': 0.017,
}

export interface ToolCostRow {
  tool: string          // ör. 'google_places'
  operation: string     // ör. 'textsearch' | 'details'
  units?: number
  costUsd?: number      // verilmezse TOOL_UNIT_COST_USD × units
  runId?: string | null
  relatedLeadId?: string | null
  meta?: Record<string, unknown>
}

let missingTableWarned = false

export async function logToolCostRow(row: ToolCostRow): Promise<void> {
  const units = row.units ?? 1
  const unitCost = TOOL_UNIT_COST_USD[`${row.tool}:${row.operation}`] ?? 0
  const costUsd = row.costUsd ?? unitCost * units
  try {
    const { error } = await supabaseAdmin.from('tool_cost_logs').insert({
      tool: row.tool,
      operation: row.operation,
      units,
      cost_usd: costUsd,
      run_id: row.runId ?? null,
      related_lead_id: row.relatedLeadId ?? null,
      meta: row.meta ?? null,
      created_at: new Date().toISOString(),
    })
    if (error) {
      // 052 uygulanmamış (tablo yok) → tek uyarı, akış devam.
      if (!missingTableWarned) {
        missingTableWarned = true
        console.warn('[toolCostLog] insert failed (mig 052 uygulanmamış olabilir):', error.message)
      }
    }
  } catch (err) {
    if (!missingTableWarned) {
      missingTableWarned = true
      console.warn('[toolCostLog] insert threw:', err instanceof Error ? err.message : err)
    }
  }
}

/** Test/manuel sıfırlama. */
export function resetToolCostWarn(): void {
  missingTableWarned = false
}
