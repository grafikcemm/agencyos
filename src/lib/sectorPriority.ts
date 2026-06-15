// Sektör öncelik modeli — Türkiye pazarı için.
// Yüksek bulunabilirlik ≠ yüksek ödeme gücü. Premium / çok şubeli / dijital aktif işletmeler bonuslanır;
// mikro işletmeler düşük öncelik alır.
//
// ── KANONİK SEKTÖR TABLOSU (tek kaynak) ──────────────────────────────────────
// Bu liste iki deep-research raporunun (TÜİK/SGK temelli + regülasyon/teşvik odaklı)
// SENTEZİDİR. Uzlaştırma kuralı: priority = iki raporun max'ı (cap 100); wave = min
// (en erken dalga kazanır); ticketBand = yüksek olan. İstisna — güzellik kullanıcı
// kararıyla "dengeli orta-yüksek": wave 1'de ama premium sektörlerin (medikal estetik,
// diş, medikal turizm) altında tutuldu.
//
// ── KEYWORD-SYNC SÖZLEŞMESİ (en yüksek risk) ─────────────────────────────────
// matchSectorProfile, leads.sector'ı (= normalizeSector(SCAN displayName)) bu listeye
// SIRAYLA substring eşler — İLK eşleşen kazanır. Bu yüzden ÖZGÜL anahtarlar GENEL
// anahtarlardan ÖNCE gelmeli (ör. 'lüks gayrimenkul' real_estate'in 'gayrimenkul'undan
// önce; 'veteriner' health_clinic'in 'klinik'inden önce). sectorRotation.ts SCAN_SECTORS
// ile bu profillerin matchKeywords'leri ortak en az bir keyword paylaşmalı — keywordSync.test.ts doğrular.

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
  /** Dijital olgunluk açığı 0-100 (deep-research). Yüksek = satış daha kolay; urgency_score'u besler. */
  painLevel?: number
}

