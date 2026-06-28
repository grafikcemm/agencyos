import { describe, it, expect } from 'vitest'
import {
  projectAgno,
  letterToPoint,
  agnoBand,
  effectiveLetter,
  BASELINE,
  type AkademiCourse,
} from './agno'

// ── Test yardımcısı ──────────────────────────────────────────────────────────
function course(partial: Partial<AkademiCourse> & { name: string }): AkademiCourse {
  return {
    id: 1,
    term: 'guz',
    akts: 5,
    kind: 'retake',
    category: 'zorunlu',
    status: 'alinacak',
    expected_letter: null,
    actual_letter: null,
    is_risk: false,
    in_average: true,
    sort_order: 0,
    ...partial,
  }
}

describe('letterToPoint', () => {
  it('bilinen harfleri katsayıya çevirir', () => {
    expect(letterToPoint('AA')).toBe(4.0)
    expect(letterToPoint('BB')).toBe(3.0)
    expect(letterToPoint('CC')).toBe(2.0)
    expect(letterToPoint('FF')).toBe(0)
    expect(letterToPoint('DZ')).toBe(0)
  })

  it('G/M/null/bilinmeyen → null (ortalamaya girmez)', () => {
    expect(letterToPoint('G')).toBeNull()
    expect(letterToPoint('M')).toBeNull()
    expect(letterToPoint(null)).toBeNull()
    expect(letterToPoint('')).toBeNull()
    expect(letterToPoint('XX')).toBeNull()
  })
})

describe('agnoBand', () => {
  it('band sınırları doğru', () => {
    expect(agnoBand(1.99)).toBe('red')
    expect(agnoBand(2.0)).toBe('yellow') // hedef dahil sarı
    expect(agnoBand(2.24)).toBe('yellow')
    expect(agnoBand(2.25)).toBe('green') // güvenli bant dahil yeşil
    expect(agnoBand(3.5)).toBe('green')
  })
})

describe('effectiveLetter', () => {
  it('kesin sonuç beklenenin önüne geçer', () => {
    expect(effectiveLetter(course({ name: 'X', expected_letter: 'BB', actual_letter: 'AA' }))).toBe('AA')
    expect(effectiveLetter(course({ name: 'X', expected_letter: 'BB', actual_letter: null }))).toBe('BB')
    expect(effectiveLetter(course({ name: 'X', expected_letter: null, actual_letter: null }))).toBeNull()
  })
})

describe('projectAgno', () => {
  it('boş/harfsiz liste → baseline 1.63', () => {
    const r = projectAgno([])
    expect(r.points).toBe(331.5)
    expect(r.denominator).toBe(203)
    expect(r.agno).toBeCloseTo(1.633, 3)
    expect(r.band).toBe('red')
    expect(r.countedCourses).toBe(0)
  })

  it('harfi girilmemiş ders projeksiyona girmez', () => {
    const r = projectAgno([course({ name: 'X', kind: 'retake', akts: 6, expected_letter: null })])
    expect(r.points).toBe(331.5)
    expect(r.denominator).toBe(203)
    expect(r.countedCourses).toBe(0)
  })

  it('retake ders paydayı şişirmez, yalnız puan ekler', () => {
    // retake 6 AKTS, BB(3.0) → puan += 18, payda sabit 203
    const r = projectAgno([course({ name: 'Temel Tasarım', kind: 'retake', akts: 6, expected_letter: 'BB' })])
    expect(r.points).toBe(331.5 + 18)
    expect(r.denominator).toBe(203)
    expect(r.agno).toBeCloseTo((331.5 + 18) / 203, 5)
    expect(r.countedCourses).toBe(1)
  })

  it('new ders hem payda hem puan ekler', () => {
    // new 5 AKTS, AA(4.0) → puan += 20, payda += 5
    const r = projectAgno([course({ name: 'Hukuk', kind: 'new', akts: 5, expected_letter: 'AA' })])
    expect(r.points).toBe(331.5 + 20)
    expect(r.denominator).toBe(203 + 5)
    expect(r.agno).toBeCloseTo((331.5 + 20) / 208, 5)
  })

  it('mezuniyet paydası = 203 + tüm new AKTS (harf bağımsız)', () => {
    // 16 AKTS new (5+5+6), hiçbiri harfsiz → gradAkts 219, denominator 203
    const r = projectAgno([
      course({ name: 'Hukuk', kind: 'new', akts: 5, expected_letter: null }),
      course({ name: 'Medya Tarihi', kind: 'new', akts: 5, expected_letter: null }),
      course({ name: 'SEC_7_3', kind: 'new', akts: 6, expected_letter: null }),
    ])
    expect(r.gradAkts).toBe(219)
    expect(r.denominator).toBe(203)
  })

  it('in_average=false (TMD) ortalamaya hiç girmez', () => {
    const r = projectAgno([course({ name: 'TMD', kind: 'retake', akts: 0, in_average: false, expected_letter: 'AA' })])
    expect(r.points).toBe(331.5)
    expect(r.gradAkts).toBe(203)
    expect(r.countedCourses).toBe(0)
  })

  it('actual_letter beklenenin yerine geçer', () => {
    const r = projectAgno([course({ name: 'X', kind: 'retake', akts: 4, expected_letter: 'FF', actual_letter: 'CB' })])
    // CB=2.5 × 4 = 10 (FF değil)
    expect(r.points).toBe(331.5 + 10)
  })

  it('karışık senaryo: 2 retake + 1 new', () => {
    const r = projectAgno([
      course({ name: 'A', kind: 'retake', akts: 6, expected_letter: 'CC' }), // 2.0×6=12
      course({ name: 'B', kind: 'retake', akts: 5, expected_letter: 'BB' }), // 3.0×5=15
      course({ name: 'C', kind: 'new', akts: 5, expected_letter: 'BA' }), // 3.5×5=17.5, payda+5
    ])
    expect(r.points).toBe(331.5 + 12 + 15 + 17.5)
    expect(r.denominator).toBe(203 + 5)
    expect(r.gradAkts).toBe(203 + 5)
    expect(r.countedCourses).toBe(3)
  })

  it('baseline AGNO sabiti tutarlı', () => {
    expect(BASELINE.agno).toBeCloseTo(1.633, 3)
  })
})
