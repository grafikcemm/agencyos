import { describe, it, expect } from 'vitest'
import { computeCockpit, type EvidenceRecord, type CapacitySummary } from './cockpit'
import { CAREER_MONTHS, WEEKLY_CAPACITY_TOTAL } from '@/data/careerRoute'

const NOW = Date.parse('2026-08-10T09:00:00.000Z')

function evi(
  requirementId: string,
  status: EvidenceRecord['verification_status'] = 'verified',
  extra: Partial<EvidenceRecord> = {},
): EvidenceRecord {
  return {
    id: `${requirementId}-${status}-${extra.id ?? '1'}`,
    requirement_id: requirementId,
    competency_id: null,
    month_id: null,
    kind: 'published_page',
    url: 'https://example.com',
    title: requirementId,
    verification_status: status,
    occurred_at: '2026-08-08T00:00:00.000Z',
    verified_at: '2026-08-08T00:00:00.000Z',
    ...extra,
  }
}

const M1 = CAREER_MONTHS[0].evidenceRequirements.map((r) => r.id)
const M2 = CAREER_MONTHS[1].evidenceRequirements.map((r) => r.id)

describe('computeCockpit — varsayılan durum', () => {
  it('kanıt yoksa Ay 1 güncel, diğerleri kilitli', () => {
    const c = computeCockpit([], null, NOW)
    expect(c.current.month.id).toBe('month-1')
    expect(c.months[0].state).toBe('current')
    expect(c.months[1].state).toBe('locked')
    expect(c.months[1].lockedBy).toEqual(['m1-landing', 'm1-design-system'])
  })

  it('haftanın TEK ana teslimini gösterir', () => {
    const c = computeCockpit([], null, NOW)
    expect(c.weekMilestone.index).toBe(1)
    expect(c.weekMilestone.total).toBe(CAREER_MONTHS[0].weeklyMilestones.length)
    expect(c.weekMilestone.title).toBe(CAREER_MONTHS[0].weeklyMilestones[0])
  })

  it('kuzey yıldızı kimliğini taşır', () => {
    const c = computeCockpit([], null, NOW)
    expect(c.northStar.identity).toContain('Creative Technologist')
  })
})

describe('kanıt kapısı — ay yalnız DOĞRULANMIŞ kanıtla açılır', () => {
  it('pending kanıt ayı açmaz', () => {
    const c = computeCockpit(M1.map((id) => evi(id, 'pending')), null, NOW)
    expect(c.current.month.id).toBe('month-1')
    expect(c.current.verifiedCount).toBe(0)
  })

  it('grace kanıt SAYILMAZ ama düşürmez de', () => {
    const c = computeCockpit(M1.map((id) => evi(id, 'grace')), null, NOW)
    expect(c.current.verifiedCount).toBe(0)
    expect(c.evidence.grace).toBe(3)
    expect(c.months[1].state).toBe('locked')
  })

  it('bağımlılık kanıtları doğrulanınca sonraki ay açılır', () => {
    const c = computeCockpit(
      [evi('m1-landing'), evi('m1-design-system')],
      null,
      NOW,
    )
    // Ay 1 hâlâ eksik (m1-user-tests yok) ama Ay 2'nin bağımlılığı karşılandı.
    expect(c.current.month.id).toBe('month-1')
    expect(c.months[1].state).toBe('next')
    expect(c.months[1].lockedBy).toEqual([])
  })

  it('Ay 1 tamamen kanıtlanınca güncel ay Ay 2 olur', () => {
    const c = computeCockpit(M1.map((id) => evi(id)), null, NOW)
    expect(c.months[0].state).toBe('done')
    expect(c.current.month.id).toBe('month-2')
  })

  it('erişilemez hale gelen kanıt ilerlemeyi DÜŞÜRÜR', () => {
    const withEvidence = computeCockpit([evi('m1-landing')], null, NOW)
    expect(withEvidence.current.verifiedCount).toBe(1)

    const broken = computeCockpit([evi('m1-landing', 'unreachable')], null, NOW)
    expect(broken.current.verifiedCount).toBe(0)
  })

  it('aynı gereksinimin BAŞKA doğrulanmış kanıtı varsa düşmez', () => {
    const c = computeCockpit(
      [evi('m1-landing', 'unreachable', { id: 'a' }), evi('m1-landing', 'verified', { id: 'b' })],
      null,
      NOW,
    )
    expect(c.current.verifiedCount).toBe(1)
  })

  it('tüm aylar tamamlanınca son ay güncel kalır', () => {
    const all = CAREER_MONTHS.flatMap((m) => m.evidenceRequirements.map((r) => evi(r.id)))
    const c = computeCockpit(all, null, NOW)
    expect(c.current.month.id).toBe('month-4')
    expect(c.months.every((m) => m.state === 'done' || m.state === 'current')).toBe(true)
  })
})

