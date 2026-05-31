// Sector Opportunity Engine — which sectors to scan today for best ROI?
// Static scoring matrix based on Turkish market, no external calls.

export interface SectorOpportunity {
  id: string
  displayName: string
  sector_opportunity_score: number
  willingness_to_pay_score: number
  urgency_score: number
  automation_fit_score: number
  local_market_density_score: number
  pain_frequency_score: number
  service_match_score: number
  competition_gap_score: number
  expected_ltv_score: number
  recommended_services: string[]
  best_offer: string
  recommended_scan_queries: string[]
  priority_wave: 1 | 2 | 3 | 4
  reason_to_target_now: string
}

const SECTORS: SectorOpportunity[] = [
  {
    id: 'dis_klinigi',
    displayName: 'Diş Kliniği / Ağız Sağlığı',
    sector_opportunity_score: 97,
    willingness_to_pay_score: 95,
    urgency_score: 90,
    automation_fit_score: 95,
    local_market_density_score: 90,
    pain_frequency_score: 95,
    service_match_score: 98,
    competition_gap_score: 85,
    expected_ltv_score: 95,
    recommended_services: ['Randevu Kurtarma', 'Yorum Motoru', 'Eski Hasta Canlandırma', 'WhatsApp Asistanı'],
    best_offer: 'Randevu Kurtarma Sistemi',
    recommended_scan_queries: ['diş kliniği', 'ağız diş sağlığı', 'dental klinik', 'ortodonti'],
    priority_wave: 1,
    reason_to_target_now: 'Randevu bağımlı, yüksek bilet, WhatsApp/form eksikliği yaygın, eski hasta canlandırma direkt para',
  },
  {
    id: 'guzellik_salonu',
    displayName: 'Güzellik Salonu / Cilt Bakım',
    sector_opportunity_score: 92,
    willingness_to_pay_score: 80,
    urgency_score: 88,
    automation_fit_score: 92,
    local_market_density_score: 95,
    pain_frequency_score: 92,
    service_match_score: 94,
    competition_gap_score: 88,
    expected_ltv_score: 78,
    recommended_services: ['Randevu Kurtarma', 'Yorum Motoru', 'WhatsApp Asistanı'],
    best_offer: 'Randevu Kurtarma Sistemi',
    recommended_scan_queries: ['güzellik salonu', 'cilt bakım merkezi', 'estetik salon'],
    priority_wave: 1,
    reason_to_target_now: 'Yüksek yoğunluk, çoğu sadece Instagram, WhatsApp yok, no-show büyük kayıp',
  },
  {
    id: 'estetik_merkezi',
    displayName: 'Medikal Estetik / Estetik Merkezi',
    sector_opportunity_score: 96,
    willingness_to_pay_score: 95,
    urgency_score: 92,
    automation_fit_score: 95,
    local_market_density_score: 80,
    pain_frequency_score: 95,
    service_match_score: 97,
    competition_gap_score: 85,
    expected_ltv_score: 95,
    recommended_services: ['AI Lead Response', 'Randevu Kurtarma', 'Yorum Motoru'],
    best_offer: 'AI Lead Response Agent',
    recommended_scan_queries: ['medikal estetik', 'estetik merkezi', 'botox', 'lazer epilasyon', 'saç ekimi'],
    priority_wave: 1,
    reason_to_target_now: 'Yüksek bilet, lead yanıt hızı kritik, reklam harcayan çok, her kaçan lead pahalı',
  },
  {
    id: 'kuafor',
    displayName: 'Kuaför / Berber',
    sector_opportunity_score: 85,
    willingness_to_pay_score: 70,
    urgency_score: 82,
    automation_fit_score: 88,
    local_market_density_score: 98,
    pain_frequency_score: 90,
    service_match_score: 88,
    competition_gap_score: 92,
    expected_ltv_score: 68,
    recommended_services: ['Randevu Kurtarma', 'Yorum Motoru'],
    best_offer: 'Randevu Kurtarma Sistemi',
    recommended_scan_queries: ['kuaför', 'berber', 'erkek kuaför', 'bayan kuaför'],
    priority_wave: 1,
    reason_to_target_now: 'En yoğun sektör, dijital olarak çok zayıf, no-show maliyeti yüksek',
  },
  {
    id: 'psikolog_danismanlik',
    displayName: 'Psikolog / Diyetisyen / Koçluk',
    sector_opportunity_score: 90,
    willingness_to_pay_score: 85,
    urgency_score: 85,
    automation_fit_score: 90,
    local_market_density_score: 75,
    pain_frequency_score: 88,
    service_match_score: 92,
    competition_gap_score: 80,
    expected_ltv_score: 85,
    recommended_services: ['AI Lead Response', 'Randevu Kurtarma', 'Yorum Motoru'],
    best_offer: 'AI Lead Response Agent',
    recommended_scan_queries: ['psikolog', 'diyetisyen', 'fizyoterapi', 'yaşam koçu'],
    priority_wave: 1,
    reason_to_target_now: 'Online danışmanlıkla büyüyen sektör, lead yanıt hızı para kaybı yarattıyor',
  },
  {
    id: 'oto_servis',
    displayName: 'Oto Servis / Ekspertiz',
    sector_opportunity_score: 88,
    willingness_to_pay_score: 85,
    urgency_score: 88,
    automation_fit_score: 88,
    local_market_density_score: 88,
    pain_frequency_score: 90,
    service_match_score: 90,
    competition_gap_score: 82,
    expected_ltv_score: 88,
    recommended_services: ['Servis Hatırlatma', 'Eski Müşteri Canlandırma', 'AI Lead Response'],
    best_offer: 'Servis Hatırlatma',
    recommended_scan_queries: ['oto servis', 'araç ekspertiz', 'kaporta boya', 'araç bakım'],
    priority_wave: 1,
    reason_to_target_now: 'Tekrar ziyaret oranı düşük, servis hatırlatması direkt ciro, dijital varlık genelde zayıf',
  },
  {
    id: 'emlak',
    displayName: 'Emlak / Gayrimenkul',
    sector_opportunity_score: 87,
    willingness_to_pay_score: 88,
    urgency_score: 88,
    automation_fit_score: 88,
    local_market_density_score: 82,
    pain_frequency_score: 88,
    service_match_score: 90,
    competition_gap_score: 78,
    expected_ltv_score: 92,
    recommended_services: ['Lead Takip Sistemi', 'Portföy Eşleştirme', 'Teklif Masası'],
    best_offer: 'Lead Takip Sistemi',
    recommended_scan_queries: ['emlak ofisi', 'gayrimenkul', 'ev satış', 'konut projesi'],
    priority_wave: 1,
    reason_to_target_now: 'Yüksek komisyon, lead takipsizliği büyük kayıp, portföy eşleştirme verimsiz',
  },
  {
    id: 'veteriner',
    displayName: 'Veteriner Klinik',
    sector_opportunity_score: 86,
    willingness_to_pay_score: 82,
    urgency_score: 84,
    automation_fit_score: 88,
    local_market_density_score: 80,
    pain_frequency_score: 88,
    service_match_score: 90,
    competition_gap_score: 85,
    expected_ltv_score: 80,
    recommended_services: ['Randevu Kurtarma', 'Eski Hasta Canlandırma', 'Yorum Motoru'],
    best_offer: 'Randevu Kurtarma Sistemi',
    recommended_scan_queries: ['veteriner', 'veteriner klinik', 'hayvan hastanesi'],
    priority_wave: 2,
    reason_to_target_now: 'Pet sahipliği artıyor, randevu sistemi genelde yok, WhatsApp beklentisi yüksek',
  },
  {
    id: 'ozel_kurs',
    displayName: 'Özel Kurs / Eğitim Merkezi',
    sector_opportunity_score: 82,
    willingness_to_pay_score: 78,
    urgency_score: 82,
    automation_fit_score: 85,
    local_market_density_score: 85,
    pain_frequency_score: 85,
    service_match_score: 85,
    competition_gap_score: 80,
    expected_ltv_score: 78,
    recommended_services: ['Veli Takip Sistemi', 'Kayıt Pipeline', 'Follow-up Agent'],
    best_offer: 'Kayıt Pipeline',
    recommended_scan_queries: ['özel kurs', 'dershane', 'eğitim merkezi', 'İngilizce kursu'],
    priority_wave: 2,
    reason_to_target_now: 'Kayıt dönemi kritik, lead kaybı büyük, veli takip sistemi eksik',
  },
]

export function getSectorOpportunities(limit = 10): SectorOpportunity[] {
  return [...SECTORS]
    .sort((a, b) => b.sector_opportunity_score - a.sector_opportunity_score)
    .slice(0, limit)
}

export function getTopScanSuggestions(limit = 3): { sector: string; query: string; reason: string }[] {
  return getSectorOpportunities(limit).map(s => ({
    sector: s.displayName,
    query: s.recommended_scan_queries[0],
    reason: s.reason_to_target_now,
  }))
}
