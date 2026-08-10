// KARİYER ROTASI — dört aylık üretim sırası.
//
// Kaynak: `grafikcem-kariyer-mufredati-ve-agencyos-lead-stratejisi.md` (30 Temmuz
// 2026) §4 + `Kalıcı Becerilerde Kalacaklar.txt` (kullanıcı kararı).
//
// ─────────────────────────────────────────────────────────────────────────────
// BU DOSYA NEYİ DEĞİŞTİRİYOR
//
// `careerRoadmap.ts` bir BECERİ KATALOĞUdur: 45+ kart, 67 kaynak linki, hangi
// beceriyi ne zaman öğreneceğine dair bir sıra yok. O katalog silinmiyor — ama
// ana ekranın omurgası olmaktan çıkıyor.
//
// Omurga artık bu dosya: dört ay, her ayın TEK ana çıktısı, o çıktının KANITI
// ve bir sonraki ayı açan BAĞIMLILIK. Kullanıcı beceri değil, kariyer çıktısı
// seçer.
//
// ─────────────────────────────────────────────────────────────────────────────
// KAPI KURALI
//
// Bir sonraki ay, yalnız önceki ayın kanıt kapısı GERÇEKTEN doğrulanmış
// kanıtla karşılandığında açılır. Manuel "Tamamlandı" tıklaması tek başına
// yetmez — sahte tamamlanma, kariyer planını süs haline getirir.

/** Kuzey yıldızı — dışarıya satılan tek ve anlaşılır kimlik. */
export const NORTH_STAR = {
  identity: 'AI destekli kreatif ve dijital ürün sistemleri tasarlayan Creative Technologist / Product & Automation Builder',
  sequence: 'Grafik tasarım ve içerik → UX/product → web/front-end → otomasyon ve AI sistemleri',
  /** Dışarıya dağınık beceri listesi sunulmaz; tek sonuç satılır. */
  positioning:
    'Tek ve anlaşılır bir sonuç satılır; içeride tasarım, motion, UX, web, veri, otomasyon ve AI birlikte kullanılır.',
} as const

/** Haftalık gerçek kapasite — 12-14 saat. GrafikcemOS gerçekleşeni sağlar. */
export const WEEKLY_CAPACITY = {
  product: 6, // gerçek ürün veya proje üretimi
  education: 3, // yapılandırılmış eğitim
  discovery: 3, // discovery, lead ve satış çalışması
  english: 2, // İngilizce
} as const

export const WEEKLY_CAPACITY_TOTAL =
  WEEKLY_CAPACITY.product + WEEKLY_CAPACITY.education + WEEKLY_CAPACITY.discovery + WEEKLY_CAPACITY.english

export type EvidenceKind =
  | 'published_page'
  | 'git_commit'
  | 'pr'
  | 'design_system'
  | 'user_test_notes'
  | 'demo_recording'
  | 'measurement'
  | 'lead_flow'
  | 'eval_result'
  | 'client_approval'
  | 'case_study'
  | 'publication'

export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  published_page: 'Yayındaki sayfa',
  git_commit: 'Git commit',
  pr: 'Pull request',
  design_system: 'Tasarım sistemi',
  user_test_notes: 'Kullanıcı testi notları',
  demo_recording: 'Demo kaydı',
  measurement: 'Ölçüm ekranı',
  lead_flow: 'Lead akışı',
  eval_result: 'Eval sonucu',
  client_approval: 'Müşteri onayı',
  case_study: 'Vaka çalışması',
  publication: 'Yayın bağlantısı',
}

export interface EvidenceRequirement {
  readonly id: string
  readonly title: string
  /** Kabul edilen kanıt türleri. Dosya yüklemek TEK seçenek değildir. */
  readonly acceptedKinds: readonly EvidenceKind[]
  /** Kanıtın neyi ispatlaması gerektiği — tek cümle, ölçülebilir. */
  readonly proves: string
}