// SIRA KRİTİK: özgül → genel. Aşağıdaki sıralama generic-steal'ı önler.
export const SECTOR_PROFILES: SectorProfile[] = [
  // ── Premium sağlık & turizm (Dalga 1) ──
  {
    id: 'medical_tourism',
    matchKeywords: ['medikal turizm', 'sağlık turizmi', 'saglik turizmi', 'health tourism', 'aracı kuruluş'],
    displayName: 'Medikal Turizm / Aracı Kuruluş',
    priority: 96,
    wave: 1,
    primaryNeed: 'Çok dilli WhatsApp lead yanıtı, teklif akışı, uluslararası güven kreatifi. (5448 sayılı kararla reklam/yazılım gideri %60-70 devlet iadeli → fiyat itirazı en düşük segment.)',
    recommendedOfferIds: ['ai_sales_assistant', 'ai_creative_lab', 'proposal_desk', 'crm_reactivation', 'website'],
    ticketBand: 'premium',
    painLevel: 85,
  },
  {
    id: 'clinic_chain',
    matchKeywords: ['klinik zinciri', 'sağlık grubu', 'saglik grubu', 'hastane grubu', 'tıp merkezleri'],
    displayName: 'Klinik Zinciri / Sağlık Grubu',
    priority: 90,
    wave: 1,
    primaryNeed: 'Merkezi lead yönlendirme, çok lokasyonlu yorum/reputasyon, CRM reaktivasyon. Yüksek LTV ama daha kurumsal satış döngüsü.',
    recommendedOfferIds: ['ai_sales_assistant', 'review_engine', 'crm_reactivation', 'proposal_desk', 'website'],
    ticketBand: 'premium',
    painLevel: 60,
  },
  {
    id: 'veterinary',
    matchKeywords: ['veteriner', 'pet kliniği', 'hayvan hastanesi'],
    displayName: 'Veteriner Kliniği',
    priority: 73,
    wave: 2,
    primaryNeed: 'Randevu/aşı hatırlatma, yorum yönetimi, yerel SEO. Tekrar eden tedavi döngüsü otomasyona uygun.',
    recommendedOfferIds: ['appointment_recovery', 'crm_reactivation', 'review_engine', 'ai_sales_assistant'],
    ticketBand: 'mid',
    painLevel: 50,
  },
  {
    id: 'psychology',
    matchKeywords: ['psikolog', 'diyetisyen', 'danışmanlık merkezi', 'terapi merkezi'],
    displayName: 'Psikolog / Diyetisyen',
    priority: 72,
    wave: 2,
    primaryNeed: 'Randevu dönüşümü, no-show azaltma, güven odaklı içerik. Çok tek-uzmanlı ofis → premium/çok-uzmanlı merkez seç.',
    recommendedOfferIds: ['appointment_recovery', 'ai_sales_assistant', 'website', 'social_media_pack'],
    ticketBand: 'mid',
    painLevel: 60,
  },
  {
    id: 'health_clinic',
    matchKeywords: ['diş', 'dental', 'dentist', 'medikal estetik', 'estetik', 'klinik', 'poliklinik', 'özel hastane', 'saç ekim', 'göz', 'fizyoterapi', 'fizik tedavi', 'plastik cerrah', 'ortodonti', 'implant', 'tıp merkezi'],
    displayName: 'Özel Sağlık / Diş / Estetik',
    priority: 95,
    wave: 1,
    primaryNeed: 'Hızlı lead dönüşü, randevu, WhatsApp, yorum yönetimi, eski hasta canlandırma',
    recommendedOfferIds: ['ai_lead_response', 'ai_sales_assistant', 'appointment_recovery', 'review_engine', 'old_patient_reactivation'],
    ticketBand: 'premium',
    painLevel: 85,
  },
  // ── Gayrimenkul (Dalga 1) ──
  {
    id: 'luxury_real_estate',
    matchKeywords: ['lüks gayrimenkul', 'luxury real estate', 'rezidans', 'lüks emlak', 'villa'],
    displayName: 'Lüks Gayrimenkul / Rezidans',
    priority: 90,
    wave: 1,
    primaryNeed: 'AI kreatif ilan, çok dilli WhatsApp lead botu, portföy + teklif otomasyonu. Görsel kalite her şey; birkaç kapanış ajans ücretini katlar.',
    recommendedOfferIds: ['ai_sales_assistant', 'ai_creative_lab', 'proposal_desk', 'portfolio_matching', 'website'],
    ticketBand: 'premium',
    painLevel: 75,
  },
  {
    id: 'real_estate',
    matchKeywords: ['emlak', 'gayrimenkul', 'inşaat', 'proje satış', 'müteahhit'],
    displayName: 'Gayrimenkul / Proje Satış',
    priority: 88,
    wave: 1,
    primaryNeed: 'Lead takibi, portföy eşleştirme, randevu, teklif takibi. (2026 EİDS zorunluluğu merdiven-altını eledi → kurumsal ofisler markalaşmaya bütçe ayırıyor.)',
    recommendedOfferIds: ['lead_tracking', 'portfolio_matching', 'proposal_desk', 'ai_sales_assistant', 'ai_creative_lab'],
    ticketBand: 'premium',
    painLevel: 80,
  },
  // ── Yüksek bilet hizmet (Dalga 1) ──
  {
    id: 'tourism',
    matchKeywords: ['otel', 'turizm', 'resort', 'pansiyon', 'butik otel'],
    displayName: 'Turizm / Otel / Premium Restoran',
    priority: 86,
    wave: 1,
    primaryNeed: 'Rezervasyon, yorum, tekrar ziyaret, sezon öncesi kreatif yenileme',
    recommendedOfferIds: ['reservation_tracking', 'review_engine', 'loyalty_system', 'social_media_pack', 'ai_sales_assistant'],
    ticketBand: 'high',
    painLevel: 55,
  },
  {
    id: 'insurance',
    matchKeywords: ['sigorta', 'broker', 'acente'],
    displayName: 'Sigorta Acentesi / Broker',
    priority: 84,
    wave: 1,
    primaryNeed: 'Yenileme takibi, poliçe hatırlatma, çapraz satış',
    recommendedOfferIds: ['renewal_engine', 'followup_agent', 'old_customer_reactivation', 'crm_reactivation'],
    ticketBand: 'high',
    painLevel: 70,
  },
  {
    id: 'education',
    matchKeywords: ['okul', 'kolej', 'anaokulu', 'kreş'],
    displayName: 'Eğitim / Özel Okul / Kolej',
    priority: 84,
    wave: 1,
    primaryNeed: 'Kayıt dönemi lead takibi, veli takibi, deneme ders randevusu, eski veli reaktivasyonu',
    recommendedOfferIds: ['parent_tracking', 'enrollment_pipeline', 'followup_agent', 'ai_sales_assistant', 'social_media_pack'],
    ticketBand: 'high',
    painLevel: 55,
  },
  {
    id: 'beauty',
    matchKeywords: ['güzellik', 'kuaför', 'berber', 'cilt bakım', 'epilasyon', 'nail', 'tırnak'],
    displayName: 'Güzellik Salonu / Kuaför',
    priority: 83,
    wave: 1,
    primaryNeed: 'Instagram DM → randevu, no-show azaltma, Google yorum, sosyal içerik. Devasa hacim + maksimum dijital açık (operasyon %90 Instagram).',
    recommendedOfferIds: ['ai_sales_assistant', 'appointment_recovery', 'review_engine', 'social_media_pack', 'crm_reactivation'],
    ticketBand: 'mid',
    painLevel: 90,
  },
  {
    id: 'automotive',
    matchKeywords: ['galeri', 'otomotiv', 'oto servis', 'araç', 'oto bakım', 'oto ekspertiz'],
    displayName: 'Otomotiv / Galeri / Servis',
    priority: 82,
    wave: 1,
    primaryNeed: 'Test sürüşü randevusu, teklif, servis/bakım hatırlatma, eski müşteri canlandırma',
    recommendedOfferIds: ['lead_to_test_drive', 'old_customer_reactivation', 'service_reminder', 'appointment_recovery', 'review_engine'],
    ticketBand: 'high',
    painLevel: 75,
  },
  {
    id: 'ecommerce',
    matchKeywords: ['e-ticaret', 'eticaret', 'online satış', 'mağaza', 'shopify', 'woocommerce'],
    displayName: 'E-Ticaret / Perakende',
    priority: 80,
    wave: 1,
    primaryNeed: 'Reklam kreatifi, tekrar satın alma, sepet kurtarma, CRM reaktivasyonu',
    recommendedOfferIds: ['ai_creative_lab', 'crm_reactivation', 'ads_optimization', 'post_purchase_flows'],
    ticketBand: 'high',
    painLevel: 45,
  },
  // ── Üretim & tasarım bağımlı (Dalga 2) ──
  {
    id: 'home_decor',
    matchKeywords: ['mobilya', 'dekorasyon', 'ev tekstil', 'aydınlatma', 'mutfak dolabı', 'iç dekorasyon'],
    displayName: 'Ev Dekorasyon / Mobilya',
    priority: 79,
    wave: 2,
    primaryNeed: 'Ürün vitrini, AI mockup/oda render, katalog + teklif otomasyonu, reklam kreatifi',
    recommendedOfferIds: ['ai_creative_lab', 'social_media_pack', 'proposal_desk', 'website', 'ads_optimization'],
    ticketBand: 'high',
    painLevel: 50,
  },
  {
    id: 'architecture',
    matchKeywords: ['mimarlık', 'mimari', 'iç mimar'],
    displayName: 'Mimarlık / İç Mimarlık',
    priority: 77,
    wave: 2,
    primaryNeed: 'Portföy sunumu, teklif/proje takip masası, premium site',
    recommendedOfferIds: ['website', 'proposal_desk', 'social_media_pack', 'brand_identity', 'ai_creative_lab'],
    ticketBand: 'high',
    painLevel: 50,
  },
  {
    id: 'legal',
    matchKeywords: ['hukuk', 'avukat', 'avukatlık'],
    displayName: 'Hukuk Bürosu',
    priority: 77,
    wave: 2,
    primaryNeed: 'Güven veren web varlığı, lead ön eleme, belge/teklif akışı, kurumsal kimlik',
    recommendedOfferIds: ['website', 'ai_sales_assistant', 'proposal_desk', 'review_engine', 'corporate_identity'],
    ticketBand: 'high',
    painLevel: 50,
  },
  {
    id: 'spor',
    matchKeywords: ['fitness', 'pilates', 'spor salonu', 'gym'],
    displayName: 'Spor Salonu / Stüdyo',
    priority: 76,
    wave: 2,
    primaryNeed: 'Üyelik lead yanıtı, no-show azaltma, eski üye reaktivasyonu, sosyal içerik',
    recommendedOfferIds: ['ai_sales_assistant', 'appointment_recovery', 'crm_reactivation', 'social_media_pack'],
    ticketBand: 'mid',
    painLevel: 70,
  },
  {
    id: 'fashion',
    matchKeywords: ['moda', 'giyim', 'butik', 'tekstil', 'ayakkabı', 'konfeksiyon'],
    displayName: 'Moda / Giyim Butiği',
    priority: 74,
    wave: 2,
    primaryNeed: 'Reklam kreatifi, koleksiyon/vitrin içerikleri, AI model giydirme, e-ticaret dönüşümü',
    recommendedOfferIds: ['ai_creative_lab', 'social_media_pack', 'ads_optimization', 'website'],
    ticketBand: 'mid',
    painLevel: 50,
  },
  {
    id: 'restaurant',
    matchKeywords: ['restoran', 'kafe', 'cafe', 'lokanta', 'bistro', 'kahve', 'fine dining'],
    displayName: 'Restoran / Kafe',
    priority: 74,
    wave: 2,
    primaryNeed: 'Yorum motoru, kampanya kreatifi, sadakat/yeniden çağırma. Yalnız fine dining, çok şubeli, turistik lokasyon önceliklensin.',
    recommendedOfferIds: ['review_engine', 'social_media_pack', 'crm_reactivation', 'ai_sales_assistant'],
    ticketBand: 'mid',
    painLevel: 70,
  },
  {
    id: 'private_course',
    matchKeywords: ['kurs', 'dershane', 'dil kursu', 'sürücü kursu', 'etüt merkezi'],
    displayName: 'Özel Kurs / Eğitim Merkezi',
    priority: 71,
    wave: 2,
    primaryNeed: 'Kayıt dönemi kampanya, veli/öğrenci lead takibi, CRM reaktivasyonu',
    recommendedOfferIds: ['ai_sales_assistant', 'crm_reactivation', 'social_media_pack', 'enrollment_pipeline'],
    ticketBand: 'mid',
    painLevel: 60,
  },
  {
    id: 'wedding',
    matchKeywords: ['düğün', 'organizasyon', 'davet', 'wedding'],
    displayName: 'Düğün / Etkinlik Organizasyon',
    priority: 70,
    wave: 2,
    primaryNeed: 'Portföy vitrini, hızlı teklif dönüşü, sezonsal kampanya kreatifi',
    recommendedOfferIds: ['social_media_pack', 'proposal_desk', 'ai_sales_assistant', 'ai_creative_lab'],
    ticketBand: 'mid',
    painLevel: 70,
  },
  // ── Operasyon ağırlıklı (Dalga 2-3) ──
  {
    id: 'logistics',
    matchKeywords: ['lojistik', 'nakliye', 'kargo', 'depolama'],
    displayName: 'Lojistik / Nakliye / Depolama',
    priority: 70,
    wave: 2,
    primaryNeed: 'Teklif, belge, operasyon takibi',
    recommendedOfferIds: ['proposal_desk', 'document_automation', 'operations_dashboard'],
    ticketBand: 'mid',
    painLevel: 45,
  },
  {
    id: 'accounting',
    matchKeywords: ['muhasebe', 'mali müşavir', 'smmm'],
    displayName: 'Muhasebe / Mali Müşavir',
    priority: 60,
    wave: 3,
    primaryNeed: 'Belge işleme, evrak takibi, müşteri dosya kontrolü, yenileme/hatırlatma',
    recommendedOfferIds: ['document_automation', 'document_tracking', 'client_status_bot', 'crm_reactivation'],
    ticketBand: 'mid',
    painLevel: 40,
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
  painLevel: 30,
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
