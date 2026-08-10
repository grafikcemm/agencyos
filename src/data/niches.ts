// AgencyOS niş kaydı — İLK 90 GÜNÜN KANONİK HEDEFLEMESİ.
//
// Kaynak: docs/grafikcem-b2b-pazar-arastirmasi-2026-08-09.{md,json}
// (kullanıcı tarafından "nihai" olarak verilen 9 Ağustos 2026 B2B araştırması).
//
// Bu dosya, `src/lib/sectorRotation.ts` içindeki 24 yerel işletme sektörünün
// (diş kliniği, oto servis, kuaför…) YERİNE GEÇEN varsayılan hedefleme
// havuzudur. Eski sektörler SİLİNMEZ — `legacyLocalSectors` olarak durur ve
// kullanıcının kaydettiği özel tipler korunur; yalnız varsayılan olmaktan çıkar.
//
// DEĞİŞMEZ KURALLAR
//   • Aynı outreach kampanyasında birden fazla niş karıştırılmaz.
//   • Bir hücrede aynı anda TEK giriş teklifi test edilir.
//   • Fiyatlar HİPOTEZDİR (bkz. PRICE_HYPOTHESIS_NOTE). Sistem kesin fiyat üretmez.
//   • `caseMatch` yalnız hizmet-uyumu düzeyinde kanıttır; yayımlanabilir müşteri
//     KPI'ı YOKTUR. Teklif metnine sayı koymak kullanıcı+müşteri iznine bağlıdır.

export type NicheId =
  | 'beauty_fragrance_cosmetics'
  | 'premium_home_kitchen_multibrand'
  | 'toy_kids_family'

export type NichePriority = 'ana' | 'deney'

/** Otomasyon merdiveni basamağı — bkz. docs/ui-principles-2026-08-10.md §2. */
export type AutomationRung = 'insan-yurutur' | 'insan-destekli' | 'tam-otonom'

export interface NicheOffer {
  /** Araştırmadaki teklif adı. `offer_id` çözümlemesinin anahtarı. */
  readonly id: string
  readonly name: string
  readonly delivery: string
  readonly duration: string
  readonly successMetrics: readonly string[]
  /** Serbest metin aralık — ayrıştırılıp sayıya çevrilmez. */
  readonly budgetTr: string
  readonly budgetGlobal: string
  readonly outOfScope: readonly string[]
}

export interface Niche {
  readonly id: NicheId
  readonly rank: number
  readonly name: string
  readonly score: number
  readonly priority: NichePriority
  /** İlk 90 günün outbound payı (yüzde). Toplamı 100 olmak zorunda. */
  readonly outboundShare: number
  readonly markets: readonly string[]
  readonly icp: {
    readonly employeeBands: readonly string[]
    readonly requiredSignals: readonly string[]
    readonly priorityCities: readonly string[]
    readonly globalPriority: readonly string[]
    readonly mustHave: readonly string[]
  }
  readonly buyingTriggers: readonly string[]
  readonly decisionMakerRoles: readonly string[]
  readonly disqualifiers: readonly string[]
  readonly entryOffer: NicheOffer
  readonly coreOffer: NicheOffer
  readonly retainerOffer: NicheOffer
  /** Araştırmadaki uzun vaka adı. Lead kayıtları kısa ad taşır — bkz. CASE_ALIASES. */
  readonly caseMatch: string
  readonly searchQueries: {
    readonly web: readonly string[]
    readonly linkedin: readonly string[]
    /**
     * Reklam kütüphanesi sorguları. GÜVENİLİR API YOK — bunlar otomatik
     * entegrasyon değil, MANUEL DOĞRULAMA GÖREVİ üretir. Tarayıcı çerezi
     * kazıma kalıcı entegrasyon sayılmaz.
     */
    readonly adLibrariesManual: readonly string[]
  }
}

export const PRICE_HYPOTHESIS_NOTE =
  'Fiyatlar ticari hipotezdir, pazar ortalaması değildir. KDV ve üçüncü taraf ' +
  'lisans maliyetleri hariç. Kapsam, teslim tarihi, kabul ölçütü, depozito ve ' +
  'sözleşme netleşmeden teklif verilmez.'

