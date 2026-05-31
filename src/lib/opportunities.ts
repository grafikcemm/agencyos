export type OpportunityCategory =
  | 'digital_product'
  | 'subscription'
  | 'workshop'
  | 'saas'
  | 'b2b_product'
  | 'side_income';

export type OpportunityStatus =
  | 'idea_stage'
  | 'planning_started'
  | 'ready_to_finish'
  | 'marketing_strategy'
  | 'completed';

export type PriorityLabel = 'hemen_icraat' | 'planlanmaya_al' | 'uzun_vadeli' | 'beklet';
export type ValidationResult = 'not_tested' | 'interest' | 'first_sale' | 'weak_interest' | 'pivot' | 'cancelled';
export type ActionTier = 'launch_now' | 'next_bet' | 'incubate' | 'park';

export const STATUS_LABELS: Record<OpportunityStatus, string> = {
  idea_stage: 'Fikir',
  planning_started: 'Planlandı',
  ready_to_finish: 'Bitir',
  marketing_strategy: 'Satışa çıkar',
  completed: 'Tamamlandı'
};

export const CATEGORY_LABELS: Record<OpportunityCategory, string> = {
  digital_product: 'Dijital ürün',
  subscription: 'Abonelik',
  workshop: 'Eğitim',
  saas: 'Sistem',
  b2b_product: 'B2B ürün',
  side_income: 'Ek gelir'
};

export const ACTION_TIER_LABELS: Record<ActionTier, string> = {
  launch_now: 'Şimdi icraat',
  next_bet: 'Sıradaki bahis',
  incubate: 'Kuluçka',
  park: 'Park et'
};

export const PRIORITY_LABELS: Record<PriorityLabel, string> = {
  hemen_icraat: 'Bugün ilerlet',
  planlanmaya_al: 'Planla',
  uzun_vadeli: 'Kanıt bekle',
  beklet: 'Beklet'
};

export interface OpportunityScore {
  revenuePotential: number;
  speedToLaunch: number;
  audienceFit: number;
  skillFit: number;
  effortLevel: number;
  scalability: number;
  strategicFit: number;
  riskLevel: number;
  distributionPower: number;
  recurringPotential: number;
  paymentReadiness: number;
  actionClarity: number;
  total: number;
}

export interface OpportunityScoreInput {
  revenuePotential: number;
  speedToLaunch: number;
  audienceFit: number;
  skillFit: number;
  effortLevel: number;
  scalability: number;
  strategicFit: number;
  riskLevel: number;
  distributionPower: number;
  recurringPotential: number;
  paymentReadiness: number;
  actionClarity: number;
}

