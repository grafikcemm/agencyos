import { describe, it, expect } from 'vitest'
import {
  computeOutcomeTelemetry,
  MIN_SAMPLES_FOR_SIGNAL,
  type OutcomeInputRow,
} from './outcomeTelemetry'

// Faz 7 — GERÇEK funnel telemetrisi: yetersiz örnekte SAHTE optimizasyon iddiası
// YOK (oranlar null + insufficientData); yeterli örnekte gerçek oranlar.

function row(over: Partial<OutcomeInputRow> = {}): OutcomeInputRow {
  return { sector: 'kafe', sent: true, replied: false, positive: false, meeting: false, proposal: false, won: false, ...over }
}

describe('computeOutcomeTelemetry', () => {
  it('YETERSİZ örnek (< MIN): oranlar null, insufficientData true, hasSignal false', () => {
    const rows = Array.from({ length: 5 }, () => row({ replied: true }))
    const r = computeOutcomeTelemetry(rows)
    expect(r.overall.insufficientData).toBe(true)
    expect(r.overall.replyRate).toBeNull()
    expect(r.overall.wonRate).toBeNull()
    expect(r.hasSignal).toBe(false)
  })

  it('YETERLİ örnek (>= MIN): gerçek oranlar hesaplanır, hasSignal true', () => {
    const rows = Array.from({ length: MIN_SAMPLES_FOR_SIGNAL }, (_, i) =>
      row({ replied: i < 10, positive: i < 6, meeting: i < 3, proposal: i < 2, won: i < 1 }),
    )
    const r = computeOutcomeTelemetry(rows)
    expect(r.overall.insufficientData).toBe(false)
    expect(r.overall.replyRate).toBe(0.5) // 10/20
    expect(r.overall.positiveRate).toBe(0.3) // 6/20
    expect(r.overall.wonRate).toBe(0.05) // 1/20
    expect(r.hasSignal).toBe(true)
  })

  it('sektör kırılımı: gönderim sayısına göre azalan sıralı; her segment kendi yeterliliğini taşır', () => {
    const rows = [
      ...Array.from({ length: MIN_SAMPLES_FOR_SIGNAL }, () => row({ sector: 'kafe', replied: true })),
      ...Array.from({ length: 3 }, () => row({ sector: 'kuafor' })),
    ]
    const r = computeOutcomeTelemetry(rows)
    expect(r.bySector[0].segment).toBe('kafe')
    expect(r.bySector[0].insufficientData).toBe(false)
    const kuafor = r.bySector.find((s) => s.segment === 'kuafor')!
    expect(kuafor.insufficientData).toBe(true)
    expect(kuafor.replyRate).toBeNull()
    // Genel yetersiz olsa bile bir segment yeterliyse hasSignal true.
    expect(r.hasSignal).toBe(true)
  })

  it('sektör null → "bilinmeyen" segmentine düşer', () => {
    const rows = [row({ sector: null }), row({ sector: '   ' })]
    const r = computeOutcomeTelemetry(rows)
    expect(r.bySector.some((s) => s.segment === 'bilinmeyen')).toBe(true)
  })

  it('boş girdi → her şey 0, hasSignal false (sahte iddia yok)', () => {
    const r = computeOutcomeTelemetry([])
    expect(r.overall.counts.sent).toBe(0)
    expect(r.hasSignal).toBe(false)
    expect(r.overall.replyRate).toBeNull()
  })

  it('sent=0 ama replied>0 anomалisi → oran null (bölme yok)', () => {
    const rows = Array.from({ length: MIN_SAMPLES_FOR_SIGNAL }, () => row({ sent: false, replied: true }))
    const r = computeOutcomeTelemetry(rows)
    expect(r.overall.counts.sent).toBe(0)
    expect(r.overall.replyRate).toBeNull() // sent=0 → null, NaN değil
  })
})
