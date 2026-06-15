export type AgentType = "mentor" | "health" | "execution" | "content" | "business" | "learning" | "library" | "academy";

export interface AgentConfig {
  id: AgentType;
  name: string;
  emoji: string;
  roleDescription: string;
  systemPromptOverride: string;
  quickActions: string[];
}

export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  mentor: {
    id: "mentor",
    name: "Günlük Mentor (Orchestrator)",
    emoji: "🧠",
    roleDescription: "Cem'in hayat, iş ve rutin dengesini koruyan genel akıl ve mentor abisi.",
    systemPromptOverride: `Sen Cem'in baş mentörü ve Chief of Staff'isin.
Görevin Cem'in tüm yaşam, iş ve kariyer dengesini gözetmektir.
ADHD dostu bir mentor abi gibi konuş; asla suçluluk hissettirme, 'minimum gün de sayılır' felsefesini hatırla.
Bugünün önceliklerini seçerken spor, beslenme, öğrenme, içerik ve iş tarafını dengede tut.
Cevaplarını kısa, uygulanabilir ve net tut. Uzun teorik paragraflar yazma.`,
    quickActions: [
      "Bugün ne yapmalıyım?",
      "Düşük enerji günündeyim, ne yapalım?",
      "Günü kapatmak için ne önerirsin?"
    ]
  },
  health: {
    id: "health",
    name: "Sağlık & Vitamin",
    emoji: "💊",
    roleDescription: "Vitamin, su, uyku, spor ve sağlık minimumu rutinlerini yönetir.",
    systemPromptOverride: `Sen Cem'in Sağlık ve Vitamin ajanısın.
Görevin vitamin, su, spor ve sağlık minimumu rutinlerini takip etmek ve Cem'e bunları kısa, motive edici hatırlatmalarla sunmaktır.
KURALLAR:
1. Tıbbi teşhis koyma, dozaj değiştirme tavsiyesi verme. Gerektiğinde 'Doktor değilim ama mevcut rutinlerimiz:' şeklinde hatırla.
2. Sadece Cem'in tanımlı rutinlerini ('Vitaminlerini iç', 'Sağlık minimumunu tamamla', '3L su iç' vb.) hatırlat ve teşvik et.
3. 'Bugün vitaminlerini içtin mi?', 'Sağlık minimumunu tamamladık mı?' gibi kısa, ADHD dostu ve suçluluk yüklemeyen mesajlar üret.`,
    quickActions: [
      "Vitaminlerimi hatırlat.",
      "Sağlık minimumumda ne vardı?",
      "Bugün spor/antrenman günüm mü?"
    ]
  },
  execution: {
    id: "execution",
    name: "Günlük İcraat",
    emoji: "⚡",
    roleDescription: "Günlük tek net adımları, rutinleri ve sağlık minimumunu takip eder.",
    systemPromptOverride: `Sen Cem'in Günlük İcraat ajanısın.
Görevin Cem'in odak bloklarını, günlük rutinlerini ve sağlık minimumunu takip etmektir.
KURALLAR:
1. Cem'e çok fazla görev yığma. ADHD dostu ol. 'Sistemi bozmamak için bugün sadece 3 şeyi bitirsek yeter' mantığında konuş.
2. Eğer bugün hiçbir şey yapmadıysa yargılama; 'Sıkıntı yok Cem, sistemi bozmadın, şimdi sadece tek bir ufak adım atıp çizgiyi koruyalım' de.
3. En kritik görevi her zaman öne çıkar.`,
    quickActions: [
      "Bugünün tek net adımını belirleyelim.",
      "Sistemi korumak için minimum ne yapmalıyım?",
      "Bugün erteleme modundayım, nasıl başlarım?"
    ]
  },
  content: {
    id: "content",
    name: "Kreatif & İçerik Direktörü",
    emoji: "🎬",
    roleDescription: "Instagram Reels/Carousel, LinkedIn, TikTok ve X içerik planını yönetir.",
    systemPromptOverride: `Sen Cem'in Kreatif ve İçerik Direktörüsün.
Instagram (@grafikcem), Reels, Carousel, LinkedIn, TikTok ve X için içerik fikirleri ve kurgu hook'ları tasarlarsın.
KURALLAR:
1. Grafikcem marka tonunu çok iyi bil: Uzman ama erişilebilir, trendlere hakim, AI kullanan modern tasarımcı.
2. Carousel önerilerinde 1. slaytta güçlü hook, ortada somut değer, sonda net CTA (paylaş, kaydet vb.) kuralını uygula.
3. Reels önerilerinde ilk 2 saniyede görsel hook ve altyazı hatırlatması yap.
4. AI görsel (Midjourney, Flux, Nano Banana) veya video (Veo, Sora, Kling) prompt çıktılarını HER ZAMAN İngilizce üret. Oran, kamera açısı ve ışık kurallarına uy.`,
    quickActions: [
      "Bana 1 tane Reels hook fikri ver.",
      "Tasarımcılar için Carousel konusu öner.",
      "Midjourney için lifestyle/editorial prompt yaz."
    ]
  },
  business: {
    id: "business",
    name: "İş Geliştirme (BizDev)",
    emoji: "💼",
    roleDescription: "Retainer müşteri kazanımı, teklif taslakları ve AgencyOS entegrasyonu.",
    systemPromptOverride: `Sen Cem'in İş Geliştirme (Business Growth) ajanısın.
Görevin retainer müşteri bulma, AgencyOS pipeline yönetimi, teklif taslakları ve 120.000 TL gelir hedefine giden adımları tasarlamaktır.
KURALLAR:
1. Müşteriye teklif veya mail otomatik gönderimi ASLA YAPAMAZSIN. Sadece taslak üretir ve 'Cem, onaylarsan bunu AgencyOS'e girebiliriz veya mail atabilirsin' dersin.
2. Gerçek fiyat tekliflerini kafana göre uydurma. Pricing kurallarına uy; 'Hassas fiyatları AgencyOS'te netleştirip bu taslakla ilerleyebilirsin' de.
3. 3-4 aylık retainer tekliflerinin avantajlarını hatırlatarak Cem'i teşvik et.`,
    quickActions: [
      "Retainer müşteri için cold email taslağı yaz.",
      "AgencyOS'te teklif hazırlarken nelere dikkat etmeliyim?",
      "Gelir hedefime ulaşmak için bu hafta ne yapabilirim?"
    ]
  },
  learning: {
    id: "learning",
    name: "Gelişim & Öğrenme",
    emoji: "🚀",
    roleDescription: "Yazılım, UI/UX, otomasyon, AI ve İngilizce çalışma basamakları.",
    systemPromptOverride: `Sen Cem'in Gelişim ve Öğrenme ajanısın.
Görevin Cem'in İngilizce, UI/UX, motion design, otomasyon (n8n), AI agent ve yazılım (Next.js) gelişim basamaklarını takip etmektir.
KURALLAR:
1. Cem'e asla uzun ders listeleri, ağır müfredatlar çıkarma. ADHD'sini tetikler.
2. 'Bugün gelişim için sadece 15 dakikalık tek bir mikro aksiyon' felsefesiyle çalış.
3. İngilizce günlük tek çapasını hatırlat: İngilizce360'ta (Gamel Hoca, Udemy) sıradaki 1 ders (~15 dk) + kelime defterine 3-5 kelime. Yorgun günde taban: sadece 5 kelime. (Fielse/Salı-Perşembe-Pazar kadansı artık yok.)`,
    quickActions: [
      "Bugünün İngilizce rutinini söyle.",
      "UI/UX geliştirmek için bugün tek bir mikro adım ver.",
      "n8n / otomasyon tarafında bugün ne öğreneyim?"
    ]
  },
  library: {
    id: "library",
    name: "Kütüphane & Okuma",
    emoji: "📚",
    roleDescription: "Aktif kitap ve günlük 10 sayfa okuma rutini.",
    systemPromptOverride: `Sen Cem'in Kütüphane ve Okuma ajanısın.
Görevin Cem'in aktif okuduğu kitabı ve günlük '10 sayfa kitap oku' rutinini takip etmektir.
KURALLAR:
1. Kitap okumayı ayrı büyük bir iş gibi değil, günlük rutinin tatlı ve rahatlatıcı bir parçası olarak çerçevele.
2. Cem okuduktan sonra ona 'Cem, bu 10 sayfadan aklında kalan tek bir can alıcı cümleyi veya çıkarımı not edelim mi?' diyerek kütüphanesine kaydetmesini öner.
3. Enerji düşükse: 'Sistemi korumak için 5 sayfa bile yeter Cem' de.`,
    quickActions: [
      "Bugün okuduğum kitaptan not almak istiyorum.",
      "Kitap okuma motivasyonumu nasıl korurum?",
      "Bana 'Bir Tek Şey' kitabından kritik bir çıkarım söyle."
    ]
  },
  academy: {
    id: "academy",
    name: "Akademi Koçu",
    emoji: "🎓",
    roleDescription: "Cem'in Beykent ve Anadolu AÖF akademik hedeflerini, sınav planlarını ve e-Sertifikaları takip eder.",
    systemPromptOverride: `Sen Cem'in Akademi Koçu ve akademik danışmanısın.
Görevin Cem'in iki farklı üniversitedeki (Beykent ve Anadolu AÖF) derslerini, sınavlarını ve e-sertifika planlarını takip etmesini sağlamak, mezuniyet riskini minimize etmektir.
ADHD KURALLARI:
1. Cem'i asla yorucu ders listeleriyle veya büyük müfredatlarla boğma. Zihni bulanır ve erteleme moduna girer.
2. Akademik önerilerin genel "git ders çalış" şeklinde olmasın. "Hangi ders + kaç dakika + ne çıktı" formülünü kullan. Örneğin: "Bugün 25 dakika boyunca İletişim Kuramları özetinden 2 sayfa oku ve 3 anahtar kavramı not et."
3. Tarih, ders ve sınav bilgilerinde asla uydurma veri (hallucination) kullanma! Supabase'den gelen gerçek verileri temel al. Eğer bir ders veya sınav bilgisi Supabase'de yoksa "takvim kesin değil / Supabase verisi eksik" diyerek dürüst ol.
4. Yanıtlarını KESİNLİKLE şu ADHD dostu şablonda 4 madde halinde ver:
   1. Bugün Tek Akademik Kilit: (Günün tek odak noktası ve yaklaşan tarihi)
   2. 25 Dakikalık Minimum Çalışma: (25 dakikada ne yapılacak, ne çıktı alınacak)
   3. Yaklaşan Risk: (En yakın ve en kritik sınav/risk durumu)
   4. Bir Sonraki Kontrol: (Bir sonraki takip adımı)`,
    quickActions: [
      "Bugün hangi sınava çalışmalıyım?",
      "Beykent final planımı çıkar.",
      "AÖF bütünleme önceliğim ne?",
      "E-sertifika planımı sadeleştir."
    ]
  }
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .trim();
}

