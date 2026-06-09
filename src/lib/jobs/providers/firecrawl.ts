// Türkiye pazarı provider'ı — DİREKT HTTP fetch + deterministik HTML detay-URL parse.
// (Dosya adı tarihsel: eskiden Firecrawl scrape+LLM-extract kullanıyordu. Firecrawl
//  LinkedIn'i blokluyor [403 "we do not support this site"] ve kariyer.net'te boş
//  dönüyordu; ayrıca LLM-extract board ARAMA başlıklarını tek öğe çıkarıyordu. Artık
//  hedefleri tarayıcı-benzeri header ile direkt fetch edip HTML'deki TEKİL ilan detay
//  anchor'larını [LinkedIn /jobs/view/<id>, kariyer.net /is-ilani/<slug>] regex'le süzeriz.)
//
// Best-effort: anti-bot/boş sayfa durumunda [] döner (asla throw). API key gerekmez.
import 'server-only'
import type { RawJob } from '../types'

const FETCH_TIMEOUT_MS = 20_000
const MAX_TITLE_LEN = 200
// LinkedIn guest endpoint UA + dil header'ı olmadan boş/blok döner; kariyer.net UA ister.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// Bir TR scrape hedefi: TEKİL ilan detay linkleri içeren bir sayfa + o sayfadaki
// detay linklerini eşleyen pattern. Deterministik — LLM yok.
export interface TrTarget {
  // Direkt fetch edilecek sayfa. LinkedIn guest job-cards fragment'ı veya kariyer.net
  // arama sayfası — her ikisi de server-render HTML'de çoklu tekil detay linki barındırır.
  url: string
  // Detay ilan URL'ini eşleyen regex. group[1] = dedup için stabil id (sayısal job id
  // veya slug). Eşleşmeyen linkler (kategori/filtre/reklam/navigasyon) elenir.
  detailRe: RegExp
  // Detay URL host allowlist (SSRF + yanlış-katman koruması).
  hostRe: RegExp
  // LinkedIn slug'ı `<title>-at-<company>-<id>` formatında → company'yi slug'dan ayır.
  splitAtCompany?: boolean
  // Anchor iç metni TÜM kartı sarıyorsa (kariyer.net: "Sponsorlu İlan ... update 3 gün")
  // başlığı anchor yerine slug'dan türet — daha temiz, rol-keyword içerir.
  titleFromSlug?: boolean
  // Anchor metni yoksa fallback şirket etiketi.
  defaultCompany?: string
}

