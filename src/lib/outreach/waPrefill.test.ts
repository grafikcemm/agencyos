import { describe, it, expect } from 'vitest'
import { gateWaPrefill, buildWaHref } from './waPrefill'

// wa.me prefill kapısı (Faz 1.1) — client-safe fail-closed davranış.

describe('gateWaPrefill', () => {
  it('boş/eksik mesaj → metinsiz link (blok nedeni yok)', () => {
    expect(gateWaPrefill({ firstMessage: null, businessName: 'X' })).toEqual({ text: null, blockedReason: null })
    expect(gateWaPrefill({ firstMessage: '   ', businessName: 'X' })).toEqual({ text: null, blockedReason: null })
  })

  it('temiz mesaj (bağlam + tek CTA + iddiasız) → prefill geçer', () => {
    const r = gateWaPrefill({
      firstMessage: 'Merhaba, Güler Klinik Instagram menü linki kırık görünüyor. Kısa bir görüşme ister misiniz?',
      businessName: 'Güler Klinik',
    })
    expect(r.blockedReason).toBeNull()
    expect(r.text).toContain('Güler Klinik')
  })

  it('sayı/başarı iddiası → client kanıt DOĞRULAYAMAZ → fail-closed blok + neden', () => {
    const r = gateWaPrefill({
      firstMessage: 'Merhaba Güler Klinik, randevularınızı %35 artırabiliriz. 15 dakika uygun musunuz?',
      businessName: 'Güler Klinik',
    })
    expect(r.text).toBeNull()
    expect(r.blockedReason).toContain('CLAIM_WITHOUT_EVIDENCE')
  })

  it('süre vaadi ("1 haftada") ve garanti dili de bloklanır', () => {
    const sure = gateWaPrefill({
      firstMessage: 'Güler Klinik web sitenizi 1 haftada yeniliyoruz. Görüşelim mi?',
      businessName: 'Güler Klinik',
    })
    expect(sure.text).toBeNull()
    const garanti = gateWaPrefill({
      firstMessage: 'Güler Klinik için sonucu garanti ediyoruz. Görüşelim mi?',
      businessName: 'Güler Klinik',
    })
    expect(garanti.text).toBeNull()
    expect(garanti.blockedReason).toContain('SPAM_RISK_LANGUAGE')
  })

  it('işletme bağlamı olmayan generic şablon bloklanır', () => {
    const r = gateWaPrefill({ firstMessage: 'Merhaba, web siteniz eski. Görüşelim mi?', businessName: 'Güler Klinik' })
    expect(r.text).toBeNull()
    expect(r.blockedReason).toContain('NO_BUSINESS_CONTEXT')
  })
})

describe('buildWaHref', () => {
  it('geçen metin encode edilir; bloklu/boş metin → yalnız sohbet linki', () => {
    expect(buildWaHref('905551112233', { text: 'selam a', blockedReason: null })).toBe(
      'https://wa.me/905551112233?text=selam%20a',
    )
    expect(buildWaHref('905551112233', { text: null, blockedReason: 'x' })).toBe('https://wa.me/905551112233')
  })
})
