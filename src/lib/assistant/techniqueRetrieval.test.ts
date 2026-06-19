import { describe, it, expect } from 'vitest'
import { selectTechniques, buildTechniqueBlock } from './techniqueRetrieval'

describe('techniqueRetrieval', () => {
  it('ruminasyon mesajına defüzyon tekniği seçer', () => {
    const ids = selectTechniques('sürekli düşünüyorum aklımdan çıkmıyor').map((c) => c.id)
    expect(ids).toContain('rumination_defusion')
  })

  it('ayrılık mesajına ilgili teknik seçer', () => {
    const ids = selectTechniques('eski sevgilim aklıma geliyor yalnızlık çekiyorum').map((c) => c.id)
    expect(ids).toContain('breakup_letgo')
  })

  it('erteleme mesajına aktivasyon tekniği seçer', () => {
    const ids = selectTechniques('motivasyonum yok başlayamıyorum bitkinim').map((c) => c.id)
    expect(ids).toContain('procrastination_activation')
  })

  it('sınır mesajına girişkenlik tekniği seçer', () => {
    const ids = selectTechniques('hayır diyemiyorum ön ödeme almadan iş yaptım').map((c) => c.id)
    expect(ids).toContain('boundaries_assertive')
  })

  it('en fazla 2 teknik döner', () => {
    expect(selectTechniques('düşünüyorum yalnızım erteliyorum sınır', 2).length).toBeLessThanOrEqual(2)
  })

  it('eşleşme yoksa boş blok', () => {
    expect(buildTechniqueBlock('xyzzy qwerty')).toBe('')
    expect(selectTechniques('')).toHaveLength(0)
  })

  it('eşleşmede blok teknik talimatı içerir', () => {
    const block = buildTechniqueBlock('kararsızım ne yapmalıyım')
    expect(block).toContain('ÖNERİLEN TEKNİK')
  })
})
