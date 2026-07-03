import { describe, it, expect } from 'vitest'
import {
  selectDailyOpportunities,
  passesHardFloor,
  computeBalanceMultiplier,
  SelectionCandidate,
  BALANCE_BONUS_CAP,
} from './selection'

function candidate(overrides: Partial<SelectionCandidate>): SelectionCandidate {
  return {
    key: overrides.key ?? 'k1',
    businessName: overrides.businessName ?? 'Test',
    designScore: 80,
    aiScore: 75,
    verifiedEvidenceCount: 4,
    hasContactChannel: true,
    primaryDomain: 'tasarim',
    primaryMatchScore: 85,
    chairDecision: 'opportunity',
    ...overrides,
  }
}

describe('passesHardFloor (asla baypas edilmez)', () => {
  it('taban şartları: ≥2 doğrulanmış kanıt, skor ≥70, iletişim kanalı, chair opportunity', () => {
    expect(passesHardFloor(candidate({})).pass).toBe(true)
    expect(passesHardFloor(candidate({ verifiedEvidenceCount: 1 })).pass).toBe(false)
    expect(passesHardFloor(candidate({ designScore: 65, aiScore: 60 })).pass).toBe(false)
    expect(passesHardFloor(candidate({ hasContactChannel: false })).pass).toBe(false)
    expect(passesHardFloor(candidate({ chairDecision: 'reject' })).pass).toBe(false)
  })

  it('tek skorun 70+ olması yeter (bağımsız Tasarım/AI skorları)', () => {
    expect(passesHardFloor(candidate({ designScore: 72, aiScore: 30 })).pass).toBe(true)
    expect(passesHardFloor(candidate({ designScore: 30, aiScore: 72 })).pass).toBe(true)
  })
})

describe('selectDailyOpportunities', () => {
  it('aynı lead\'in Tasarım ve AI adayları birlikte seçilebilir; en güçlü 2 kazanır', () => {
    const result = selectDailyOpportunities(
      [
        candidate({ key: 'a', businessName: 'Tasarım Güçlü', primaryDomain: 'tasarim', primaryMatchScore: 92 }),
        candidate({ key: 'b', businessName: 'AI Güçlü', primaryDomain: 'ai_otomasyon', primaryMatchScore: 88, designScore: 40, aiScore: 85 }),
        candidate({ key: 'c', businessName: 'Orta', primaryMatchScore: 75 }),
      ],
      { designCount: 0, aiCount: 0 }
    )
    expect(result.selected.map((s) => s.key)).toEqual(['a', 'b'])
    expect(result.rejected.find((r) => r.candidate.key === 'c')?.reason).toContain('kota')
  })

  it('DENGE BONUSU ZAYIF ADAYI KURTARAMAZ: deficit 5 bile olsa tabansız aday seçilmez', () => {
    const result = selectDailyOpportunities(
      [
        candidate({ key: 'guclu-tasarim', primaryDomain: 'tasarim', primaryMatchScore: 90 }),
        // Zayıf AI adayı: skor 60 (taban 70 altı) + tek doğrulanmış kanıt.
        candidate({ key: 'zayif-ai', primaryDomain: 'ai_otomasyon', designScore: 40, aiScore: 60, verifiedEvidenceCount: 1, primaryMatchScore: 95 }),
      ],
      { designCount: 6, aiCount: 1 } // deficit 5 → AI lehine maksimum bonus isterdi
    )
    expect(result.selected.map((s) => s.key)).toEqual(['guclu-tasarim'])
    expect(result.selected).toHaveLength(1) // kota ZORLA doldurulmaz
    const rejection = result.rejected.find((r) => r.candidate.key === 'zayif-ai')
    expect(rejection).toBeDefined()
  })

  it('denge bonusu yalnız baş-başa yarışı çevirir (tavan 1.15)', () => {
    const { multiplier } = computeBalanceMultiplier({ designCount: 0, aiCount: 10 })
    expect(multiplier).toBe(BALANCE_BONUS_CAP) // deficit 10 → yine 1.15'te kapanır

    // Baş-başa: tasarım 84 vs AI 80; deficit 3 (AI az) → AI çarpanı 1.15 → 92 → AI öne geçer.
    const closeRace = selectDailyOpportunities(
      [
        candidate({ key: 't', primaryDomain: 'tasarim', primaryMatchScore: 84 }),
        candidate({ key: 'ai', primaryDomain: 'ai_otomasyon', designScore: 75, aiScore: 82, primaryMatchScore: 80 }),
        candidate({ key: 't2', primaryDomain: 'tasarim', primaryMatchScore: 83 }),
      ],
      { designCount: 4, aiCount: 1 },
      2
    )
    expect(closeRace.balanceApplied.favoredDomain).toBe('ai_otomasyon')
    expect(closeRace.selected.map((s) => s.key)).toContain('ai')

    // Açık fark: AI 60 vs tasarım 90 — bonus (×1.15=69) yetmez, tasarımlar kazanır.
    const bigGap = selectDailyOpportunities(
      [
        candidate({ key: 't', primaryDomain: 'tasarim', primaryMatchScore: 90 }),
        candidate({ key: 't2', primaryDomain: 'tasarim', primaryMatchScore: 88 }),
        candidate({ key: 'ai', primaryDomain: 'ai_otomasyon', designScore: 75, aiScore: 72, primaryMatchScore: 60 }),
      ],
      { designCount: 4, aiCount: 1 },
      2
    )
    expect(bigGap.selected.map((s) => s.key)).toEqual(['t', 't2'])
  })

  it('denge eşitse çarpan 1 (bonus yok)', () => {
    expect(computeBalanceMultiplier({ designCount: 3, aiCount: 3 })).toEqual({ favoredDomain: null, multiplier: 1 })
  })

  it('tabanı geçen tek aday varsa 1 döner — eksik kota kabul edilir', () => {
    const result = selectDailyOpportunities(
      [candidate({ key: 'tek' }), candidate({ key: 'reject', chairDecision: 'reject' })],
      { designCount: 0, aiCount: 0 }
    )
    expect(result.selected).toHaveLength(1)
  })
})
