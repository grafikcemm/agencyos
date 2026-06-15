/**
 * Secure offline knowledge layer for Ali Cem Bozma (Grafikcem)
 * Consolidates desktop markdown files into a single compile-safe and secure TS context.
 * Real pricing details are omitted and should remain in AgencyOS.
 */

export interface UserProfile {
  name: string;
  brandName: string;
  location: string;
  instagram: string;
  experienceYears: number;
  adhdTraits: string[];
  focusAreas: string[];
}

export interface BusinessModel {
  revenueTarget: string;
  retainerTarget: string;
  services: string[];
  pricingRules: string[];
  clientAcquisitionChannels: string[];
  strictSafetyRules: string[];
}

export interface ContentStrategy {
  brandVoice: string;
  instagramGoals: string[];
  carouselRules: string[];
  reelsRules: string[];
  visualPromptGuide: {
    language: string;
    requiredParameters: string[];
    models: string[];
    productRules: string[];
    characterRules: string[];
    exampleTemplate: string;
  };
}

export interface CareerGoals {
  shortTerm: string[];
  learningSubjects: string[];
  learningMethodology: string[];
}

export interface AcademicGoals {
  beykent: string;
  anadoluAof: string;
  objective: string;
  adhdRules: string[];
  promptRules: string[];
}

export interface SystemsContext {
  feedTheGoat: string;
  newsAi: string;
  agencyOs: string;
  integrationGoal: string;
}

export interface AssistantKnowledge {
  userProfile: UserProfile;
  businessModel: BusinessModel;
  contentStrategy: ContentStrategy;
  careerGoals: CareerGoals;
  academicGoals: AcademicGoals;
  systemsContext: SystemsContext;
}

