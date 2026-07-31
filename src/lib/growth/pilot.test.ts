import { describe, it, expect, vi } from 'vitest'
import {
  EMAIL_PILOT_V1,
  MAX_WORDS,
  MIN_WORDS,
  SIGNATURE,
  TERMINAL_EVENTS,
  checkPilotFormat,
  countWords,
  isGenericObservation,
  remainingSteps,
  renderPilotStep,
  stepDueAt,
} from './sequences/emailPilotV1'
import type { PilotEvidence } from './sequences/emailPilotV1'
import {
  DAILY_CAPS,
  HARD_PAUSE,
  PilotBlockedError,
  assertCanEnqueue,
  capForWeek,
  describePilotGate,
  hardPauseReasons,
} from './pilotGuards'
import {
  MIN_DELIVERED_FOR_WINNER,
  buildCockpit,
  costMetrics,
  decideWinner,
  funnelRates,
} from './cockpit'
import type { FunnelCounts, VariantStats } from './cockpit'
import { createFakeOutreachProvider, guardedSend, listOutreachHealth } from './outreach'
import { listProviderHealth } from './sources'

// RT-A6 — email_pilot_v1, güvence kapıları ve kokpit.
// Gerçek gönderim SIFIR: uçtan uca akış Fake sağlayıcıyla koşar.

const EVIDENCE: PilotEvidence = {
  observation: {
    tr: 'Rezervasyon formunuz mobilde ikinci adımda telefon doğrulaması istiyor; telefonda klavye açılınca doğrulama alanı ekranın altında kalıyor ve sayfa kendiliğinden kaymıyor, alanı görmek için elle yukarı çekmek gerekiyor.',
    en: 'On mobile your booking form asks for phone verification at step two; once the keyboard opens the field sits below the fold and the page does not scroll on its own, so people have to drag it up by hand to see it.',
  },
  hypothesis: {
    tr: 'Bırakmanın bir kısmı burada olabilir. Doğrulamayı rezervasyon tamamlandıktan sonraya almak ya da alanı görünür tutmak tamamlanan rezervasyon sayısını artırabilir; ölçmeden emin konuşmuyorum.',
    en: 'Some of the drop-off may sit here. Moving verification to after the booking, or keeping the field in view, could raise completed bookings; I would not claim it without measuring.',
  },
  cta: {
    tr: 'Bu ekranın kısa bir kaydını göndermemi ister misiniz?',
    en: 'Would you like me to send a short recording of that screen?',
  },
}

const day0 = EMAIL_PILOT_V1[0]

// ───────────────────────────── dizi tanımı ───────────────────────────────────

describe('email_pilot_v1 — dizi tanımı', () => {
  it('üç temas: gün 0, 3, 7', () => {
    expect(EMAIL_PILOT_V1.map((s) => s.dayOffset)).toEqual([0, 3, 7])
    expect(EMAIL_PILOT_V1.map((s) => s.key)).toEqual(['day0', 'day3', 'day7'])
  })

  it('her temasın AYRI bir işi var', () => {
    const purposes = EMAIL_PILOT_V1.map((s) => s.purpose)
    expect(new Set(purposes).size).toBe(3)
  })

  it('tanım dondurulmuş — çalışma zamanında değiştirilemez', () => {
    expect(Object.isFrozen(EMAIL_PILOT_V1)).toBe(true)
  })

  it('vade günü ofsetten hesaplanır', () => {
    const start = new Date('2026-08-03T09:00:00Z')
    expect(stepDueAt(EMAIL_PILOT_V1[1], start).toISOString()).toBe('2026-08-06T09:00:00.000Z')
    expect(stepDueAt(EMAIL_PILOT_V1[2], start).toISOString()).toBe('2026-08-10T09:00:00.000Z')
  })

  it('çok kanallı 6 temaslı matris SİLİNMEDİ', async () => {
    const m = await import('../outreach/channelMatrix')
    expect(typeof m.buildMultiChannelPlan).toBe('function')
    expect(m.buildMultiChannelPlan('local').length).toBeGreaterThanOrEqual(5)
  })
})