export const NICHES: readonly Niche[] = [
  {
    id: 'beauty_fragrance_cosmetics',
    rank: 1,
    name: 'Güzellik, parfüm ve kozmetik',
    score: 92,
    priority: 'ana',
    outboundShare: 60,
    markets: ['Türkiye', 'Birleşik Krallık', 'Birleşik Arap Emirlikleri', 'Hollanda'],
    icp: {
      employeeBands: ['51-200', '201-500'],
      requiredSignals: [
        'son 90 günde lansman, fuar, mağaza veya ülke açılımı',
        'pazarlama ekibi',
        'tekrarlayan ürün kreatifi',
      ],
      priorityCities: ['İstanbul', 'Ankara', 'Bursa', 'Kocaeli'],
      globalPriority: ['UK', 'UAE', 'NL'],
      mustHave: ['e-ticaret', 'aktif sosyal', 'son 90 gün lansman veya açılım'],
    },
    buyingTriggers: [
      'yeni ürün/seri',
      'yeni mağaza',
      'fuar',
      'yeni ülke veya distribütör',
      'yeni marketing leader',
      'tasarım/video ilanı',
      'TR/EN veya TR/AR lokalizasyon',
    ],
    decisionMakerRoles: [
      'Pazarlama Direktörü / Marketing Director',
      'CMO',
      'Brand Director',
      'Brand Manager',
      'E-commerce Manager',
      'Creative Director',
      'Founder',
    ],
    disqualifiers: [
      'aktif pazarlama yok',
      'yalnız mikro/düşük fiyat odaklı',
      'claim ve kullanım hakkı onay süreci yok',
      'tek seferlik yıllık kreatif',
    ],
    entryOffer: {
      id: 'launch-creative-diagnostic',
      name: 'Launch Creative Diagnostic',
      delivery: "kampanya audit'i, 3 konsept yönü, varyasyon matrisi, risk/QC listesi",
      duration: '7 iş günü',
      successMetrics: ['kabul edilen yön', 'pilot onayı', 'tahmini üretim süresi'],
      budgetTr: '45.000-80.000 TL',
      budgetGlobal: '1.500-3.000 EUR',
      outOfScope: ['medya satın alma', 'çekim', 'sınırsız revizyon'],
    },
    coreOffer: {
      id: 'product-launch-creative-system',
      name: 'Product Launch Creative System',
      delivery: 'hero film/still, 3-5 format, landing hero, brand-safe prompt ve QC',
      duration: '3-5 hafta',
      successMetrics: ['zamanında lansman', 'ilk seferde onay', 'asset sayısı'],
      budgetTr: '180.000-350.000 TL',
      budgetGlobal: '6.000-12.000 EUR',
      outOfScope: ['claim/legal onay', 'influencer yönetimi'],
    },
    retainerOffer: {
      id: 'ai-assisted-creative-retainer',
      name: 'AI-assisted Creative Retainer',
      delivery: 'aylık 2 konsept, 12-24 master/varyasyon, 1-2 kısa video, öğrenim raporu',
      duration: 'en az 3 ay',
      successMetrics: ['test edilen konsept', 'CTR/CPA yönü', 'turnaround'],
      budgetTr: '140.000-300.000 TL/ay',
      budgetGlobal: '5.000-10.000 EUR/ay',
      outOfScope: ['medya bütçesi', 'günlük community management'],
    },
    caseMatch: 'Your Own Scent (YOS)',
    searchQueries: {
      web: [
        'site:linkedin.com/company cosmetics new product 2026 Turkey',
        'beauty brand new market launch 2026',
      ],
      linkedin: ['beauty marketing director Turkey', 'fragrance export marketing'],
      adLibrariesManual: ['Meta Ad Library', 'Google Ads Transparency Center'],
    },
  },
  {
    id: 'premium_home_kitchen_multibrand',
    rank: 2,
    name: 'Premium ev/mutfak + çok markalı perakende ve distribütör',
    score: 90,
    priority: 'deney',
    outboundShare: 25,
    markets: ['Türkiye', 'Birleşik Krallık', 'Almanya', 'Hollanda'],
    icp: {
      employeeBands: ['201-500', '500+'],
      requiredSignals: [
        'yüksek SKU/kanal karmaşıklığı',
        'son 90 gün mağaza, koleksiyon veya ülke sinyali',
        'pazarlama/e-ticaret ekibi',
      ],
      priorityCities: ['İstanbul', 'Kütahya', 'Bilecik'],
      globalPriority: ['UK', 'DE', 'NL'],
      mustHave: ['e-ticaret', 'çok SKU/marka', 'son 90 gün mağaza/koleksiyon/pazar sinyali'],
    },
    buyingTriggers: [
      'yeni mağaza',
      'yeni koleksiyon',
      'e-ticaret altyapısı',
      'uluslararası açılım',
      'PIM/ERP/AI dönüşümü',
      'yüksek SKU',
      'tasarım/e-ticaret ilanı',
    ],
    decisionMakerRoles: [
      'Pazarlama Direktörü / Marketing Director',
      'E-commerce Director',
      'Brand Manager',
      'Digital Marketing Manager',
      'Creative Director',
      'Digital Transformation Manager',
    ],
    disqualifiers: [
      'çok düşük marj ve yalnız fiyat promosyonu',
      'aktif e-ticaret yok',
      'altı aydan uzun procurement',
      'yalnız yıllık katalog ihtiyacı',
    ],
    entryOffer: {
      id: 'sku-channel-creative-audit',
      name: 'SKU & Channel Creative Audit',
      delivery: 'SKU/kanal haritası, backlog analizi, 3 örnek adaptasyon, taxonomy taslağı',
      duration: '10 iş günü',
      successMetrics: ['SKU başı süre', 'reuse fırsatı', 'pilot onayı'],
      budgetTr: '60.000-95.000 TL',
      budgetGlobal: '2.000-3.500 EUR',
      outOfScope: ['tüm katalog üretimi'],
    },
    coreOffer: {
      id: 'multichannel-campaign-factory-sprint',
      name: 'Multi-channel Campaign Factory Sprint',
      delivery: 'tek koleksiyon için mail-banner-social-PDP sistemi, template ve naming',
      duration: '4-6 hafta',
      successMetrics: ['kanal kapsaması', 'onay turu', 'yeniden kullanım oranı'],
      budgetTr: '220.000-450.000 TL',
      budgetGlobal: '8.000-15.000 EUR',
      outOfScope: ['ERP/PIM kurulumu', 'ürün çekimi', '3D'],
    },
    retainerOffer: {
      id: 'monthly-campaign-cell',
      name: 'Monthly Campaign Cell',
      delivery: '20-40 aylık asset/adaptasyon, SLA ve arşiv disiplini',
      duration: 'en az 3 ay',
      successMetrics: ['backlog', 'SLA', 'asset başı saat'],
      budgetTr: '180.000-380.000 TL/ay',
      budgetGlobal: '6.000-13.000 EUR/ay',
      outOfScope: ['7/24 acil iş', 'baskı', 'medya maliyeti'],
    },
    caseMatch: 'Enplus Türkiye',
    searchQueries: {
      web: ['home kitchen new collection 2026 Turkey', 'home retailer new store 2026'],
      linkedin: ['home retail e-commerce director', 'kitchenware marketing director'],
      adLibrariesManual: ['Meta Ad Library', 'Google Ads Transparency Center'],
    },
  },
  {
    id: 'toy_kids_family',
    rank: 3,
    name: 'Oyuncak, çocuk ve aile tüketim ürünleri',
    score: 84,
    priority: 'deney',
    outboundShare: 15,
    markets: ['Türkiye', 'Birleşik Krallık', 'İrlanda', 'Almanya'],
    icp: {
      employeeBands: ['51-200', '201-500', '500+'],
      requiredSignals: [
        'son 90 gün lisans/ürün/sezon/mağaza sinyali',
        'pazarlama ekibi',
        'düzenli video veya ürün içeriği',
      ],
      priorityCities: ['İstanbul', 'Ankara', 'Kocaeli', 'Tekirdağ', 'Kırklareli'],
      globalPriority: ['UK', 'IE', 'DE'],
      mustHave: [
        'e-ticaret',
        'son 90 gün lisans/ürün/sezon sinyali',
        'tekrarlayan video/social/PDP',
      ],
    },
    buyingTriggers: [
      'yeni lisans',
      'yeni ürün',
      'sezon kataloğu',
      'fuar',
      'yeni mağaza',
      'yeni ülke/distribütör',
      'video/content creator ilanı',
    ],
    decisionMakerRoles: [
      'Pazarlama Direktörü / Marketing Director',
      'Brand Director',
      'Brand Manager',
      'E-commerce Manager',
      'Export Marketing',
      'Creative Director',
      'Founder',
    ],
    disqualifiers: [
      'IP/lisans onay süreci tanımsız',
      'çocuk güvenliği riski',
      'aktif pazarlama yok',
      'yalnız toptan ve yıllık katalog ihtiyacı',
    ],
    entryOffer: {
      id: 'seasonal-campaign-diagnostic',
      name: 'Seasonal Campaign Diagnostic',
      delivery: "sezon/lisans audit'i, storyboard/animatic, safety/IP checklist",
      duration: '5 iş günü',
      successMetrics: ['storyboard onayı', 'üretim uyumu'],
      budgetTr: '45.000-75.000 TL',
      budgetGlobal: '1.500-2.500 EUR',
      outOfScope: ['lisans onayı', 'çocuk oyuncu', 'çekim'],
    },
    coreOffer: {
      id: 'character-safe-ai-campaign-sprint',
      name: 'Character-safe AI Campaign Sprint',
      delivery: 'hero kısa film, 3-5 cutdown, social/PDP kit, character-safe QC',
      duration: '3-5 hafta',
      successMetrics: ['lisans ret oranı', 'teslim süresi', 'varyasyon'],
      budgetTr: '160.000-320.000 TL',
      budgetGlobal: '5.000-10.000 EUR',
      outOfScope: ["oyuncak güvenlik claim'i", 'medya'],
    },
    retainerOffer: {
      id: 'seasonal-campaign-cell',
      name: 'Seasonal Campaign Cell',
      delivery: '12-24 aylık asset, katalog/PDP adaptasyonu',
      duration: 'en az 3 ay',
      successMetrics: ['zamanında sezon', 'PDP video kapsamı'],
      budgetTr: '120.000-260.000 TL/ay',
      budgetGlobal: '4.000-9.000 EUR/ay',
      outOfScope: ['sınırsız SKU', 'sınırsız revizyon'],
    },
    caseMatch: 'Dede Oyuncak',
    searchQueries: {
      web: ['toy new license 2026 Turkey', 'kids brand new collection 2026'],
      linkedin: ['toy marketing director Turkey', 'kids brand export marketing'],
      adLibrariesManual: ['Meta Ad Library', 'Google Ads Transparency Center'],
    },
  },
]

