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
}

export function passesTitle(title: string): boolean {
  const t = title.toLowerCase()
  if (DENY.some((kw) => t.includes(kw))) return false
  return ALLOW.some((kw) => t.includes(kw))
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
    return { ok: false, reason: 'eksik başlık/url' }
  }
  if (!passesTitle(job.title)) {
    return { ok: false, reason: 'başlık rol filtresine uymuyor' }
  }
  if (!passesLocation(job.location ?? '', Boolean(job.remote))) {
    return { ok: false, reason: 'konum uygun değil (yurt dışı, remote değil)' }
  }
  return { ok: true }
}
