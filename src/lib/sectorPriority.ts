// Sektör öncelik modeli — Türkiye pazarı için.
// Yüksek bulunabilirlik ≠ yüksek ödeme gücü. Premium / çok şubeli / dijital aktif işletmeler bonuslanır;
// mikro işletmeler düşük öncelik alır.

export type Wave = 1 | 2 | 3

export interface SectorProfile {
  id: string
  matchKeywords: string[]
  displayName: string
  priority: number
  wave: Wave
  primaryNeed: string
  recommendedOfferIds: string[]
  ticketBand: 'low' | 'mid' | 'high' | 'premium'
}

export const SECTOR_PROFILES: SectorProfile[] = [
  {
    id: 'health_clinic',
    matchKeywords: ['diş', 'dental', 'dentist', 'estetik', 'klinik', 'özel hastane', 'saç ekim', 'göz', 'fizyoterapi', 'plastik cerrah'],
    displayName: 'Özel Sağlık / Diş / Estetik',
    priority: 95,
    wave: 1,
    primaryNeed: 'Hızlı lead dönüşü, randevu, WhatsApp, yorum yönetimi, eski hasta canlandırma',
    recommendedOfferIds: ['ai_lead_response', 'ai_sales_assistant', 'appointment_recovery', 'review_engine', 'old_patient_reactivation'],
    ticketBand: 'premium',
  },
  {
    id: 'ecommerce',
    matchKeywords: ['e-ticaret', 'eticaret', 'online satış', 'mağaza', 'shopify', 'woocommerce'],
    displayName: 'E-Ticaret / Perakende',
    priority: 92,
    wave: 1,
    primaryNeed: 'Reklam kreatifi, tekrar satın alma, sepet kurtarma, CRM reaktivasyonu',
    recommendedOfferIds: ['ai_creative_lab', 'crm_reactivation', 'ads_optimization', 'post_purchase_flows'],
    ticketBand: 'high',
  },
  {
    id: 'insurance',
    matchKeywords: ['sigorta', 'broker', 'acente'],
    displayName: 'Sigorta Acentesi / Broker',
    priority: 90,
    wave: 1,
    primaryNeed: 'Yenileme takibi, poliçe hatırlatma, çapraz satış',
    recommendedOfferIds: ['renewal_engine', 'followup_agent', 'old_customer_reactivation'],
    ticketBand: 'high',
  },
  {
    id: 'real_estate',
    matchKeywords: ['emlak', 'gayrimenkul', 'inşaat', 'proje satış', 'müteahhit'],
    displayName: 'Gayrimenkul / Proje Satış',
    priority: 88,
    wave: 1,
    primaryNeed: 'Lead takibi, portföy eşleştirme, randevu, teklif takibi',
    recommendedOfferIds: ['lead_tracking', 'portfolio_matching', 'proposal_desk'],
    ticketBand: 'premium',
  },
  {
    id: 'automotive',
    matchKeywords: ['galeri', 'otomotiv', 'oto servis', 'araç', 'oto bakım'],
    displayName: 'Otomotiv / Galeri / Servis',
    priority: 84,
    wave: 1,
    primaryNeed: 'Test sürüşü randevusu, teklif, servis hatırlatma, eski müşteri canlandırma',
    recommendedOfferIds: ['lead_to_test_drive', 'old_customer_reactivation', 'service_reminder'],
    ticketBand: 'high',
  },
  {
    id: 'accounting',
    matchKeywords: ['muhasebe', 'mali müşavir', 'smmm'],
    displayName: 'Muhasebe / Mali Müşavir',
    priority: 80,
    wave: 2,
    primaryNeed: 'Belge işleme, evrak takibi, müşteri dosya kontrolü',
    recommendedOfferIds: ['document_automation', 'document_tracking', 'client_status_bot'],
    ticketBand: 'mid',
  },
  {
    id: 'logistics',
    matchKeywords: ['lojistik', 'nakliye', 'kargo', 'depolama'],
    displayName: 'Lojistik / Nakliye / Depolama',
    priority: 78,
    wave: 2,
    primaryNeed: 'Teklif, belge, operasyon takibi',
    recommendedOfferIds: ['proposal_desk', 'document_automation', 'operations_dashboard'],
    ticketBand: 'mid',
  },
  {
    id: 'education',
    matchKeywords: ['eğitim', 'okul', 'kurs', 'dersane', 'kreş'],
    displayName: 'Eğitim / Kurs / Özel Okul',
    priority: 76,
    wave: 2,
    primaryNeed: 'Kayıt dönemi lead takibi, veli takibi, deneme ders randevusu',
    recommendedOfferIds: ['parent_tracking', 'enrollment_pipeline', 'followup_agent'],
    ticketBand: 'mid',
  },
  {
    id: 'tourism',
    matchKeywords: ['otel', 'turizm', 'resort', 'restoran grup', 'pansiyon'],
    displayName: 'Turizm / Otel / Premium Restoran',
    priority: 72,
    wave: 2,
    primaryNeed: 'Rezervasyon, yorum, tekrar ziyaret, kampanya',
    recommendedOfferIds: ['reservation_tracking', 'review_engine', 'loyalty_system'],
    ticketBand: 'high',
  },
  {
    id: 'beauty',
    matchKeywords: ['güzellik', 'salon', 'kuaför', 'berber', 'nail', 'tırnak'],
    displayName: 'Güzellik Salonu / Kuaför',
    priority: 68,
    wave: 2,
    primaryNeed: 'Randevu, no-show, Google yorum, Instagram içerik',
    recommendedOfferIds: ['ai_sales_assistant', 'appointment_recovery', 'review_engine', 'social_media_pack'],
    ticketBand: 'low',
  },
]

const DEFAULT_PROFILE: SectorProfile = {
  id: 'other',
  matchKeywords: [],
  displayName: 'Diğer',
  priority: 25,
  wave: 3,
  primaryNeed: 'Genel müşteri kazanımı',
  recommendedOfferIds: ['ai_lead_response', 'followup_agent'],
  ticketBand: 'low',
}

export function matchSectorProfile(sector: string | null | undefined): SectorProfile {
  const lower = (sector || '').toLowerCase().trim()
  if (!lower) return DEFAULT_PROFILE
  for (const profile of SECTOR_PROFILES) {
    if (profile.matchKeywords.some(kw => lower.includes(kw))) {
      return profile
    }
  }
  return DEFAULT_PROFILE
}

export function offerIdsForSector(sector: string | null | undefined): string[] {
  return matchSectorProfile(sector).recommendedOfferIds
}