/**
 * Lead kayıtlarındaki KISA vaka adı → nişteki UZUN vaka adı.
 * Araştırma JSON'unda lead seviyesi `YOS` / `Enplus` derken niş seviyesi
 * `Your Own Scent (YOS)` / `Enplus Türkiye` diyor. Eşleme olmadan vaka
 * bağlantısı sessizce kopar.
 */
export const CASE_ALIASES: Readonly<Record<string, string>> = {
  YOS: 'Your Own Scent (YOS)',
  Enplus: 'Enplus Türkiye',
  'Dede Oyuncak': 'Dede Oyuncak',
  // Birden fazla vakanın birlikte kanıt gösterildiği melez eşleşme.
  'Dede Oyuncak + Enplus': 'Dede Oyuncak + Enplus Türkiye',
}

export function getNiche(id: string | null | undefined): Niche | null {
  if (!id) return null
  return NICHES.find((n) => n.id === id) ?? null
}

export function allOffers(niche: Niche): readonly NicheOffer[] {
  return [niche.entryOffer, niche.coreOffer, niche.retainerOffer]
}

/**
 * Araştırmadaki serbest metin `matched_offer` değerini kanonik teklif kimliğine
 * çözer. 60 lead'de 45 farklı serbest metin var — bu bir ENUM DEĞİL.
 * Çözülemeyen değer `null` döner ve etiket olarak aynen saklanır; uydurma
 * eşleştirme yapılmaz.
 */
export function resolveOfferId(nicheId: string | null, label: string | null | undefined): string | null {
  const niche = getNiche(nicheId)
  if (!niche || !label) return null
  const needle = label.trim().toLowerCase()
  if (needle === '') return null
  const hit = allOffers(niche).find((o) => o.name.toLowerCase() === needle)
  return hit?.id ?? null
}

/** Toplam outbound payı — 100 olmak zorunda (test bunu doğrular). */
export const TOTAL_OUTBOUND_SHARE = NICHES.reduce((sum, n) => sum + n.outboundShare, 0)

/**
 * Kanıt tazeliği sınırı. Araştırma §17: doğrulaması 14 günden eski olan lead
 * satış eyleminden ÖNCE yeniden doğrulanır.
 */
export const EVIDENCE_MAX_AGE_DAYS = 14
