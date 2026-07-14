import { describe, it, expect } from 'vitest'
import { evaluatePersuasion } from './persuasionEval'
import {
  PERSUASION_MATRIX,
  MATRIX_SECTORS,
  MATRIX_ROLES,
  MATRIX_STAGES,
} from './persuasionMatrix'

// FINALIZATION Faz 2 — GERÇEK 90-kombinasyon matrisi (5 sektör × 6 rol × 3 aşama),
// her kombinasyonda iyi/kötü sınır örneği + beklenen kriter sonucu. Deterministik.

describe('persuasion matrisi — kapsam', () => {
  it('TAM çapraz matris: 5×6×3 = 90 kombinasyon, her birinde GOOD + BAD (180 örnek)', () => {
    expect(PERSUASION_MATRIX).toHaveLength(180)
    const combos = new Set(
      PERSUASION_MATRIX.map((c) => `${c.ctx.sector}|${c.ctx.role}|${c.ctx.funnelStage}`),
    )
    expect(combos.size).toBe(90)
    expect(MATRIX_SECTORS).toHaveLength(5)
    expect(MATRIX_ROLES).toHaveLength(6)
    expect(MATRIX_STAGES).toHaveLength(3)
    for (const sector of MATRIX_SECTORS)
      for (const role of MATRIX_ROLES)
        for (const stage of MATRIX_STAGES)
          expect(combos.has(`${sector}|${role}|${stage}`), `eksik kombinasyon: ${sector}/${role}/${stage}`).toBe(true)
  })

  it('6 başarısızlık sınıfının HEPSİ matriste temsil edilir', () => {
    const modes = new Set(
      PERSUASION_MATRIX.filter((c) => !c.expectPass).map((c) => c.id.split('-BAD-')[1]),
    )
    for (const m of ['uydurma_iddia', 'sahte_aciliyet', 'manipulasyon', 'klise', 'asiri_uzunluk', 'rol_uyumsuz']) {
      expect(modes.has(m), `başarısızlık sınıfı matriste yok: ${m}`).toBe(true)
    }
  })

  it('açılar farklılaşır: aynı sektörde farklı ROL ve farklı AŞAMA metinleri birbirinin kopyası değil', () => {
    const good = PERSUASION_MATRIX.filter((c) => c.expectPass)
    for (const sector of MATRIX_SECTORS) {
      const bodies = good.filter((c) => c.ctx.sector === sector).map((c) => c.sample.body)
      expect(new Set(bodies).size).toBe(bodies.length) // 18 farklı metin / sektör
    }
    // Sektörler arası gözlem cümlesi de farklı (evidence-backed kişiselleştirme).
    const coldOwner = good.filter((c) => c.ctx.role === 'owner' && c.ctx.funnelStage === 'cold')
    expect(new Set(coldOwner.map((c) => c.sample.body)).size).toBe(MATRIX_SECTORS.length)
  })
})

describe('persuasion matrisi — 180 sınır örneği deterministik değerlendirme', () => {
  for (const gc of PERSUASION_MATRIX) {
    it(`${gc.id} → ${gc.expectPass ? 'GEÇER' : 'KALIR'}`, () => {
      const score = evaluatePersuasion(gc.sample, gc.ctx)
      if (gc.expectPass) {
        expect(
          score.criteria.filter((c) => !c.pass).map((c) => `${c.key}:${c.detail}`),
          'GOOD örnek tüm kriterleri geçmeli',
        ).toEqual([])
        expect(score.pass).toBe(true)
      } else {
        expect(score.pass).toBe(false)
        for (const key of gc.expectFail ?? []) {
          const criterion = score.criteria.find((c) => c.key === key)
          expect(criterion?.pass, `kriter ${key} başarısız olmalıydı (${gc.id})`).toBe(false)
        }
      }
    })
  }
})
