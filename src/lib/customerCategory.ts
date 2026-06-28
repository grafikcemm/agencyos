// Müşteri (ihtiyaç) kategorisi — tasarım ajansı için "bu işletme NEDEN hedefimiz,
// hangi hizmeti satmalıyız" boyutu. Deterministik, LLM yok. lead_tier'a DİKTİR:
// tier'ı veya quality_score'u değiştirmez — yalnızca hangi tasarım hizmetinin
// pitchleneceğini belirler. AI hizmeti SADECE 'otomasyon_fit' kategorisinde önerilir.
//
// Öncelik sırası (ilk eşleşen kazanır) AI'ı en sona koyar: web sitesi olmayan bir
// güzellik salonu 'web_yok' (Web Tasarım) olur, 'otomasyon_fit' (AI) DEĞİL.

import type { CustomerCategory, WebsiteQualityBand } from './types'

export interface CategoryInput {
  sector: string | null | undefined
  has_real_website: boolean
  instagram_as_site: boolean
  website_quality_band: WebsiteQualityBand
  has_social_link: boolean
  has_whatsapp: boolean
  has_online_booking: boolean
  has_form: boolean
  has_ads_signal: boolean
  rating: number | null | undefined
  review_count: number | null | undefined
}

export interface CategoryResult {
  customer_category: CustomerCategory
  recommended_offer_id: string
  recommended_service_name: string
  category_reasons: string[]
}

// Tweet-doğrulamalı "esnaf" verticalleri — tekrar eden WhatsApp/Instagram
// yanıtlamada günde ~2 saat kaybeden küçük işletmeler; AI satış asistanının asıl
// hedefi. evidenceEngine.selectOffer ile AYNI tanım (tek kaynak — sapma olmasın).
export function isEsnafAIFit(sector: string | null | undefined): boolean {
  const s = (sector ?? '').toLowerCase()
  const isHealthClinic = /diş|klinik|estetik|doktor|sağlık|fizyoterapi|göz|plastik/.test(s)
  const isBeauty = /güzellik|kuaför|berber|nail|tırnak|spa/.test(s)
  return isBeauty || isHealthClinic ||
    /emlak|mobilya|butik|oto yıkama|oto kuaför|spor salonu|fitness|pilates|kafe|restoran/.test(s)
}

export interface CategoryDisplay {
  label: string
  service: string
  offerId: string
  variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted'
}

// UI rozet + önerilen hizmet eşlemesi. offerId'ler offers.ts kataloğunda mevcut.
export const CATEGORY_DISPLAY: Record<CustomerCategory, CategoryDisplay> = {
  web_yok:       { label: 'Web Yok',        service: 'Web Tasarım',                   offerId: 'website',            variant: 'danger' },
  web_kotu:      { label: 'Web Kötü',       service: 'Web Yenileme',                  offerId: 'website',            variant: 'warning' },
  donusum_dusuk: { label: 'Dönüşüm Düşük',  service: 'Landing / UX',                  offerId: 'website',            variant: 'warning' },
  marka_daginik: { label: 'Marka Dağınık',  service: 'Marka Kimliği',                 offerId: 'brand_identity',     variant: 'info' },
  sosyal_zayif:  { label: 'Sosyal Zayıf',   service: 'Sosyal Medya Tasarımı',         offerId: 'social_media_pack',  variant: 'info' },
  otomasyon_fit: { label: 'Otomasyon Fit',  service: 'AI Satış Asistanı',             offerId: 'ai_sales_assistant', variant: 'success' },
  genel_tasarim: { label: 'Genel Tasarım',  service: 'Sosyal Medya / Görsel Tasarım', offerId: 'social_media_pack',  variant: 'muted' },
}

export function deriveCustomerCategory(input: CategoryInput): CategoryResult {
  const reasons: string[] = []
  const make = (cat: CustomerCategory): CategoryResult => ({
    customer_category: cat,
    recommended_offer_id: CATEGORY_DISPLAY[cat].offerId,
    recommended_service_name: CATEGORY_DISPLAY[cat].service,
    category_reasons: reasons,
  })

  const rating = input.rating ?? 5
  const reviewCount = input.review_count ?? 999

  // 1. Web yok — site yok / sadece Instagram / ölü site.
  if (!input.has_real_website || input.instagram_as_site || input.website_quality_band === 'none') {
    reasons.push(input.instagram_as_site ? 'Sadece Instagram — web sitesi yok' : 'Web sitesi yok')
    return make('web_yok')
  }
  // 2. Web kötü — site var ama tasarım/kalite zayıf.
  if (input.has_real_website && input.website_quality_band === 'poor') {
    reasons.push('Web sitesi var ama tasarım/kalite zayıf')
    return make('web_kotu')
  }
  // 3. Dönüşüm düşük — reklam harcıyor ama huni yok. NADİR: has_ads_signal scan'de
  //    hesaplanmıyor (hep false); pratikte yalnız backfill/manuel veriyle ateşlenir.
  if (input.has_ads_signal && !input.has_form && !input.has_online_booking) {
    reasons.push('Reklam harcıyor ama dönüşüm hunisi (form/randevu) yok')
    return make('donusum_dusuk')
  }
  // 4. Marka dağınık — düşük puan + az yorum → zayıf marka algısı.
  if (rating < 4.0 && reviewCount < 20) {
    reasons.push(`Düşük Google puanı (${input.rating ?? '?'}) + az yorum (${input.review_count ?? 0})`)
    return make('marka_daginik')
  }
  // 5. Sosyal zayıf — sitesi var ama sosyal medya bağlantısı yok.
  if (input.has_real_website && !input.has_social_link) {
    reasons.push('Web sitesinde sosyal medya bağlantısı yok — zayıf sosyal varlık')
    return make('sosyal_zayif')
  }
  // 6. Otomasyon fit — esnaf + WhatsApp/randevu yok. AI BURADA pitchlenir.
  if (isEsnafAIFit(input.sector) && !input.has_whatsapp && !input.has_online_booking) {
    reasons.push('Esnaf + WhatsApp/randevu kanalı yok — AI satış asistanı uygun')
    return make('otomasyon_fit')
  }
  // 7. Fallback — asla AI değil.
  reasons.push('Genel tasarım/sosyal medya geliştirme fırsatı')
  return make('genel_tasarim')
}
