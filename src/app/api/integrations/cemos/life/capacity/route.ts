import { NextResponse } from 'next/server'
import {
  authErrorResponse, envelope, istanbulDate, requireCemosAuth, writeAudit,
} from '@/lib/integrations/cemosLifeAuth'
import { capacitySignal, readDaily, readTasks, type LifeWarnings } from '@/lib/integrations/cemosLifeData'

export const dynamic = 'force-dynamic'

/**
 * KAPASITE SINYALI — hesap DEĞİL.
 *
 * "Kaç saatin var" sorusunu GrafikcemOS'un `capacity.mjs`'i cevaplar ve o motor
 * ölçülmemiş girdiyi sıfır saymaz (ölçüldü / tahmin / bilinmiyor). Burada bir
 * saat tahmini üretmek ikinci bir doğruluk kaynağı yaratırdı: iki taraf farklı
 * sayı gösterir, hangisinin doğru olduğu belirsizleşirdi.
 */
export async function GET(req: Request) {
  try {
    requireCemosAuth(req, 'read')
    const warnings: LifeWarnings = []
    const today = istanbulDate()
    const [tasks, daily] = await Promise.all([readTasks(warnings), readDaily(today, warnings)])
    const signal = capacitySignal(tasks, daily, today)
    if (!signal.measured) warnings.push('daily_v2: bugün için kayıt yok — enerji/mod ÖLÇÜLMEDI')
    await writeAudit({ route: 'life/capacity', method: 'GET', scope: 'read', status: 200, responseSummary: { openTasks: signal.openTasks } })
    return NextResponse.json(envelope('life/capacity', { date: today, signal }, warnings, signal.measured ? 'ok' : 'degraded'))
  } catch (e) {
    return authErrorResponse(e)
  }
}
