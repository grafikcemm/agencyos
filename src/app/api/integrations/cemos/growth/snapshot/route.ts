import { NextResponse } from 'next/server'
import { authErrorResponse, envelope, istanbulDate } from '@/lib/integrations/cemosLifeAuth'
import { requireGrowthAuth, writeGrowthAudit } from '@/lib/integrations/cemosGrowthAuth'
import {
  findForbiddenSnapshotKeys, readBatchSummary, readOutcomes, readSectorSignals, type GrowthWarnings,
} from '@/lib/integrations/cemosGrowthData'

export const dynamic = 'force-dynamic'

/**
 * Growth köprüsünün TEK okuma çağrısı.
 *
 * GrafikcemOS buradan DESEN alır, kişi almaz: sektör sinyalleri, deney sonuçları
 * ve maliyet bandı. İşletme adı, e-posta, telefon ve site bu gövdede YOKTUR —
 * `cemosGrowthData` her `select`i alan alan yazar, `select('*')` kullanmaz.
 *
 * Eksik kaynak `warnings` ile ADIYLA görünür. Sessizce boş dönmek, "veri yok"
 * ile "okuyamadım"ı aynı gösterirdi.
 */
export async function GET(req: Request) {
  const date = istanbulDate()
  const monthKey = date.slice(0, 7)
  try {
    const { clientId } = requireGrowthAuth(req, 'read')
    const warnings: GrowthWarnings = []

    const [sectorSignals, outcomes, batches] = await Promise.all([
      readSectorSignals(warnings),
      readOutcomes(warnings),
      readBatchSummary(monthKey, warnings),
    ])

    const snapshot = { date, monthKey, sectorSignals, outcomes, batches }
    const forbidden = findForbiddenSnapshotKeys(snapshot)
    if (forbidden.length) throw new Error('Growth snapshot PII anahtari iceriyor; yanit fail-closed durduruldu.')

    const body = envelope(
      'growth',
      snapshot,
      warnings,
      sectorSignals.length || outcomes.length ? 'ok' : 'empty',
    )

    await writeGrowthAudit({
      route: 'growth/snapshot', method: 'GET', scope: 'read', status: 200,
      responseSummary: {
        clientId, sectors: sectorSignals.length, outcomes: outcomes.length,
        batches: batches.length, warnings: warnings.length,
      },
    })
    return NextResponse.json(body)
  } catch (e) {
    const res = authErrorResponse(e)
    await writeGrowthAudit({
      route: 'growth/snapshot', method: 'GET', scope: 'read', status: res.status,
      error: String((e as Error)?.message ?? e).slice(0, 200),
    })
    return res
  }
}