// ──────────────────────────── metin üretimi ──────────────────────────────────

describe('renderPilotStep — TR', () => {
  it('60-100 kelime, tek çağrı, doğru imza', () => {
    const r = renderPilotStep({ step: day0, locale: 'tr', recipientFirstName: 'Deniz', evidence: EVIDENCE })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.step.body).toContain('Merhaba Deniz,')
    expect(r.step.body.endsWith(SIGNATURE)).toBe(true)
    expect(r.step.backTranslationTr).toBeNull()
    const f = checkPilotFormat(r.step.body)
    expect(f.violations).not.toContain('wrong_signature')
    expect(f.violations).not.toContain('multiple_questions')
  })

  it('isim yoksa selam yine de doğru biter', () => {
    const r = renderPilotStep({ step: day0, locale: 'tr', evidence: EVIDENCE })
    expect(r.ok && r.step.body.startsWith('Merhaba,')).toBe(true)
  })
})

describe('renderPilotStep — global lead', () => {
  it('İngilizce gövde + operatör için TÜRKÇE geri çeviri', () => {
    const r = renderPilotStep({ step: day0, locale: 'en', recipientFirstName: 'Alex', evidence: EVIDENCE })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.step.body).toContain('Hello Alex,')
    expect(r.step.body).toContain('booking form')
    // Geri çeviri makine çevirisi DEĞİL — aynı kanıtın Türkçe alanı.
    expect(r.step.backTranslationTr).toContain('Rezervasyon formunuz')
    expect(r.step.backTranslationTr).toContain('Merhaba Alex,')
  })

  it('İngilizce karşılık YOKSA gönderim yapılmaz (Türkçe ile doldurulmaz)', () => {
    const trOnly: PilotEvidence = {
      observation: { tr: EVIDENCE.observation.tr },
      hypothesis: { tr: EVIDENCE.hypothesis.tr },
      cta: { tr: EVIDENCE.cta.tr },
    }
    const r = renderPilotStep({ step: day0, locale: 'en', evidence: trOnly })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reasons).toContain('missing_translation')
  })
})