export interface Opportunity {
  id: string;
  title: string;
  category: OpportunityCategory;
  status: OpportunityStatus;
  actionTier: ActionTier;
  order: number;
  decision: string;
  description: string;
  targetAudience: string;
  problem: string;
  solution: string;
  revenueModel: string;
  priceRange: string;
  salesChannels: string[];
  whyItMakesSense: string[];
  risks: string[];
  tags: string[];
  score: OpportunityScore;
  priorityLabel: PriorityLabel;
  stageNotes: string;
  currentStageChecklist: { label: string; checked: boolean }[];
  stageUpdatedAt: string;
  nextAction: string;
  nextActionDueDate: string;
  primaryMetric: string;
  firstRevenueTarget: string;
  paymentPlan: string;
  launchBlocker: string;
  antiDistractionRule: string;
  actionSteps: string[];
  completionCriteria: string[];
  sevenDayPlan: string[];
  thirtyDayPlan: string[];
  validationChecklist: { label: string; checked: boolean }[];
  validationResult: ValidationResult;
  marketingPlan: {
    channels: string[];
    launchAngle: string;
    contentPlan: string[];
    outreachPlan: string[];
    firstSalesMessage: string;
    ctaOptions: string[];
    pricingStrategy: string;
  };
  revenueProjection: {
    unitPrice: number;
    monthlySalesTarget: number;
    monthlyRevenuePotential: number;
    operationCost: 'low' | 'medium' | 'high';
    profitPotential: 'low' | 'medium' | 'high';
    recurring: boolean;
  };
  resultTracking: {
    launchDate: string;
    firstSaleDate: string;
    totalSales: number;
    totalRevenue: number;
    lessonsLearned: string[];
    nextVersionNeeded: boolean;
  };
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export const STAGE_CHECKLISTS: Record<OpportunityStatus, string[]> = {
  idea_stage: [
    'Tek cümlelik ürün vaadi yazıldı',
    'Hedef müşteri netleşti',
    'İlk fiyat ve ödeme yolu seçildi',
    'İlk satış kanalı seçildi',
    'Satışa engel olan tek blokaj yazıldı'
  ],
  planning_started: [
    'MVP kapsamı 1 sayfaya indirildi',
    'Satış sayfası bölümleri çıkarıldı',
    'Ödeme/test checkout planı netleşti',
    'İlk 3 tanıtım içeriği yazıldı',
    'İlk 10 potansiyel alıcı listelendi'
  ],
  ready_to_finish: [
    'Ürün dosyası/demosu hazır',
    'Mockup ve kapak hazır',
    'Satış sayfası yayına hazır',
    'Ödeme linki test edildi',
    'Teslimat maili veya indirme akışı hazır'
  ],
  marketing_strategy: [
    'Lansman metni hazır',
    'İlk satış postu hazır',
    'DM cevap şablonu hazır',
    'Fiyat itirazı cevabı hazır',
    'İlk satış sonrası upsell planı hazır'
  ],
  completed: [
    'Yayına alındı',
    'İlk satış kaydedildi',
    'Dönüşüm oranı not edildi',
    'Geri bildirim toplandı',
    'Devam/park kararı verildi'
  ]
};

export const VALIDATION_CHECKLIST = [
  'Alıcı kim net mi?',
  'Ürün 7 günde satılabilir hale gelir mi?',
  'Ödeme alma yolu net mi?',
  'İlk satış kanalı belli mi?',
  'İlk 10 kişiye ne söyleneceği hazır mı?',
  'Satın alan kişiye ürün nasıl teslim edilecek?',
  'İlk satıştan sonra hangi ürün gelecek?'
];

export function createChecklist(items: string[]) {
  return items.map(label => ({ label, checked: false }));
}

export function calculateOpportunityScore(input: OpportunityScoreInput): OpportunityScore {
  const effortPenalty = 100 - input.effortLevel;
  const riskPenalty = 100 - input.riskLevel;

  const total = Math.round(
    input.revenuePotential * 0.12 +
    input.speedToLaunch * 0.14 +
    input.audienceFit * 0.14 +
    input.skillFit * 0.1 +
    effortPenalty * 0.1 +
    input.scalability * 0.08 +
    input.strategicFit * 0.1 +
    riskPenalty * 0.08 +
    input.distributionPower * 0.08 +
    input.paymentReadiness * 0.04 +
    input.actionClarity * 0.02
  );

  return { ...input, total };
}

function createOpportunity(input: Omit<Opportunity, 'score' | 'currentStageChecklist' | 'validationChecklist' | 'stageUpdatedAt' | 'createdAt' | 'updatedAt'> & { score: OpportunityScoreInput }): Opportunity {
  const now = new Date().toISOString();

  return {
    ...input,
    score: calculateOpportunityScore(input.score),
    currentStageChecklist: createChecklist(STAGE_CHECKLISTS[input.status]),
    validationChecklist: createChecklist(VALIDATION_CHECKLIST),
    stageUpdatedAt: now,
    createdAt: now,
    updatedAt: now
  };
}

const emptyResultTracking = {
  launchDate: '',
  firstSaleDate: '',
  totalSales: 0,
  totalRevenue: 0,
  lessonsLearned: [],
  nextVersionNeeded: false
};

export const MOCK_OPPORTUNITIES: Opportunity[] = [
  createOpportunity({
    id: 'opp-payment-stack',
    title: 'Grafikcem Web Sitesi Satış Altyapısı',
    category: 'side_income',
    status: 'planning_started',
    actionTier: 'launch_now',
    order: 1,
    decision: 'Önce para alma engelini kaldır. Ürün mükemmel olmasa da ödeme akışı hazır olmalı.',
    description: 'Mevcut Grafikcem web sitesini ilk dijital ürün satışı için checkout, teslimat ve basit satış sayfası akışına hazırlayan icraat paketi.',
    targetAudience: 'Grafikcem kitlesinden ilk dijital ürünü satın alacak tasarımcılar, içerik üreticileri ve freelancerlar.',
    problem: 'Ürün fikri hazır olsa bile ödeme, teslimat ve satış sayfası net değilse ilk satış gecikir.',
    solution: 'Tek ürünlük landing page, ödeme linki, teslimat maili ve basit teşekkür sayfası ile satışa hazır altyapı kurmak.',
    revenueModel: 'Satış altyapısı; doğrudan gelir değil, ilk ürün gelirini açan sistem.',
    priceRange: 'Altyapı maliyeti düşük; ilk ürün fiyatı $4.99',
    salesChannels: ['Grafikcem web sitesi', 'Instagram bio link', 'Shopier', 'iyzico Link', 'Lemon Squeezy'],
    whyItMakesSense: [
      'İlk satışın önündeki en kritik belirsizlik ödeme ve teslimat.',
      'Shopier veya iyzico Link ile Türkiye içinde hızlı test yapılabilir.',
      'Lemon Squeezy global satış ve vergi kolaylığı için ikinci kanal olabilir.',
      'Bir kez kurulan altyapı sonraki ürünleri de hızlandırır.'
    ],
    risks: [
      'Ödeme sağlayıcı onayı veya hesap kurulumu beklenenden uzun sürebilir.',
      'Global satış için komisyon, payout ve vergi detayları ayrıca kontrol edilmeli.'
    ],
    tags: ['checkout', 'satış-sayfası', 'ödeme', 'grafikcem'],
    score: {
      revenuePotential: 75,
      speedToLaunch: 90,
      audienceFit: 95,
      skillFit: 90,
      effortLevel: 35,
      scalability: 85,
      strategicFit: 100,
      riskLevel: 25,
      distributionPower: 90,
      recurringPotential: 10,
      paymentReadiness: 85,
      actionClarity: 95
    },
    priorityLabel: 'hemen_icraat',
    stageNotes: 'Bu iş bitmeden yeni fikir eklenmez.',
    nextAction: 'Shopier veya iyzico Link ile test ödeme linki oluştur; sitede tek ürünlük satış sayfasına bağla.',
    nextActionDueDate: '',
    primaryMetric: 'Test ödeme linki canlı mı?',
    firstRevenueTarget: 'İlk ürün için 1 gerçek ödeme',
    paymentPlan: 'Türkiye içi hızlı test: Shopier/iyzico Link. Global dijital satış: Lemon Squeezy ikinci kanal. Büyüdüğünde PayTR/iyzico sanal POS.',
    launchBlocker: 'Ödeme linki ve teslimat akışı kurulmadı.',
    antiDistractionRule: 'Checkout canlı olmadan yeni ürün fikri açma.',
    actionSteps: [
      'Tek ürünlük landing page iskeletini çıkar.',
      'Ödeme linki için Shopier veya iyzico hesabını hazırla.',
      'Satın alma sonrası PDF teslimat mailini yaz.',
      'Kendine düşük tutarlı test ödeme akışı yap.'
    ],
    completionCriteria: [
      'Satış sayfası canlı',
      'Ödeme linki çalışıyor',
      'Teslimat mesajı hazır',
      'İlk ürün linki Instagram bio için hazır'
    ],
    sevenDayPlan: [
      'Gün 1: Ödeme sağlayıcı kararı ve hesap kurulumu.',
      'Gün 2: Landing page metni.',
      'Gün 3: Checkout ve teslimat testi.',
      'Gün 4: Ürün mockup alanı.',
      'Gün 5: İlk satış postu taslağı.',
      'Gün 6: Test ödeme.',
      'Gün 7: Satışa aç.'
    ],
    thirtyDayPlan: [
      'İlk ürün satışını takip et.',
      'Ödeme terk oranını not et.',
      'Satış sayfasını geri bildirimle düzelt.',
      'İkinci ürün için aynı checkout altyapısını çoğalt.'
    ],
    validationResult: 'not_tested',
    marketingPlan: {
      channels: ['Instagram', 'web sitesi', 'DM'],
      launchAngle: 'Grafikcem artık küçük ama uygulanabilir AI ürünleri satıyor.',
      contentPlan: ['Satış sayfası canlı duyurusu', 'Ürün içeriği önizlemesi', 'İlk alıcı indirimi'],
      outreachPlan: ['Yakın çevrede 10 tasarımcıya test linki gönder'],
      firstSalesMessage: 'İlk Grafikcem prompt ürününü $4.99 erken erişim fiyatıyla açtım; istersen satış sayfasını göndereyim.',
      ctaOptions: ['Satın al', 'Önizlemeyi gör', 'Erken erişime katıl'],
      pricingStrategy: 'İlk ürün düşük fiyat; ödeme sürtünmesini test et.'
    },
    revenueProjection: {
      unitPrice: 0,
      monthlySalesTarget: 0,
      monthlyRevenuePotential: 0,
      operationCost: 'low',
      profitPotential: 'high',
      recurring: false
    },
    resultTracking: emptyResultTracking,
    notes: 'Bu fırsat ürün değil, gelir sisteminin kapısı. En yüksek öncelik, satışın teknik olarak mümkün hale gelmesi.'
  }),
  createOpportunity({
    id: 'opp-prompt-booklet',
    title: 'Grafikcem Prompt Kitapçığı',
    category: 'digital_product',
    status: 'ready_to_finish',
    actionTier: 'launch_now',
    order: 2,
    decision: 'İlk satılacak ürün bu. Kapsam küçük, fiyat düşük, satış testi net.',
    description: 'Tasarımcılar ve içerik üreticileri için doğrudan kopyalanabilir, örnek çıktılı, kısa ve uygulanabilir AI prompt kitapçığı.',
    targetAudience: 'Grafik tasarımcılar, sosyal medya tasarımcıları, içerik üreticileri, junior kreatifler.',
    problem: 'AI kullanmak istiyorlar ama promptları dağınık, sonuçları tutarsız ve işe başlama hızları düşük.',
    solution: '30-40 prompt, 5 kullanım senaryosu, örnek çıktı ve kısa kullanım notları içeren PDF/Notion kitapçık.',
    revenueModel: 'Tek seferlik dijital ürün satışı.',
    priceRange: '$4.99 erken satış; Türkiye için yaklaşık TL karşılığı ayrı gösterilebilir.',
    salesChannels: ['Grafikcem web sitesi', 'Instagram', 'Shopier', 'iyzico Link', 'Lemon Squeezy'],
    whyItMakesSense: [
      'Mevcut Grafikcem kitlesine doğrudan uyar.',
      'Düşük fiyat ilk ödeme davranışını test eder.',
      'Üretimi hızlıdır ve sonraki AI Agent Paketi için giriş ürünü olur.',
      'Satış sayfasında örnek çıktı gösterildiğinde değer somutlaşır.'
    ],
    risks: [
      'Sadece prompt listesi gibi görünürse değer algısı düşer.',
      'Örnek çıktı ve kullanım senaryosu olmazsa satın alma motivasyonu zayıflar.'
    ],
    tags: ['prompt', 'dijital-ürün', 'grafikcem', 'ilk-satış'],
    score: {
      revenuePotential: 78,
      speedToLaunch: 95,
      audienceFit: 96,
      skillFit: 94,
      effortLevel: 25,
      scalability: 95,
      strategicFit: 92,
      riskLevel: 18,
      distributionPower: 88,
      recurringPotential: 10,
      paymentReadiness: 80,
      actionClarity: 100
    },
    priorityLabel: 'hemen_icraat',
    stageNotes: 'İlk satış ürünü. Başka fikirler bu satış testinden sonra gelir.',
    nextAction: '30 promptluk MVP dosyasını bitir, 5 örnek çıktı ekle ve $4.99 satış sayfasına bağla.',
    nextActionDueDate: '',
    primaryMetric: 'İlk 7 günde 10 satış veya 30 ciddi tıklama',
    firstRevenueTarget: 'İlk 10 satış: yaklaşık $49.90',
    paymentPlan: 'Türkiye testinde Shopier/iyzico Link; global checkout için Lemon Squeezy. Satış sayfasında TL ve USD fiyat mantığını ayrı not et.',
    launchBlocker: 'PDF kapsamı, kapak/mockup ve ödeme linki bitmeli.',
    antiDistractionRule: 'İlk satış gelmeden mega paket, üyelik veya yeni eğitim açma.',
    actionSteps: [
      'Promptları 5 kategoriye ayır.',
      'Her kategoriye 1 örnek çıktı ekle.',
      'Kapak ve ürün mockup görselini hazırla.',
      'Satış sayfasına fiyat, içerik listesi ve SSS koy.',
      'İlk duyuru postunu yayınla.'
    ],
    completionCriteria: [
      'PDF/Notion ürün hazır',
      '5 örnek çıktı var',
      'Satış sayfası canlı',
      'Ödeme ve teslimat test edildi',
      'İlk satış postu yayınlandı'
    ],
    sevenDayPlan: [
      'Gün 1: Ürün içindekiler ve prompt kategorileri.',
      'Gün 2: İlk 20 prompt.',
      'Gün 3: Kalan promptlar ve örnek çıktılar.',
      'Gün 4: PDF tasarımı ve kapak.',
      'Gün 5: Satış sayfası.',
      'Gün 6: Ödeme/teslimat testi.',
      'Gün 7: Lansman.'
    ],
    thirtyDayPlan: [
      'İlk 10 satışı hedefle.',
      'Alıcı geri bildirimlerinden v1.1 çıkar.',
      'En çok istenen prompt kategorisini AI Agent Paketi için sinyal olarak kaydet.',
      'Bundle fiyatı test et.'
    ],
    validationResult: 'not_tested',
    marketingPlan: {
      channels: ['Instagram', 'Grafikcem web sitesi', 'DM', 'LinkedIn'],
      launchAngle: 'Tasarımcıların AI ile üretime başlarken kullanacağı ilk küçük Grafikcem aracı.',
      contentPlan: ['Önce/sonra prompt çıktısı', 'Kitapçığın içindekiler', '1 ücretsiz örnek prompt'],
      outreachPlan: ['10 tasarımcıya erken erişim mesajı', 'Kaydeden/yorum yapan kişilere DM'],
      firstSalesMessage: 'Grafikcem Prompt Kitapçığı v1 çıktı. 30+ kopyalanabilir prompt ve örnek çıktıyla $4.99 erken fiyatla açtım.',
      ctaOptions: ['Kitapçığı al', 'Örnek promptu gör', 'Erken fiyatla satın al'],
      pricingStrategy: '$4.99 ile ilk satış sürtünmesini düşür; 20 satıştan sonra $9.99 test et.'
    },
    revenueProjection: {
      unitPrice: 5,
      monthlySalesTarget: 100,
      monthlyRevenuePotential: 500,
      operationCost: 'low',
      profitPotential: 'high',
      recurring: false
    },
    resultTracking: emptyResultTracking,
    notes: 'Bu ürünün görevi büyük para değil, satın alma kanıtı üretmek. İlk satış gelirse AI Agent Paketi ve eğitim için zemin güçlenir.'
  }),
  createOpportunity({
    id: 'opp-designer-agent-pack',
    title: 'Tasarımcılar İçin AI Agent Paketi',
    category: 'digital_product',
    status: 'planning_started',
    actionTier: 'next_bet',
    order: 3,
    decision: 'Prompt kitapçığından sonra en güçlü ikinci ürün. Daha pahalı satılabilir ama ilk satış kanıtını beklemeli.',
    description: 'Tasarımcıların tekrar eden işlerinde kullanacağı hazır GPT/Gem/Gemini talimatları, brief asistanları ve üretim agent sistemleri.',
    targetAudience: 'Freelancer tasarımcılar, sosyal medya tasarımcıları, junior kreatifler, küçük ajans ekipleri.',
    problem: 'AI kullanıyorlar ama her iş için sıfırdan prompt yazıyor, tutarlı bir kreatif workflow kuramıyorlar.',
    solution: '5 çekirdek agent: brief çözücü, carousel fikir üretici, görsel prompt mühendisi, revize yorumlayıcı, teklif/teslimat asistanı.',
    revenueModel: 'Tek seferlik dijital ürün + prompt kitapçığı bundle.',
    priceRange: '$19 - $49',
    salesChannels: ['Grafikcem web sitesi', 'Instagram', 'LinkedIn', 'Shopier', 'Lemon Squeezy'],
    whyItMakesSense: [
      'Kullanıcının AI agent ve GEM deneyimiyle birebir uyumlu.',
      'Prompt kitapçığından doğal upsell olur.',
      'Daha yüksek fiyatlandırılabilir.',
      'AgencyOS Lite ile freelancer operasyon paketine bağlanabilir.'
    ],
    risks: [
      'Kurulum rehberi olmazsa kullanıcı ürünü çalıştıramaz.',
      'Agent çıktıları fazla genel kalırsa değer algısı düşer.'
    ],
    tags: ['ai-agent', 'designer-agent', 'upsell', 'grafikcem'],
    score: {
      revenuePotential: 88,
      speedToLaunch: 78,
      audienceFit: 92,
      skillFit: 96,
      effortLevel: 42,
      scalability: 96,
      strategicFit: 96,
      riskLevel: 22,
      distributionPower: 84,
      recurringPotential: 25,
      paymentReadiness: 75,
      actionClarity: 88
    },
    priorityLabel: 'planlanmaya_al',
    stageNotes: 'Prompt kitapçığının satış verisi geldikten sonra kapsam netleşsin.',
    nextAction: 'İlk 5 agent başlığını ve her biri için input-output örneğini yaz.',
    nextActionDueDate: '',
    primaryMetric: 'Prompt kitapçığı alıcılarının %20’si agent paketini ister mi?',
    firstRevenueTarget: 'İlk 20 satış: $380-$980',
    paymentPlan: 'Prompt kitapçığı checkout altyapısını kullan; bundle seçeneği ekle.',
    launchBlocker: 'Agent kurulum rehberi ve örnek çıktı seti eksik.',
    antiDistractionRule: 'Prompt kitapçığı satış sinyali gelmeden 10+ agent kapsamına büyütme.',
    actionSteps: [
      '5 agent başlığını dondur.',
      'Her agent için ne zaman kullanılır notu yaz.',
      '1 ücretsiz agent örneği paylaş.',
      'İlk alıcı anketine agent ihtiyacı sorusu ekle.'
    ],
    completionCriteria: [
      '5 agent talimatı hazır',
      'Kurulum rehberi hazır',
      'Örnek çıktılar hazır',
      'Bundle fiyatı net'
    ],
    sevenDayPlan: [
      '5 agent görev tanımı.',
      'Her agent için input-output formatı.',
      '1 ücretsiz örnek.',
      'Mini kurulum rehberi.',
      'Satış sayfası taslağı.'
    ],
    thirtyDayPlan: [
      'Prompt kitapçığı alıcılarından veri topla.',
      '5 agent paketini tamamla.',
      'Bundle test et.',
      'İlk 20 satışı hedefle.'
    ],
    validationResult: 'not_tested',
    marketingPlan: {
      channels: ['Instagram', 'web sitesi', 'DM'],
      launchAngle: 'Tasarımcılar için copy-paste değil, iş akışına oturan AI ekip arkadaşları.',
      contentPlan: ['1 agent demo videosu', 'Önce/sonra revize akışı', 'Agent paketinin içindekiler'],
      outreachPlan: ['Prompt kitapçığı alıcılarına erken erişim'],
      firstSalesMessage: 'Prompt kitapçığını alanlar için 5 agentlık tasarımcı paketi hazırlıyorum; erken erişim ister misin?',
      ctaOptions: ['Erken erişime katıl', 'Demo agentı gör', 'Bundle al'],
      pricingStrategy: 'İlk 20 satış $19; sonra $29-$49.'
    },
    revenueProjection: {
      unitPrice: 29,
      monthlySalesTarget: 50,
      monthlyRevenuePotential: 1450,
      operationCost: 'low',
      profitPotential: 'high',
      recurring: false
    },
    resultTracking: emptyResultTracking,
    notes: 'Bu fikir güçlü ama ilk ürünün gölgesinde kalmalı. Doğru sıra: prompt kitapçığı -> agent paketi -> eğitim/bundle.'
  }),
  createOpportunity({
    id: 'opp-mini-ai-creative-ops',
    title: 'Mini AI Creative Operations Eğitimi',
    category: 'workshop',
    status: 'idea_stage',
    actionTier: 'next_bet',
    order: 4,
    decision: 'AI görsel üretim mini eğitimiyle birleştirildi. Ürün satışından sonra canlı/recorded mini eğitim olarak test edilebilir.',
    description: 'Tasarımcıların AI ile brief alma, fikir üretme, görsel üretme, revize yönetme ve teslimat akışını hızlandıracağı 60-90 dakikalık mini eğitim.',
    targetAudience: 'Tasarımcılar, içerik üreticileri, sosyal medya ekipleri ve AI ile üretimi operasyon haline getirmek isteyen freelancerlar.',
    problem: 'AI araçları tek tek biliniyor ama uçtan uca kreatif iş akışı kurulmadığı için zaman kazancı sınırlı kalıyor.',
    solution: 'Brief -> fikir -> prompt -> görsel -> revize -> teslimat akışını canlı örneklerle anlatan mini eğitim.',
    revenueModel: 'Canlı workshop / kayıtlı mini eğitim / bundle upsell.',
    priceRange: '$29 - $79',
    salesChannels: ['Instagram', 'Zoom/Meet', 'Grafikcem web sitesi', 'Lemon Squeezy', 'Shopier'],
    whyItMakesSense: [
      'Prompt kitapçığı ve agent paketinin uygulamalı üst katmanı olur.',
      'Canlı eğitim alıcı itirazlarını doğrudan gösterir.',
      'Daha yüksek ticket ile hızlı nakit üretebilir.'
    ],
    risks: [
      'Hazırlık kapsamı büyürse ilk ürünleri yavaşlatabilir.',
      'Tekrar satılabilir kayıt formatı baştan düşünülmeli.'
    ],
    tags: ['mini-eğitim', 'ai-creative-ops', 'görsel-üretim', 'workshop'],
    score: {
      revenuePotential: 82,
      speedToLaunch: 70,
      audienceFit: 88,
      skillFit: 92,
      effortLevel: 55,
      scalability: 75,
      strategicFit: 88,
      riskLevel: 28,
      distributionPower: 78,
      recurringPotential: 20,
      paymentReadiness: 70,
      actionClarity: 78
    },
    priorityLabel: 'planlanmaya_al',
    stageNotes: 'Eğitim tek başına değil, ilk iki dijital üründen sonra bundle/upsell olarak açılmalı.',
    nextAction: '5 modüllük mini eğitim akışını tek sayfaya indir.',
    nextActionDueDate: '',
    primaryMetric: '20 kişilik erken kayıt listesi',
    firstRevenueTarget: 'İlk workshop: 20 kişi x $29 = $580',
    paymentPlan: 'Ön satış için ödeme linki + kayıt formu; canlı eğitim sonrası kayıt linki teslimatı.',
    launchBlocker: 'Müfredat ve örnek demo akışı net değil.',
    antiDistractionRule: 'Eğitim duyurusu, prompt kitapçığı satış sayfası canlı olmadan yapılmaz.',
    actionSteps: [
      '5 modülü belirle.',
      '1 gerçek brief üzerinden demo akışı seç.',
      'Erken kayıt formu metnini yaz.',
      'Prompt kitapçığı alıcılarına öncelik ver.'
    ],
    completionCriteria: [
      'Müfredat hazır',
      'Demo akışı hazır',
      'Ön satış sayfası hazır',
      'Canlı eğitim tarihi belli'
    ],
    sevenDayPlan: [
      'Müfredat.',
      'Demo brief.',
      'Ön kayıt sayfası.',
      '3 içerik postu.',
      'İlk erken kayıt mesajı.'
    ],
    thirtyDayPlan: [
      'Ön kayıt topla.',
      'Canlı eğitimi yap.',
      'Kaydı ürünleştir.',
      'Agent paketiyle bundle dene.'
    ],
    validationResult: 'not_tested',
    marketingPlan: {
      channels: ['Instagram', 'web sitesi', 'DM'],
      launchAngle: 'AI ile tek prompt değil, baştan sona kreatif operasyon kur.',
      contentPlan: ['Workflow ekranı', '1 brief dönüşümü', 'Eğitim içeriği postu'],
      outreachPlan: ['Prompt ve agent ürünleriyle ilgilenenlere erken kayıt'],
      firstSalesMessage: 'AI Creative Ops mini eğitimini açıyorum; 60-90 dakikada brief’ten teslimata sistem kuracağız.',
      ctaOptions: ['Erken kayıt ol', 'Müfredatı gör', 'Bundle iste'],
      pricingStrategy: 'İlk grup düşük fiyat; kayıt ürünleşince fiyatı yükselt.'
    },
    revenueProjection: {
      unitPrice: 49,
      monthlySalesTarget: 30,
      monthlyRevenuePotential: 1470,
      operationCost: 'medium',
      profitPotential: 'high',
      recurring: false
    },
    resultTracking: emptyResultTracking,
    notes: 'AI görsel üretim mini eğitimi bu fırsata dahil edildi; ayrı fikir olarak takip edilmeyecek.'
  }),
  createOpportunity({
    id: 'opp-agencyos-lite',
    title: 'AgencyOS Lite — Freelancer CRM Template',
    category: 'saas',
    status: 'idea_stage',
    actionTier: 'incubate',
    order: 5,
    decision: 'Güçlü fikir ama şimdi ana ürün değil. İlk dijital ürün alıcılarından freelancer operasyon problemi doğrulanırsa aç.',
    description: 'Freelancerlar için lead, teklif, proje, ödeme, revize ve haftalık aksiyon yönetimini tek yerde toplayan sade AgencyOS template.',
    targetAudience: 'Freelancer tasarımcılar, küçük ajans sahipleri, sosyal medya tasarımcıları ve tek başına müşteri yöneten kreatifler.',
    problem: 'Freelancerlar teklifleri, müşteri takibini ve ödemeleri dağınık yönettiği için para ve fırsat kaçırıyor.',
    solution: 'Notion/Sheets tabanlı sade CRM template + kullanım rehberi + örnek freelancer workflow.',
    revenueModel: 'Template satışı + özel kurulum upsell.',
    priceRange: '$29 - $99; özel kurulum $199+',
    salesChannels: ['Grafikcem web sitesi', 'Instagram', 'LinkedIn', 'freelancer toplulukları'],
    whyItMakesSense: [
      'AgencyOS deneyiminden doğan gerçek sistem bilgisi var.',
      'Grafikcem kitlesindeki freelancerlara bağlanabilir.',
      'AI Agent Paketi ve brief şablonlarıyla bundle yapılabilir.'
    ],
    risks: [
      'Web app kapsamına büyürse çok zaman yer.',
      'Freelancer kitlesi fiyat hassas olabilir.',
      'Destek yükü doğurabilir.'
    ],
    tags: ['agencyos-lite', 'freelancer-crm', 'template', 'incubate'],
    score: {
      revenuePotential: 86,
      speedToLaunch: 62,
      audienceFit: 82,
      skillFit: 94,
      effortLevel: 70,
      scalability: 88,
      strategicFit: 96,
      riskLevel: 38,
      distributionPower: 76,
      recurringPotential: 25,
      paymentReadiness: 65,
      actionClarity: 70
    },
    priorityLabel: 'uzun_vadeli',
    stageNotes: 'SaaS değil template olarak tutulmalı. Sadece validasyon gelirse ilerlet.',
    nextAction: 'Şimdilik 5 modüllük kapsam notu yaz; geliştirmeye başlama.',
    nextActionDueDate: '',
    primaryMetric: 'En az 10 kişi “freelancer CRM isterim” demeli',
    firstRevenueTarget: 'Beta 20 satış x $29 = $580',
    paymentPlan: 'Mevcut dijital ürün checkout altyapısı kullanılacak.',
    launchBlocker: 'Kapsam büyüme riski yüksek.',
    antiDistractionRule: 'İlk iki ürün satılmadan AgencyOS Lite geliştirme başlatma.',
    actionSteps: [
      '5 modülü yaz.',
      'Prompt kitapçığı alıcı anketine CRM sorusu ekle.',
      '10 kişilik demo talebi gelirse MVP başlat.'
    ],
    completionCriteria: [
      'Kapsam 5 modülde sabit',
      '10 validasyon sinyali var',
      'Template formatı seçildi'
    ],
    sevenDayPlan: [
      'Kapsam notu.',
      'Validasyon sorusu.',
      'Bekletme kararı.'
    ],
    thirtyDayPlan: [
      'İlk ürün alıcılarına sor.',
      '10 talep gelirse Notion/Sheets MVP.',
      'Talep yoksa parkta tut.'
    ],
    validationResult: 'not_tested',
    marketingPlan: {
      channels: ['Instagram', 'LinkedIn'],
      launchAngle: 'Freelancerların müşteri ve teklif kaybetmemesi için sade işletim sistemi.',
      contentPlan: ['Freelancer takip hataları', 'Teklif kaçırma örneği', 'CRM ekran mockup'],
      outreachPlan: ['Freelancer takipçilerine anket'],
      firstSalesMessage: 'Freelancer müşteri ve teklif takibini tek yerde toplayan hafif bir sistem hazırlıyorum; beta ister misin?',
      ctaOptions: ['Beta listesine katıl', 'Demo görmek istiyorum'],
      pricingStrategy: 'Beta $29, sonra $49-$99.'
    },
    revenueProjection: {
      unitPrice: 49,
      monthlySalesTarget: 30,
      monthlyRevenuePotential: 1470,
      operationCost: 'low',
      profitPotential: 'high',
      recurring: false
    },
    resultTracking: emptyResultTracking,
    notes: 'Kapsamlaştırıldı ama bilerek kuluçkaya alındı. Bu sayfanın amacı bu fikrin bugünü yemesini engellemek.'
  }),
  createOpportunity({
    id: 'opp-feed-the-goat',
    title: 'Feed the Goat Kişiye Özel Sistem',
    category: 'side_income',
    status: 'idea_stage',
    actionTier: 'incubate',
    order: 6,
    decision: 'Ürün fikri güçlü ama dağıtım kanalı henüz yok. Önce motivasyon hesabı ve kişisel hikaye kanıtı gerekir.',
    description: 'Kişisel hedef, disiplin, spor, kariyer ve üretkenlik alanları için kişiye özel kurulabilen sistem/plan paketi.',
    targetAudience: 'Disiplin kurmak isteyen genç profesyoneller, öğrenciler, içerik takipçileri ve kişisel gelişim kitlesi.',
    problem: 'İnsanlar hedef koyuyor ama günlük sisteme çeviremediği için devamlılık kuramıyor.',
    solution: 'Kişisel hedeflere göre Notion/Sheets/AI destekli haftalık plan, takip ekranı ve hesap verebilirlik sistemi.',
    revenueModel: 'Kişiye özel kurulum + ileride template veya mini abonelik.',
    priceRange: 'Beta $49 - $199; kişisel kurulum daha yüksek.',
    salesChannels: ['İleride motivasyon hesabı', 'Instagram', 'kişisel hikaye içerikleri', 'DM'],
    whyItMakesSense: [
      'Kişisel deneyimden doğarsa samimi ve farklılaşabilir.',
      'Hikaye hesabı büyürse ürün doğal olarak satılır.',
      'Template ve kişiye özel kurulum birlikte çalışabilir.'
    ],
    risks: [
      'Mevcut Grafikcem kitlesinden farklı bir kitle ister.',
      'Kişiselleştirme operasyonu zaman yiyebilir.',
      'Kanıt olmadan satış vaadi zayıf kalır.'
    ],
    tags: ['feed-the-goat', 'kişisel-sistem', 'motivasyon', 'incubate'],
    score: {
      revenuePotential: 78,
      speedToLaunch: 48,
      audienceFit: 55,
      skillFit: 88,
      effortLevel: 72,
      scalability: 58,
      strategicFit: 68,
      riskLevel: 50,
      distributionPower: 42,
      recurringPotential: 55,
      paymentReadiness: 40,
      actionClarity: 54
    },
    priorityLabel: 'uzun_vadeli',
    stageNotes: 'Motivasyon hesabı ve kişisel dönüşüm kanıtı olmadan satılmayacak.',
    nextAction: 'Şimdilik ürün geliştirme yok; sadece 30 günlük içerik/kanıt hipotezini not et.',
    nextActionDueDate: '',
    primaryMetric: 'Motivasyon hesabında 1.000 ilgili takipçi veya 50 waitlist',
    firstRevenueTarget: 'Beta 10 kişisel kurulum',
    paymentPlan: 'İleride kişisel hizmet ödemesi için Shopier/iyzico Link yeterli.',
    launchBlocker: 'Dağıtım kanalı ve sosyal kanıt yok.',
    antiDistractionRule: 'Grafikcem ürünleri satışa çıkmadan Feed the Goat ürünü geliştirilmez.',
    actionSteps: [
      '30 günlük içerik serisi fikrini yaz.',
      'Kişisel sistemin kendi üzerinde çalışan ekranlarını arşivle.',
      'İlk waitlist mesajını ilerisi için sakla.'
    ],
    completionCriteria: [
      'Motivasyon hesabı aktif',
      '50 waitlist var',
      '3 gerçek dönüşüm hikayesi var'
    ],
    sevenDayPlan: [
      'Sadece fikir notu.',
      'Ürün geliştirme yok.',
      'Kişisel sistem ekranlarını bir klasörde sakla.'
    ],
    thirtyDayPlan: [
      'Grafikcem ilk ürünlerinden sonra tekrar değerlendir.',
      'Motivasyon hesabı açılırsa waitlist test et.'
    ],
    validationResult: 'not_tested',
    marketingPlan: {
      channels: ['İleride ayrı motivasyon hesabı'],
      launchAngle: 'Hedef değil, günlük sistem kur.',
      contentPlan: ['Kişisel dönüşüm notları', 'Haftalık sistem ekranı', 'Disiplin hataları'],
      outreachPlan: ['Waitlist dışında satış yok'],
      firstSalesMessage: 'Kendi hedef sistemimi kişiye özel kurulum olarak beta açıyorum; ilgilenir misin?',
      ctaOptions: ['Waitlist', 'Beta başvuru'],
      pricingStrategy: 'Önce hizmet beta, sonra template.'
    },
    revenueProjection: {
      unitPrice: 99,
      monthlySalesTarget: 10,
      monthlyRevenuePotential: 990,
      operationCost: 'medium',
      profitPotential: 'medium',
      recurring: false
    },
    resultTracking: emptyResultTracking,
    notes: 'Güçlendirildi ama bugünün işi değil. Dağıtım kanalı kurulmadan bu fikir aksiyon listesine girmemeli.'
  }),
  createOpportunity({
    id: 'opp-ai-vault',
    title: 'Grafikcem AI Vault Membership',
    category: 'subscription',
    status: 'idea_stage',
    actionTier: 'park',
    order: 7,
    decision: 'Üyelik fikri kaldırılmadı, kapısı kilitlendi. Ancak 3 ürün ve tekrar eden talep kanıtından sonra açılabilir.',
    description: 'Aylık promptlar, agent sistemleri, mini eğitimler ve kreatif workflow kaynaklarının toplandığı ileriki seviye üyelik alanı.',
    targetAudience: 'Grafikcem ürünlerini zaten satın almış ve düzenli kaynak isteyen tasarımcılar/freelancerlar.',
    problem: 'Tek seferlik ürünler fayda sağladıktan sonra kullanıcılar düzenli güncelleme ve yeni sistemler isteyebilir.',
    solution: 'Sadece kanıt geldiğinde açılacak küçük beta üyelik: aylık 1 prompt pack, 1 agent, 1 mini workflow.',
    revenueModel: 'Aylık/yıllık üyelik.',
    priceRange: '$9 - $19 beta; daha sonra paketli fiyat.',
    salesChannels: ['E-posta listesi', 'Grafikcem web sitesi', 'Instagram', 'satın alanlar listesi'],
    whyItMakesSense: [
      'Tek seferlik ürünlerden sonra tekrar eden gelir katmanı olabilir.',
      'Mevcut ürünleri bir vault içinde birleştirir.',
      'Doğru zamanda açılırsa marka varlığı güçlenir.'
    ],
    risks: [
      'Erken açılırsa içerik üretim borcu yaratır.',
      'Yeterli alıcı tabanı olmadan üyelik sürdürülemez.',
      'Community yönetimi zaman yiyebilir.'
    ],
    tags: ['membership', 'ai-vault', 'park', 'recurring'],
    score: {
      revenuePotential: 90,
      speedToLaunch: 35,
      audienceFit: 84,
      skillFit: 88,
      effortLevel: 85,
      scalability: 92,
      strategicFit: 90,
      riskLevel: 58,
      distributionPower: 50,
      recurringPotential: 100,
      paymentReadiness: 35,
      actionClarity: 35
    },
    priorityLabel: 'beklet',
    stageNotes: 'Şimdilik park. Sadece kanıt kapıları açılırsa geri gelir.',
    nextAction: 'Hiçbir aksiyon yok; sadece kanıt kapılarını takip et.',
    nextActionDueDate: '',
    primaryMetric: '3 ürün satıldı + 100 alıcı + 50 üyelik waitlist',
    firstRevenueTarget: 'Beta 50 üye x $9 = $450/ay',
    paymentPlan: 'Üyelik için Lemon Squeezy/Paddle benzeri abonelik altyapısı veya yerel abonelik çözümü ayrıca değerlendirilecek.',
    launchBlocker: 'Alıcı tabanı ve düzenli içerik ritmi yok.',
    antiDistractionRule: '100 tekil alıcı olmadan üyelik sayfası açma.',
    actionSteps: [
      'Aksiyon yok.',
      'Sadece prompt kitapçığı, agent paketi ve eğitim alıcı verilerini izle.',
      'Waitlist 50 kişiye ulaşırsa tekrar puanla.'
    ],
    completionCriteria: [
      '100 alıcı',
      '50 waitlist',
      '3 ay içerik takvimi',
      'Abonelik ödeme altyapısı'
    ],
    sevenDayPlan: [
      'Parkta tut.'
    ],
    thirtyDayPlan: [
      'İlk ürün satışları sonrası yeniden değerlendir.'
    ],
    validationResult: 'not_tested',
    marketingPlan: {
      channels: ['E-posta listesi', 'satın alanlar'],
      launchAngle: 'Grafikcem ürünlerinin aylık güncellenen kaynak kasası.',
      contentPlan: ['Şimdilik yok'],
      outreachPlan: ['Şimdilik yok'],
      firstSalesMessage: 'Grafikcem AI Vault beta listesi açıldı; aylık agent, prompt ve workflow kaynakları gelecek.',
      ctaOptions: ['Waitlist'],
      pricingStrategy: 'Sadece kanıt sonrası $9 beta.'
    },
    revenueProjection: {
      unitPrice: 9,
      monthlySalesTarget: 50,
      monthlyRevenuePotential: 450,
      operationCost: 'medium',
      profitPotential: 'medium',
      recurring: true
    },
    resultTracking: emptyResultTracking,
    notes: 'Güçlendirilmiş hali bu: üyelik bir fikir değil, ürün portföyü kanıtlandıktan sonra açılacak gelir katmanı.'
  })
].sort((a, b) => a.order - b.order);