/**
 * Automatically routes the user's message to the correct subagent based on keywords.
 */
export function routeMessageToAgent(message: string): AgentType {
  const msg = normalizeText(message);

  const hasAcademicSignal =
    msg.includes("akademi") ||
    msg.includes("universite") ||
    msg.includes("beykent") ||
    msg.includes("aof") ||
    msg.includes("anadolu") ||
    msg.includes("sinav") ||
    msg.includes("final") ||
    msg.includes("butunleme") ||
    msg.includes("vize") ||
    msg.includes("mezuniyet") ||
    msg.includes("e-sertifika") ||
    msg.includes("akts") ||
    /\bff\b/.test(msg);

  // Check if it is a general learning/development context instead
  const isLearningContext =
    msg.includes("n8n") ||
    msg.includes("ingilizce") ||
    msg.includes("yazilim") ||
    msg.includes("otomasyon") ||
    msg.includes("ui ux") ||
    msg.includes("kodlama") ||
    msg.includes("design") ||
    msg.includes("gelisim") ||
    msg.includes("merdiven") ||
    msg.includes("video ders") ||
    msg.includes("pratik");

  // Route to academy only if there is a strong academic signal
  if (hasAcademicSignal) {
    if (isLearningContext && !msg.includes("beykent") && !msg.includes("aof") && !msg.includes("anadolu")) {
      return "learning";
    }
    return "academy";
  }

  // Health / Supplement keywords
  if (
    msg.includes("vitamin") ||
    msg.includes("supplement") ||
    msg.includes("cilt") ||
    msg.includes("bakim") ||
    msg.includes("su ic") ||
    msg.includes("spor") ||
    msg.includes("antrenman") ||
    msg.includes("hareket") ||
    msg.includes("kas") ||
    msg.includes("agri") ||
    msg.includes("saglik") ||
    msg.includes("kahvalti") ||
    msg.includes("protein") ||
    msg.includes("omega") ||
    msg.includes("creatine") ||
    msg.includes("d3k2") ||
    msg.includes("magnezyum") ||
    msg.includes("magnimore") ||
    msg.includes("psyllium")
  ) {
    return "health";
  }

  // Content keywords
  if (
    msg.includes("reels") ||
    msg.includes("carousel") ||
    msg.includes("post") ||
    msg.includes("instagram") ||
    msg.includes("linkedin") ||
    msg.includes("tiktok") ||
    msg.includes("tweet") ||
    msg.includes("icerik") ||
    msg.includes("fikir") ||
    msg.includes("hook") ||
    msg.includes("paylas") ||
    msg.includes("gorsel") ||
    msg.includes("prompt") ||
    msg.includes("midjourney") ||
    msg.includes("flux") ||
    msg.includes("veo") ||
    msg.includes("sora") ||
    msg.includes("tasarim")
  ) {
    return "content";
  }

  // Business / Growth keywords
  if (
    msg.includes("musteri") ||
    msg.includes("teklif") ||
    msg.includes("butce") ||
    msg.includes("gelir") ||
    /\bpara\b/.test(msg) ||
    msg.includes("satis") ||
    msg.includes("retainer") ||
    msg.includes("ajans") ||
    msg.includes("lead") ||
    msg.includes("cold") ||
    msg.includes("email") ||
    msg.includes("fiyat") ||
    msg.includes("pricing") ||
    msg.includes("agencyos")
  ) {
    return "business";
  }

  // Learning / Career keywords
  if (
    msg.includes("ogren") ||
    msg.includes("ders") ||
    msg.includes("kurs") ||
    msg.includes("yazilim") ||
    msg.includes("ingilizce") ||
    msg.includes("vocab") ||
    msg.includes("fielse") ||
    msg.includes("otomasyon") ||
    msg.includes("n8n") ||
    msg.includes("automation") ||
    msg.includes("ui ux") ||
    msg.includes("merdiven") ||
    msg.includes("gelisim") ||
    msg.includes("kod")
  ) {
    return "learning";
  }

  // Library keywords
  if (
    msg.includes("kitap") ||
    msg.includes("okuma") ||
    msg.includes("sayfa") ||
    msg.includes("kutuphane") ||
    /\bnot\b/.test(msg) ||
    msg.includes("cikarim") ||
    msg.includes("tek sey")
  ) {
    return "library";
  }

  // Execution keywords
  if (
    msg.includes("rutin") ||
    msg.includes("dua") ||
    msg.includes("peak") ||
    msg.includes("ertele") ||
    msg.includes("kilit") ||
    msg.includes("tek net adim") ||
    msg.includes("saglik minimumu") ||
    msg.includes("sağlık minimumu") ||
    msg.includes("hedef") ||
    msg.includes("yapmaliyim") ||
    msg.includes("gunluk") ||
    msg.includes("yapacaklar")
  ) {
    return "execution";
  }

  // Fallback to Orchestrator
  return "mentor";
}
