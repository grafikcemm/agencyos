// Deep-research raporlarındaki teklif (offer) id'lerini offers.ts kanonik katalog
// id'lerine eşler. Raporlar serbest id kullandı (ai_whatsapp_bot, google_yorum_motoru…);
// SECTOR_PROFILES.recommendedOfferIds yalnız katalogda ÇÖZÜLEN id tutmalı yoksa
// offersForSector/offerIdsForSector boşa düşer. resolveOfferId tek geçiş kapısı.

import { findOfferById } from './offers'

/** Araştırma offer id → kanonik offers.ts id. */
export const RESEARCH_OFFER_MAP: Record<string, string> = {
  // WhatsApp / DM / lead botları
  ai_whatsapp_bot: 'ai_sales_assistant',
  whatsapp_satis_asistani: 'whatsapp_sales_assistant',
  ai_dm_bot: 'ai_sales_assistant',
  ai_lead_bot: 'ai_lead_response',
  // Kreatif / reklam / görsel
  ai_video_reklam: 'ai_creative_lab',
  ai_creative_ads: 'ai_creative_lab',
  ai_gorsel_uretici: 'ai_creative_lab',
  packaging_mockup: 'ai_creative_lab',
  banner_tasarimi: 'social_media_pack',
  reklam_optimizasyonu: 'ads_optimization',
  // Yorum / randevu
  google_yorum_motoru: 'review_engine',
  no_show_azaltma: 'appointment_recovery',
  // Sosyal medya / web / kimlik
  sosyal_medya_tasarimi: 'social_media_pack',
  social_media_content: 'social_media_pack',
  ui_ux_tasarimi: 'website',
  web_uiux: 'website',
  logo_kurumsal_kimlik: 'brand_identity',
  kurumsal_kimlik: 'corporate_identity',
  // CRM / belge / yenileme
  crm_reaktivasyon: 'crm_reactivation',
  belge_otomasyonu: 'document_automation',
  proposal_doc_automation: 'proposal_desk',
  renewal_reminders: 'renewal_engine',
}

/**
 * Bir offer id'sini kanonik katalog id'sine çözer.
 * 1) Mapping varsa onu döner. 2) Yoksa katalogda zaten varsa olduğu gibi döner.
 * 3) Hiçbiri değilse güvenli default 'ai_lead_response' (dangling id önler).
 */
export function resolveOfferId(researchId: string): string {
  const mapped = RESEARCH_OFFER_MAP[researchId]
  if (mapped) return mapped
  if (findOfferById(researchId)) return researchId
  return 'ai_lead_response'
}

/** Bir id dizisini kanonik id'lere çözer + tekilleştirir (sıra korunur). */
export function resolveOfferIds(ids: string[]): string[] {
  const out: string[] = []
  for (const id of ids) {
    const resolved = resolveOfferId(id)
    if (!out.includes(resolved)) out.push(resolved)
  }
  return out
}