describe('kapasite — "ölçülmedi" ≠ 0', () => {
  it('köprü kapalıyken actualHours null ve kaynak olculmedi', () => {
    const c = computeCockpit([], null, NOW)
    expect(c.capacity.actualHours).toBeNull()
    expect(c.capacity.source).toBe('olculmedi')
    expect(c.capacity.plannedHours).toBe(WEEKLY_CAPACITY_TOTAL)
    expect(WEEKLY_CAPACITY_TOTAL).toBe(14)
  })

  it('CemOS özeti geldiğinde gerçekleşen saat görünür', () => {
    const cap: CapacitySummary = {
      actualHours: 9,
      loadClass: 'heavy',
      hasConflict: true,
      lockedPriority: null,
    }
    const c = computeCockpit([], cap, NOW)
    expect(c.capacity.actualHours).toBe(9)
    expect(c.capacity.source).toBe('cemos')
    expect(c.capacity.loadClass).toBe('heavy')
  })

  it('sıfır saat bildirilirse 0 gösterilir — bu ölçülmüş bir değerdir', () => {
    const cap: CapacitySummary = { actualHours: 0, loadClass: 'light', hasConflict: false, lockedPriority: null }
    const c = computeCockpit([], cap, NOW)
    expect(c.capacity.actualHours).toBe(0)
    expect(c.capacity.source).toBe('cemos')
  })
})

describe('sürekli şeritler ve engeller', () => {
  it('İngilizce blocker olarak işaretli ve kanıtsızken ilk engel odur', () => {
    const c = computeCockpit([], null, NOW)
    const english = c.lanes.find((l) => l.lane.id === 'english')
    expect(english?.isBlocker).toBe(true)
    expect(english?.recentProof).toBe(false)
    expect(c.nextBlocker).toContain('A1 seviyesi')
  })

  it('son 7 günde kanıt varsa şerit taze sayılır ve engel değişir', () => {
    const c = computeCockpit(
      [evi('x', 'verified', { competency_id: 'english', occurred_at: '2026-08-09T00:00:00.000Z', requirement_id: null })],
      null,
      NOW,
    )
    const english = c.lanes.find((l) => l.lane.id === 'english')
    expect(english?.recentProof).toBe(true)
    expect(c.nextBlocker).toContain('Kanıt bekliyor')
  })

  it('7 günden eski kanıt şeridi taze yapmaz', () => {
    const c = computeCockpit(
      [evi('x', 'verified', { competency_id: 'english', occurred_at: '2026-07-01T00:00:00.000Z', requirement_id: null })],
      null,
      NOW,
    )
    expect(c.lanes.find((l) => l.lane.id === 'english')?.recentProof).toBe(false)
  })

  it('sürekli öğrenme ayrı bir tamamlanabilir kart DEĞİL — şerit olarak var', () => {
    const c = computeCockpit([], null, NOW)
    expect(c.lanes.map((l) => l.lane.id)).toContain('continuous-learning')
    expect(c.lanes.find((l) => l.lane.id === 'continuous-learning')?.lane.weeklyHours).toBe(0)
  })
})

describe('bozulma görünürlüğü', () => {
  it('LIFE DB okunamadıysa degraded işaretlenir — sessizce "kanıt yok" denmez', () => {
    const c = computeCockpit([], null, NOW, { evidence: true, capacity: true })
    expect(c.degraded.evidence).toBe(true)
    expect(c.degraded.capacity).toBe(true)
  })
})

describe('kanıt sayacı', () => {
  it('her durumu ayrı sayar', () => {
    const c = computeCockpit(
      [evi(M1[0]), evi(M1[1], 'pending'), evi(M1[2], 'grace'), evi(M2[0], 'unreachable')],
      null,
      NOW,
    )
    expect(c.evidence).toEqual({ verified: 1, pending: 1, grace: 1, unreachable: 1, total: 4 })
  })
})
