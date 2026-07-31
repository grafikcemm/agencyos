import { NextResponse } from 'next/server'
import { authErrorResponse, envelope } from '@/lib/integrations/cemosLifeAuth'
import { requireGrowthAuth, writeGrowthAudit } from '@/lib/integrations/cemosGrowthAuth'
import { supabaseAdmin } from '@/lib/supabase'
import {
  RecommendationCreate, handleGrowthWrite, insertRecommendation,
} from '@/lib/integrations/cemosGrowthWrite'

export const dynamic = 'force-dynamic'

/**
 * Öneri YAZMA — GrafikcemOS'un tek yazma yetkisi.
 *
 * Yazılan satır her zaman `proposed` durumundadır ve hiçbir şey tetiklemez:
 * gönderim başlatmaz, koşu açmaz, bütçe harcamaz. Uygulanıp uygulanmayacağına
 * operatör AgencyOS içinde karar verir. Yazma tokenı sızsa bile elde edilecek
 * şey, panelde görünen bir öneri satırıdır.
 */
export async function POST(req: Request) {
  // Kimlik doğrulaması `handleGrowthWrite` içinde TEK KEZ yapılır ve `clientId`
  // handler'a oradan iner — burada ikinci kez doğrulamak hız sınırı sayacını
  // istek başına iki kez düşürürdü.
  return handleGrowthWrite(req, 'growth/recommendations', 'POST', RecommendationCreate, async (input, ctx) => {
    const { id } = await insertRecommendation(input, ctx.clientId)
    return { summary: { id: id ?? null, kind: input.kind, status: 'proposed' } }
  })
}

/**
 * Öneri OKUMA — kokpitin salt okunur listesi.
 *
 * Yazma tokenı gerekmez; okuma kapsamı yeter. Liste kısa tutulur: kokpit karar
 * kuyruğudur, arşiv değil.
 */
export async function GET(req: Request) {
  try {
    const { clientId } = requireGrowthAuth(req, 'read')
    const { data, error } = await supabaseAdmin
      .from('cemos_recommendations')
      .select('id,kind,title,rationale,proposed_change,evidence_ref,experiment_key,confidence,sample_sufficient,status,created_at')
      .order('created_at', { ascending: false })
      .limit(50)
    const warnings = error ? ['cemos_recommendations okunamadı (migration 067 uygulanmamış olabilir)'] : []
    const rows = error ? [] : (data ?? [])

    await writeGrowthAudit({
      route: 'growth/recommendations', method: 'GET', scope: 'read', status: 200,
      responseSummary: { clientId, count: rows.length, warnings: warnings.length },
    })
    return NextResponse.json(envelope('growth/recommendations', { items: rows }, warnings, rows.length ? 'ok' : 'empty'))
  } catch (e) {
    const res = authErrorResponse(e)
    await writeGrowthAudit({
      route: 'growth/recommendations', method: 'GET', scope: 'read', status: res.status,
      error: String((e as Error)?.message ?? e).slice(0, 200),
    })
    return res
  }
}