export interface CareerMonth {
  readonly id: 'month-1' | 'month-2' | 'month-3' | 'month-4'
  readonly order: 1 | 2 | 3 | 4
  readonly title: string
  /** Ayın TEK ana çıktısı. Haftalık kilometre taşları buna hizmet eder. */
  readonly primaryOutcome: string
  readonly learningFocus: readonly string[]
  readonly evidenceRequirements: readonly EvidenceRequirement[]
  /** Bu ayın açılması için karşılanması gereken önceki kanıtlar. */
  readonly dependsOnEvidence: readonly string[]
  /** Ayın haftalık kilometre taşları — sırayla tek ana teslim. */
  readonly weeklyMilestones: readonly string[]
  /** En fazla ÜÇ bağlamsal kaynak. Kaynak sayısı bir başarı ölçüsü değildir. */
  readonly resources: readonly { readonly title: string; readonly url: string; readonly free: boolean }[]
}

export const CAREER_MONTHS: readonly CareerMonth[] = [
  {
    id: 'month-1',
    order: 1,
    title: 'UX ve web temeli',
    primaryOutcome:
      'Grafikcem Creative için iki dilli, ölçümü kurulmuş bir landing page yayında',
    learningFocus: [
      'HTML/CSS ve responsive yapı',
      'Git',
      'UI düzeni ve component mantığı',
      'UX görüşmesi ve kullanılabilirlik testi',
    ],
    evidenceRequirements: [
      {
        id: 'm1-landing',
        title: 'İki dilli, ölçümlenebilir landing page',
        acceptedKinds: ['published_page', 'measurement'],
        proves: 'Yayında bir sayfa var ve üzerinde çalışan bir olay/ölçüm kurulu.',
      },
      {
        id: 'm1-design-system',
        title: 'Yeniden kullanılabilir küçük design system',
        acceptedKinds: ['design_system', 'published_page', 'git_commit'],
        proves: 'Token ve component kararları tek yerde tanımlı ve tekrar kullanılmış.',
      },
      {
        id: 'm1-user-tests',
        title: 'Beş kullanıcıyla test ve bulgu raporu',
        acceptedKinds: ['user_test_notes'],
        proves: 'Beş gerçek kullanıcının davranışı gözlenmiş ve bulgular yazılmış.',
      },
    ],
    dependsOnEvidence: [],
    weeklyMilestones: [
      'Landing page bilgi mimarisi ve iki dilli içerik iskeleti',
      'Responsive düzen + token/component kararları',
      'Ölçüm kurulumu ve yayına alma',
      'Beş kullanıcı testi ve bulgu raporu',
    ],
    resources: [
      { title: 'Skillcamp/Patika Başlangıç Frontend Patikası', url: 'https://www.skillcamp.dev/paths/baslangic-seviye-frontend-web-development-patikasi/', free: true },
      { title: 'Figma Learn — kurslar ve design systems', url: 'https://help.figma.com/hc/en-us/categories/23557013073047-Courses-tutorials-projects', free: true },
      { title: 'W3C Digital Accessibility Foundations', url: 'https://www.w3.org/WAI/courses/foundations-course/', free: true },
    ],
  },
  {
    id: 'month-2',
    order: 2,
    title: 'JavaScript/TypeScript ve React/Next',
    primaryOutcome:
      'AgencyOS lead inceleme ekranı: kaynak, skor, kanıt ve insan onay kapısı çalışır durumda',
    learningFocus: [
      'DOM ve async JavaScript',
      'TypeScript temel tipleri',
      'React component, props, state',
      'Next.js App Router, form, server action ve hata durumları',
    ],
    evidenceRequirements: [
      {
        id: 'm2-lead-review',
        title: 'Lead inceleme ekranı',
        acceptedKinds: ['published_page', 'git_commit', 'pr', 'demo_recording'],
        proves: 'Ekran gerçek veriyle çalışıyor ve kaynak/skor/kanıt üçlüsünü gösteriyor.',
      },
      {
        id: 'm2-approval-gate',
        title: 'İnsan onay kapısı',
        acceptedKinds: ['git_commit', 'pr', 'demo_recording'],
        proves: 'Onaysız gönderim yapısal olarak imkânsız.',
      },
      {
        id: 'm2-accessible-ui',
        title: 'Erişilebilir ve responsive üretim arayüzü',
        acceptedKinds: ['published_page', 'measurement', 'user_test_notes'],
        proves: 'Klavye erişimi, odak görünürlüğü ve dar ekran gerçek tarayıcıda doğrulanmış.',
      },
    ],
    dependsOnEvidence: ['m1-landing', 'm1-design-system'],
    weeklyMilestones: [
      'TypeScript ve React temelleriyle ilk bileşen katmanı',
      'Lead listesi + kaynak/skor/kanıt görünümü',
      'İnsan onay kapısı ve hata durumları',
      'Erişilebilirlik ve responsive doğrulama',
    ],
    resources: [
      { title: 'Next.js Learn', url: 'https://nextjs.org/learn', free: true },
      { title: 'React Learn', url: 'https://react.dev/learn', free: true },
      { title: 'TypeScript Handbook', url: 'https://www.typescriptlang.org/docs/handbook/intro.html', free: true },
    ],
  },
  {
    id: 'month-3',
    order: 3,
    title: 'API, veri ve otomasyon',
    primaryOutcome:
      'Public kaynaklardan gelen lead’i normalize eden, dedupe eden ve insan kontrollü kuyruğa alan akış',
    learningFocus: [
      'HTTP, REST, JSON, webhook, auth',
      'SQL, Postgres, Supabase ve RLS',
      'n8n/Make: trigger, node, mapping, error handling',
    ],
    evidenceRequirements: [
      {
        id: 'm3-normalization',
        title: 'Lead normalizasyon akışı',
        acceptedKinds: ['lead_flow', 'git_commit', 'demo_recording'],
        proves: 'Ham kaynak veri kanonik şemaya deterministik biçimde iniyor.',
      },
      {
        id: 'm3-dedupe',
        title: 'Dedupe ve provenance',
        acceptedKinds: ['lead_flow', 'git_commit', 'measurement'],
        proves: 'Aynı şirket ikinci kez eklenmiyor ve her kaydın kaynağı görünür.',
      },
      {
        id: 'm3-queue',
        title: 'İnsan kontrollü outreach kuyruğu',
        acceptedKinds: ['demo_recording', 'git_commit', 'published_page'],
        proves: 'Onaysız hiçbir mesaj kuyruktan çıkmıyor.',
      },
    ],
    dependsOnEvidence: ['m2-lead-review', 'm2-approval-gate'],
    weeklyMilestones: [
      'HTTP/JSON/webhook temelleri ve ilk entegrasyon',
      'SQL/Postgres veri modeli ve RLS',
      'Normalizasyon + dedupe akışı',
      'İnsan kontrollü kuyruk ve hata yönetimi',
    ],
    resources: [
      { title: 'Supabase + Next.js Quickstart', url: 'https://supabase.com/docs/guides/getting-started/quickstarts/nextjs', free: true },
      { title: 'Supabase Row Level Security', url: 'https://supabase.com/docs/guides/database/postgres/row-level-security', free: true },
      { title: 'n8n Academy (N8N101→103)', url: 'https://learn.n8n.io/courses', free: true },
    ],
  },
  {
    id: 'month-4',
    order: 4,
    title: 'Güvenilir AI iş akışı ve ajan',
    primaryOutcome:
      'Tek bir gerçek müşteri problemi için pilot + yayımlanabilir vaka çalışması',
    learningFocus: [
      'Agent gerektiren ile deterministic otomasyonla çözülebilen işi ayırma',
      'Structured output, tool use, RAG, eval, fallback',
      'KVKK, prompt injection, secret ve erişim sınırları',
    ],
    evidenceRequirements: [
      {
        id: 'm4-pilot',
        title: 'Gerçek müşteri pilotu',
        acceptedKinds: ['client_approval', 'demo_recording', 'measurement'],
        proves: 'Bir müşteri gerçek bir problemi için sistemi kullandı.',
      },
      {
        id: 'm4-evals',
        title: '20-50 örneklik eval seti',
        acceptedKinds: ['eval_result', 'git_commit'],
        proves: 'Kalite ölçülebilir ve regresyon yakalanabilir.',
      },
      {
        id: 'm4-case',
        title: 'Yayımlanabilir vaka çalışması',
        acceptedKinds: ['case_study', 'publication', 'client_approval'],
        proves: 'Problem, baseline, çözüm, sonuç ve öğrenim müşteri izniyle yayımlanabilir.',
      },
    ],
    dependsOnEvidence: ['m3-normalization', 'm3-queue'],
    weeklyMilestones: [
      'Pilot kapsamı ve baseline ölçümü',
      'Structured output + fallback ve insan devri',
      'Eval seti ve hata senaryoları',
      'Vaka çalışması ve yayın izni',
    ],
    resources: [
      { title: 'OpenAI — A Practical Guide to Building Agents', url: 'https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/', free: true },
      { title: 'OWASP LLM Top 10', url: 'https://owasp.org/www-project-top-10-for-large-language-model-applications/', free: true },
      { title: 'KVKK — Üretken Yapay Zekâ ve Kişisel Verilerin Korunması', url: 'https://www.kvkk.gov.tr/Icerik/8547/uretken-yapay-zeka-ve-kisisel-verilerin-korunmasi-rehberi-15-soruda', free: true },
    ],
  },
]

