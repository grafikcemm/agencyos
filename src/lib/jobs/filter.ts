// Deterministik ön-filtre — LLM'e gitmeden önce alakasız/şüpheli ilanları eler.
// career-ops portals.yml title/location filtre mantığının portu. Saf fonksiyon.
import type { RawJob } from './types'

// Başlık EN AZ birini içermeli (operatörün rol/uzmanlık alanı).
const ALLOW = [
  'tasarım', 'tasarimci', 'designer', 'design',
  'grafik', 'graphic',
  'sosyal medya', 'social media',
  'art director', 'sanat yönetmeni', 'kreatif', 'creative',
  'ui', 'ux', 'ui/ux', 'arayüz',
  'motion', 'animasyon', 'animation',
  'görsel', 'visual', 'brand', 'marka',
  'içerik', 'content',
]

// Başlık bunlardan birini içeriyorsa elenir (alakasız roller + scam kalıpları).
const DENY = [
  'backend', 'back-end', 'frontend developer', 'full stack', 'fullstack',
  'yazılım mühendisi', 'software engineer', 'devops', 'data engineer',
  'satış', 'sales', 'muhasebe', 'accountant', 'avukat', 'lawyer',
  'çağrı merkezi', 'call center', 'kurye', 'şoför', 'driver',
  'evden para', 'kolay para', 'ek gelir', 'günlük ödeme', 'work from home easy',
  'stajyer ararız ücretsiz', 'gönüllü',
]

// Konum kabul: İstanbul, remote/uzaktan, ya da boş (downstream netleştirir).
// Yurt dışı zorunlu (remote değil) ise ele.
const LOCATION_ALLOW = /istanbul|i̇stanbul|remote|uzaktan|hybrid|türkiye|turkey|anywhere/i
const FOREIGN_HINT = /\b(usa|united states|germany|deutschland|london|uk|india|berlin|amsterdam|paris|dubai)\b/i

export interface FilterResult {
  ok: boolean
  reason?: string
  /** Makine tarafından sayılabilir eleme nedeni — telemetri için. */
  code?: FilterRejectCode
  /** DENY ile elendiyse HANGİ kelimeyle. Kör kural kaldırmayı önler. */
  matchedKeyword?: string
}

export type FilterRejectCode =
  | 'missing_fields'
  | 'deny_keyword'
  | 'no_allow_keyword'
  | 'location_foreign'

/**
 * ELEME NEDENİ TELEMETRİSİ — neden var.
 *
 * `/kariyer` 0 ilan gösteriyordu ve nedenini söylemiyordu. İki ihtimal vardı:
 * tarama hiç koşmadı, ya da koştu ve her şey elendi. Ekran ikisini ayırt
 * edemiyordu.
 *
 * DENY listesinden `frontend developer` / `software engineer` gibi terimleri
 * DOĞRUDAN KALDIRMAK cazip görünüyor (Cem'in yeni rotası Creative Technologist
 * / Product & Automation Builder), ama ölçmeden kaldırmak alakasız ilan selini
 * açar. Önce HANGİ kuralın KAÇ ilanı eledigini sayıyoruz; karar ölçümden sonra.
 */
export function classifyTitle(title: string): FilterResult {
  const t = title.toLowerCase()
  const denied = DENY.find((kw) => t.includes(kw))
  if (denied) {
    return { ok: false, reason: 'başlık DENY kelimesi içeriyor', code: 'deny_keyword', matchedKeyword: denied }
  }
  const allowed = ALLOW.find((kw) => t.includes(kw))
  if (!allowed) {
    return { ok: false, reason: 'başlıkta ALLOW kelimesi yok', code: 'no_allow_keyword' }
  }
  return { ok: true, matchedKeyword: allowed }
}

export function passesTitle(title: string): boolean {
  return classifyTitle(title).ok
}

export function passesLocation(location: string, remote: boolean): boolean {
  if (remote) return true
  const loc = (location || '').trim()
  if (!loc) return true // belirsiz → geç, LLM/operatör değerlendirsin
  if (LOCATION_ALLOW.test(loc)) return true
  if (FOREIGN_HINT.test(loc)) return false
  return true // diğer TR şehirleri vb. → geçir (skor downstream düşürür)
}

export function passesFilter(job: RawJob): FilterResult {
  if (!job.title?.trim() || !job.url?.trim()) {
    return { ok: false, reason: 'eksik başlık/url', code: 'missing_fields' }
  }
  const title = classifyTitle(job.title)
  if (!title.ok) return title

  if (!passesLocation(job.location ?? '', Boolean(job.remote))) {
    return {
      ok: false,
      reason: 'konum uygun değil (yurt dışı, remote değil)',
      code: 'location_foreign',
    }
  }
  return { ok: true, matchedKeyword: title.matchedKeyword }
}

/** Bir tarama koşusunun eleme dökümü. Sıfır ilan ile bozuk taramayı ayırır. */
export interface RejectionBreakdown {
  byCode: Record<FilterRejectCode, number>
  /** En çok eleyen DENY kelimeleri — kural değiştirmeden önce okunur. */
  topDenyKeywords: { keyword: string; count: number }[]
  totalRejected: number
}

export function summarizeRejections(results: FilterResult[]): RejectionBreakdown {
  const byCode: Record<FilterRejectCode, number> = {
    missing_fields: 0,
    deny_keyword: 0,
    no_allow_keyword: 0,
    location_foreign: 0,
  }
  const denyCounts = new Map<string, number>()

  for (const r of results) {
    if (r.ok || !r.code) continue
    byCode[r.code] += 1
    if (r.code === 'deny_keyword' && r.matchedKeyword) {
      denyCounts.set(r.matchedKeyword, (denyCounts.get(r.matchedKeyword) ?? 0) + 1)
    }
  }

  const topDenyKeywords = [...denyCounts.entries()]
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))

  return {
    byCode,
    topDenyKeywords,
    totalRejected: Object.values(byCode).reduce((s, n) => s + n, 0),
  }
}
