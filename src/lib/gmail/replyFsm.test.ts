import { describe, it, expect } from 'vitest'
import { classifyReply, replyEffects } from './replyFsm'

// FINALIZATION Faz 7 — inbound cevap FSM'i: deterministik sınıflar + yan etkiler.

describe('classifyReply', () => {
  it('opt-out HER ŞEYİ ezer ("ret" tek kelime dahil)', () => {
    expect(classifyReply('Ret')).toBe('opt_out')
    expect(classifyReply('Lütfen listeden çıkarın, teklif de istemiyorum')).toBe('opt_out')
    expect(classifyReply('unsubscribe')).toBe('opt_out')
    expect(classifyReply('Bir daha mail atmayın')).toBe('opt_out')
  })

  it('auto-reply tespit edilir (mutasyonsuz sınıf)', () => {
    expect(classifyReply('Out of office: 20 Temmuza kadar yokum')).toBe('auto_reply')
    expect(classifyReply('Yıllık izindeyim, dönüşte bakarım')).toBe('auto_reply')
  })

  it('itiraz / sonra / pozitif ilgi sınıfları', () => {
    expect(classifyReply('Bütçemiz yok şu an')).toBe('objection')
    expect(classifyReply('Zaten çalışıyoruz bir ajansla, memnunuz')).toBe('objection')
    expect(classifyReply('Daha sonra konuşalım, yoğunuz')).toBe('not_now')
    expect(classifyReply('Fiyat bilgisi alabilir miyim?')).toBe('positive_interest')
    expect(classifyReply('Yarın uygunum, arar mısınız')).toBe('positive_interest')
  })

  it('sınıflanamayan gerçek insan cevabı → other; boş → other', () => {
    expect(classifyReply('Bunu ortağımla konuşmam lazım.')).toBe('other')
    expect(classifyReply('')).toBe('other')
  })

  it('ret kelimesi başka kelimenin içinde OPT-OUT SAYILMAZ (kelime sınırı)', () => {
    expect(classifyReply('İnternet sitemiz var zaten, ihtiyacımız yok')).toBe('objection')
  })
})

describe('replyEffects — sınıf → zorunlu yan etkiler', () => {
  it('opt_out: suppress + responded + follow-up iptal', () => {
    expect(replyEffects('opt_out')).toEqual({ suppress: true, markResponded: true, cancelFollowups: true })
  })
  it('auto_reply: HİÇBİR mutasyon (takip devam eder)', () => {
    expect(replyEffects('auto_reply')).toEqual({ suppress: false, markResponded: false, cancelFollowups: false })
  })
  it('insan cevabı sınıfları: responded + takip DURUR (otomatik takip gönderilmez)', () => {
    for (const cls of ['positive_interest', 'objection', 'not_now', 'other'] as const) {
      expect(replyEffects(cls)).toEqual({ suppress: false, markResponded: true, cancelFollowups: true })
    }
  })
})
