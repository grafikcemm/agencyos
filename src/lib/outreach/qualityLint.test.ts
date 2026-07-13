import { describe, it, expect } from 'vitest'
import { lintOutreachDraft, type QualityLintInput } from './qualityLint'

// Golden set (Faz D3): farklı sektörler × karar-verici rolleri × kanallar ×
// yetersiz-veri durumu. DETERMİNİSTİK assertion'lar — AI judge tek başına
// kabul kapısı olamaz; bu suite yapısal kaliteyi kilitler.

function base(overrides: Partial<QualityLintInput> = {}): QualityLintInput {
  return {
    subject: 'Güler Klinik web sitesi üzerine kısa bir not',
    body:
      'Merhaba Ayşe Hanım, Güler Klinik randevu sayfasına baktım — mobilde form çalışmıyor. ' +
      'Benzer bir klinik için yaptığım yenilemenin örneğini gönderebilirim. ' +
      '15 dakika uygun musunuz? İstemiyorsanız tek kelime "çık" yazmanız yeterli, listeden çıkarayım.',
    businessName: 'Güler Klinik',
    contactName: 'Ayşe',
    evidenceIds: ['ev-1'],
    // Faz 1.2: gözlem iddiası ("baktım") SPESİFİK kanıtla eşlenmiş.
    claimEvidence: [{ claim: 'baktım', evidenceIds: ['ev-1'] }],
    bannedPhrases: [],
    channel: 'email',
    ...overrides,
  }
}