/**
 * SÜREKLİ ŞERİTLER — aya bağlı değil, rotanın tamamı boyunca işler.
 *
 * Bunlar "tamamlanabilir kart" DEĞİLDİR. Kart yapmak, kapatılabilir bir kutu
 * üretir; oysa bunların değeri sürekliliktedir. Bu yüzden ilerleme yüzdesi
 * değil, KANIT SIKLIĞI ile ölçülürler.
 */
export interface ContinuousLane {
  readonly id: string
  readonly title: string
  readonly cadence: string
  readonly weeklyHours: number
  readonly proofCadence: string
  /** Bu şerit bir bağımlılığı BLOKE ediyorsa gerekçesi. */
  readonly blocker?: string
}

export const CONTINUOUS_LANES: readonly ContinuousLane[] = [
  {
    id: 'english',
    title: 'İngilizce ve global iş iletişimi',
    cadence: 'Her gün 20-30 dk teknik doküman + 5 cümle özet',
    weeklyHours: WEEKLY_CAPACITY.english,
    proofCadence: 'Haftada bir İngilizce vaka paragrafı',
    blocker:
      'A1 seviyesi global müşteri, teknik dokümantasyon ve ürün satışı için gerçek darboğaz. ' +
      'BTK A1→A2→B1→B2 sırası izlenir; Business English B1 sonrasıdır.',
  },
  {
    id: 'discovery',
    title: 'Müşteri discovery ve satış',
    cadence: 'Haftada 3 saat: görüşme, lead araştırması, teklif hazırlığı',
    weeklyHours: WEEKLY_CAPACITY.discovery,
    proofCadence: 'Ayda 10 görüşme; görüş değil geçmiş davranış kanıtı',
  },
  {
    id: 'continuous-learning',
    title: 'Uyum sağlama ve sürekli öğrenme',
    cadence: 'Rotanın işletim biçimi — ayrı bir ders değil',
    weeklyHours: 0,
    proofCadence: 'Her ayın kanıt kapısı bunun kendisidir',
  },
]

export function getMonth(id: string | null | undefined): CareerMonth | null {
  if (!id) return null
  return CAREER_MONTHS.find((m) => m.id === id) ?? null
}

/** Tüm kanıt gereksinimleri, düz liste. */
export const ALL_EVIDENCE_REQUIREMENTS: readonly EvidenceRequirement[] = CAREER_MONTHS.flatMap(
  (m) => m.evidenceRequirements,
)

export function getEvidenceRequirement(id: string): EvidenceRequirement | null {
  return ALL_EVIDENCE_REQUIREMENTS.find((r) => r.id === id) ?? null
}