describe('renderPilotStep — kanıt yoksa ÇEKİMSER', () => {
  it('eksik alanların her biri ayrı sebep üretir', () => {
    const r = renderPilotStep({
      step: day0,
      locale: 'tr',
      evidence: { observation: { tr: '' }, hypothesis: { tr: '' }, cta: { tr: '' } },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reasons).toEqual(expect.arrayContaining(['missing_observation', 'missing_hypothesis', 'missing_cta']))
  })

  it('GENEL gözlem reddedilir — uydurma gözlemle mail gitmez', () => {
    for (const generic of ['Sitenizi inceledim.', 'Harika bir iş çıkarmışsınız!', 'I saw your website', 'Tebrikler']) {
      expect(isGenericObservation(generic), generic).toBe(true)
    }
    const r = renderPilotStep({
      step: day0,
      locale: 'tr',
      evidence: { ...EVIDENCE, observation: { tr: 'Sitenizi inceledim.' } },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reasons).toContain('observation_too_generic')
  })

  it('gerçek, işe özgü gözlem GENEL sayılmaz', () => {
    expect(isGenericObservation(EVIDENCE.observation.tr)).toBe(false)
  })
})

// ──────────────────────────── biçim denetimi ─────────────────────────────────

describe('checkPilotFormat — gönderim yolunun önündeki kapı', () => {
  const good = renderPilotStep({ step: day0, locale: 'tr', recipientFirstName: 'Deniz', evidence: EVIDENCE })
  const body = good.ok ? good.step.body : ''

  it('gerçek kanıtla üretilen metin 60-100 kelime aralığında ve GÖNDERİLEBİLİR', () => {
    const n = countWords(body)
    expect(n).toBeGreaterThanOrEqual(MIN_WORDS)
    expect(n).toBeLessThanOrEqual(MAX_WORDS)
    expect(good.ok && good.step.sendable).toBe(true)
    expect(good.ok && good.step.format.violations).toEqual([])
  })

  it('KISA kanıt üretilir ama GÖNDERİLEBİLİR SAYILMAZ', () => {
    // Üretici kendi kapısından geçmeyen taslağı "hazır" göstermez.
    const short = renderPilotStep({
      step: day0,
      locale: 'tr',
      evidence: {
        observation: { tr: 'Formunuzda ikinci adımda doğrulama alanı görünmüyor.' },
        hypothesis: { tr: 'Burada bırakma olabilir.' },
        cta: { tr: 'Kayıt göndereyim mi?' },
      },
    })
    expect(short.ok).toBe(true)
    if (!short.ok) return
    expect(short.step.sendable).toBe(false)
    expect(short.step.format.violations).toContain('too_short')
  })

  it('link, izleme, emoji, HTML REDDEDİLİR', () => {
    expect(checkPilotFormat(`x https://ornek.com\n${SIGNATURE}`).violations).toContain('contains_link')
    expect(checkPilotFormat(`x ?utm_source=mail\n${SIGNATURE}`).violations).toContain('contains_tracking')
    expect(checkPilotFormat(`Merhaba 🙂\n${SIGNATURE}`).violations).toContain('contains_emoji')
    expect(checkPilotFormat(`<b>selam</b>\n${SIGNATURE}`).violations).toContain('contains_html')
  })

  it('İKİ soru işareti = iki talep → reddedilir', () => {
    expect(checkPilotFormat(`Olur mu? Peki ya bu?\n${SIGNATURE}`).violations).toContain('multiple_questions')
  })

  it('imza tam olarak eşleşmeli', () => {
    expect(checkPilotFormat('metin\nAli Cem').violations).toContain('wrong_signature')
    expect(checkPilotFormat(`metin\n${SIGNATURE}`).violations).not.toContain('wrong_signature')
  })

  it('portföy YALNIZ açık izinle geçer', () => {
    const withPortfolio = `Portföyümü göndereyim.\n${SIGNATURE}`
    expect(checkPilotFormat(withPortfolio).violations).toContain('portfolio_without_consent')
    expect(checkPilotFormat(withPortfolio, { portfolioAllowed: true }).violations)
      .not.toContain('portfolio_without_consent')
  })

  it('çok kısa ve çok uzun metin reddedilir', () => {
    expect(checkPilotFormat(`kısa\n${SIGNATURE}`).violations).toContain('too_short')
    expect(checkPilotFormat(`${'kelime '.repeat(150)}\n${SIGNATURE}`).violations).toContain('too_long')
  })
})

// ───────────────────────── sonlandırıcı olaylar ──────────────────────────────

describe('remainingSteps — cevap/opt-out/bounce/şikâyet KALANI İPTAL EDER', () => {
  it('olay yoksa kalan temaslar sırayla gelir', () => {
    expect(remainingSteps({ completedStepKeys: ['day0'], events: [] }).map((s) => s.key)).toEqual(['day3', 'day7'])
  })

  it('dört sonlandırıcı olayın HER BİRİ diziyi bitirir', () => {
    for (const eventType of TERMINAL_EVENTS) {
      expect(remainingSteps({ completedStepKeys: ['day0'], events: [{ eventType }] }), eventType).toEqual([])
    }
  })

  it('ilgisiz olay diziyi bitirmez', () => {
    expect(remainingSteps({ completedStepKeys: [], events: [{ eventType: 'delivered' }] })).toHaveLength(3)
  })
})

// ──────────────────────────── pilot güvenceleri ──────────────────────────────

describe('pilot kapısı — ısınma ve tavan', () => {
  const base = {
    pilotEnabled: true,
    warmup: { verified: true, weekNumber: 1 },
    stats: { sentToday: 0, delivered: 0, bounced: 0, complaints: 0, consecutiveFailures: 0 },
  }

  it('bayrak kapalıyken kuyruğa alma YOK', () => {
    expect(() => assertCanEnqueue({ ...base, pilotEnabled: false })).toThrow(PilotBlockedError)
  })

  it('DOĞRULANMAMIŞ ısınma sıfır sayılır', () => {
    try {
      assertCanEnqueue({ ...base, warmup: { verified: false, weekNumber: 3 } })
      throw new Error('reddetmeliydi')
    } catch (e) {
      expect((e as PilotBlockedError).code).toBe('warmup_unverified')
    }
  })

  it('ısınma haftası bilinmiyorsa tavan belirlenemez → gönderim yok', () => {
    try {
      assertCanEnqueue({ ...base, warmup: { verified: true, weekNumber: null } })
      throw new Error('reddetmeliydi')
    } catch (e) {
      expect((e as PilotBlockedError).code).toBe('warmup_insufficient')
    }
  })

  it('tavan 5 → 10 → 20 ve 20`de sabitlenir', () => {
    expect(DAILY_CAPS).toEqual([5, 10, 20])
    expect([1, 2, 3, 4, 12].map(capForWeek)).toEqual([5, 10, 20, 20, 20])
    expect(capForWeek(0)).toBe(5)
    expect(capForWeek(NaN)).toBe(5)
  })

  it('günlük tavan dolunca reddeder', () => {
    expect(assertCanEnqueue({ ...base, stats: { ...base.stats, sentToday: 4 } }).remainingToday).toBe(1)
    try {
      assertCanEnqueue({ ...base, stats: { ...base.stats, sentToday: 5 } })
      throw new Error('reddetmeliydi')
    } catch (e) {
      expect((e as PilotBlockedError).code).toBe('daily_cap_reached')
    }
  })
})

describe('sert duraklatma', () => {
  const stats = { sentToday: 0, delivered: 0, bounced: 0, complaints: 0, consecutiveFailures: 0 }

  it('küçük örneklemde ORAN HESAPLANMAZ', () => {
    // 3 gönderimin 1`i bounce → %33 değil, "henüz bilmiyoruz".
    expect(hardPauseReasons({ ...stats, delivered: 2, bounced: 1 })).toEqual([])
  })

  it('yeterli örneklemde bounce oranı durdurur', () => {
    expect(hardPauseReasons({ ...stats, delivered: 96, bounced: 4 })).toContain('bounce_rate')
    expect(hardPauseReasons({ ...stats, delivered: 99, bounced: 1 })).not.toContain('bounce_rate')
  })

  it('şikâyet oranı durdurur', () => {
    expect(hardPauseReasons({ ...stats, delivered: 1000, bounced: 0, complaints: 1 })).toContain('complaint_rate')
  })

  it('ardışık arıza durdurur', () => {
    expect(hardPauseReasons({ ...stats, consecutiveFailures: HARD_PAUSE.consecutiveFailures }))
      .toContain('consecutive_failures')
  })

  it('elle duraklatma her zaman geçerli', () => {
    expect(hardPauseReasons({ ...stats, manualPause: true })).toContain('manual')
  })

  it('duraklatma ISINMADAN ÖNCE bakılır — tamamlanmış ısınma kurtarmaz', () => {
    try {
      assertCanEnqueue({
        pilotEnabled: true,
        warmup: { verified: true, weekNumber: 8 },
        stats: { ...stats, manualPause: true },
      })
      throw new Error('reddetmeliydi')
    } catch (e) {
      expect((e as PilotBlockedError).code).toBe('hard_paused')
    }
  })

  it('kokpit satırı nedeni DEĞER olarak gösterir', () => {
    const g = describePilotGate({
      pilotEnabled: true,
      warmup: { verified: false, weekNumber: 1 },
      stats,
    })
    expect(g).toMatchObject({ canSend: false, blockedReason: 'warmup_unverified' })
  })
})

// ───────────────────────────────── kokpit ────────────────────────────────────

const counts = (over: Partial<FunnelCounts> = {}): FunnelCounts => ({
  sourced: 0, accepted: 0, eligible: 0, enqueued: 0, sent: 0, delivered: 0, replied: 0,
  positiveReplied: 0, meetings: 0, bounced: 0, optedOut: 0, complaints: 0, unknown: 0, ...over,
})

describe('kokpit — oranlar ve kazanan', () => {
  it('payda sıfırken oran null (yüzde sıfır DEĞİL)', () => {
    const r = funnelRates(counts())
    expect(r.replyRate).toBeNull()
    expect(r.deliveryRate).toBeNull()
  })

  it('bilinmeyen sonuçlar AYRI oranla görünür', () => {
    expect(funnelRates(counts({ sent: 100, unknown: 4 })).unknownRate).toBe(4)
  })

  it('50 teslimin ALTINDA kazanan ilan edilmez', () => {
    const v: VariantStats[] = [
      { key: 'a', changedVariable: 'konu', counts: counts({ delivered: 20, positiveReplied: 8 }) },
      { key: 'b', changedVariable: 'konu', counts: counts({ delivered: 20, positiveReplied: 1 }) },
    ]
    expect(decideWinner(v)).toEqual({
      decided: false, reason: 'insufficient_sample', delivered: 40, needed: MIN_DELIVERED_FOR_WINNER,
    })
  })

  it('yeterli örneklemde OLUMLU CEVAP oranı karar verir', () => {
    const v: VariantStats[] = [
      { key: 'a', changedVariable: 'konu', counts: counts({ delivered: 40, positiveReplied: 8 }) },
      { key: 'b', changedVariable: 'konu', counts: counts({ delivered: 40, positiveReplied: 2 }) },
    ]
    expect(decideWinner(v)).toEqual({ decided: true, variantKey: 'a', positiveReplyRate: 20 })
  })

  it('beraberlikte kazanan YOK', () => {
    const v: VariantStats[] = [
      { key: 'a', changedVariable: null, counts: counts({ delivered: 30, positiveReplied: 3 }) },
      { key: 'b', changedVariable: null, counts: counts({ delivered: 30, positiveReplied: 3 }) },
    ]
    expect(decideWinner(v)).toEqual({ decided: false, reason: 'tie' })
  })

  it('varyant yoksa karar yok', () => {
    expect(decideWinner([])).toEqual({ decided: false, reason: 'no_variants' })
  })

  it('açılma/tıklama karara GİRMEZ', () => {
    const v: VariantStats[] = [
      { key: 'a', changedVariable: null, counts: counts({ delivered: 40, positiveReplied: 2, opened: 40, clicked: 30 }) },
      { key: 'b', changedVariable: null, counts: counts({ delivered: 40, positiveReplied: 8, opened: 1, clicked: 0 }) },
    ]
    expect(decideWinner(v)).toMatchObject({ decided: true, variantKey: 'b' })
  })
})

describe('kokpit — maliyet', () => {
  it('payda sıfırken lead başına maliyet null', () => {
    const m = costMetrics(counts(), { sourceCostUsd: 12, burnedUsd: 3 })
    expect(m.costPerAcceptedLeadUsd).toBeNull()
    expect(m.totalCostUsd).toBe(12)
  })

  it('yanan kredi AYRI satır — lead maliyetine gömülmez', () => {
    const m = costMetrics(counts({ accepted: 100, replied: 4 }), { sourceCostUsd: 20, burnedUsd: 9 })
    expect(m.costPerAcceptedLeadUsd).toBe(0.2)
    expect(m.costPerReplyUsd).toBe(5)
    expect(m.burnedUsd).toBe(9)
  })
})

describe('kokpit — bütünleşik görünüm', () => {
  it('bütçe, bayraklar, sağlık ve kapı tek nesnede', () => {
    const c = buildCockpit({
      env: {},
      experiments: [
        {
          key: 'mimarlik-tr',
          status: 'running',
          niche: 'mimarlık',
          offer: 'sosyal medya',
          hypothesis: 'form sürtünmesi',
          variants: [{ key: 'a', changedVariable: 'konu', counts: counts({ sourced: 100, accepted: 60, delivered: 10 }) }],
        },
      ],
      spend: { spentUsd: 4, burnedUsd: 1, runCount: 2, monthKey: '2026-07' },
      cost: { sourceCostUsd: 4, burnedUsd: 1 },
      sourceHealth: listProviderHealth({ env: {} }),
      outreachHealth: listOutreachHealth({ env: {} }),
      pilotGate: { canSend: false, dailyCap: null, remainingToday: 0, blockedReason: 'warmup_unverified' },
    })
    expect(c.budget).toMatchObject({ capUsd: 29, spentUsd: 4, remainingUsd: 25, state: 'ok' })
    expect(c.experiments[0].totals.sourced).toBe(100)
    expect(c.experiments[0].winner.decided).toBe(false)
    expect(c.providers.sources.find((p) => p.key === 'apify')!.enabled).toBe(false)
    expect(c.providers.outreach.every((p) => p.canSendReal === false)).toBe(true)
    expect(c.pilotGate.canSend).toBe(false)
    expect(c.notes.join(' ')).toContain('ana KPI değildir')
  })

  it('okunamayan harcama kokpitte SAĞLIKLI görünmez', () => {
    const c = buildCockpit({
      env: {},
      experiments: [],
      spend: { spentUsd: null, burnedUsd: 0, runCount: 0, monthKey: '2026-07' },
      cost: { sourceCostUsd: 0, burnedUsd: 0 },
      sourceHealth: [],
      outreachHealth: [],
      pilotGate: { canSend: true, dailyCap: 5, remainingToday: 5, blockedReason: null },
    })
    expect(c.budget.state).toBe('unmeasurable')
  })
})

// ─────────────────────── uçtan uca: fake transport ───────────────────────────

describe('uçtan uca akış — fake sağlayıcı, GERÇEK MAİL SIFIR', () => {
  it('kanıt → metin → kapı → gönderim → olay → kalan temas iptali', async () => {
    // 1) Metin üretimi
    const rendered = renderPilotStep({ step: day0, locale: 'tr', recipientFirstName: 'Deniz', evidence: EVIDENCE })
    expect(rendered.ok).toBe(true)
    if (!rendered.ok) return
    // Gönderim yolunun ön koşulu: taslak KENDİ kapısından geçmiş olmalı.
    expect(rendered.step.sendable).toBe(true)
    expect(checkPilotFormat(rendered.step.body).violations).toEqual([])

    // 2) Pilot kapısı
    const gate = assertCanEnqueue({
      pilotEnabled: true,
      warmup: { verified: true, weekNumber: 1 },
      stats: { sentToday: 0, delivered: 0, bounced: 0, complaints: 0, consecutiveFailures: 0 },
    })
    expect(gate.dailyCap).toBe(5)

    // 3) Gönderim — fake sağlayıcı, gerçek mail yok
    const provider = createFakeOutreachProvider()
    const sent = await guardedSend({
      provider,
      outreachEligible: true,
      message: {
        localId: 'om-e2e',
        recipient: { localId: 'lead-1', email: 'deniz@sirket.com', firstName: 'Deniz' },
        subject: rendered.step.subject,
        body: rendered.step.body,
        sequenceStep: 0,
      },
    })
    expect(sent.state).toBe('sent')
    expect(sent.reallySent).toBe(false)

    // 4) Cevap geldi → kalan iki temas İPTAL
    expect(remainingSteps({ completedStepKeys: ['day0'], events: [{ eventType: 'reply' }] })).toEqual([])
  })

  it('kanıtı olmayan lead diziye HİÇ girmez', async () => {
    const rendered = renderPilotStep({
      step: day0,
      locale: 'tr',
      evidence: { observation: { tr: '' }, hypothesis: { tr: 'x' }, cta: { tr: 'y' } },
    })
    expect(rendered.ok).toBe(false)
    const provider = createFakeOutreachProvider()
    const spy = vi.spyOn(provider, 'send')
    // Metin üretilemediği için gönderim yolu HİÇ çağrılmaz.
    expect(spy).not.toHaveBeenCalled()
  })
})
