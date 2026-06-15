export type CareerSkillType = "technical" | "personal"

export type CareerSkillStatus =
  | "not_started"
  | "active"
  | "in_progress"
  | "known"
  | "needs_practice"
  | "completed"
  | "archived"

export type CareerSkillPriority = "now" | "next" | "later" | "archive"

export interface CareerSkillResource {
  courseSearchTerms?: string[]
  youtubeSearchTerms?: string[]
  docs?: string[]
  savedCoursesNote?: string
}

export interface CareerSkill {
  id: string
  title: string
  technicalName?: string
  type: CareerSkillType
  shortDescription: string
  whyLearn: string
  relevanceToCem: string
  howToLearn: string[]
  resources: CareerSkillResource
  practiceProjects: string[]
  completionProof: string[]
  ifAlreadyKnown: string[]
  defaultStatus: CareerSkillStatus
  priority: CareerSkillPriority
}

export interface CareerLevel {
  id: string
  levelNumber: number
  title: string
  subtitle: string
  description: string
  skills: CareerSkill[]
}

export const CAREER_ROADMAP: CareerLevel[] = [
  {
    id: "level-1",
    levelNumber: 1,
    title: "Öğrenmeye Başlangıç",
    subtitle: "Temel üretim araçları ve yaratıcı sistemi",
    description:
      "Temel üretim araçlarını, yaratıcı sistemi ve kişisel öğrenme disiplinini kurduğun başlangıç seviyesi.",
    skills: [
      {
        id: "after-effects-motion",
        title: "Adobe After Effects Motion",
        technicalName: "Adobe After Effects",
        type: "technical",
        shortDescription:
          "Motion design, reklam, reels ve kreatif üretim için hareketli görsel üretme becerisi.",
        whyLearn:
          "Motion design, modern içerik üretiminin merkezinde. Reels'lerin büyük çoğunluğu hareket içeriyor; hareketsiz üretim artık rekabetçi değil.",
        relevanceToCem:
          "Ajans ve içerik işleri için doğrudan gelir üretecek beceri. After Effects bilen az sayıda operatör var.",
        howToLearn: [
          "Hasancan Keleş eğitimini modül modül bitir.",
          "Her modülden sonra 1 kısa pratik çalışma çıkar.",
          "Pratikleri kendi reels veya içerik planına entegre et.",
          "En az 3 tamamlanmış motion çalışması portfolyoya ekle.",
        ],
        resources: {
          courseSearchTerms: ["Hasancan Keleş After Effects", "Adobe After Effects motion design Türkçe"],
          youtubeSearchTerms: ["After Effects motion design beginner", "After Effects reels tutorial"],
          savedCoursesNote: "Hasancan Keleş eğitimi kayıtlı.",
        },
        practiceProjects: [
          "15 saniyelik sosyal medya reklamı için motion intro yap.",
          "CapCut'taki bir reels'i After Effects ile yeniden üret.",
        ],
        completionProof: [
          "Eğitim tamamlandı.",
          "3 pratik motion çalışma üretildi.",
          "1 reel veya motion örneği portfolyoya eklendi.",
        ],
        ifAlreadyKnown: [
          "Kurs izleme. Kendi reels için 5 template yap ve portfolyona ekle.",
          "Müşteri işi olarak kullan ve kanıtla.",
        ],
        defaultStatus: "not_started",
        priority: "now",
      },
      {
        id: "premiere-pro",
        title: "Adobe Premiere Pro",
        technicalName: "Adobe Premiere Pro",
        type: "technical",
        shortDescription:
          "Video kurgu, reels, içerik ve müşteri işleri için temel kurgu becerisi.",
        whyLearn:
          "Profesyonel video üretiminin standart aracı. Müşteri işlerinde teslim kalitesi Premiere gerektirir.",
        relevanceToCem:
          "Ajans ve içerik işlerinde kurgu hızını artırır, müşteri teslim kalitesini yükseltir.",
        howToLearn: [
          "Hasancan Keleş eğitimini bitir.",
          "Kesme, ritim, ses sync, renk düzeltme ve export süreçlerini öğren.",
          "5 kısa video editleyerek pratik yap.",
        ],
        resources: {
          courseSearchTerms: ["Hasancan Keleş Premiere Pro", "Premiere Pro video editing Türkçe"],
          youtubeSearchTerms: ["Premiere Pro tutorial beginners", "Premiere Pro reels editing"],
          savedCoursesNote: "Hasancan Keleş eğitimi kayıtlı.",
        },
        practiceProjects: [
          "5 kısa video editleyip farklı platformlar için export et.",
          "Renk grading ve ses miksajı uygulanmış 1 video üret.",
        ],
        completionProof: [
          "Eğitim tamamlandı.",
          "5 kısa video editlendi ve export edildi.",
        ],
        ifAlreadyKnown: [
          "Renk grading ve ses miksajını bir müşteri işine uygula, kanıt olarak paylaş.",
        ],
        defaultStatus: "not_started",
        priority: "now",
      },
      {
        id: "ai-visual-direction",
        title: "AI Görsel/Video Yönetmenliği",
        technicalName: "Midjourney / Flux / Runway / Kling Pipeline",
        type: "technical",
        shortDescription:
          "Midjourney/Flux ile görsel, Runway/Kling ile video üreten prompt→prodüksiyon hattını yöneten AI yönetmenlik becerisi.",
        whyLearn:
          "2026'da kreatif piyasada fark, aracı bilmekten değil, AI'a ne ürettireceğini bilmekten geliyor. Prompt yazan çok; yönetmen gibi düşünüp tutarlı kampanya çıkaran az. Aranan adam bu ikincisi.",
        relevanceToCem:
          "Zaten yapıyorsun: müşteri işlerinde ve kendi içeriğinde AI görsel/video üretiyorsun. Burada amaç öğrenmek değil, bu işi sistematik bir pipeline'a oturtup 'AI prodüksiyon yönetmeni' diye fatura kesmek.",
        howToLearn: [
          "Tek bir kampanya için fikir → moodboard → Midjourney/Flux görsel → Runway/Kling video zincirini baştan sona kur.",
          "Tutarlılık için prompt + referans + seed/stil disiplinini netleştir (kampanya boyu aynı dil).",
          "Görselden videoya (image-to-video) ve kamera hareketi prompt'larını ayrı ayrı çalış.",
          "Çıktıyı Premiere/After Effects'te toparlayıp yayına hazır teslim et.",
        ],
        resources: {
          courseSearchTerms: ["Midjourney advanced workflow", "Runway Gen-3 Kling AI video production"],
          youtubeSearchTerms: ["Flux prompt to production", "AI ad creative Runway Kling pipeline"],
          docs: ["docs.midjourney.com", "runwayml.com"],
        },
        practiceProjects: [
          "Bir marka için tek temalı, tutarlı 3 görsel + 1 video içeren mini kampanya üret.",
          "Aynı karakter/ürünü 5 farklı sahnede tutarlı tutan bir AI görsel seti çıkar.",
        ],
        completionProof: [
          "1 uçtan uca AI kampanya (görsel + video) yayına hazır teslim edildi.",
          "Pipeline (hangi araç, hangi sırayla, hangi prompt mantığı) tek sayfada dokümante edildi.",
        ],
        ifAlreadyKnown: [
          "Bu pipeline'ı paketle: 'AI Prodüksiyon' adıyla bir hizmet kalemi yaz ve mevcut bir müşteriye fiyatla.",
        ],
        defaultStatus: "active",
        priority: "now",
      },
      {
        id: "performance-creative-reading",
        title: "Performans Kreatif Okuryazarlığı",
        technicalName: "Performance Creative Reading",
        type: "technical",
        shortDescription:
          "CTR, CPA, ROAS, hook rate ve retention curve gibi metrikleri okuyup kreatif çıktıyı performans verisine bağlama.",
        whyLearn:
          "Tasarımcı + medya alıcı hibrit profil premium değer yaratır. Sadece estetik değil, sonuç üreten kreatif yapabilmek seni farklılaştırır.",
        relevanceToCem:
          "Ajans müşterilerine sadece görsel değil ölçülebilir sonuç teslim edebilmek için kritik.",
        howToLearn: [
          "Temel reklam metriklerini öğren: CTR, CPA, ROAS, CPM.",
          "Hook rate ve retention curve kavramlarını öğren.",
          "3 farklı reklam kreatifini metrikleriyle analiz et.",
          "1 iyileştirme önerisi raporu yaz.",
        ],
        resources: {
          youtubeSearchTerms: ["CTR CPA ROAS explained", "Facebook Ads creative metrics", "hook rate video ads"],
          courseSearchTerms: ["performance creative advertising", "media buying creative optimization"],
        },
        practiceProjects: ["3 reklam kreatifini metrikleriyle analiz et ve rapor çıkar."],
        completionProof: ["3 performans kreatifi analiz edildi.", "1 metrik bazlı rapor çıkarıldı."],
        ifAlreadyKnown: [
          "Kendi ürettiğin bir kreatifte A/B test senaryosu tasarla ve yazılı olarak sun.",
        ],
        defaultStatus: "not_started",
        priority: "next",
      },
      {
        id: "branding-theory",
        title: "Branding ve Tasarımsal Teori",
        type: "personal",
        shortDescription:
          "Marka konumlandırma, algı, renk, tipografi, kompozisyon ve görsel dil anlayışı.",
        whyLearn:
          "Marka psikolojik konumlandırmasını AI tek başına yapamaz. Bu bilgi insanı AI'dan ayıran katmandır.",
        relevanceToCem:
          "Müşteriye strateji ve görsel kimlik bir arada sunabilmek için temel. Grafik tasarımdan brand consultant'a geçişin köprüsü.",
        howToLearn: [
          "Marka konumlandırma (Positioning) kavramını öğren.",
          "Renk psikolojisi ve tipografi hiyerarşisi için 2-3 kaynak oku.",
          "3 farklı marka için kısa konumlandırma analizi yaz.",
        ],
        resources: {
          courseSearchTerms: ["brand positioning fundamentals", "brand strategy visual identity"],
          youtubeSearchTerms: ["branding fundamentals türkçe", "marka konumlandırma nedir"],
        },
        practiceProjects: [
          "3 marka için kısa konumlandırma analizi.",
          "1 marka için görsel dil analizi notu.",
        ],
        completionProof: ["1 marka analiz notu yazıldı.", "1 konumlandırma çalışması tamamlandı."],
        ifAlreadyKnown: [
          "Kendi kişisel markana (Cem Bozdu / grafikcem) için positioning canvas doldur.",
        ],
        defaultStatus: "not_started",
        priority: "next",
      },
      {
        id: "digital-literacy",
        title: "Dijital Okuryazarlık",
        type: "personal",
        shortDescription:
          "Notion + Supabase + n8n + Claude Code + Vercel gibi araçlarda derin operatörlük ve İngilizce teknik terim hakimiyeti.",
        whyLearn:
          "Araçlarda yüzeysel değil derin operatörlük, iş hızını ve kalitesini 3-5x artırır.",
        relevanceToCem:
          "Her gün kullandığın araçları gerçekten öğrenmek, başkasına bağımlılığı bitirir.",
        howToLearn: [
          "İngilizce teknik terimleri not al, kişisel sözlük oluştur.",
          "Her araç için 1 temel kullanım kılavuzu yaz.",
          "1 mini sistem kur (araçları bir araya getiren küçük flow).",
        ],
        resources: {
          youtubeSearchTerms: ["Notion advanced features", "Vercel deployment guide", "Supabase beginner tutorial"],
        },
        practiceProjects: [
          "Kişisel dijital araç sözlüğü oluştur.",
          "1 mini sistem kur (en az 2 araç birbirine bağlı).",
        ],
        completionProof: ["Dijital araç sözlüğü oluşturuldu.", "1 mini sistem kuruldu."],
        ifAlreadyKnown: ["En az bildiğin araçta gelişmiş bir özellik keşfet ve kullan."],
        defaultStatus: "not_started",
        priority: "next",
      },
      {
        id: "continuous-learning",
        title: "Uyum Sağlama ve Sürekli Öğrenme",
        type: "personal",
        shortDescription:
          "Haftalık öğrenme, aylık retro ve araç-pazar adaptasyonu sistemi.",
        whyLearn:
          "WEF 2030'un en hızlı büyüyen becerileri: resilience, flexibility, agility. AI çağında öğrenmeyi öğrenmek en kritik meta-beceri.",
        relevanceToCem:
          "Aylık retro ve haftalık öğrenme notu sistemi Feed The Goat ile entegre çalışır.",
        howToLearn: [
          "Haftalık 1 AI/teknoloji gelişmesini takip et, 2-3 cümle not al.",
          "Aylık 1 retro yap: ne öğrendim, ne değişti, sıradaki.",
          "Öğrendiğin 1 şeyi sisteme uygula.",
        ],
        resources: {
          youtubeSearchTerms: ["weekly learning system", "monthly retrospective productivity"],
        },
        practiceProjects: ["4 haftalık öğrenme notu al.", "1 aylık retro dökümanı oluştur."],
        completionProof: ["4 haftalık öğrenme notu tamamlandı.", "1 aylık retro yapıldı."],
        ifAlreadyKnown: ["Sistemi büyüt: haftalık notları kategorize et (araç / pazar / kişisel)."],
        defaultStatus: "not_started",
        priority: "later",
      },
      {
        id: "creative-thinking",
        title: "Yaratıcı Düşünme Disiplini",
        type: "personal",
        shortDescription:
          "Günlük konsept üretimi, lateral düşünme ve özgün fikir geliştirme becerisi.",
        whyLearn:
          "WEF 2030'da en hızlı büyüyen 4. beceri. AI'ın taklit edemediği tek alan: gerçek özgünlük ve orijinal konsept üretimi.",
        relevanceToCem:
          "Müşteri işlerinde 'AI bu yapamazdı' diyebileceğin farklılaştırıcı katman.",
        howToLearn: [
          "Günlük 15-30 dakika brifsiz konsept üret.",
          "Lateral düşünme egzersizleri yap (görsel benzetme, zıt fikir, kategori dışı ilham).",
          "30 fikirlik konsept havuzu oluştur.",
          "3 fikri görselleştir.",
        ],
        resources: {
          courseSearchTerms: ["lateral thinking exercises", "creative thinking design"],
          youtubeSearchTerms: ["konsept üretimi nasıl yapılır", "lateral thinking Edward de Bono"],
        },
        practiceProjects: ["30 fikirlik konsept havuzu dokümante et.", "3 fikri görsel olarak ifade et."],
        completionProof: ["30 fikirlik konsept havuzu oluşturuldu.", "3 fikir görselleştirildi."],
        ifAlreadyKnown: [
          "Bir müşteri brief'i için 3 farklı konsept yön öner ve sunum yap.",
        ],
        defaultStatus: "not_started",
        priority: "later",
      },
      // Archived
      {
        id: "domain-ai-workflow-archived",
        title: "Sektöre Özel AI İş Akışı Mimarisi",
        technicalName: "Domain-Specific AI Workflow Architecture",
        type: "technical",
        shortDescription: "Belirli bir iş alanı için AI destekli operasyon ve otomasyon akışları tasarlama.",
        whyLearn: "Creative Stack Orchestration ile kapsanıyor.",
        relevanceToCem: "Arşivlendi — Creative Stack Orchestration ile birleştirildi.",
        howToLearn: [],
        resources: {},
        practiceProjects: [],
        completionProof: [],
        ifAlreadyKnown: [],
        defaultStatus: "archived",
        priority: "archive",
      },
      {
        id: "claude-code-course-archived",
        title: "Claude & Claude Code Kurslarını Bitir",
        type: "technical",
        shortDescription: "Anthropic'in Claude ve Claude Code araçlarını kapsayan eğitim kursları.",
        whyLearn: "Feed The Goat geliştirme sürecinde zaten kullanılıyor, ayrı kurs gerekmez.",
        relevanceToCem: "Arşivlendi.",
        howToLearn: [],
        resources: {},
        practiceProjects: [],
        completionProof: [],
        ifAlreadyKnown: [],
        defaultStatus: "archived",
        priority: "archive",
      },
    ],
  },
  {
    id: "level-2",
    levelNumber: 2,
    title: "Gelişiyorsun",
    subtitle: "Tasarım, AI workflow, portfolyo ve iletişim",
    description:
      "Tasarım, AI workflow, portfolyo ve iletişim becerilerini güçlendirdiğin seviye.",
    skills: [
      {
        id: "photoshop-editorial",
        title: "Editorial Photoshop ve Kompozit Ustalığı",
        technicalName: "Adobe Photoshop Editorial & Composite",
        type: "technical",
        shortDescription:
          "AI'ın yetmediği yerde editorial composite, retouching, color grading, kapak ve premium reklam görseli üretme.",
        whyLearn:
          "AI görüntü üretimi güçleniyor ama editorial composite, retouch ve renk dili hâlâ insanın alanında. Bu beceri seni AI'dan ayırır.",
        relevanceToCem:
          "Premium müşteri işlerinde 'AI yapamaz, sadece Cem yapar' dedirten katman. Yüksek ücret bu tür işlerden gelir.",
        howToLearn: [
          "Kayıtlı oynatma listeleri ve kursları bitir.",
          "Retouching, color grading ve composite egzersizleri yap.",
          "3 editorial composite çalışma üret.",
        ],
        resources: {
          courseSearchTerms: ["Photoshop composite mastery", "editorial retouching Photoshop"],
          youtubeSearchTerms: ["Photoshop composite tutorial", "editorial photo manipulation"],
          savedCoursesNote: "Kayıtlı oynatma listelerini bitir.",
        },
        practiceProjects: ["3 editorial composite çalışma üret.", "1 premium reklam görseli oluştur."],
        completionProof: [
          "3 editorial composite tamamlandı.",
          "1 premium reklam görseli portfolyoya eklendi.",
        ],
        ifAlreadyKnown: ["Müşteri işi olarak editorial retouch yap ve fatura kes."],
        defaultStatus: "not_started",
        priority: "now",
      },
      {
        id: "uiux-specialization",
        title: "UI/UX Uzmanlaşma",
        technicalName: "UI/UX Design",
        type: "technical",
        shortDescription:
          "AI ile üretilen yeni ürünlerin tasarım katmanını yönetme ve kullanıcı deneyimi tasarlama.",
        whyLearn:
          "WEF'in en hızlı büyüyen 8. mesleği. AI'nın tetiklediği yeni ürünlerin tasarım katmanı insan tarafından yönetilmeli.",
        relevanceToCem:
          "Feed The Goat dahil tüm dijital ürünlerin UI kararları bu beceriyle daha bilinçli alınır.",
        howToLearn: [
          "Online kurs tamamla (Figma, kullanıcı akışları, bileşen sistemleri).",
          "1 vaka çalışması yap.",
          "Feed The Goat veya benzer üründe UI revizyonu uygula.",
        ],
        resources: {
          courseSearchTerms: ["UI UX design beginner course", "Figma UI design fundamentals"],
          youtubeSearchTerms: ["UI UX design tutorial", "Figma beginner tutorial"],
        },
        practiceProjects: [
          "1 uygulama ekranı için UI/UX case study üret.",
          "Ajans websitesi veya Feed The Goat için UI revizyonu yap.",
        ],
        completionProof: ["1 UI/UX case study tamamlandı.", "1 canlı ekran revizyonu uygulandı."],
        ifAlreadyKnown: ["Bir kullanıcı testini yönet, bulgularını dokümante et."],
        defaultStatus: "not_started",
        priority: "now",
      },
      {
        id: "python-ai-workflow",
        title: "AI Workflow için Python",
        technicalName: "Python for AI Workflow Engineering",
        type: "technical",
        shortDescription:
          "Python ile AI otomasyon, veri işleme ve workflow geliştirme temeli.",
        whyLearn:
          "n8n ve Claude ile yapılamayan özel otomasyon senaryolarını Python ile çözmek mümkün.",
        relevanceToCem:
          "Feed The Goat ve otomasyon sistemleri için custom script yazabilmek verimliliği artırır.",
        howToLearn: [
          "Python AI 101 ve 102 kurslarından ihtiyacın olan bölümleri tamamla.",
          "Sadece kariyer hedeflerine hizmet eden parçaları öğren.",
          "1 küçük Python script yaz.",
        ],
        resources: {
          courseSearchTerms: ["Python AI automation beginners", "Python scripting for creatives"],
          youtubeSearchTerms: ["Python AI workflow tutorial", "Python beginners automation"],
        },
        practiceProjects: [
          "1 küçük Python script yaz (örn. dosya ismi toplu düzenleme).",
          "1 AI workflow yardımcı aracı üret.",
        ],
        completionProof: [
          "1 küçük Python script yazıldı ve çalıştırıldı.",
          "1 AI workflow yardımcı aracı üretildi.",
        ],
        ifAlreadyKnown: ["OpenAI veya Anthropic API'ını Python ile çağıran mini bir araç yaz."],
        defaultStatus: "not_started",
        priority: "next",
      },
      {
        id: "ai-ad-ugc-creative",
        title: "AI Reklam/UGC Kreatif Üretimi",
        technicalName: "AI Ad & UGC Creative",
        type: "technical",
        shortDescription:
          "AI avatar/ses ve görsel araçlarıyla reklam ve UGC formatında (hook–değer–CTA) satış odaklı kreatif üretmek.",
        whyLearn:
          "Marka ve ajanslar artık 'güzel görsel' değil, dönüşüm getiren reklam/UGC istiyor. AI ile UGC üretebilen kreatif, hem hızlı hem ucuz çalıştığı için piyasada doğrudan aranan adam oluyor.",
        relevanceToCem:
          "Zaten yapıyorsun: performans kreatif ve UGC tarzı içerikler çıkarıyorsun. Burada amaç öğrenmek değil, bu üretimi tekrarlanabilir bir reklam kreatif hattına çevirip 'AI UGC / reklam kreatifi' olarak satmak.",
        howToLearn: [
          "Çalışan reklam yapısını netleştir: hook (ilk 3 sn) → problem → değer → CTA.",
          "AI avatar/ses (örn. HeyGen / ElevenLabs) ile 1 UGC reklam varyasyonu üret.",
          "Aynı mesajdan 3 farklı hook varyasyonu çıkar (test edilecek malzeme).",
          "Statik + video reklamı tek bir kampanya seti olarak teslim formatına sok.",
        ],
        resources: {
          courseSearchTerms: ["AI UGC ads creative", "performance ad creative direct response"],
          youtubeSearchTerms: ["HeyGen UGC ad", "AI avatar ad creative hook variations"],
        },
        practiceProjects: [
          "Bir ürün için 3 hook varyasyonlu 1 AI UGC reklam seti üret.",
          "1 statik + 1 video reklamdan oluşan kampanya paketi çıkar.",
        ],
        completionProof: [
          "3 hook varyasyonlu 1 AI UGC reklam seti teslim edildi.",
          "Reklam kreatifi teklif kalemi olarak yazıldı (kapsam + fiyat).",
        ],
        ifAlreadyKnown: [
          "Ürettiğin reklamları gerçek bir kampanyada test et; hook rate / CTR'a göre en iyi varyasyonu raporla.",
        ],
        defaultStatus: "not_started",
        priority: "now",
      },
      {
        id: "diction-voice",
        title: "Diksiyon ve Ses Kontrolü",
        type: "personal",
        shortDescription:
          "Kamera karşısında güçlü, net ve otoriter iletişim becerisi.",
        whyLearn:
          "Otorite inşa etmek için kameraya karşı güçlü iletişim şart. İçerik üreticisi olarak önce sesini kontrol etmelisin.",
        relevanceToCem:
          "YouTube kanalı ve müşteri sunumları için kritik. İçerik güçlü olsa bile zayıf sunum güveni düşürür.",
        howToLearn: [
          "Günlük 10 dakika yüksek sesle okuma pratiği.",
          "5 kısa konuşma kaydı al ve dinle.",
          "1 video anlatım denemesi çek.",
        ],
        resources: {
          youtubeSearchTerms: ["diksiyon egzersizleri", "ses kontrolü nasıl öğrenilir", "public speaking kamera"],
        },
        practiceProjects: ["5 kısa konuşma kaydı al.", "1 kamera karşısı anlatım denemesi çek."],
        completionProof: ["5 kısa konuşma kaydı alındı.", "1 video anlatım denemesi tamamlandı."],
        ifAlreadyKnown: ["Bir müşteri sunumunu veya YouTube videosunu kaydederek analiz et."],
        defaultStatus: "not_started",
        priority: "next",
      },
      {
        id: "financial-literacy",
        title: "Finansal Okuryazarlık ve İş Zekası",
        type: "personal",
        shortDescription:
          "Saatlik ücret değil sistem ve büyüme değeri satma. LTV, CAC gibi temel metrikleri anlama.",
        whyLearn:
          "Kreatif yetenekten yüksek gelire geçişin köprüsü. Para matematikten değil, fiyatlandırma stratejisinden gelir.",
        relevanceToCem:
          "Ajans işlerini ve retainer paketlerini doğru fiyatlandırmak için temel.",
        howToLearn: [
          "LTV, CAC, profit margin kavramlarını öğren.",
          "1 fiyatlandırma mantığı çalışması yap.",
          "Hizmetlerini 'zaman sat' yerine 'sistem sat' perspektifinden yeniden fiyatlandır.",
        ],
        resources: {
          youtubeSearchTerms: ["LTV CAC explained freelance", "pricing strategy for creatives", "value based pricing"],
        },
        practiceProjects: ["LTV/CAC kısa notu yaz.", "1 hizmet paketi için yeni fiyatlandırma mantığı oluştur."],
        completionProof: ["LTV/CAC notu yazıldı.", "1 fiyatlandırma mantığı çalışması tamamlandı."],
        ifAlreadyKnown: ["Mevcut hizmet paketlerini value-based pricing'e göre yeniden yaz."],
        defaultStatus: "not_started",
        priority: "next",
      },
      {
        id: "storytelling",
        title: "Hikaye Anlatıcılığı",
        technicalName: "Storytelling",
        type: "personal",
        shortDescription:
          "İçerik, sunum ve müşteri konuşmalarında anlatı gücünü kullanma becerisi.",
        whyLearn:
          "İnsanlar ürün değil hikaye satın alır. Storytelling, sıradan içeriği sürükleyici hale getirir.",
        relevanceToCem:
          "YouTube kanalı, müşteri sunumları ve içerik üretiminin tümünde ayrıştırıcı katman.",
        howToLearn: [
          "Story structure (başlangıç, çatışma, çözüm) kavramını öğren.",
          "1 vaka hikayesi yaz (bir proje anısını hikayeye dönüştür).",
          "1 içerik senaryosu hikaye yapısıyla yaz.",
        ],
        resources: {
          courseSearchTerms: ["storytelling for content creators", "narrative design"],
          youtubeSearchTerms: ["storytelling techniques content creator", "hikaye anlatımı içerik"],
        },
        practiceProjects: ["1 vaka hikayesi yaz.", "1 içerik senaryosu hikaye yapısıyla oluştur."],
        completionProof: ["1 vaka hikayesi yazıldı.", "1 içerik senaryosu tamamlandı."],
        ifAlreadyKnown: [
          "Bir müşteri hikayesini (problem → çözüm → sonuç) LinkedIn veya içerik formatında yayınla.",
        ],
        defaultStatus: "not_started",
        priority: "later",
      },
      // Archived
      {
        id: "b2b-sales-evaluation-archived",
        title: "B2B Satış Sistemini Değerlendir",
        type: "personal",
        shortDescription: "AgencyOS aktif olduktan sonra müşteri sayısı ve yanıt oranlarını değerlendirme.",
        whyLearn: "Arşivlendi — Seviye 3-4'te daha uygun.",
        relevanceToCem: "AgencyOS aktif olduktan sonra tekrar değerlendir.",
        howToLearn: [], resources: {}, practiceProjects: [], completionProof: [], ifAlreadyKnown: [],
        defaultStatus: "archived", priority: "archive",
      },
      {
        id: "vertical-pick-archived",
        title: "Vertical Pick — Dikey Pazar Seçimi",
        type: "personal",
        shortDescription: "Bir ana dikey ve bir yedek pazar seçimi. Üç vaka olmadan ana mesajı değiştirme.",
        whyLearn: "Arşivlendi — Seviye 3'te değerlendir.",
        relevanceToCem: "Seviye 3 tamamlanınca değerlendir.",
        howToLearn: [], resources: {}, practiceProjects: [], completionProof: [], ifAlreadyKnown: [],
        defaultStatus: "archived", priority: "archive",
      },
      {
        id: "performance-sprint-archived",
        title: "Performance Creative Sprint Şablonu",
        type: "technical",
        shortDescription: "30 günde 20 reel + 50 statik + raporlama şablonu.",
        whyLearn: "Arşivlendi — Seviye 3'e geçince tekrar değerlendir.",
        relevanceToCem: "Seviye 3 tamamlanınca ekle.",
        howToLearn: [], resources: {}, practiceProjects: [], completionProof: [], ifAlreadyKnown: [],
        defaultStatus: "archived", priority: "archive",
      },
      {
        id: "creativity-dev-archived",
        title: "Yaratıcılık Geliştirme (eski başlık)",
        type: "personal",
        shortDescription: "Seviye 1'deki Yaratıcı Düşünme Disiplini ile birleştirildi.",
        whyLearn: "Arşivlendi.",
        relevanceToCem: "Arşivlendi.",
        howToLearn: [], resources: {}, practiceProjects: [], completionProof: [], ifAlreadyKnown: [],
        defaultStatus: "archived", priority: "archive",
      },
    ],
  },
  {
    id: "level-3",
    levelNumber: 3,
    title: "Aranacaksın",
    subtitle: "Görünürlük, pazarlama ve ilişki yönetimi",
    description:
      "Üretim becerilerini görünürlük, pazarlama ve ilişki yönetimiyle birleştirdiğin seviye.",
    skills: [
      {
        id: "vibe-marketing",
        title: "Vibe Marketing ve Pazarlama",
        technicalName: "Vibe Marketing",
        type: "technical",
        shortDescription:
          "Organik büyüme, içerik pazarlaması ve sosyal kanallarda otorite inşası.",
        whyLearn:
          "Beceri yeterli değil; görünür olmak gerekiyor. Otorite inşa etmeden yüksek ücret istemek güç.",
        relevanceToCem:
          "Ajans ve müşteri işlerini organik olarak büyütmek için kritik. Reklamdan daha uzun vadeli ROI.",
        howToLearn: [
          "1 aylık içerik planı yap.",
          "10 içerik fikri üret.",
          "3 içerik yayınla ve performansını ölç.",
        ],
        resources: {
          courseSearchTerms: ["content marketing strategy", "organic growth social media"],
          youtubeSearchTerms: ["vibe marketing içerik", "organik büyüme sosyal medya"],
        },
        practiceProjects: ["1 aylık içerik planı oluştur.", "3 yayınlanmış içerik ve performans notu."],
        completionProof: [
          "1 aylık içerik planı oluşturuldu.",
          "10 içerik fikri belgelendi.",
          "3 yayınlanmış içerik üretildi.",
        ],
        ifAlreadyKnown: ["İçerik dönüşüm metriklerini takip eden bir sistem kur."],
        defaultStatus: "not_started",
        priority: "now",
      },
      {
        id: "youtube-channel",
        title: "YouTube Profesyonel Kanal",
        type: "technical",
        shortDescription:
          "Yapay zeka, tasarım ve teknoloji üzerine bilgi paylaşımı kanalı.",
        whyLearn:
          "En güçlü inbound pazarlama kanalı. Bildiklerini anlatan içerik, müşteri çeker ve otorite inşa eder.",
        relevanceToCem:
          "Cem'in uzmanlık alanında Türkiye'de içerik üreten az kişi var. İlk güçlü içerik üreticilerden biri olmak büyük avantaj.",
        howToLearn: [
          "Kanal konseptini belirle (ne hakkında, kim için, neden farklı).",
          "5 video başlığı ve içerik planı yap.",
          "İlk videoyu çek ve yayınla.",
        ],
        resources: {
          youtubeSearchTerms: ["YouTube channel strategy 2024", "YouTube content creator beginners"],
        },
        practiceProjects: [
          "Kanal konsepti belgesi yaz.",
          "5 video başlığı ve açıklaması hazırla.",
          "1 video çek ve yayınla.",
        ],
        completionProof: ["Kanal konsepti belirlendi.", "5 video başlığı hazırlandı.", "1 video yayınlandı."],
        ifAlreadyKnown: ["İlk 5 videoyu yayınla ve izlenme metriklerini analiz et."],
        defaultStatus: "not_started",
        priority: "now",
      },
      {
        id: "public-speaking",
        title: "Topluluk Önünde Konuşma",
        type: "personal",
        shortDescription:
          "B2B sunumu, keşif görüşmesi ve kamera karşısında güçlü duruş.",
        whyLearn:
          "Müşteri güveni çoğunlukla ürünü değil kişiyi satın alır. Güçlü sunum yeteneği daha yüksek ücret demek.",
        relevanceToCem:
          "Müşteri sunumları, YouTube ve olası workshop'lar için olmazsa olmaz.",
        howToLearn: [
          "3 sunum provası yap (ayna veya kamera önünde).",
          "1 kamera karşısı anlatım kaydı çek.",
          "Kaydı izleyerek iyileştirme noktalarını belirle.",
        ],
        resources: {
          youtubeSearchTerms: ["sunum becerileri türkçe", "public speaking beginner tips"],
        },
        practiceProjects: ["3 sunum provası tamamla.", "1 kamera anlatım kaydı al."],
        completionProof: ["3 sunum provası tamamlandı.", "1 kamera karşısı anlatım kaydedildi."],
        ifAlreadyKnown: ["Bir müşteri keşif görüşmesini kaydet ve analiz et."],
        defaultStatus: "not_started",
        priority: "next",
      },
      {
        id: "outreach-networking",
        title: "Girişkenlik ve Ağ Kurma",
        technicalName: "B2B Outreach",
        type: "personal",
        shortDescription:
          "Soğuk görüşme ve ağ kurma. Haftalık 1 B2B temas hedefi.",
        whyLearn:
          "Gelir, ağından gelir. Beklemek değil, ulaşmak. Profesyonel ilişki kurma, uzun vadeli iş akışının kaynağı.",
        relevanceToCem:
          "Mevcut müşteri ağını büyütmek ve retainer iş geliştirmek için.",
        howToLearn: [
          "Haftalık 1 B2B temas hedefle.",
          "İlk 4 haftada 4 temas gerçekleştir.",
          "Her temas için görüşme notu tut.",
        ],
        resources: {
          youtubeSearchTerms: ["B2B outreach strategy", "cold email templates freelance", "networking for freelancers"],
        },
        practiceProjects: [
          "4 haftada 4 B2B temas gerçekleştir.",
          "Görüşme notları belgesi oluştur.",
        ],
        completionProof: [
          "4 haftada 4 B2B temas gerçekleştirildi.",
          "Görüşme notları belgelendi.",
        ],
        ifAlreadyKnown: ["Temas başarı oranını takip eden mini CRM oluştur."],
        defaultStatus: "not_started",
        priority: "next",
      },
      {
        id: "retainer-client-management",
        title: "Retainer Müşteri Yönetimi",
        type: "personal",
        shortDescription:
          "Proje değil sistem satmak. Onboarding ve raporlama şablonları hazırlamak.",
        whyLearn:
          "Proje bazlı gelir istikrarsız. Retainer modeli öngörülebilir, büyüyen gelir sağlar.",
        relevanceToCem:
          "Ajans işinin hedefi proje değil retainer. Sistemin hazır olması kapıyı açıyor.",
        howToLearn: [
          "1 onboarding şablonu hazırla.",
          "1 aylık raporlama şablonu oluştur.",
          "1 retainer paket taslağı (fiyat, kapsam, koşullar) yaz.",
        ],
        resources: {
          youtubeSearchTerms: ["retainer client management freelance", "onboarding template designer"],
        },
        practiceProjects: [
          "1 onboarding şablonu oluştur.",
          "1 raporlama şablonu oluştur.",
          "1 retainer paket taslağı yaz.",
        ],
        completionProof: [
          "1 onboarding şablonu tamamlandı.",
          "1 raporlama şablonu tamamlandı.",
          "1 retainer paket taslağı yazıldı.",
        ],
        ifAlreadyKnown: ["Şablonları gerçek bir müşteriyle uygula ve geri bildirim al."],
        defaultStatus: "not_started",
        priority: "next",
      },
      {
        id: "offer-design-productization",
        title: "Teklif Tasarımı & Ürünleştirme",
        technicalName: "Offer Design & Productization",
        type: "technical",
        shortDescription:
          "Saat satmayı bırakıp net kapsamlı, fiyatı belli, paketlenmiş bir teklif (offer) tasarlamak.",
        whyLearn:
          "Aranan adam olmanın yarısı yetenekse, diğer yarısı 'ne sattığının' net olması. Belirsiz iş = pazarlık + düşük ücret. Paketlenmiş net teklif = yüksek fiyat ve hızlı 'evet'.",
        relevanceToCem:
          "Zaten yapıyorsun: müşteriye iş veriyorsun ama her seferinde sıfırdan pazarlık. Burada amaç bu işi tek seferlik 'şu paket, şu fiyat, şu kapsam' teklifine dönüştürüp tekrar tekrar satmak.",
        howToLearn: [
          "Şu an yaptığın işi 3 nete ayır: ne veriyorsun, ne kadar sürede, ne kadara.",
          "Tek bir 'imza paket' tanımla (kapsam içi / kapsam dışı net çizgi).",
          "Fiyatı sonuç üstünden konumlandır (zaman değil, ne kazandırdığı).",
          "Teklifi tek sayfalık net bir dokümana / sunuma indir.",
        ],
        resources: {
          courseSearchTerms: ["offer design productized service", "value based pricing offer"],
          youtubeSearchTerms: ["productized service offer", "how to package a creative offer"],
        },
        practiceProjects: [
          "1 imza paket teklifi yaz (kapsam + fiyat + süre + kapsam dışı).",
          "Aynı teklifin 'mini / ana / premium' 3 kademesini çıkar.",
        ],
        completionProof: [
          "1 paketlenmiş teklif tek sayfada hazır.",
          "Teklif en az 1 gerçek müşteriye sunuldu.",
        ],
        ifAlreadyKnown: [
          "Tekliften gerçek bir satış kapat; itirazları not al ve teklifi ona göre revize et.",
        ],
        defaultStatus: "not_started",
        priority: "now",
      },
      {
        id: "distribution-content-engine",
        title: "Dağıtım & İçerik Motoru",
        technicalName: "Distribution & Content Engine",
        type: "technical",
        shortDescription:
          "@grafikcem + @maskulenkod + @pixelspor hesaplarını tek bir tekrarlanabilir içerik üretim-dağıtım sistemine bağlamak.",
        whyLearn:
          "İyi olman yetmez, görünmen gerek. Dağıtım motoru kuran kişi, beklemeden iş çağıran kişidir. Düzensiz paylaşan değil, sistemli üreten aranır.",
        relevanceToCem:
          "Zaten yapıyorsun: 3 ayrı hesabı yönetiyorsun (@grafikcem kreatif, @maskulenkod, @pixelspor). Burada amaç bunu his'le değil, '1 fikir → 3 format → çok kanal' tekrarlanabilir bir motora çevirmek.",
        howToLearn: [
          "3 hesabın her biri için net içerik sütunlarını (pillar) yaz.",
          "Tek fikri 3 formata çoğaltan akışı kur (reel + carousel + kısa metin).",
          "Haftalık tekrarlanabilir bir üretim ritmi belirle (kaç içerik, hangi gün).",
          "Performansı tek yerde takip et (ne tuttu, ne tutmadı).",
        ],
        resources: {
          courseSearchTerms: ["content engine system creator", "multi account content distribution"],
          youtubeSearchTerms: ["1 idea 3 formats content system", "content repurposing workflow"],
        },
        practiceProjects: [
          "3 hesap için 1 haftalık içerik takvimi çıkar (sütunlar + format eşlemesi).",
          "Tek fikirden 3 format üretip 3 kanala dağıt.",
        ],
        completionProof: [
          "3 hesabın içerik sütunları ve haftalık ritmi tek dokümanda tanımlı.",
          "1 fikir → 3 format → çok kanal döngüsü en az 1 kez çalıştırıldı.",
        ],
        ifAlreadyKnown: [
          "Motoru otomatikleştir: üretim → planlama → dağıtım adımlarından en az birini araç/otomasyonla hızlandır.",
        ],
        defaultStatus: "not_started",
        priority: "now",
      },
      // Archived
      {
        id: "linkedin-authority-archived",
        title: "LinkedIn Authority Track",
        type: "technical",
        shortDescription: "B2B retainer satışını artırmak için LinkedIn otorite inşası.",
        whyLearn: "Arşivlendi — YouTube ve içerik öncelikli.",
        relevanceToCem: "Seviye 4-5'te tekrar değerlendir.",
        howToLearn: [], resources: {}, practiceProjects: [], completionProof: [], ifAlreadyKnown: [],
        defaultStatus: "archived", priority: "archive",
      },
      {
        id: "english-newsletter-archived",
        title: "English Newsletter Lansmanı",
        type: "technical",
        shortDescription: "Beehiiv veya Substack, B2B owned audience.",
        whyLearn: "Arşivlendi — Seviye 5'te değerlendir.",
        relevanceToCem: "Seviye 5'e geçince değerlendir.",
        howToLearn: [], resources: {}, practiceProjects: [], completionProof: [], ifAlreadyKnown: [],
        defaultStatus: "archived", priority: "archive",
      },
      {
        id: "case-study-content-archived",
        title: "Vaka Analizi İçerik Formatı",
        type: "technical",
        shortDescription: "Carousel yerine vaka analizi formatında içerik.",
        whyLearn: "Arşivlendi — Seviye 3 tamamlanınca ekle.",
        relevanceToCem: "Seviye 3 tamamlanınca ekle.",
        howToLearn: [], resources: {}, practiceProjects: [], completionProof: [], ifAlreadyKnown: [],
        defaultStatus: "archived", priority: "archive",
      },
      {
        id: "brand-communication-archived",
        title: "Marka İletişimi ve Yönetimi",
        type: "personal",
        shortDescription: "Grafikcem ve @cembozdu arasındaki tutarlı dili yönetmek.",
        whyLearn: "Arşivlendi — Seviye 2'deki Branding Teorisi ile birlikte değerlendir.",
        relevanceToCem: "Arşivlendi.",
        howToLearn: [], resources: {}, practiceProjects: [], completionProof: [], ifAlreadyKnown: [],
        defaultStatus: "archived", priority: "archive",
      },
    ],
  },
  {
    id: "level-4",
    levelNumber: 4,
    title: "Sektörün Nadirlerinden",
    subtitle: "Yazılım, operasyon, ses, satış ve sistem",
    description:
      "Yazılım, operasyon, ses, satış ve sistem kurma becerilerini birleştirdiğin üst seviye.",
    skills: [
      {
        id: "creative-ops-package",
        title: "Creative Operations Paketi",
        technicalName: "CreOps Package",
        type: "technical",
        shortDescription:
          "İçerik operasyonlarını AI ile otomasyonlaştıran, aylık retainer formatında satılabilen paket.",
        whyLearn:
          "Seviye 1'de öğrenilen CreOps disiplininin pazara çıkmış hali. Ürünleştirme, saati satmaktan çok daha karlı.",
        relevanceToCem:
          "Ajans işinin ölçeklenmesi için paket formatı şart. Müşteriye ne sattığını netleştiriyor.",
        howToLearn: [
          "1 paket tanımı yaz (ne kapsar, ne kapsamaz, fiyat aralığı).",
          "1 örnek workflow dokümante et.",
          "1 fiyatlandırma taslağı oluştur.",
        ],
        resources: {
          courseSearchTerms: ["creative operations productized service", "agency retainer package design"],
          youtubeSearchTerms: ["productized service freelance", "creative agency package"],
        },
        practiceProjects: ["1 paket tanım belgesi hazırla.", "1 fiyatlandırma taslağı oluştur."],
        completionProof: [
          "1 paket tanımı yazıldı.",
          "1 örnek workflow dokümante edildi.",
          "1 fiyatlandırma taslağı oluşturuldu.",
        ],
        ifAlreadyKnown: ["Paketi bir müşteriye sun ve geri bildirim al."],
        defaultStatus: "not_started",
        priority: "now",
      },
      {
        id: "3d-basics",
        title: "3D Temelleri",
        technicalName: "C4D veya Blender",
        type: "technical",
        shortDescription:
          "3D temel bilgi; derin uzmanlık değil, motion ve AI üretimiyle birleşecek kadar temel seviye.",
        whyLearn:
          "İş ilanlarının %70'i 3D'yi 'tercih edilir' olarak listeliyor. AI motion ile birleşince premium kapısı açıyor. Bu seviyede 3D, üretimine değer katan bir farklılaştırıcı.",
        relevanceToCem:
          "After Effects motion ve AI görsel çalışmalarına 3D eleman ekleyince iş kalitesi ve fiyatı atlıyor. Bu noktada 3D, paketlerine eklenebilecek bir premium katman.",
        howToLearn: [
          "Blender veya C4D temel kursu tamamla.",
          "Model, ışık, kamera ve render mantığını öğren.",
          "3 basit 3D sahne üret.",
        ],
        resources: {
          courseSearchTerms: ["Blender beginner tutorial", "Cinema 4D basics for motion designers"],
          youtubeSearchTerms: ["Blender 3D beginner full course", "C4D motion design tutorial"],
        },
        practiceProjects: ["3 basit 3D sahne üret.", "1 motion/AI görselle birleşen 3D çıktı üret."],
        completionProof: [
          "3 basit 3D sahne tamamlandı.",
          "1 motion veya AI görselle birleşen 3D çıktı üretildi.",
        ],
        ifAlreadyKnown: ["1 3D nesneyi After Effects veya AI video pipeline'ına entegre eden bir parça üret."],
        defaultStatus: "not_started",
        priority: "next",
      },
      {
        id: "sales-negotiation",
        title: "Satış ve Müzakere",
        type: "personal",
        shortDescription:
          "Teklif sunma, fiyat savunma, itiraz yönetimi ve müşteri kapatma becerileri.",
        whyLearn:
          "Dağıtım kanalları kuruluyor, kitle büyüyor. Ama sistematik satış metodolojisi yoksa bu kitle gelire dönüşmüyor.",
        relevanceToCem:
          "Her solopreneur'ün en zayıf halkası genellikle satış. Bunun erken öğrenilmesi gerekiyor.",
        howToLearn: [
          "Teklif sunma ve fiyat savunma konusunda 1 kaynak oku.",
          "5 itiraz-cevap senaryosu yaz.",
          "1 teklif şablonu oluştur.",
        ],
        resources: {
          youtubeSearchTerms: ["freelance satış müzakere", "how to handle price objections freelance"],
        },
        practiceProjects: [
          "1 teklif şablonu hazırla.",
          "5 itiraz-cevap senaryosu yaz.",
          "1 fiyat savunma notu oluştur.",
        ],
        completionProof: [
          "1 teklif şablonu yazıldı.",
          "1 fiyat savunma notu hazırlandı.",
          "5 itiraz-cevap örneği yazıldı.",
        ],
        ifAlreadyKnown: ["Son 3 müşteri görüşmeni değerlendir: nerede kayıp verdim, nerede kazandım?"],
        defaultStatus: "not_started",
        priority: "next",
      },
      {
        id: "talent-management",
        title: "Talent Management ve Delegasyon",
        type: "personal",
        shortDescription:
          "Onboarding, brief verme, kalite kontrol, geri bildirim ve AI orkestrasyonunun insan tarafı.",
        whyLearn:
          "WEF 2030 Top 10 büyüyen beceri. Ölçeklenmek için 'yapan' değil 'yöneten' olmak şart.",
        relevanceToCem:
          "Ajans büyüdüğünde ilk işbirlikçiyi yönetmek için altyapı hazır olmalı.",
        howToLearn: [
          "1 işbirlikçi onboarding şablonu hazırla.",
          "1 brief verme süreci oluştur.",
          "1 kalite kontrol checklist'i yaz.",
        ],
        resources: {
          youtubeSearchTerms: ["delegation skills for freelancers", "talent management small agency"],
        },
        practiceProjects: ["1 onboarding şablonu oluştur.", "1 kalite kontrol checklist'i hazırla."],
        completionProof: ["1 brief şablonu yazıldı.", "1 kalite kontrol checklist'i tamamlandı."],
        ifAlreadyKnown: ["Şablonları gerçek bir işbirlikçiyle uygula."],
        defaultStatus: "not_started",
        priority: "later",
      },
      {
        id: "systems-thinking",
        title: "Sistem Düşüncesi",
        technicalName: "Systems Thinking",
        type: "personal",
        shortDescription:
          "Tek tek görev değil, süreçleri sistem olarak görmek. Süreç haritalama, döngü tasarımı ve ölçülebilir çıktı.",
        whyLearn:
          "Bireysel üretimden sistem kurucusuna geçişin zihinsel altyapısı.",
        relevanceToCem:
          "Feed The Goat'ta zaten yaşıyorsun bunu. Sistematik düşünceyi operasyonuna taşımak işi büyütür.",
        howToLearn: [
          "1 üretim sürecini adım adım haritalandır.",
          "Tekrar eden darboğazları belirle.",
          "1 sistem dokümanı yaz.",
        ],
        resources: {
          youtubeSearchTerms: ["systems thinking explained", "process mapping small business"],
        },
        practiceProjects: ["1 süreç haritası oluştur.", "1 sistem dokümanı yaz."],
        completionProof: ["1 süreç haritası tamamlandı.", "1 sistem dokümanı yazıldı."],
        ifAlreadyKnown: ["Mevcut bir süreci haritala ve iyileştirme önerisi sun."],
        defaultStatus: "not_started",
        priority: "later",
      },
      // Archived
      {
        id: "first-freelancer-archived",
        title: "İlk Freelance İşbirlikçi",
        type: "personal",
        shortDescription: "1 motion editor + 1 prompt operator. AgencyOS'tan sonra ölçekleme.",
        whyLearn: "Arşivlendi — Talent Management öğrenildikten sonra daha uygun.",
        relevanceToCem: "Seviye 4 tamamlanınca değerlendir.",
        howToLearn: [], resources: {}, practiceProjects: [], completionProof: [], ifAlreadyKnown: [],
        defaultStatus: "archived", priority: "archive",
      },
      {
        id: "fractional-cd-archived",
        title: "Fractional Creative Director Hizmeti",
        type: "personal",
        shortDescription: "Aylık sabit ücret, hafta 1-2 toplantı + sistem denetimi.",
        whyLearn: "Arşivlendi — Önce retainer müşteri kazanılmalı.",
        relevanceToCem: "Seviye 5'te değerlendir.",
        howToLearn: [], resources: {}, practiceProjects: [], completionProof: [], ifAlreadyKnown: [],
        defaultStatus: "archived", priority: "archive",
      },
      {
        id: "masculinity-archived",
        title: "Maskülenite ve Karakter Gelişimi",
        type: "personal",
        shortDescription: "Feed The Goat sistemiyle zaten ele alınıyor.",
        whyLearn: "Arşivlendi.",
        relevanceToCem: "Sistem zaten bu işlevi görüyor.",
        howToLearn: [], resources: {}, practiceProjects: [], completionProof: [], ifAlreadyKnown: [],
        defaultStatus: "archived", priority: "archive",
      },
    ],
  },
  {
    id: "level-5",
    levelNumber: 5,
    title: "Uzmanlaşıyorsun",
    subtitle: "Uluslararası, topluluk, eğitim ve görsel kimlik",
    description:
      "Uluslararası servis, topluluk, eğitim, görsel kimlik ve hukuki altyapı seviyesine geçtiğin aşama.",
    skills: [
      {
        id: "paid-community",
        title: "Discord / Ücretli Topluluk",
        type: "technical",
        shortDescription:
          "Yapay Zeka Destekli Tasarım Operatörlüğü topluluğu kurulumu.",
        whyLearn:
          "Topluluk, en yüksek ROI'ye sahip içerik işi. Üyeler hem müşteri hem de referans olur.",
        relevanceToCem:
          "Uzmanlık alanını paylaşan Türkiye'de çok az insan var. İlk güçlü topluluk kurucusu avantajı büyük.",
        howToLearn: [
          "Topluluk konseptini belirle.",
          "Discord sunucu yapısını ve kanal organizasyonunu kur.",
          "İlk içerik planını hazırla.",
          "Ücret ve erişim modelini belirle.",
        ],
        resources: {
          youtubeSearchTerms: ["Discord community building creator", "paid community setup"],
        },
        practiceProjects: [
          "Topluluk konsepti belgesi.",
          "Discord kanal yapısı kurulumu.",
          "İlk içerik planı.",
        ],
        completionProof: ["Topluluk konsepti belirlendi.", "Kanal yapısı kuruldu.", "İlk içerik planı hazırlandı."],
        ifAlreadyKnown: ["İlk 10 üyeyi topluluğa kabul et."],
        defaultStatus: "not_started",
        priority: "next",
      },
      {
        id: "color-visual-identity",
        title: "Renk Bilimi ve Görsel Kimlik Sistemi",
        type: "technical",
        shortDescription:
          "Renk teorisi, tipografi sistemi, spacing ritmi ve tutarlı görsel sistem.",
        whyLearn:
          "Görsel kimlik sistemini bilen tasarımcı, sistematik üretim yapabilir. After Effects motion da bu bilgiyle daha tutarlı kurulur.",
        relevanceToCem:
          "Müşterilere brand identity hizmeti sunmak ve kendi markasını güçlendirmek için.",
        howToLearn: [
          "Renk teorisi ve tipografi sistem temellerini öğren.",
          "1 görsel kimlik mini rehberi yaz.",
          "1 motion tasarım sistem örneği oluştur.",
        ],
        resources: {
          courseSearchTerms: ["color theory design system", "visual identity system design"],
          youtubeSearchTerms: ["brand identity design system", "color theory typography"],
        },
        practiceProjects: ["1 görsel kimlik mini rehberi.", "1 motion tasarım sistem örneği."],
        completionProof: ["1 görsel kimlik mini rehberi yazıldı.", "1 motion tasarım sistem örneği oluşturuldu."],
        ifAlreadyKnown: ["Kendi kişisel markası için tam görsel kimlik sistemi oluştur."],
        defaultStatus: "not_started",
        priority: "next",
      },
      {
        id: "education-leadership",
        title: "Eğitim Liderliği",
        type: "personal",
        shortDescription:
          "AI-Native Orkestratör Olma Eğitim Kampı müfredatı hazırlamak.",
        whyLearn:
          "Öğretmek en derin öğrenme yöntemidir. Eğitim içeriği aynı zamanda müşteri çeken içerik olur.",
        relevanceToCem:
          "Uzmanlığı ürünleştirmenin en yüksek değerli biçimi. Kurs, topluluk ve workshop için temel.",
        howToLearn: [
          "Müfredat taslağı çıkar.",
          "5 ders başlığı belirle.",
          "1 örnek ders hazırla.",
        ],
        resources: {
          youtubeSearchTerms: ["how to create online course", "course creation curriculum design"],
        },
        practiceProjects: ["Müfredat taslağı.", "5 ders başlığı.", "1 örnek ders."],
        completionProof: ["Müfredat taslağı oluşturuldu.", "5 ders başlığı belirlendi.", "1 örnek ders hazırlandı."],
        ifAlreadyKnown: ["Örnek dersi yayınla (YouTube veya toplulukta) ve geri bildirim al."],
        defaultStatus: "not_started",
        priority: "next",
      },
      {
        id: "legal-literacy",
        title: "Temel Hukuki Okuryazarlık",
        type: "personal",
        shortDescription:
          "Freelancer olarak sözleşme, kullanım hakkı, fikri mülkiyet, ödeme şartları ve lisans mantığını bilmek.",
        whyLearn:
          "Freelancer'ların en çok para kaybettiği yer: sözleşmesiz iş, kullanım hakkı belirsizliği, ödeme garantisi olmayan projeler.",
        relevanceToCem:
          "Her müşteri işi bir sözleşmeye ihtiyaç duyar. Hukuki temeli olmayan iş, risk altındadır.",
        howToLearn: [
          "Temel freelance sözleşme maddelerini öğren.",
          "Fikri mülkiyet ve kullanım lisansı kavramlarını araştır.",
          "1 freelance sözleşme checklist'i oluştur.",
        ],
        resources: {
          youtubeSearchTerms: ["freelance contract basics", "intellectual property design freelance"],
        },
        practiceProjects: ["Temel sözleşme maddeleri notu.", "1 freelance sözleşme checklist'i."],
        completionProof: ["Temel sözleşme maddeleri notu yazıldı.", "1 freelance sözleşme checklist'i oluşturuldu."],
        ifAlreadyKnown: ["Bir avukatla mevcut sözleşme taslağını gözden geçir."],
        defaultStatus: "not_started",
        priority: "later",
      },
      // Archived
      {
        id: "gumroad-digital-product-archived",
        title: "Dijital Ürün — Gumroad",
        type: "technical",
        shortDescription: "Mega-Prompt Kütüphanesi, n8n şablonlar, mini eğitimler.",
        whyLearn: "Arşivlendi — Retainer kurulduktan sonra değerlendir.",
        relevanceToCem: "Seviye 5 tamamlanınca ekle.",
        howToLearn: [], resources: {}, practiceProjects: [], completionProof: [], ifAlreadyKnown: [],
        defaultStatus: "archived", priority: "archive",
      },
      {
        id: "newsletter-owned-audience-archived",
        title: "Newsletter — Owned Audience",
        type: "technical",
        shortDescription: "Aylık ücretli abonelik veya B2B sponsorluk sistemi.",
        whyLearn: "Arşivlendi — YouTube ve topluluk önce, newsletter sonra.",
        relevanceToCem: "Seviye 5 tamamlanınca değerlendir.",
        howToLearn: [], resources: {}, practiceProjects: [], completionProof: [], ifAlreadyKnown: [],
        defaultStatus: "archived", priority: "archive",
      },
      {
        id: "b2b-workshop-archived",
        title: "B2B Workshop / In-House Training",
        type: "technical",
        shortDescription: "Şirketlere 'AI Creative Operations' 2 günlük eğitim.",
        whyLearn: "Arşivlendi — Eğitim liderliği ve topluluk hazır olmadan workshop zor satılır.",
        relevanceToCem: "Seviye 5 tamamlanınca değerlendir.",
        howToLearn: [], resources: {}, practiceProjects: [], completionProof: [], ifAlreadyKnown: [],
        defaultStatus: "archived", priority: "archive",
      },
    ],
  },
  {
    id: "level-6",
    levelNumber: 6,
    title: "Fiziksel Kariyer Sigortası",
    subtitle: "Stratejik opsiyon — şu an aktif hedef değil",
    description:
      "Dijital becerilerini fiziksel üretim, saha çekimi, drone ve alternatif kariyer sigortalarıyla desteklediğin stratejik opsiyonlar seviyesi.",
    skills: [
      {
        id: "drone-certification",
        title: "İHA-1 Ticari Drone Sertifikası",
        technicalName: "İHA-1 / SHGM",
        type: "technical",
        shortDescription:
          "SHGM onaylı kurumdan ticari drone ehliyeti almak.",
        whyLearn:
          "Emlak, inşaat ve etkinlik dikeyi ile birleşince aylık retainer kapısı açabilir.",
        relevanceToCem:
          "Seviye 1-4 tamamlandıktan sonra değerlendir. Şu an stratejik opsiyon.",
        howToLearn: [
          "SHGM onaylı kurs arayışına gir.",
          "Teorik ve pratik sınavları geç.",
          "Sertifika al ve 1 demo çekim yap.",
        ],
        resources: {
          courseSearchTerms: ["İHA-1 sertifika kursu SHGM", "drone pilotu nasıl olunur Türkiye"],
        },
        practiceProjects: ["1 demo drone çekimi."],
        completionProof: ["İHA-1 sertifikası alındı.", "1 demo çekim yapıldı."],
        ifAlreadyKnown: ["Ticari portföy oluştur; emlak müşterisi bul."],
        defaultStatus: "not_started",
        priority: "later",
      },
      {
        id: "hybrid-production",
        title: "Hibrit Prodüksiyon",
        type: "technical",
        shortDescription:
          "Drone + saha çekimi + röportaj + aynı gün kurgu + ertesi gün motion varyasyonları.",
        whyLearn:
          "Tek günlük paket fiyatı 25.000-80.000 TL. Tam hizmet prodüksiyon yüksek değer üretir.",
        relevanceToCem:
          "Drone sertifikası alındıktan sonra bu paketi oluştur.",
        howToLearn: ["1 paket taslağı yaz (kapsam, süre, fiyat).", "1 demo prodüksiyon gerçekleştir."],
        resources: {
          youtubeSearchTerms: ["hybrid video production package", "full production day rate"],
        },
        practiceProjects: ["1 paket taslağı.", "1 demo prodüksiyon."],
        completionProof: ["1 paket taslağı yazıldı.", "1 demo prodüksiyon gerçekleştirildi."],
        ifAlreadyKnown: ["Paketi bir müşteriye sat."],
        defaultStatus: "not_started",
        priority: "later",
      },
      {
        id: "photogrammetry",
        title: "Photogrammetry / 3D Reality Capture",
        type: "technical",
        shortDescription:
          "Drone + iPhone LiDAR + Polycam ile inşaat, emlak veya müze için 3D dokümantasyon.",
        whyLearn:
          "Proje başı 50.000-200.000 TL. Türkiye'de neredeyse boş niş.",
        relevanceToCem:
          "Drone ve 3D temellerinin tamamlanmasından sonra değerlendir.",
        howToLearn: [
          "Polycam veya benzer araçla 1 test mekan taraması yap.",
          "1 örnek rapor hazırla.",
        ],
        resources: {
          youtubeSearchTerms: ["photogrammetry iPhone LiDAR tutorial", "Polycam 3D scanning"],
        },
        practiceProjects: ["1 test mekan taraması ve örnek rapor."],
        completionProof: ["1 test mekan taraması yapıldı.", "1 örnek rapor hazırlandı."],
        ifAlreadyKnown: ["Bir müşteri için ticari tarama yap."],
        defaultStatus: "not_started",
        priority: "later",
      },
      {
        id: "iha2-or-knx",
        title: "İHA-2 veya KNX Akıllı Ev",
        technicalName: "İHA-2 / KNX Partner",
        type: "technical",
        shortDescription:
          "İHA-2 (endüstriyel drone) veya KNX Partner sertifikası. Seviye 1-2 sonuçlarına göre seç.",
        whyLearn:
          "İki yüksek değerli niş alan. Hangisinin Cem için daha uygun olduğunu veri toplayarak belirle.",
        relevanceToCem:
          "Kararı şimdi verme. Faz 1-2 sonuçlarına göre seç.",
        howToLearn: [
          "Her iki alan için karar matrisi hazırla.",
          "Uygun olanı seçtikten sonra ilgili sertifika sürecini başlat.",
        ],
        resources: {
          youtubeSearchTerms: ["KNX smart home certification", "İHA-2 drone sertifikası Türkiye"],
        },
        practiceProjects: ["Karar matrisi hazırla."],
        completionProof: ["Karar matrisi hazırlandı ve seçim yapıldı."],
        ifAlreadyKnown: [],
        defaultStatus: "not_started",
        priority: "later",
      },
      {
        id: "professional-cooking",
        title: "Profesyonel Aşçılık",
        technicalName: "MSA veya Orta Yol",
        type: "personal",
        shortDescription:
          "MSA tam programı veya orta yol alternatifi. Kariyer sigortası; şu an aktif hedef değil.",
        whyLearn:
          "420.000 TL + 4-8 ay tam gün ciddi taahhüt. Diğer seviyeler tamamlandıktan sonra tekrar değerlendir.",
        relevanceToCem:
          "Kariyer sigortası niteliğinde, şu an aktif hedef yapılmayacak.",
        howToLearn: [
          "Alternatif yol analizi hazırla (MSA vs. kısa kurs vs. pastane işinde çalışma).",
        ],
        resources: {
          youtubeSearchTerms: ["MSA mutfak sanatları okulu", "profesyonel aşçılık kursları"],
        },
        practiceProjects: ["Alternatif yol analizi."],
        completionProof: ["Alternatif yol analizi tamamlandı ve karar verildi."],
        ifAlreadyKnown: [],
        defaultStatus: "not_started",
        priority: "later",
      },
    ],
  },
  {
    id: "level-7",
    levelNumber: 7,
    title: "2026 AI Operator / Creative Builder",
    subtitle: "Yüksek değerli AI-native beceriler",
    description:
      "2026 yılında en çok değer üreten AI entegrasyonu, lokal model yönetimi ve makine öğrenmesi temelli yaratıcı otomasyon yetenekleri.",
    skills: [
      {
        id: "mcp-tool-ecosystem",
        title: "MCP & Tool Ecosystem",
        technicalName: "Model Context Protocol",
        type: "technical",
        shortDescription: "MCP mantığı, GitHub/Supabase/Vercel/browser tool bağlama.",
        whyLearn: "AI asistanlarının harici sistemlerle konuşabilmesi için MCP 2026'nın en sıcak standardıdır. Bu beceri operasyonları 10x hızlandırır.",
        relevanceToCem: "Feed The Goat ve asistan altyapısına kendi MCP server'larını entegre ederek tam kontrollü otomasyonlar kurabilirsin.",
        howToLearn: [
          "Model Context Protocol (MCP) dokümantasyonunu oku.",
          "GitHub ve Vercel MCP server'larını lokal asistanına bağla.",
          "Supabase ve SQLite database'leri için MCP araçları kur.",
          "Browser otomasyon tool'u entegre et."
        ],
        resources: {
          courseSearchTerms: ["Model Context Protocol tutorial", "MCP server guide"],
          youtubeSearchTerms: ["MCP Anthropic setup", "Claude Code MCP tools"]
        },
        practiceProjects: [
          "Kendi GitHub repository'ni yöneten mini bir MCP entegrasyonu kur.",
          "Browser tool ile webden veri çekip Supabase'e yazan MCP otomasyonu yap."
        ],
        completionProof: [
          "MCP server başarıyla kuruldu.",
          "En az bir çalışan MCP/tool tabanlı otomasyon kanıtlandı."
        ],
        ifAlreadyKnown: [
          "Custom bir MCP server yazıp npm/GitHub üzerinde yayınla."
        ],
        defaultStatus: "not_started",
        priority: "now"
      },
      {
        id: "local-model-operations",
        title: "Local Model Operations",
        technicalName: "Local LLMs (Ollama / LM Studio)",
        type: "technical",
        shortDescription: "Ollama/LM Studio, quantized model, local RAG ve gizlilik odaklı iş akışları.",
        whyLearn: "Müşteri verilerinin gizliliği ve API maliyetlerini düşürmek için lokal modeller (örn. Llama 3, Qwen) çalıştırmak 2026'da hayati önem taşır.",
        relevanceToCem: "Grafikcem içerik ve asistan verilerini tamamen lokalde, API ücreti ödemeden ve veri sızıntısı olmadan işlemek için.",
        howToLearn: [
          "Ollama veya LM Studio uygulamasını bilgisayarına kur.",
          "Quantized modelleri (GGUF formatı) lokalde çalıştır.",
          "Lokal modellerle entegre çalışan bir mini RAG sistemi kur.",
          "Lokal asistan ile gizlilik dostu bir operasyon akışı tasarla."
        ],
        resources: {
          youtubeSearchTerms: ["Ollama local LLM tutorial", "LM Studio setup guide"],
          docs: ["ollama.com/docs"]
        },
        practiceProjects: [
          "Lokalde çalışan ve kendi markdown notlarını okuyan bir bilgi asistanı kur.",
          "Quantized model kullanarak lokal veri işleme scripti yaz."
        ],
        completionProof: [
          "Ollama/LM Studio bilgisayarda aktif.",
          "Lokal modelle çalışan küçük bilgi asistanı başarıyla çalıştırıldı."
        ],
        ifAlreadyKnown: [
          "Lokal modellerde inference hızını artıracak donanım optimizasyonlarını (VRAM allocation, CPU threads) uygula."
        ],
        defaultStatus: "not_started",
        priority: "now"
      },
      {
        id: "lora-model-customization",
        title: "LoRA & Model Customization",
        technicalName: "LoRA Training (Flux / SDXL)",
        type: "technical",
        shortDescription: "LoRA mantığı, dataset hazırlığı, stil ve karakter tutarlılığı.",
        whyLearn: "AI ile görsel üretimde en büyük sorun tutarlılıktır. LoRA eğitimleri Grafikcem tarzını ve karakterlerini AI modellerine kalıcı öğretmenin tek yoludur.",
        relevanceToCem: "Grafikcem portfolyo stilinde veya Cem'in kendi çizim tarzında Flux/SDXL LoRA modeli eğiterek tutarlı kreatif üretimi sağlamak.",
        howToLearn: [
          "LoRA (Low-Rank Adaptation) çalışma mantığını öğren.",
          "Stil veya karakter tutarlılığı için en az 20 yüksek çözünürlüklü görselden oluşan dataset hazırla.",
          "Dataset için captioning (tagging) yapısını kur (Kohya_ss veya fal.ai).",
          "Eğitilen LoRA'yı görsel üretim asistanına bağlayıp test et."
        ],
        resources: {
          youtubeSearchTerms: ["Flux LoRA training tutorial", "Kohya_ss dataset preparation"],
          courseSearchTerms: ["stable diffusion lora customization", "flux character consistency training"]
        },
        practiceProjects: [
          "Kendi çizim veya görsel tarzını içeren 25 görseli etiketleyip bir stil LoRA'sı eğit.",
          "Kendi yüzünden veya bir karakterden tutarlı görseller üreten LoRA deneyi yap."
        ],
        completionProof: [
          "Dataset başarıyla hazırlanıp etiketlendi.",
          "Stil/karakter tutarlılığı deneyi tamamlandı ve karar ağacı dokümante edildi."
        ],
        ifAlreadyKnown: [
          "Eğittiğin LoRA modelini Civitai veya Hugging Face üzerinde yayınlayarak topluluk geri bildirimi al."
        ],
        defaultStatus: "not_started",
        priority: "now"
      },
      {
        id: "ml-fundamentals-builders",
        title: "ML Fundamentals for Builders",
        technicalName: "Embeddings, Vector Search & RAG",
        type: "technical",
        shortDescription: "Embedding, vector search, inference, fine-tuning ve model değerlendirmesi (evals).",
        whyLearn: "Sadece prompt yazmak yetmez. Vector veritabanlarını, embedding modellerini ve fine-tuning sınırlarını bilmek gerçek bir 'AI Builder' profili çizer.",
        relevanceToCem: "Feed The Goat veya NewsAI uygulamalarına semantic search ve gelişmiş RAG altyapısı kurarak akıllı asistan yeteneklerini güçlendirmek.",
        howToLearn: [
          "Embedding ve Cosine Similarity (vektör benzerliği) teorisini öğren.",
          "Supabase pgvector veya Pinecone ile vektör veritabanı yapısını anla.",
          "Model inference ve fine-tuning farklarını kavra.",
          "AI çıktılarının doğruluğunu ölçmek için basit bir evaluation (değerlendirme) scripti yaz."
        ],
        resources: {
          youtubeSearchTerms: ["vector databases explained for beginners", "embeddings and RAG tutorial"],
          docs: ["supabase.com/docs/guides/ai"]
        },
        practiceProjects: [
          "Feed The Goat içindeki notlar veya günlükler üzerinde semantic search (vektör arama) deneyi yap.",
          "Küçük bir RAG pipeline'ı kurup model yanıt doğruluğunu test et."
        ],
        completionProof: [
          "Embedding ve vektör arama mantığı anlaşıldı.",
          "Feed The Goat içinde semantic search veya mini RAG deneyi başarıyla tamamlandı."
        ],
        ifAlreadyKnown: [
          "RAG sistemine hybrid search (semantic + full-text search) entegre edip doğruluğu ölç."
        ],
        defaultStatus: "not_started",
        priority: "now"
      }
    ]
  }
]

export function getActiveSkills(level: CareerLevel): CareerSkill[] {
  return level.skills.filter(s => s.priority !== "archive")
}

export function getArchivedSkills(level: CareerLevel): CareerSkill[] {
  return level.skills.filter(s => s.priority === "archive")
}

export function getAllArchivedSkills(): Array<{
  skill: CareerSkill
  levelNumber: number
  levelTitle: string
}> {
  return CAREER_ROADMAP.flatMap(level =>
    getArchivedSkills(level).map(skill => ({
      skill,
      levelNumber: level.levelNumber,
      levelTitle: level.title,
    }))
  )
}
