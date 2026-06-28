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

// İsimli + tıklanır kaynak. Belirsiz arama terimi yerine doğrudan eriştirir.
export type CareerResourceKind = "course" | "youtube" | "channel" | "doc" | "book" | "tool"

export interface CareerResourceLink {
  title: string
  url: string
  kind?: CareerResourceKind
  free?: boolean
  note?: string
}

export interface CareerSkillResource {
  courseSearchTerms?: string[]
  youtubeSearchTerms?: string[]
  docs?: string[]
  savedCoursesNote?: string
  links?: CareerResourceLink[]
}

// Becerinin ham içeriği (kategori-bağımsız). Eski "CareerSkill" şekli.
export interface BaseSkill {
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

// Üst gruplama: 2 ana kart. "level" kavramı ikincil etikete (originLevel) düştü.
export type SkillCategory = "kalici" | "teknik"
export type TeknikSubgroup = "kreatif" | "ai_kaldirac" | "yazilim_temeli"

// UI'ın gördüğü zenginleştirilmiş beceri. category/subgroup/order build adımında eklenir.
export interface CareerSkill extends BaseSkill {
  category: SkillCategory
  subgroup?: TeknikSubgroup
  order?: number
  originLevel?: number
}

// Ham içerik kaynağı — yalnızca dosya-içi. UI bu yapıyı görmez (level demote edildi).
interface RawLevel {
  id: string
  levelNumber: number
  title: string
  subtitle: string
  description: string
  skills: BaseSkill[]
}

// ── HAM KAYNAK (dosya-içi) ───────────────────────────────────────────────────
// Tüm beceri içerikleri burada birebir korunur. Gruplama/timing aşağıdaki
// ENRICHMENT haritasıyla türetilir — içeriklere dokunulmaz.
const RAW_LEVELS: RawLevel[] = [
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
          links: [
            { title: "School of Motion", url: "https://www.schoolofmotion.com", kind: "course", free: false, note: "Mentor destekli, sektör standardı motion eğitimi (Animation Bootcamp)." },
            { title: "Motion Design School — Motion Beast", url: "https://motiondesign.school/products/motion-beast", kind: "course", free: false, note: "Daha ucuz, proje bazlı başlangıç. AE temellerini hızlı geçer." },
            { title: "Hasancan Keleş (YouTube)", url: "https://www.youtube.com/@hasancankeles", kind: "youtube", free: true, note: "Türkçe AE — kayıtlı eğitim. Modül modül bitir." },
          ],
          courseSearchTerms: ["Hasancan Keleş After Effects", "Adobe After Effects motion design Türkçe"],
          youtubeSearchTerms: ["After Effects motion design beginner", "After Effects reels tutorial"],
          savedCoursesNote: "Hasancan Keleş eğitimi kayıtlı. Amaç: AI video çıktısını polish'lemek, tam motion-designer olmak değil.",
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
          links: [
            { title: "Adobe — Premiere Pro Tutorials", url: "https://helpx.adobe.com/premiere-pro/tutorials.html", kind: "doc", free: true, note: "Resmi: sequence, renk, ses miksaj, export — modüler." },
            { title: "Hasancan Keleş (YouTube)", url: "https://www.youtube.com/@hasancankeles", kind: "youtube", free: true, note: "Türkçe kurgu — kesme, ritim, ses sync." },
          ],
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
          links: [
            { title: "Nick St. Pierre (Maven)", url: "https://maven.com/nick-st-pierre", kind: "course", free: false, note: "Sektörün en çok atıf alan Midjourney uzmanı. 'Additive Prompting' framework'ü." },
            { title: "Theoretically Media (YouTube)", url: "https://www.youtube.com/@TheoreticallyMedia", kind: "youtube", free: true, note: "Runway/Veo/Kling/Luma — prodüksiyonda ne işe yarar, ne hype." },
            { title: "Curious Refuge", url: "https://www.curiousrefuge.com", kind: "course", free: false, note: "En prestijli AI filmmaking okulu (Advanced AI Filmmaking)." },
            { title: "Midjourney Docs", url: "https://docs.midjourney.com", kind: "doc", free: true },
          ],
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
          links: [
            { title: "Meta Blueprint", url: "https://www.facebook.com/business/learn", kind: "course", free: true, note: "Reklam metrikleri (CTR/CPM/ROAS) resmi ücretsiz eğitim." },
            { title: "Google Skillshop", url: "https://skillshop.exceedlms.com", kind: "course", free: true, note: "Google Ads ölçümleme temelleri." },
          ],
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
          links: [
            { title: "Refactoring UI", url: "https://www.refactoringui.com", kind: "book", free: false, note: "Tasarımcı/builder için en pratik görsel hiyerarşi + tipografi kaynağı." },
          ],
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
          links: [
            { title: "Supabase Docs — RLS & API Keys", url: "https://supabase.com/docs/guides/database/postgres/row-level-security", kind: "doc", free: true, note: "KRİTİK güvenlik: service_role sadece server-side, her tabloda RLS. Geçmiş key sızıntının dersi." },
            { title: "Anthropic — MCP / Claude kursu", url: "https://anthropic.skilljar.com", kind: "course", free: true, note: "Claude skills yaptın — en doğal uzantın." },
            { title: "Vercel Docs", url: "https://vercel.com/docs", kind: "doc", free: true },
          ],
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
          links: [
            { title: "Building a Second Brain — Tiago Forte", url: "https://www.buildingasecondbrain.com", kind: "book", free: false, note: "Öğrenme + not sistemi." },
            { title: "Ali Abdaal (YouTube)", url: "https://www.youtube.com/@aliabdaal", kind: "youtube", free: true, note: "Öğrenmeyi öğrenme, sistem kurma." },
          ],
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
          links: [
            { title: "Steal Like an Artist — Austin Kleon", url: "https://austinkleon.com/steal/", kind: "book", free: false, note: "Özgün fikir + ilham disiplini." },
            { title: "IDEO — Design Kit", url: "https://www.designkit.org/methods", kind: "doc", free: true, note: "Yaratıcı yöntemler / lateral düşünme." },
          ],
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
      {
        id: "web-literacy",
        title: "Web Okuryazarlığı (HTML/CSS/JS + Git)",
        technicalName: "Web Literacy & Version Control",
        type: "technical",
        shortDescription:
          "Ürettiğin arayüzün nasıl çalıştığını anlamak: HTML/CSS/JS temeli + Git/GitHub rutini.",
        whyLearn:
          "Vibecoding'i 'şans eseri çalışan' olmaktan çıkarıp kontrol edebildiğin üretime çevirir. Kodun nasıl çalıştığını anlamadan ürettiğin şeyi onaramazsın.",
        relevanceToCem:
          "Zaten app shipliyorsun ama bazen ne olduğunu anlamadan. Bu katman, AI'ın yazdığı kodu okuyup düzeltebilmeni ve Git ile güvenle çalışmanı sağlar.",
        howToLearn: [
          "MDN Learn Web Development'tan HTML→CSS→JS sırasını takip et.",
          "freeCodeCamp Responsive Web Design sertifikasını bitir.",
          "GitHub Skills ile commit/branch/PR rutinini kur.",
          "Mevcut bir app'ini Git ile branch açıp düzenle, PR ile birleştir.",
        ],
        resources: {
          links: [
            { title: "MDN — Learn Web Development", url: "https://developer.mozilla.org/en-US/docs/Learn", kind: "doc", free: true, note: "Başlangıçtan rahat seviyeye HTML/CSS/JS." },
            { title: "freeCodeCamp — Responsive Web Design", url: "https://www.freecodecamp.org/learn/2022/responsive-web-design/", kind: "course", free: true },
            { title: "GitHub Skills", url: "https://skills.github.com", kind: "course", free: true, note: "Git/GitHub rutinini pratikle kur." },
            { title: "CS50x — Harvard", url: "https://cs50.harvard.edu/x/", kind: "course", free: true, note: "Programlama mantığını sıfırdan istersen." },
          ],
        },
        practiceProjects: [
          "Tek sayfalık responsive landing page'i elde HTML/CSS ile yaz.",
          "Bir app'ini Git branch + PR akışıyla düzenle.",
          "AKTİF GÜVENLİK GÖREVİ: AgencyOS'ta service-role/anon key ve auth açığını kapat — RLS politikalarını ve client-side'da hangi key'in kullanıldığını denetle.",
        ],
        completionProof: [
          "1 responsive sayfa elle kodlandı.",
          "En az 1 branch + PR ile değişiklik birleştirildi.",
        ],
        ifAlreadyKnown: [
          "Bir AI-üretimli component'i baştan sona okuyup açıkla; bir güvenlik/erişilebilirlik hatasını bul ve düzelt.",
        ],
        defaultStatus: "not_started",
        priority: "next",
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
          links: [
            { title: "Google UX Design Certificate", url: "https://www.coursera.org/professional-certificates/google-ux-design", kind: "course", free: false, note: "Senin seviyene: ilk 4 modülü bitir, sonra günlük UX challenge pratiğine geç." },
            { title: "Figma — Resource Library", url: "https://www.figma.com/resource-library/", kind: "course", free: true, note: "Design for beginners + prototyping. Uygulama tarafı." },
          ],
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
          links: [
            { title: "CS50P — Harvard Python", url: "https://cs50.harvard.edu/python/", kind: "course", free: true, note: "Programlama mantığını sıfırdan oturtmak için en sağlam ücretsiz set." },
            { title: "Python for Everybody", url: "https://www.py4e.com", kind: "course", free: true, note: "Daha yumuşak giriş — Dr. Chuck." },
          ],
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
          links: [
            { title: "Curious Refuge — AI Advertising", url: "https://www.curiousrefuge.com", kind: "course", free: false, note: "Ticari AI reklam prodüksiyonu için hedefli kurs." },
            { title: "PJ Ace (Genre.ai) Newsletter", url: "https://pjace.beehiiv.com", kind: "doc", free: true, note: "AI-native reklam ajansı kurucusu — Veo 3 + reklam iş akışları." },
          ],
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
          links: [
            { title: "Mennan Şahin / Diksiyon TV (YouTube)", url: "https://www.youtube.com/@DiksiyonTV", kind: "youtube", free: true, note: "TRT spikeri — İstanbul Türkçesi, nefes, ses tonu. TasarımRotası konuşmandaki alana doğrudan." },
            { title: "TRT Akademi", url: "https://www.trtakademi.net", kind: "course", free: true, note: "Etkili ve Güzel Konuşma sertifikalı program." },
          ],
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
          links: [
            { title: "Profit First — Mike Michalowicz", url: "https://mikemichalowicz.com/profit-first/", kind: "book", free: false, note: "Kreatif işlerde yaygın, nakit-akış basitliği." },
          ],
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
          links: [
            { title: "Building a StoryBrand — Donald Miller", url: "https://storybrand.com", kind: "book", free: false, note: "Marka mesajı netleştirme çerçevesi." },
            { title: "Talk Like TED — Carmine Gallo", url: "https://www.carminegallo.com", kind: "book", free: false, note: "Sunum/pitch klasiği." },
          ],
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
      {
        id: "ux-research-usability",
        title: "UX Araştırma & Kullanılabilirlik",
        technicalName: "UX Research, Usability & IA",
        type: "technical",
        shortDescription:
          "Kullanıcı araştırması, usability test, bilgi mimarisi ve wireframe→prototip akışı — UI/UX'i 'uzmanlık' yapan çekirdek.",
        whyLearn:
          "UI/UX'i sıradan görsel üreticiden ayıran şey güzel ekran değil, doğru kararı veren araştırma + test. İşe alımda en aranan katman bu.",
        relevanceToCem:
          "Feed The Goat ve müşteri ürünlerinde 'neden bu tasarım' sorusuna kanıtla cevap verebilmek seni junior'dan ayırır.",
        howToLearn: [
          "Google UX Certificate'ın ilk 4 modülünü bitir (persona, journey, wireframe, usability).",
          "Figma Learn 'Design for beginners' ile uygulama tarafını pekiştir.",
          "1 üründe 3 kullanıcıyla mini usability testi yap, bulguları dökümante et.",
          "1 vaka çalışmasını problem→karar→sonuç olarak yaz.",
        ],
        resources: {
          links: [
            { title: "Google UX Design Certificate", url: "https://www.coursera.org/professional-certificates/google-ux-design", kind: "course", free: false, note: "İlk 4 modül yeterli, sonra pratiğe geç." },
            { title: "Figma — Design for beginners", url: "https://www.figma.com/resource-library/", kind: "course", free: true },
            { title: "IxDF — User Research", url: "https://www.interaction-design.org/courses", kind: "course", free: false, note: "Daha sistematik ikinci katman." },
            { title: "Nielsen Norman Group", url: "https://www.nngroup.com/articles/", kind: "doc", free: true, note: "Usability'nin otorite kaynağı." },
          ],
        },
        practiceProjects: [
          "1 ürün için kullanıcı akışı + wireframe + hi-fi prototip üret.",
          "3 kişilik usability testi yap, bulgu raporu yaz.",
        ],
        completionProof: [
          "1 uçtan uca vaka çalışması (araştırma→prototip→test) portfolyoda.",
          "1 usability test raporu yazıldı.",
        ],
        ifAlreadyKnown: [
          "Gerçek bir üründe A/B veya tree-test kur, kararı veriyle savun.",
        ],
        defaultStatus: "not_started",
        priority: "now",
      },
      {
        id: "design-systems",
        title: "Tasarım Sistemleri",
        technicalName: "Design Systems",
        type: "technical",
        shortDescription:
          "Token, component ve library mantığı — ölçeklenebilir, tutarlı tasarım üretimi.",
        whyLearn:
          "Figma araştırması 'systems thinking'i işe alımda yükselen beceri sayıyor. Sistem kuran tasarımcı, tek tek ekran çizenden katbekat değerli.",
        relevanceToCem:
          "Hem Figma'da hem kodda (shadcn/Tailwind token) tutarlı sistem kurmak, ajans işlerini ve kendi app'lerini hızlandırır.",
        howToLearn: [
          "Figma Design Systems eğitimini bitir (styles, components, libraries).",
          "Refactoring UI ile görsel hiyerarşi + spacing + renk disiplinini oturt.",
          "1 marka için mini design system kur (renk, tip, buton/form/card state'leri).",
          "Aynı sistemi kodda token olarak eşle (CSS değişkenleri / shadcn).",
        ],
        resources: {
          links: [
            { title: "Figma — Design Systems", url: "https://www.figma.com/resource-library/design-systems/", kind: "course", free: true },
            { title: "Refactoring UI", url: "https://www.refactoringui.com", kind: "book", free: false, note: "Token/hiyerarşi/spacing pratiği." },
            { title: "shadcn/ui", url: "https://ui.shadcn.com", kind: "doc", free: true, note: "Kod tarafında component/token örneği." },
          ],
        },
        practiceProjects: [
          "1 mini design system (renk, tip, spacing, buton/form/card/modal/empty state).",
          "Sistemi koda token olarak eşle.",
        ],
        completionProof: [
          "1 yayınlanmış design system dosyası (Figma + kod token eşlemesi).",
        ],
        ifAlreadyKnown: [
          "Bir ürünün dağınık stillerini tek sisteme konsolide et.",
        ],
        defaultStatus: "not_started",
        priority: "next",
      },
      {
        id: "accessibility-wcag",
        title: "Erişilebilirlik (WCAG 2.2)",
        technicalName: "Web Accessibility / WCAG 2.2",
        type: "technical",
        shortDescription:
          "Klavye, kontrast, ARIA ve WCAG 2.2 ile herkesin kullanabildiği arayüz üretme.",
        whyLearn:
          "Erişilebilirlik sadece etik değil; kalite + iş faydası ve WCAG 2.2 uluslararası standart. Bu farkındalık seni amatörden ayırır, çoğu kurumsal işte zorunlu.",
        relevanceToCem:
          "Müşteri/SaaS işlerinde 'erişilebilir tasarlıyorum' demek hem fark yaratır hem kurumsal kapı açar.",
        howToLearn: [
          "W3C WAI Tutorials ile temel ilkeleri öğren (kontrast, klavye, alt text, form).",
          "MDN Accessibility bölümünü tara.",
          "axe DevTools ile bir sayfayı tara, hataları düzelt.",
          "Bir tasarımı klavye-only ve kontrast ölçütleriyle denetle.",
        ],
        resources: {
          links: [
            { title: "W3C WAI — Tutorials", url: "https://www.w3.org/WAI/tutorials/", kind: "doc", free: true, note: "Erişilebilirliğin resmi kaynağı." },
            { title: "MDN — Accessibility", url: "https://developer.mozilla.org/en-US/docs/Web/Accessibility", kind: "doc", free: true },
            { title: "axe DevTools", url: "https://www.deque.com/axe/devtools/", kind: "tool", free: true, note: "Otomatik erişilebilirlik denetimi." },
          ],
        },
        practiceProjects: [
          "1 sayfayı axe ile denetle, tüm kritik hataları gider.",
          "Bir formu klavye + ekran okuyucu uyumlu hale getir.",
        ],
        completionProof: [
          "1 sayfa WCAG 2.2 AA kontrol listesinden geçti.",
        ],
        ifAlreadyKnown: [
          "Bir design system'e erişilebilirlik kuralları (kontrast token, focus state) göm.",
        ],
        defaultStatus: "not_started",
        priority: "next",
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
      {
        id: "portfolio-case-study",
        title: "Portfolyo & Vaka Anlatımı",
        technicalName: "Portfolio & Case Study Writing",
        type: "technical",
        shortDescription:
          "İşi 'ekran' değil 'çözüm' olarak anlatan, problem→karar→sonuç yapısıyla yazılmış vaka portfolyosu.",
        whyLearn:
          "İşe alım ve müşteri kararı portfolyoyla verilir. Seni 'ekran yapan'dan 'çıktıyı düşünen'e taşıyan şey, işin kendisi değil nasıl anlatıldığı.",
        relevanceToCem:
          "6 yıllık iş var ama dağınık. 3 güçlü vaka (brand+landing, ürün UI/UX, motion/içerik) seni anında aranan yapar.",
        howToLearn: [
          "Her vakada şu soruları yanıtla: problem neydi, neden bu karar, hangi metrik/hipotez, AI'ı nerede kullandın, insan kararı nerede.",
          "3 pakete indir: brand+landing, ürün UI/UX, motion/içerik dağıtımı.",
          "Önce/sonra ve karar gerekçesini görselle göster.",
          "grafikcem.com / portfolyo sayfasında yayınla.",
        ],
        resources: {
          links: [
            { title: "Google UX — Portfolyo modülü", url: "https://www.coursera.org/professional-certificates/google-ux-design", kind: "course", free: false, note: "Vaka çalışması yapısını öğretir." },
            { title: "Refactoring UI", url: "https://www.refactoringui.com", kind: "book", free: false, note: "Vaka görsellerini profesyonel sunmak için." },
          ],
        },
        practiceProjects: [
          "3 vaka çalışması yaz (problem→karar→sonuç).",
          "Portfolyo sayfasını 3 pakete göre yeniden düzenle.",
        ],
        completionProof: [
          "3 yayınlanmış vaka çalışması.",
          "Her vakada en az 1 metrik/hipotez ve AI-rol açıklaması var.",
        ],
        ifAlreadyKnown: [
          "Bir vakayı LinkedIn/içerik formatında dağıt; gelen geri bildirimi ölç.",
        ],
        defaultStatus: "not_started",
        priority: "now",
      },
      {
        id: "product-metrics",
        title: "Ürün Metriği & Dönüşüm Analizi",
        technicalName: "Product Metrics & Conversion Analysis",
        type: "technical",
        shortDescription:
          "Funnel, dönüşüm, retention ve temel ürün metriklerini okuyup tasarım kararına bağlama.",
        whyLearn:
          "AI çağında fark, güzel ekran değil çıktıyı ölçmek. Metrik okuyan tasarımcı 'sanat' değil 'sonuç' satar — ücret primi buradan gelir.",
        relevanceToCem:
          "Performans kreatif ve SaaS işlerinde 'şu tasarım dönüşümü %X artırdı' diyebilmek seni doğrudan aranan yapar.",
        howToLearn: [
          "Temel metrikleri öğren: dönüşüm, funnel, retention, aktivasyon.",
          "Mixpanel/GA4 ile bir üründe 1 funnel kur ve oku.",
          "Bir tasarım değişikliğini metrikle önce/sonra karşılaştır.",
        ],
        resources: {
          links: [
            { title: "Mixpanel — Product Analytics Guide", url: "https://mixpanel.com/blog/", kind: "doc", free: true, note: "Funnel/retention temelleri." },
            { title: "Google Analytics 4 — Yardım", url: "https://support.google.com/analytics", kind: "doc", free: true },
            { title: "Lenny's Newsletter", url: "https://www.lennysnewsletter.com", kind: "doc", free: true, note: "Ürün/growth metrik sezgisi." },
          ],
        },
        practiceProjects: [
          "1 üründe funnel kur, dönüşüm noktalarını raporla.",
          "1 tasarım A/B'sini metrikle değerlendir.",
        ],
        completionProof: [
          "1 funnel raporu yazıldı.",
          "1 tasarım kararı metrikle savunuldu.",
        ],
        ifAlreadyKnown: [
          "Bir portfolyo vakasına gerçek metrik (önce/sonra) ekle.",
        ],
        defaultStatus: "not_started",
        priority: "next",
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
          links: [
            { title: "Never Split the Difference — Chris Voss", url: "https://www.blackswanltd.com", kind: "book", free: false, note: "Taktiksel empati, calibrated questions — retainer pazarlığı." },
            { title: "Gap Selling — Keenan", url: "https://salesgrowth.com", kind: "book", free: false, note: "Müşteri 'gap'ini bulup hizmeti köprü konumlama — discovery + teklif." },
          ],
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
          links: [
            { title: "Anthropic — Introduction to MCP", url: "https://anthropic.skilljar.com", kind: "course", free: true, note: "Python SDK ile MCP server/client; tools/resources/prompts." },
            { title: "modelcontextprotocol.io", url: "https://modelcontextprotocol.io", kind: "doc", free: true, note: "Resmi spec + tutorials." },
          ],
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

// ── TÜRETME MOTORU ───────────────────────────────────────────────────────────
// Ham beceriler düzleştirilir, sonra ENRICHMENT haritasıyla 2-kart modeline
// zenginleştirilir. İçerikler değişmez; yalnızca category/subgroup/order/timing
// eklenir. Tüm skill ID'leri korunduğu için kullanıcı ilerlemesi kayıpsız.

const RAW_WITH_LEVEL: Array<{ skill: BaseSkill; levelNumber: number; levelTitle: string }> =
  RAW_LEVELS.flatMap(level =>
    level.skills.map(skill => ({ skill, levelNumber: level.levelNumber, levelTitle: level.title }))
  )

function typeToCategory(type: CareerSkillType): SkillCategory {
  return type === "technical" ? "teknik" : "kalici"
}

interface Enrichment {
  category: SkillCategory
  subgroup?: TeknikSubgroup
  order: number
  priority: CareerSkillPriority // nihai timing (otoritatif — ham priority'yi ezer)
}

// ONAYLI dağılım tablosu. ŞİMDİ (now) = 4 kalem. Eski "now" olup burada now
// olmayan her kalem "next"e indirildi.
const ENRICHMENT: Record<string, Enrichment> = {
  // KART A — KALICI BECERİLER
  "offer-design-productization": { category: "kalici", order: 1, priority: "now" },
  "continuous-learning": { category: "kalici", order: 2, priority: "now" },
  "branding-theory": { category: "kalici", order: 3, priority: "next" },
  "sales-negotiation": { category: "kalici", order: 4, priority: "next" },
  "retainer-client-management": { category: "kalici", order: 5, priority: "next" },
  "financial-literacy": { category: "kalici", order: 6, priority: "next" },
  "product-metrics": { category: "kalici", order: 7, priority: "next" },
  "public-speaking": { category: "kalici", order: 8, priority: "next" },
  "outreach-networking": { category: "kalici", order: 9, priority: "next" },
  "vibe-marketing": { category: "kalici", order: 10, priority: "next" },
  "portfolio-case-study": { category: "kalici", order: 11, priority: "next" },
  "diction-voice": { category: "kalici", order: 12, priority: "next" },
  "paid-community": { category: "kalici", order: 13, priority: "next" },
  "education-leadership": { category: "kalici", order: 14, priority: "next" },
  "digital-literacy": { category: "kalici", order: 15, priority: "next" },
  "creative-ops-package": { category: "kalici", order: 16, priority: "next" },
  "storytelling": { category: "kalici", order: 17, priority: "later" },
  "creative-thinking": { category: "kalici", order: 18, priority: "later" },
  "legal-literacy": { category: "kalici", order: 19, priority: "later" },
  "talent-management": { category: "kalici", order: 20, priority: "later" },
  "systems-thinking": { category: "kalici", order: 21, priority: "later" },

  // KART B1 — Kreatif & Ürün Üretimi
  "after-effects-motion": { category: "teknik", subgroup: "kreatif", order: 1, priority: "next" },
  "premiere-pro": { category: "teknik", subgroup: "kreatif", order: 2, priority: "next" },
  "photoshop-editorial": { category: "teknik", subgroup: "kreatif", order: 3, priority: "next" },
  "uiux-specialization": { category: "teknik", subgroup: "kreatif", order: 4, priority: "next" },
  "ux-research-usability": { category: "teknik", subgroup: "kreatif", order: 5, priority: "next" },
  "design-systems": { category: "teknik", subgroup: "kreatif", order: 6, priority: "next" },
  "accessibility-wcag": { category: "teknik", subgroup: "kreatif", order: 7, priority: "next" },
  "3d-basics": { category: "teknik", subgroup: "kreatif", order: 8, priority: "next" },
  "color-visual-identity": { category: "teknik", subgroup: "kreatif", order: 9, priority: "next" },

  // KART B2 — AI Kaldıracı
  "ai-ad-ugc-creative": { category: "teknik", subgroup: "ai_kaldirac", order: 1, priority: "now" },
  "ai-visual-direction": { category: "teknik", subgroup: "ai_kaldirac", order: 2, priority: "next" },
  "performance-creative-reading": { category: "teknik", subgroup: "ai_kaldirac", order: 3, priority: "next" },
  "distribution-content-engine": { category: "teknik", subgroup: "ai_kaldirac", order: 4, priority: "next" },
  "mcp-tool-ecosystem": { category: "teknik", subgroup: "ai_kaldirac", order: 5, priority: "next" },
  "local-model-operations": { category: "teknik", subgroup: "ai_kaldirac", order: 6, priority: "next" },
  "lora-model-customization": { category: "teknik", subgroup: "ai_kaldirac", order: 7, priority: "next" },
  "ml-fundamentals-builders": { category: "teknik", subgroup: "ai_kaldirac", order: 8, priority: "next" },
  "python-ai-workflow": { category: "teknik", subgroup: "ai_kaldirac", order: 9, priority: "next" },

  // KART B3 — Yazılım Temeli (sıralı yol; Adım 1 = web-literacy, şimdi)
  "web-literacy": { category: "teknik", subgroup: "yazilim_temeli", order: 1, priority: "now" },
}

// YENİ B3 becerileri (sıralı öğrenme yolu, Adım 2-6). İçerik yeni yazıldı.
const NEW_B3_SKILLS: CareerSkill[] = [
  {
    id: "js-ts-fundamentals",
    title: "JavaScript / TypeScript Temelleri",
    technicalName: "JavaScript & TypeScript Fundamentals",
    type: "technical",
    category: "teknik",
    subgroup: "yazilim_temeli",
    order: 2,
    shortDescription:
      "Değişken, fonksiyon, async/await ve temel tipler — AI'ın yazdığı kodu OKUYABİLMEK için JS/TS okuryazarlığı.",
    whyLearn:
      "Vibecoding'de kilitlenmenin asıl sebebi kodu okuyamamak. JS'in temel akışını ve TS tiplerini bilmek, 'neden hata veriyor' sorusunu tahminden bilgiye çevirir.",
    relevanceToCem:
      "AgencyOS ve Feed The Goat zaten TypeScript. Bu adım, AI'ın ürettiği fonksiyonu satır satır okuyup 'burası null olabilir' diyebilmeni sağlar — düzeltmeyi sana bırakır, AI'a değil.",
    howToLearn: [
      "javascript.info'dan değişkenler → fonksiyonlar → diziler/objeler → async/await sırasını takip et.",
      "Promise ve async/await'i ayrı çalış: 'await ne bekliyor, hata nereye düşüyor'.",
      "TypeScript Handbook'tan temel tipleri öğren: string/number/boolean, union, interface, optional (?).",
      "AgencyOS'ta bir server action'ı aç, her satırın tipini kendi kelimelerinle açıkla.",
    ],
    resources: {
      links: [
        { title: "javascript.info", url: "https://javascript.info", kind: "doc", free: true, note: "Modern JS'in en net ücretsiz kaynağı — sırayla git." },
        { title: "TypeScript Handbook", url: "https://www.typescriptlang.org/docs/handbook/intro.html", kind: "doc", free: true, note: "Temel tipler + everyday types bölümleri yeterli." },
        { title: "MDN — JavaScript Guide", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide", kind: "doc", free: true },
      ],
      youtubeSearchTerms: ["JavaScript async await explained", "TypeScript basics for beginners"],
    },
    practiceProjects: [
      "Bir API'den veri çekip işleyen 30-40 satırlık bir async fonksiyon yaz, tiplerini elle ekle.",
      "AgencyOS'taki gevşek tipli (any) bir yeri bul, doğru tiple değiştir.",
    ],
    completionProof: [
      "async/await akışını ve hata yakalamayı bir örnekle anlatabiliyorsun.",
      "Bir TS dosyasındaki tipleri okuyup ne ifade ettiklerini açıklayabiliyorsun.",
    ],
    ifAlreadyKnown: [
      "AgencyOS'ta tipi zayıf bir modülü güçlü tiplere geçir (union/guard ekle).",
    ],
    defaultStatus: "not_started",
    priority: "next",
  },
  {
    id: "react-nextjs-fundamentals",
    title: "React + Next.js Temelleri",
    technicalName: "React & Next.js App Router Fundamentals",
    type: "technical",
    category: "teknik",
    subgroup: "yazilim_temeli",
    order: 3,
    shortDescription:
      "Component, props/state, server vs client component ve App Router — ürettiğin app'in iskeletini anlamak.",
    whyLearn:
      "AgencyOS ve diğer app'lerin tamamı React + Next.js App Router. Component'in nasıl render olduğunu ve 'use client' sınırını bilmeden hata ayıklamak körlemesine olur.",
    relevanceToCem:
      "Zaten Next.js app shipliyorsun. Bu adım 'bu dosya neden client, bu neden server', 'state neden güncellenmiyor' gibi günlük takıldığın yerleri çözer.",
    howToLearn: [
      "React docs'tan 'Describing the UI' + 'Adding Interactivity' (state, event) bölümlerini bitir.",
      "Props ile state farkını netleştir: veri yukarıdan mı geliyor, component mi tutuyor.",
      "Next.js docs'tan Server vs Client Components ve App Router routing'i oku.",
      "AgencyOS'ta bir Server Component ile bir Client Component'i karşılaştır, farkı yaz.",
    ],
    resources: {
      links: [
        { title: "React — Learn", url: "https://react.dev/learn", kind: "doc", free: true, note: "Resmi, interaktif. State ve props burada oturur." },
        { title: "Next.js — App Router Docs", url: "https://nextjs.org/docs/app", kind: "doc", free: true, note: "Server/Client component sınırı + routing." },
      ],
      youtubeSearchTerms: ["React useState explained", "Next.js server vs client components"],
    },
    practiceProjects: [
      "Tek bir sayfada props alan + kendi state'ini tutan küçük bir component ağacı kur.",
      "AgencyOS'ta bir client component'i izole edip neden 'use client' gerektiğini açıkla.",
    ],
    completionProof: [
      "Server ve Client Component farkını kendi app'inden örnekle anlatabiliyorsun.",
      "Bir component'in neden yeniden render olduğunu takip edebiliyorsun.",
    ],
    ifAlreadyKnown: [
      "Prop drilling olan bir yeri context veya bileşim (composition) ile sadeleştir.",
    ],
    defaultStatus: "not_started",
    priority: "next",
  },
  {
    id: "debugging-skills",
    title: "Hata Ayıklama (Debugging)",
    technicalName: "Debugging: Console, Network, Stack Traces",
    type: "technical",
    category: "teknik",
    subgroup: "yazilim_temeli",
    order: 4,
    shortDescription:
      "Console, network sekmesi, stack trace okuma ve hatayı izole etme — 'neden çalışmıyor'ı sistematik çözmek.",
    whyLearn:
      "Hata ayıklama, AI'a sınırsız 'düzelt' demek yerine sorunu kendin daraltabilmektir. Stack trace okuyabilen kişi dakikalarda, okuyamayan saatlerce takılır.",
    relevanceToCem:
      "AgencyOS'ta bir şey patladığında AI'a tüm dosyayı atmak yerine, 'şu satırda şu hata' diyebilmek hem hızlı hem ucuz. Bağımsızlığını artırır.",
    howToLearn: [
      "Chrome DevTools'ta Console + Network sekmelerini tanı: hangi istek attı, ne döndü, status kodu ne.",
      "Bir stack trace'i yukarıdan aşağı oku: hata hangi dosyada, hangi satırda başladı.",
      "Hatayı izole et: bölerek-küçülterek sorunlu parçayı bul.",
      "console.log yerine breakpoint kullanmayı dene.",
    ],
    resources: {
      links: [
        { title: "Chrome DevTools — Docs", url: "https://developer.chrome.com/docs/devtools", kind: "doc", free: true, note: "Console, Network, Sources (breakpoint) resmi rehber." },
        { title: "MDN — What went wrong? Debugging JS", url: "https://developer.mozilla.org/en-US/docs/Learn/JavaScript/First_steps/What_went_wrong", kind: "doc", free: true },
      ],
      youtubeSearchTerms: ["Chrome DevTools debugging tutorial", "how to read a stack trace"],
    },
    practiceProjects: [
      "AgencyOS'ta gerçek bir hatayı sadece DevTools + stack trace ile bulup düzelt (AI'sız).",
      "Bir network isteğinin neden 4xx/5xx döndüğünü Network sekmesinden teşhis et.",
    ],
    completionProof: [
      "Bir stack trace'i okuyup hatanın kaynağını işaret edebiliyorsun.",
      "En az 1 bug'ı yardımsız izole edip çözdün.",
    ],
    ifAlreadyKnown: [
      "Tekrar eden bir hata sınıfı için küçük bir kontrol listesi / guard ekle.",
    ],
    defaultStatus: "not_started",
    priority: "later",
  },
  {
    id: "sql-supabase-fundamentals",
    title: "SQL + Supabase Temelleri",
    technicalName: "SQL, RLS & Supabase Security",
    type: "technical",
    category: "teknik",
    subgroup: "yazilim_temeli",
    order: 5,
    shortDescription:
      "Tablo/sorgu mantığı, RLS politikaları ve service-role vs anon key farkı — veri katmanının GÜVENLİĞİ.",
    whyLearn:
      "AgencyOS verisi Supabase'de. RLS'i ve hangi key'in nerede kullanıldığını bilmemek, geçmişte yaşadığın key sızıntısı gibi gerçek güvenlik açıkları doğurur.",
    relevanceToCem:
      "Doğrudan kritik: service_role yalnızca server-side kalmalı, her tabloda RLS açık olmalı. Bu adım AgencyOS'taki auth/anahtar açığını kendi başına denetleyip kapatmanı sağlar.",
    howToLearn: [
      "Temel SQL: SELECT/INSERT/UPDATE/DELETE ve WHERE/JOIN mantığını öğren.",
      "Supabase'de Row Level Security (RLS) nedir, policy nasıl yazılır — resmi rehberi oku.",
      "anon key ile service_role key farkını netleştir: hangisi client'a gider, hangisi ASLA gitmez.",
      "AgencyOS tablolarını gez: her birinde RLS açık mı, policy auth tabanlı mı denetle.",
    ],
    resources: {
      links: [
        { title: "Supabase — Row Level Security", url: "https://supabase.com/docs/guides/database/postgres/row-level-security", kind: "doc", free: true, note: "KRİTİK: service_role server-only, her tabloda RLS." },
        { title: "Supabase — API Keys", url: "https://supabase.com/docs/guides/api/api-keys", kind: "doc", free: true, note: "anon vs service_role — nerede kullanılır." },
        { title: "SQLBolt — Interactive SQL", url: "https://sqlbolt.com", kind: "course", free: true, note: "Sıfırdan interaktif SQL pratiği." },
      ],
      docs: ["supabase.com/docs/guides/database"],
    },
    practiceProjects: [
      "Bir tabloya RLS açıp auth tabanlı bir policy yaz, anon key ile erişimi test et.",
      "AgencyOS'ta service_role'ün client'a sızmadığını ve tüm tabloların RLS'li olduğunu denetle.",
    ],
    completionProof: [
      "anon vs service_role farkını ve nerede kullanıldığını açıklayabiliyorsun.",
      "En az 1 tabloya çalışan bir RLS policy yazdın.",
    ],
    ifAlreadyKnown: [
      "AgencyOS'taki tüm tablolar için RLS denetim listesi çıkar, eksikleri kapat.",
    ],
    defaultStatus: "not_started",
    priority: "later",
  },
  {
    id: "api-auth-fundamentals",
    title: "API & Auth Temelleri",
    technicalName: "REST, Env/Secrets & Endpoint Security",
    type: "technical",
    category: "teknik",
    subgroup: "yazilim_temeli",
    order: 6,
    shortDescription:
      "REST mantığı, env/secret yönetimi ve endpoint güvenliği — dış dünyayla konuşan katmanı güvenle kurmak.",
    whyLearn:
      "App'lerin çoğu API çağrısı + auth üstüne kurulu. Secret'ı env'de tutmak, endpoint'i doğrulamak ve input'u doğrulamak bilinmezse veri sızar veya kötüye kullanılır.",
    relevanceToCem:
      "AgencyOS API route'ları ve 3. parti entegrasyonlar (Telegram, Gemini, Supabase) bu temele dayanıyor. Hangi anahtarın NEXT_PUBLIC olabileceğini, hangisinin asla olamayacağını bilmek şart.",
    howToLearn: [
      "REST temelleri: GET/POST/PUT/DELETE, status kodları (2xx/4xx/5xx), header/body.",
      "Env/secret yönetimi: .env, NEXT_PUBLIC_ öneki neyi client'a açar, neyi açmaz.",
      "Endpoint güvenliği: her route'ta auth kontrolü, input doğrulama (zod), rate limit mantığı.",
      "AgencyOS'ta bir API route aç: auth var mı, input doğrulanıyor mu, secret nasıl okunuyor.",
    ],
    resources: {
      links: [
        { title: "MDN — HTTP Overview", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview", kind: "doc", free: true, note: "REST/HTTP temelleri." },
        { title: "Next.js — Route Handlers", url: "https://nextjs.org/docs/app/building-application/routing/route-handlers", kind: "doc", free: true, note: "App Router API endpoint'leri." },
        { title: "OWASP API Security Top 10", url: "https://owasp.org/API-Security/editions/2023/en/0x11-t10/", kind: "doc", free: true, note: "Endpoint güvenliğinde en sık 10 hata." },
        { title: "Zod", url: "https://zod.dev", kind: "doc", free: true, note: "Input doğrulama için şema." },
      ],
    },
    practiceProjects: [
      "Auth + zod doğrulamalı küçük bir API route yaz; geçersiz input'u net hata ile reddet.",
      "AgencyOS'taki bir endpoint'in auth ve input doğrulamasını denetle, eksikse ekle.",
    ],
    completionProof: [
      "Bir endpoint'i auth + input doğrulama ile güvene aldın.",
      "Hangi env değişkeninin client'a açık (NEXT_PUBLIC) olabileceğini açıklayabiliyorsun.",
    ],
    ifAlreadyKnown: [
      "AgencyOS API route'ları için bir güvenlik kontrol listesi (auth, validation, rate limit) çıkar.",
    ],
    defaultStatus: "not_started",
    priority: "later",
  },
]

// Ham becerileri zenginleştir (yalnızca ENRICHMENT'te olanlar = kart-içi 40 kalem).
const ENRICHED_EXISTING: CareerSkill[] = RAW_WITH_LEVEL
  .filter(({ skill }) => ENRICHMENT[skill.id] !== undefined)
  .map(({ skill, levelNumber }) => {
    const e = ENRICHMENT[skill.id]
    return {
      ...skill,
      priority: e.priority,
      category: e.category,
      subgroup: e.subgroup,
      order: e.order,
      originLevel: levelNumber,
    }
  })

// 2 ana kartın içindeki tüm beceriler (45 = 40 mevcut + 5 yeni B3).
export const CAREER_SKILLS: CareerSkill[] = [...ENRICHED_EXISTING, ...NEW_B3_SKILLS]

// Fiziksel Kariyer Sigortası — ayrı stratejik/ileride blok (dokunulmaz).
export const STRATEGIC_INSURANCE_SKILLS: CareerSkill[] = RAW_WITH_LEVEL
  .filter(({ levelNumber }) => levelNumber === 6)
  .map(({ skill, levelNumber }, i) => ({
    ...skill,
    category: typeToCategory(skill.type),
    order: i + 1,
    originLevel: levelNumber,
  }))

// Backlog / Projeler — beceri değil. youtube-channel buraya taşındı.
export interface BacklogProject {
  id: string
  title: string
  note: string
  url?: string
}

export const BACKLOG_PROJECTS: BacklogProject[] = [
  {
    id: "youtube-channel",
    title: "YouTube Profesyonel Kanal",
    note:
      "Yapay zeka, tasarım ve teknoloji üzerine içerik kanalı. Bu bir beceri değil, proje/kanal — yol haritasında değil, backlog'da bekliyor.",
  },
]

// Arşiv — şekil korunur (ArchivedCareerItems aynı sözleşmeyi kullanır).
const ARCHIVED: Array<{ skill: CareerSkill; levelNumber: number; levelTitle: string }> = RAW_WITH_LEVEL
  .filter(({ skill }) => skill.priority === "archive")
  .map(({ skill, levelNumber, levelTitle }) => ({
    skill: { ...skill, category: typeToCategory(skill.type), originLevel: levelNumber },
    levelNumber,
    levelTitle,
  }))

// ── SELECTORLAR ──────────────────────────────────────────────────────────────
const PRIORITY_RANK: Record<CareerSkillPriority, number> = { now: 0, next: 1, later: 2, archive: 3 }

function sortSkills(a: CareerSkill, b: CareerSkill): number {
  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  if (byPriority !== 0) return byPriority
  return (a.order ?? 99) - (b.order ?? 99)
}

export function getSkillById(id: string): CareerSkill | undefined {
  return CAREER_SKILLS.find(s => s.id === id) ?? STRATEGIC_INSURANCE_SKILLS.find(s => s.id === id)
}

export function getKaliciSkills(): CareerSkill[] {
  return CAREER_SKILLS.filter(s => s.category === "kalici").sort(sortSkills)
}

export function getTeknikSkills(subgroup: TeknikSubgroup): CareerSkill[] {
  return CAREER_SKILLS.filter(s => s.category === "teknik" && s.subgroup === subgroup).sort(sortSkills)
}

export function getAllActiveSkills(): CareerSkill[] {
  return CAREER_SKILLS.slice().sort(sortSkills)
}

export function getNowSkills(): CareerSkill[] {
  return getAllActiveSkills().filter(s => s.priority === "now")
}

export function getAllArchivedSkills(): Array<{
  skill: CareerSkill
  levelNumber: number
  levelTitle: string
}> {
  return ARCHIVED
}
