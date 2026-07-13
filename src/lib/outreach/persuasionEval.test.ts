import { describe, it, expect } from 'vitest'
import {
  PERSUASION_GOLDEN_SET,
  evaluatePersuasion,
  repetitionRatio,
  buildJudgePrompt,
} from './persuasionEval'

// Golden persuasion seti (Faz 3.9-3.11) — deterministik; her koşuda aynı sonuç.
// Model-judge CI'da ÇAĞRILMAZ; buildJudgePrompt yalnız şekil olarak doğrulanır.

describe('golden persuasion set — sektör × rol × funnel', () => {
  for (const gc of PERSUASION_GOLDEN_SET) {
    it(`${gc.id} → ${gc.expectPass ? 'GEÇER' : 'KALIR'}`, () => {
      const score = evaluatePersuasion(gc.sample, gc.ctx)
      if (gc.expectPass) {
        expect(score.criteria.filter((c) => !c.pass)).toEqual([])
        expect(score.pass).toBe(true)
      } else {
        expect(score.pass).toBe(false)
        for (const key of gc.expectFail ?? []) {
          const criterion = score.criteria.find((c) => c.key === key)
          expect(criterion?.pass, `kriter ${key} başarısız olmalıydı`).toBe(false)
        }
      }
    })
  }

  it('matris kapsaması: ≥4 sektör, ≥5 rol, 3 funnel aşaması, iki kanal', () => {
    const sectors = new Set(PERSUASION_GOLDEN_SET.map((g) => g.ctx.sector))
    const roles = new Set(PERSUASION_GOLDEN_SET.map((g) => g.ctx.role))
    const stages = new Set(PERSUASION_GOLDEN_SET.map((g) => g.ctx.funnelStage))
    const channels = new Set(PERSUASION_GOLDEN_SET.map((g) => g.ctx.channel))
    expect(sectors.size).toBeGreaterThanOrEqual(4)
    expect(roles.size).toBeGreaterThanOrEqual(5)
    expect(stages.size).toBe(3)
    expect(channels.size).toBe(2)
  })

  it('iyi ve kötü örnekler dengeli (her ikisinden de en az 4)', () => {
    const good = PERSUASION_GOLDEN_SET.filter((g) => g.expectPass).length
    const bad = PERSUASION_GOLDEN_SET.filter((g) => !g.expectPass).length
    expect(good).toBeGreaterThanOrEqual(4)
    expect(bad).toBeGreaterThanOrEqual(4)
  })
})

describe('repetitionRatio', () => {
  it('önceki metin yoksa 0; birebir kopya yüksek oran', () => {
    expect(repetitionRatio('Uzun bir cümle burada duruyor ve yeterince karakter içeriyor.', [])).toBe(0)
    const text = 'Bu cümle yeterince uzun ve tekrar kontrolüne girecek kadar karakterli.\nİkinci cümle de yeterince uzun ve özgün olmayan bir içerik taşıyor.'
    expect(repetitionRatio(text, [text])).toBe(1)
  })
})

describe('buildJudgePrompt (model-judge — CI\'da çağrılmaz)', () => {
  it('bağlamı ve metni içerir; JSON çıktı ister', () => {
    const gc = PERSUASION_GOLDEN_SET[0]
    const prompt = buildJudgePrompt(gc.sample, gc.ctx)
    expect(prompt).toContain('sektör=klinik')
    expect(prompt).toContain('YALNIZ JSON döndür')
    expect(prompt).toContain(gc.sample.body.slice(0, 30))
  })
})