export const ASSISTANT_KNOWLEDGE: AssistantKnowledge = {
  userProfile: {
    name: "Ali Cem Bozma",
    brandName: "Grafikcem",
    location: "İstanbul, Türkiye",
    instagram: "@grafikcem",
    experienceYears: 6,
    adhdTraits: [
      "Kalabalık dashboard'lardan ve uzun görev listelerinden bunalır.",
      "Aynı anda çok fazla şey yapmak isteyip başlayamama / erteleme eğilimi vardır.",
      "Karar yorgunluğu yüksektir; sade, az görevli ve net planlar işe yarar.",
      "Suçluluk hissi uyandırmayan, 'minimum gün de sayılır' felsefesine sahip mentor abi desteği ister."
    ],
    focusAreas: [
      "Grafik Tasarım",
      "Sosyal Medya Tasarımı",
      "Kreatif Üretim",
      "AI Destekli Görsel/Video Üretimi",
      "Junior Art Director odağında gelişim"
    ]
  },
  businessModel: {
    revenueTarget: "Aylık kişisel gelir hedefi 120.000 TL",
    retainerTarget: "3-4 adet aylık sabit (retainer) sözleşmeli müşteri",
    services: [
      "Sosyal medya post / story / carousel tasarımı",
      "Kurumsal kimlik ve logo tasarımı",
      "Reklam kreatifleri",
      "AI destekli görsel ve video prompt üretimi",
      "Web ve landing page görsel tasarımı",
      "Behance case study ve marka sunumu hazırlama"
    ],
    pricingRules: [
      "Türkiye şartlarına uygun TL bazlı fiyatlandırma.",
      "Paket bazlı teklif önceliği (hizmet kapsamı, revize hakkı, teslim süresi, kullanım hakkı net belirtilir).",
      "Hassas fiyat rakamları bu dosyaya yazılmaz, AgencyOS üzerinden yönetilir.",
      "Hacim indirimleri sadece retainer ve uzun vadeli sözleşmelerde geçerlidir."
    ],
    clientAcquisitionChannels: [
      "Instagram (@grafikcem)",
      "LinkedIn",
      "Cold Email",
      "Google Business",
      "AgencyOS lead araştırması",
      "Referanslar & Behance Portfolyosu"
    ],
    strictSafetyRules: [
      "Müşteri teklifleri, e-postalar, DM'ler veya harici gönderimler otomatik YAPILAMAZ.",
      "BusinessGrowthAgent sadece taslak ve öneri üretir; her aksiyonda kullanıcı onayı şarttır.",
      "Sağlık / supplement tavsiyelerinde tıbbi teşhis konulamaz; doktor olmadığı kısa ve net belirtilir."
    ]
  },
  contentStrategy: {
    brandVoice: "Uzman ama erişilebilir, pratik, uygulanabilir bilgi veren, AI teknolojisini kullanan modern kreatif.",
    instagramGoals: [
      "Kaliteli takipçi kazanmak (Türkiye ve global tasarım kitlesi).",
      "Düşük kaliteli / Hindistan kökenli takipçi oranını azaltmak.",
      "Story view, DM, yorum ve kaydetme oranlarını artırmak.",
      "Reels üretimini haftada 2-3 adede çıkarmak.",
      "Her içerikten lead / müşteri kazanım fırsatı üretmek."
    ],
    carouselRules: [
      "1. slayt: Güçlü hook (soru veya çarpıcı bilgi).",
      "Orta slaytlar: Somut ve hemen uygulanabilir değer.",
      "Son slayt: Net CTA (kaydet, paylaş, DM at veya biyografi linki)."
    ],
    reelsRules: [
      "İlk 2 saniye: Dikkat çekici görsel/başlık başlangıcı.",
      "Hook: Soru veya 'sana bir şey göstereyim' formatı.",
      "Süre: 15-60 saniye arası ideal.",
      "Son 3 saniyede net CTA ve altyazı desteği."
    ],
    visualPromptGuide: {
      language: "AI görsel/video prompt çıktıları her zaman İNGİLİZCE yazılır.",
      requiredParameters: [
        "Camera angle (eye level, low angle, cinematic vb.)",
        "Lighting (natural, studio, golden hour vb.)",
        "Composition (centered, rule of thirds, minimal vb.)",
        "Atmosphere (clean, minimal, photorealistic vb.)",
        "Aspect ratio (9:16 story, 3:4 post, 4:5 carousel, 16:9 banner/reels)"
      ],
      models: [
        "Midjourney (örn: --ar 4:5 --v 6.1 --style raw)",
        "Flux (uzun ve detaylı prompt)",
        "Nano Banana Pro (ürün görselleri için)",
        "Veo / Sora / Kling (kamera hareketi ve süre belirtilen video promptları)"
      ],
      productRules: [
        "Ürün formu, rengi ve ambalajı bire bir korunmalı.",
        "Logo istenmiyorsa: 'no logo, no text on product'.",
        "Metinsiz görsel için: 'no text, no writing, no typography'."
      ],
      characterRules: [
        "Gerçekçi cilt dokusu: 'photorealistic, natural skin texture, authentic, non-stock'.",
        "Yapay stok gülüşlerinden kaçınma: 'no artificial smile, no generic pose'."
      ],
      exampleTemplate: "[Subject] on a [surface], [environment], [lighting], [camera shot], [atmosphere], product photography, 4:5 aspect ratio, ultra detailed, photorealistic, no text, no logo"
    }
  },
  careerGoals: {
    shortTerm: [
      "Erteleme problemini azaltıp günlük üretim disiplini kurmak.",
      "İngilizce seviyesini geliştirmek.",
      "UI/UX, motion design, otomasyon (n8n), AI agent ve yazılımda ilerlemek.",
      "Behance ve portfolyoyu sürekli güncel tutmak."
    ],
    learningSubjects: [
      "React, Next.js, UI/UX",
      "Motion Design, Video Editing",
      "n8n ve AI Otomasyonları",
      "İngilizce (katmanlı ritim)"
    ],
    learningMethodology: [
      "Aynı anda birden fazla konuya dalıp bunalmamak için basamaklı ilerleme (Gelişim Merdiveni).",
      "Sadece video izlemeyi değil, küçük uygulamalar yapmayı ilerleme saymak.",
      "Büyük listeler yerine günlük tek bir mikro öğrenme aksiyonu önermek."
    ]
  },
  academicGoals: {
    beykent: "Görsel İletişim Tasarımı",
    anadoluAof: "Halkla İlişkiler ve Reklamcılık",
    objective: "Mezuniyet riskini azaltmak, final/bütünleme sınavlarını kaçırmamak",
    adhdRules: [
      "Cem'e asla uzun ders listeleri verme.",
      "Aynı anda sadece tek bir sınava veya tek bir odak bloğuna odaklanmasını öner."
    ],
    promptRules: [
      "Akademik planları genel 'ders çalış' şeklinde değil, 'hangi ders + kaç dakika + ne çıktı' şeklinde mikro düzeyde öner."
    ]
  },
  systemsContext: {
    feedTheGoat: "Günlük disiplin, irade kası, supplement ve rutin takibi.",
    newsAi: "AI/tasarım haberlerini takip etme ve haberlerden içerik fikirleri (carousel/reels) üretme.",
    agencyOs: "Müşteri, lead, CRM, teklif ve bütçe/gelir takibi.",
    integrationGoal: "Manuel başlayıp, sistemleri netleştirip sonrasında API/n8n otomasyonlarına geçiş yapmak."
  }
};