describe('lintOutreachDraft — golden set', () => {
  it('GOLDEN diş kliniği / owner / email: temiz taslak geçer', () => {
    const r = lintOutreachDraft(base())
    expect(r.violations).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('GOLDEN restoran / marketing / whatsapp: subject ve opt-out zorunlu değil', () => {
    const r = lintOutreachDraft(
      base({
        channel: 'whatsapp',
        subject: null,
        businessName: 'Lezzet Durağı',
        contactName: null,
        body: 'Merhaba, Lezzet Durağı Instagram menü linki kırık görünüyor. Kısa bir görüşme ister misiniz?',
        evidenceIds: ['ev-2'],
      }),
    )
    expect(r.ok).toBe(true)
  })

  it('yetersiz-veri lead: işletme/kişi bağlamı yok → NO_BUSINESS_CONTEXT', () => {
    const r = lintOutreachDraft(
      base({ body: 'Merhaba, web siteniz eski görünüyor. 15 dakika uygun musunuz? İstemiyorsanız listeden çıkarayım.', evidenceIds: [] }),
    )
    expect(r.violations.map((v) => v.code)).toContain('NO_BUSINESS_CONTEXT')
  })

  it('uydurma başarı/sayı iddiası + kanıt yok → CLAIM_WITHOUT_EVIDENCE (hallucination reddi)', () => {
    const r = lintOutreachDraft(
      base({
        evidenceIds: [],
        claimEvidence: [],
        body:
          'Merhaba Ayşe Hanım, Güler Klinik için %40 daha fazla randevu garanti edebilirim, 3 kat artış gördüm. ' +
          '15 dakika uygun musunuz? İstemiyorsanız listeden çıkarayım.',
      }),
    )
    const codes = r.violations.map((v) => v.code)
    expect(codes).toContain('CLAIM_WITHOUT_EVIDENCE')
    expect(codes).toContain('SPAM_RISK_LANGUAGE') // "garanti"
  })

  it('Faz 1.2: lead\'de evidence VAR ama iddia EŞLENMEMİŞ → yine bloklanır (genel kanıt yeterli değil)', () => {
    const r = lintOutreachDraft(
      base({
        evidenceIds: ['ev-1', 'ev-2'], // lead'de kanıt kayıtları var…
        claimEvidence: [], // …ama bu iddiaya SPESİFİK bağ yok.
        body:
          'Merhaba Ayşe Hanım, Güler Klinik için %40 daha fazla randevu mümkün. ' +
          '15 dakika uygun musunuz? İstemiyorsanız listeden çıkarayım.',
      }),
    )
    expect(r.violations.map((v) => v.code)).toContain('CLAIM_WITHOUT_EVIDENCE')
  })

  it('aynı iddia SPESİFİK claimEvidence eşlemesiyle → CLAIM_WITHOUT_EVIDENCE YOK', () => {
    const r = lintOutreachDraft(
      base({
        evidenceIds: ['ev-9'],
        claimEvidence: [{ claim: 'randevu formunu inceledim', evidenceIds: ['ev-9'] }],
        body:
          'Merhaba Ayşe Hanım, Güler Klinik randevu formunu inceledim — mobilde çalışmıyor. ' +
          '15 dakika uygun musunuz? İstemiyorsanız listeden çıkarayım.',
      }),
    )
    expect(r.violations.map((v) => v.code)).not.toContain('CLAIM_WITHOUT_EVIDENCE')
  })

  it('Faz 1.2 zorunlu blok örnekleri: süre/%,X-katı/ciro/cevap-davranışı iddiaları kanıtsız GEÇEMEZ', () => {
    const cases = [
      'sorunu 1 haftada çözüyoruz',
      'randevularınızı %35 artırabiliriz',
      '90 günde 3X büyüme mümkün',
      'müşteriler mesaj atıyor ama cevap alamıyor',
      'bu doğrudan ciro artışı demek',
    ]
    for (const claim of cases) {
      const r = lintOutreachDraft(
        base({
          evidenceIds: [],
          claimEvidence: [],
          body: `Merhaba Ayşe Hanım, Güler Klinik için not: ${claim}. 15 dakika uygun musunuz? İstemiyorsanız listeden çıkarayım.`,
        }),
      )
      expect(r.violations.map((v) => v.code), claim).toContain('CLAIM_WITHOUT_EVIDENCE')
    }
  })

  it('cliché açılış → GENERIC_CLICHE', () => {
    const r = lintOutreachDraft(
      base({ body: `Umarım bu e-posta sizi iyi bulur. Güler Klinik için 15 dakika uygun musunuz? İstemiyorsanız listeden çıkarayım.` }),
    )
    expect(r.violations.map((v) => v.code)).toContain('GENERIC_CLICHE')
  })

  it('çoklu CTA → MULTIPLE_CTA; CTA hiç yok → NO_CTA', () => {
    const multi = lintOutreachDraft(
      base({
        body:
          'Ayşe Hanım, Güler Klinik formuna baktım. 15 dakika uygun musunuz? Yarın arayabilir miyim? ' +
          'İstemiyorsanız listeden çıkarayım.',
      }),
    )
    expect(multi.violations.map((v) => v.code)).toContain('MULTIPLE_CTA')

    const none = lintOutreachDraft(
      base({ body: 'Ayşe Hanım, Güler Klinik formuna baktım. İyi günler. İstemiyorsanız listeden çıkarayım.' }),
    )
    expect(none.violations.map((v) => v.code)).toContain('NO_CTA')
  })

  it('email opt-out cümlesi yoksa → MISSING_OPT_OUT', () => {
    const r = lintOutreachDraft(
      base({ body: 'Ayşe Hanım, Güler Klinik formuna baktım. 15 dakika uygun musunuz?' }),
    )
    expect(r.violations.map((v) => v.code)).toContain('MISSING_OPT_OUT')
  })

  it('Voice DNA yasak ifade → VOICE_BANNED_PHRASE', () => {
    const r = lintOutreachDraft(base({ bannedPhrases: ['çözüm ortağınız'] , body: base().body + ' Çözüm ortağınız olmak isteriz.' }))
    expect(r.violations.map((v) => v.code)).toContain('VOICE_BANNED_PHRASE')
  })

  it('uzun subject → SUBJECT_TOO_LONG; boş subject → SUBJECT_MISSING (yalnız email)', () => {
    expect(
      lintOutreachDraft(base({ subject: 'x'.repeat(100) })).violations.map((v) => v.code),
    ).toContain('SUBJECT_TOO_LONG')
    expect(lintOutreachDraft(base({ subject: '  ' })).violations.map((v) => v.code)).toContain(
      'SUBJECT_MISSING',
    )
  })
})
