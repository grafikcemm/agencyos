import { describe, it, expect } from 'vitest'
import { applyViolationFixes, anchorViolation } from './draftFixes'
import { lintOutreachDraft } from './qualityLint'

// Faz 4.3 — deterministik "ihlalleri düzelt": düzeltme sonrası metin kapıdan
// yeniden geçirilir ve mekanik ihlaller kapanır (kapının yerine geçmez).

const OPT_OUT = 'Bu tür e-postaları almak istemiyorsanız "ret" yazarak yanıtlamanız yeterlidir.'

describe('applyViolationFixes', () => {
  it('klişe + yasak ifade + kanıtsız iddia cümleleri çıkarılır; lint yeniden geçer', () => {
    const body = `Merhaba,\n\nUmarım bu mail sizi iyi bulur. Denta Klinik'in profilinde web sitesi göremedim; bu görünürlük kaybettirir.\n\nRandevularınızı 90 günde 3 katına çıkarırız. İsterseniz 15 dakikada değerlendirelim mi?\n\n${OPT_OUT}`
    const lint = lintOutreachDraft({
      subject: 'Denta Klinik — kısa not',
      body,
      businessName: 'Denta Klinik',
      evidenceIds: [],
      claimEvidence: [],
      bannedPhrases: [],
      channel: 'email',
    })
    expect(lint.ok).toBe(false)

    const fixed = applyViolationFixes('Denta Klinik — kısa not', body, lint.violations)
    expect(fixed.applied.length).toBeGreaterThan(0)
    expect(fixed.body).not.toContain('Umarım bu mail')
    expect(fixed.body).not.toContain('3 katına')

    const relint = lintOutreachDraft({
      subject: fixed.subject,
      body: fixed.body,
      businessName: 'Denta Klinik',
      evidenceIds: [],
      claimEvidence: [{ claim: 'göremedim', evidenceIds: [] }],
      bannedPhrases: [],
      channel: 'email',
    })
    // 'göremedim' iddia kalıbı değil; kalan ihlaller yalnız içerik-gerektirenler olabilir.
    const mechanical = relint.violations.filter((v) =>
      ['GENERIC_CLICHE', 'SPAM_RISK_LANGUAGE', 'VOICE_BANNED_PHRASE', 'CLAIM_WITHOUT_EVIDENCE', 'MULTIPLE_CTA', 'MISSING_OPT_OUT', 'BODY_TOO_LONG', 'SUBJECT_TOO_LONG'].includes(v.code),
    )
    expect(mechanical).toEqual([])
  })

  it('MULTIPLE_CTA: ilk CTA korunur, sonrakiler çıkar', () => {
    const body = `Merhaba Denta Klinik,\n\nProfilinize baktım. 15 dakikada değerlendirelim mi? Ayrıca örnekleri paylaşabilir miyim? Bir de kısa bir görüşme yapalım.\n\n${OPT_OUT}`
    const fixed = applyViolationFixes('konu', body, [{ code: 'MULTIPLE_CTA', detail: '3 CTA' }])
    expect(fixed.body).toContain('15 dakikada değerlendirelim mi')
    expect(fixed.body).not.toContain('paylaşabilir miyim')
  })

  it('MISSING_OPT_OUT: standart satır eklenir; BODY_TOO_LONG: opt-out korunarak kısalır', () => {
    const noOpt = applyViolationFixes('k', 'Merhaba Denta, kısa not.', [
      { code: 'MISSING_OPT_OUT', detail: 'yok' },
    ])
    expect(noOpt.body).toContain('istemiyorsanız')

    const longBody = `${'Paragraf. '.repeat(50)}\n\n${'Dolgu cümlesi burada. '.repeat(60)}\n\n${OPT_OUT}`
    const shortened = applyViolationFixes('k', longBody, [{ code: 'BODY_TOO_LONG', detail: 'uzun' }])
    expect(shortened.body.length).toBeLessThanOrEqual(1800)
    expect(shortened.body).toContain('istemiyorsanız') // opt-out düşmedi
  })

  it('SUBJECT_TOO_LONG kelime sınırında kısalır; içerik-gerektirenler notFixable', () => {
    const longSubject = 'Çok uzun bir konu satırı '.repeat(6)
    const fixed = applyViolationFixes(longSubject, `Merhaba Denta. 15 dakika uygun musunuz?\n${OPT_OUT}`, [
      { code: 'SUBJECT_TOO_LONG', detail: 'uzun' },
      { code: 'NO_CTA', detail: 'yok' },
      { code: 'NO_BUSINESS_CONTEXT', detail: 'yok' },
    ])
    expect(fixed.subject.length).toBeLessThanOrEqual(78)
    expect(fixed.notFixable).toContain('NO_CTA')
    expect(fixed.notFixable).toContain('NO_BUSINESS_CONTEXT')
  })
})

describe('anchorViolation — ihlal→metin bölgesi bağı (Faz 4.2)', () => {
  it('tırnaklı ihlal parçası gövdede bulunur ve aralık döner', () => {
    const body = 'Merhaba, randevularınızı 90 günde üç katına çıkarırız demiştim.'
    const a = anchorViolation(body, { code: 'CLAIM_WITHOUT_EVIDENCE', detail: 'İddia "90 günde" eşlenmemiş' })
    expect(a).not.toBeNull()
    expect(body.slice(a!.start, a!.end)).toBe('90 günde')
  })
  it('metinde olmayan/parçasız ihlal → null (konu/yapı ihlali)', () => {
    expect(anchorViolation('kısa gövde', { code: 'NO_CTA', detail: 'Net bir CTA yok' })).toBeNull()
    expect(anchorViolation('kısa gövde', { code: 'GENERIC_CLICHE', detail: 'Cliché: "sinerji"' })).toBeNull()
  })
})
