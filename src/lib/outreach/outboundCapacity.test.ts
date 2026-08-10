import { describe, it, expect } from 'vitest'
import {
  DELIVERABILITY_THRESHOLDS,
  ENGAGEMENT_LADDER,
  MAILBOX_PLAN,
  OPEN_TRACKING_DEFAULT_ENABLED,
  OUTBOUND_TARGET,
  OUTCOME_HYPOTHESIS,
  READINESS_CHECKS,
  dailyPlan,
  evaluateReadiness,
  mailboxReady,
  readinessFromEnv,
  requiredMailboxes,
  warmupCeiling,
  type ReadinessState,
} from './outboundCapacity'

function state(over: Partial<ReadinessState> = {}): ReadinessState {
  const checks = Object.fromEntries(READINESS_CHECKS.map((c) => [c, true]))
  return {
    checks,
    spamRate: 0.0005,
    hardBounceRate: 0.005,
    gmailSendEnabled: true,
    instantlyEnabled: false,
    ...over,
  }
}

describe('kapasite hedefi', () => {
  it('aylık toplam 2.500–3.000, yeni prospect 1.400–1.600', () => {
    expect(OUTBOUND_TARGET.monthlyTotalMin).toBe(2500)
    expect(OUTBOUND_TARGET.monthlyTotalMax).toBe(3000)
    expect(OUTBOUND_TARGET.monthlyNewProspectsMin).toBe(1400)
    expect(OUTBOUND_TARGET.monthlyNewProspectsMax).toBe(1600)
  })

  it('prospect başına EN FAZLA bir follow-up', () => {
    expect(OUTBOUND_TARGET.maxFollowUpsPerProspect).toBe(1)
  })

  it('günlük plan 22 iş gününde ~114–136 e-posta', () => {
    const p = dailyPlan()
    expect(p.perDayMin).toBe(114)
    expect(p.perDayMax).toBe(136)
  })

  it('günlük plan ilk temas ile follow-up ayrımını gösterir', () => {
    const p = dailyPlan()
    expect(p.firstTouchPerDay).toBeGreaterThan(0)
    expect(p.followUpPerDay).toBeGreaterThan(0)
    // "3.000 ayrı kişi" yanılgısı: ilk temas toplam gönderimden AZ olmalı.
    expect(p.firstTouchPerDay).toBeLessThan(p.perDayMax)
  })

  it('sonuç hedefi GARANTİ değil, deney hedefi olarak etiketlenir', () => {
    expect(OUTCOME_HYPOTHESIS.label).toContain('garanti değil')
    expect(OUTCOME_HYPOTHESIS.paidClientsMax).toBe(4)
  })
})

describe('mailbox ve warm-up', () => {
  it('ana web domaini cold outreach\'te kullanılmaz', () => {
    expect(MAILBOX_PLAN.primaryDomainUsedForOutreach).toBe(false)
  })

  it('warm-up rampası kademelidir, ani sıçrama yoktur', () => {
    const ramp = MAILBOX_PLAN.warmupRamp
    for (let i = 1; i < ramp.length; i++) {
      expect(ramp[i].maxPerDay).toBeGreaterThan(ramp[i - 1].maxPerDay)
      // Hiçbir adım bir öncekinin iki katından fazla olamaz.
      expect(ramp[i].maxPerDay).toBeLessThanOrEqual(ramp[i - 1].maxPerDay * 2)
    }
  })

  it('rampa gün bazlı tavan verir', () => {
    expect(warmupCeiling(0)).toBe(0)
    expect(warmupCeiling(1)).toBe(5)
    expect(warmupCeiling(7)).toBe(10)
    expect(warmupCeiling(90)).toBe(30)
  })

  it('gereken mailbox sayısı plan aralığıyla tutarlı', () => {
    const n = requiredMailboxes()
    expect(n).toBeGreaterThanOrEqual(MAILBOX_PLAN.mailboxesMin - 1)
    expect(n).toBeLessThanOrEqual(MAILBOX_PLAN.mailboxesMax)
  })
})

describe('hazırlık kapısı — FAIL-CLOSED', () => {
  it('hiçbir şey kanıtlanmamışken hazır değildir', () => {
    const v = evaluateReadiness({ checks: {}, spamRate: null, hardBounceRate: null, gmailSendEnabled: false, instantlyEnabled: false })
    expect(v.ready).toBe(false)
    expect(v.missingChecks.length).toBe(READINESS_CHECKS.length)
    expect(v.blockers.join(' ')).toContain('ölçülmedi')
  })

  it('ölçüm yoksa "iyi" varsayılmaz', () => {
    expect(evaluateReadiness(state({ spamRate: null })).ready).toBe(false)
    expect(evaluateReadiness(state({ hardBounceRate: null })).ready).toBe(false)
  })

  it('spam oranı sert durdurma eşiğinde gönderim durur', () => {
    const v = evaluateReadiness(state({ spamRate: DELIVERABILITY_THRESHOLDS.spamRateHardStop }))
    expect(v.hardStop).toBe(true)
    expect(v.ready).toBe(false)
  })

  it('hard bounce tavanı %2', () => {
    expect(evaluateReadiness(state({ hardBounceRate: 0.021 })).ready).toBe(false)
    expect(evaluateReadiness(state({ hardBounceRate: 0.019 })).ready).toBe(true)
  })

  it('tek bir eksik koşul bile hazırlığı düşürür', () => {
    for (const c of READINESS_CHECKS) {
      const checks = Object.fromEntries(READINESS_CHECKS.map((k) => [k, k !== c]))
      expect(evaluateReadiness(state({ checks })).ready).toBe(false)
    }
  })

  it('gerçek gönderim bayrağı kapalıysa hazır değildir', () => {
    const v = evaluateReadiness(state({ gmailSendEnabled: false, instantlyEnabled: false }))
    expect(v.ready).toBe(false)
    expect(v.blockers.join(' ')).toContain('GMAIL_SEND_ENABLED')
  })

  it('hepsi tamsa hazırdır', () => {
    expect(evaluateReadiness(state()).ready).toBe(true)
  })
})

describe('ortam okuması', () => {
  it('bayrak açık olsa bile ölçüm yokken mailbox hazır değildir', () => {
    const s = readinessFromEnv({ GMAIL_SEND_ENABLED: 'true' })
    expect(s.gmailSendEnabled).toBe(true)
    expect(mailboxReady(s)).toBe(false)
  })

  it('varsayılan ortamda bayraklar kapalı', () => {
    const s = readinessFromEnv({})
    expect(s.gmailSendEnabled).toBe(false)
    expect(s.instantlyEnabled).toBe(false)
  })
})

describe('ölçüm dili', () => {
  it('open tracking varsayılan KAPALI', () => {
    expect(OPEN_TRACKING_DEFAULT_ENABLED).toBe(false)
  })

  it('etkileşim merdiveninde open yoktur ve her basamak kendi paydasını taşır', () => {
    const keys = ENGAGEMENT_LADDER.map((s) => s.key)
    expect(keys).not.toContain('open')
    for (const step of ENGAGEMENT_LADDER) {
      expect(step.denominator.length).toBeGreaterThan(0)
    }
  })

  it('ücretli müşteri basamağı ayrı paydayla ölçülür', () => {
    const paid = ENGAGEMENT_LADDER.find((s) => s.key === 'paid_entry_offer')
    expect(paid?.denominator).toBe('meeting')
  })
})