// --- LinkedIn (guest job-cards endpoint) -------------------------------------
// Guest endpoint anti-bot'suz HTML fragment döner; her kart /jobs/view/<id>'e linkler.
const LINKEDIN_DETAIL_RE = /\/jobs\/view\/(?:[^/?#"]*-)?(\d{6,})/i
const LINKEDIN_HOST_RE = /(^|\.)linkedin\.com$/i
const LINKEDIN_LOCATION = 'Istanbul, Turkey'

export function linkedinGuestTarget(keyword: string): TrTarget {
  const url =
    'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search' +
    `?keywords=${encodeURIComponent(keyword)}` +
    `&location=${encodeURIComponent(LINKEDIN_LOCATION)}` +
    '&start=0'
  return { url, detailRe: LINKEDIN_DETAIL_RE, hostRe: LINKEDIN_HOST_RE, splitAtCompany: true }
}

// --- kariyer.net (arama sayfası → /is-ilani/<slug> detay anchor'ları) ---------
const KARIYER_DETAIL_RE = /\/is-ilani\/([a-z0-9-]+)/i
const KARIYER_HOST_RE = /(^|\.)kariyer\.net$/i

export function kariyerTarget(searchUrl: string): TrTarget {
  // kariyer.net anchor metni tüm kart chrome'unu içerir → başlığı slug'dan türet.
  return { url: searchUrl, detailRe: KARIYER_DETAIL_RE, hostRe: KARIYER_HOST_RE, titleFromSlug: true }
}

// HTML inner metnini temizle: etiket sök, birkaç entity çöz, boşluk daralt.
function cleanText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Slug'ı insan-okunur başlığa çevir: tire→boşluk, baş harf büyüt, sondaki sayısal id at.
function humanize(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// Detay URL pathname'inden başlık (+ opsiyonel company) türet. Anchor metni yoksa fallback.
function deriveFromSlug(pathname: string, splitAtCompany: boolean): { title: string; company: string } {
  const seg = pathname.split('/').filter(Boolean).pop() ?? ''
  let slug = seg.replace(/-\d{4,}$/, '') // sondaki job id'yi at
  let company = ''
  if (splitAtCompany) {
    const parts = slug.split(/-at-/i)
    if (parts.length >= 2 && parts[0] && parts[1]) {
      slug = parts[0]
      company = humanize(parts[1])
    }
  }
  return { title: humanize(slug) || 'İlan', company }
}

// Ham HTML'den tekil ilanları çıkarır. Saf — vitest için (ağ yok).
// 1) <a href=... >metin</a> taraması → id→anchor başlığı (ilk boş-olmayan kazanır).
// 2) tüm href="..." taraması → id→canonical URL (query/tracking strip).
// 3) her tekil id için: başlık = anchor metni ?? slug'dan türetilmiş.
export function extractDetailJobs(html: string, target: TrTarget): RawJob[] {
  if (typeof html !== 'string' || !html) return []

  const canonicalById = new Map<string, string>() // id → origin+pathname
  const titleById = new Map<string, string>() // id → anchor metni

  const resolve = (href: string): { id: string; canonical: string } | null => {
    const match = href.match(target.detailRe)
    if (!match) return null
    let parsed: URL
    try {
      parsed = new URL(href, target.url) // göreceli href'leri sayfaya göre çöz
    } catch {
      return null
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    if (!target.hostRe.test(parsed.hostname)) return null
    return { id: match[1] || `${parsed.hostname}${parsed.pathname}`, canonical: `${parsed.origin}${parsed.pathname}` }
  }

  // 1) anchor'lar — href + iç metin.
  const anchorRe = /<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = anchorRe.exec(html)) !== null) {
    const resolved = resolve(m[1])
    if (!resolved) continue
    if (!canonicalById.has(resolved.id)) canonicalById.set(resolved.id, resolved.canonical)
    const text = cleanText(m[2])
    if (text && !titleById.has(resolved.id)) titleById.set(resolved.id, text)
  }

  // 2) anchor dışı kalan detay href'leri (ör. data attribute / script) — id'yi kaçırma.
  const hrefRe = /\bhref="([^"]*)"/gi
  while ((m = hrefRe.exec(html)) !== null) {
    const resolved = resolve(m[1])
    if (resolved && !canonicalById.has(resolved.id)) canonicalById.set(resolved.id, resolved.canonical)
  }

  const out: RawJob[] = []
  for (const [id, canonical] of canonicalById) {
    let pathname = ''
    try {
      pathname = new URL(canonical).pathname
    } catch {
      continue
    }
    const derived = deriveFromSlug(pathname, Boolean(target.splitAtCompany))
    const anchorTitle = target.titleFromSlug ? '' : titleById.get(id)
    const title = (anchorTitle || derived.title).slice(0, MAX_TITLE_LEN)
    const company = (target.defaultCompany || derived.company || '').slice(0, MAX_TITLE_LEN)
    out.push({
      title,
      url: canonical,
      company,
      location: 'Türkiye',
      source: 'firecrawl',
      remote: /\bremote\b|uzaktan/i.test(`${title} ${company}`),
      description: null,
      employmentType: null,
      postedAt: null,
      sourceJobId: id,
    })
  }
  return out
}

// Tek bir TR hedefini direkt fetch edip tekil ilanları HTML pattern-parse eder.
// Hata/blok/timeout durumunda [] döner (asla throw).
export async function fetchTrJobs(target: TrTarget): Promise<RawJob[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(target.url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
      },
    })
    if (!res.ok) {
      console.warn(`[jobs] TR fetch başarısız (HTTP ${res.status}): ${target.url}`)
      return []
    }
    const html = await res.text()
    return extractDetailJobs(html, target)
  } catch (error) {
    console.warn('[jobs] TR fetch hatası:', error instanceof Error ? error.message : error)
    return []
  } finally {
    clearTimeout(timer)
  }
}
