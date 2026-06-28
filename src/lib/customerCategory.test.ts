import { describe, it, expect } from 'vitest'
import { deriveCustomerCategory, isEsnafAIFit, CATEGORY_DISPLAY, type CategoryInput } from './customerCategory'

// Sağlam temel: gerçek site, ok band, sosyal link var, iyi puan, iletişim kanalları
// dolu. Tek tek alanlar override edilerek her kategori izole test edilir.
const base: CategoryInput = {
  sector: 'lojistik',          // esnaf DEĞİL → otomasyon_fit'i tetiklemez
  has_real_website: true,
  instagram_as_site: false,
  website_quality_band: 'ok',
  has_social_link: true,
  has_whatsapp: true,
  has_online_booking: true,
  has_form: true,
  has_ads_signal: false,
  rating: 4.6,
  review_count: 80,
}

describe('deriveCustomerCategory — kategori türetme', () => {
  it('web_yok: gerçek site yoksa → Web Tasarım, AI değil', () => {
    const r = deriveCustomerCategory({ ...base, has_real_website: false, website_quality_band: 'none' })
    expect(r.customer_category).toBe('web_yok')
    expect(r.recommended_offer_id).toBe('website')
    expect(r.recommended_offer_id).not.toBe('ai_sales_assistant')
  })

  it('web_yok: sadece Instagram (instagram_as_site) → web_yok', () => {
    const r = deriveCustomerCategory({ ...base, instagram_as_site: true, website_quality_band: 'none' })
    expect(r.customer_category).toBe('web_yok')
  })

  it('web_kotu: site var ama band poor → Web Yenileme', () => {
    const r = deriveCustomerCategory({ ...base, website_quality_band: 'poor' })
    expect(r.customer_category).toBe('web_kotu')
    expect(r.recommended_offer_id).toBe('website')
  })

  it('donusum_dusuk: reklam var + form/randevu yok → Landing/UX', () => {
    const r = deriveCustomerCategory({ ...base, has_ads_signal: true, has_form: false, has_online_booking: false })
    expect(r.customer_category).toBe('donusum_dusuk')
  })

  it('marka_daginik: düşük puan + az yorum → Marka Kimliği', () => {
    const r = deriveCustomerCategory({ ...base, rating: 3.5, review_count: 8 })
    expect(r.customer_category).toBe('marka_daginik')
    expect(r.recommended_offer_id).toBe('brand_identity')
  })

  it('sosyal_zayif: site var ama sosyal link yok → Sosyal Medya Tasarımı', () => {
    const r = deriveCustomerCategory({ ...base, has_social_link: false })
    expect(r.customer_category).toBe('sosyal_zayif')
    expect(r.recommended_offer_id).toBe('social_media_pack')
  })

  it('otomasyon_fit: esnaf + WhatsApp/randevu yok → AI Satış Asistanı (AI BURADA)', () => {
    const r = deriveCustomerCategory({
      ...base,
      sector: 'güzellik salonu',
      has_whatsapp: false,
      has_online_booking: false,
    })
    expect(r.customer_category).toBe('otomasyon_fit')
    expect(r.recommended_offer_id).toBe('ai_sales_assistant')
  })

  it('genel_tasarim: fallback → asla AI offer döndürmez', () => {
    const r = deriveCustomerCategory(base)
    expect(r.customer_category).toBe('genel_tasarim')
    expect(r.recommended_offer_id).not.toBe('ai_sales_assistant')
    expect(r.recommended_offer_id).toBe('social_media_pack')
  })

  it('ÖNCELİK GUARD: web sitesi olmayan güzellik salonu → web_yok, otomasyon_fit DEĞİL', () => {
    const r = deriveCustomerCategory({
      ...base,
      sector: 'güzellik salonu',
      has_real_website: false,
      website_quality_band: 'none',
      has_whatsapp: false,
      has_online_booking: false,
    })
    expect(r.customer_category).toBe('web_yok')
    expect(r.customer_category).not.toBe('otomasyon_fit')
    expect(r.recommended_offer_id).not.toBe('ai_sales_assistant')
  })

  it('her kategori bir gerekçe (category_reasons) üretir', () => {
    const r = deriveCustomerCategory(base)
    expect(r.category_reasons.length).toBeGreaterThan(0)
  })
})

describe('isEsnafAIFit — esnaf segmenti', () => {
  it('güzellik/diş/kafe esnaf sayılır', () => {
    expect(isEsnafAIFit('güzellik salonu')).toBe(true)
    expect(isEsnafAIFit('diş kliniği')).toBe(true)
    expect(isEsnafAIFit('kafe')).toBe(true)
  })

  it('lojistik/muhasebe esnaf değildir', () => {
    expect(isEsnafAIFit('lojistik')).toBe(false)
    expect(isEsnafAIFit('muhasebe')).toBe(false)
    expect(isEsnafAIFit(null)).toBe(false)
  })
})

describe('CATEGORY_DISPLAY — yalnız otomasyon_fit AI hizmetine eşler', () => {
  it('AI offer SADECE otomasyon_fit kategorisinde', () => {
    const aiCategories = Object.entries(CATEGORY_DISPLAY)
      .filter(([, v]) => v.offerId === 'ai_sales_assistant')
      .map(([k]) => k)
    expect(aiCategories).toEqual(['otomasyon_fit'])
  })
})
