// Uluslararası ATS provider'ları — career-ops `providers/*.mjs` modüllerinin TS portu.
// Hepsi public JSON/markdown endpoint'lerine vurur; API key gerektirmez. Her provider
// host-allowlist + HTTPS zorunluluğu ile SSRF'e karşı korunur. fetch() RawJob[] döner.
//
// Parse fonksiyonları (mapGreenhouseJobs, parseWorkableMarkdown, ...) saf ve export
// edilmiştir — vitest altında ağ olmadan test edilir.
import type { AtsFetch, JobHttp, RawJob } from '../types'

interface AtsProvider {
  id: string
  fetch: AtsFetch
}

function isRemote(location: string): boolean {
  return /\bremote\b|uzaktan|hybrid/i.test(location)
}

// --- Greenhouse ---------------------------------------------------------------
const GREENHOUSE_HOSTS = new Set([
  'boards-api.greenhouse.io',
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'job-boards.eu.greenhouse.io',
])

function assertHost(label: string, url: string, allowed: Set<string>): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`${label}: geçersiz URL: ${url}`)
  }
  if (parsed.protocol !== 'https:') throw new Error(`${label}: URL HTTPS olmalı: ${url}`)
  if (!allowed.has(parsed.hostname)) {
    throw new Error(`${label}: güvenilmeyen host "${parsed.hostname}"`)
  }
  return url
}

function greenhouseApiUrl(careersUrl: string): string | null {
  const match = careersUrl.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/)
  if (match) return `https://boards-api.greenhouse.io/v1/boards/${match[1]}/jobs`
  const slug = careersUrl.match(/greenhouse\.io\/([^/?#]+)/)
  return slug ? `https://boards-api.greenhouse.io/v1/boards/${slug[1]}/jobs` : null
}

export function mapGreenhouseJobs(json: unknown, company: string): RawJob[] {
  const jobs = Array.isArray((json as { jobs?: unknown[] })?.jobs)
    ? (json as { jobs: Record<string, unknown>[] }).jobs
    : []
  return jobs
    .filter((j) => typeof j.absolute_url === 'string')
    .map((j) => {
      const location = ((j.location as { name?: string })?.name as string) ?? ''
      return {
        title: (j.title as string) ?? '',
        url: j.absolute_url as string,
        company,
        location,
        source: 'greenhouse',
        sourceJobId: j.id != null ? String(j.id) : undefined,
        remote: isRemote(location),
        postedAt: (j.updated_at as string) ?? null,
      }
    })
}

const greenhouseProvider: AtsProvider = {
  id: 'greenhouse',
  async fetch(entry, http) {
    const apiUrl = greenhouseApiUrl(entry.careersUrl)
    if (!apiUrl) throw new Error(`greenhouse: API URL türetilemedi: ${entry.name}`)
    assertHost('greenhouse', apiUrl, GREENHOUSE_HOSTS)
    const json = await http.fetchJson(apiUrl, { redirect: 'error' })
    return mapGreenhouseJobs(json, entry.name)
  },
}

// --- Lever --------------------------------------------------------------------
export function mapLeverJobs(json: unknown, company: string): RawJob[] {
  if (!Array.isArray(json)) return []
  return (json as Record<string, unknown>[]).map((j) => {
    const location = ((j.categories as { location?: string })?.location as string) ?? ''
    return {
      title: (j.text as string) ?? '',
      url: (j.hostedUrl as string) ?? '',
      company,
      location,
      source: 'lever',
      sourceJobId: j.id != null ? String(j.id) : undefined,
      remote: isRemote(location),
      postedAt: j.createdAt ? new Date(Number(j.createdAt)).toISOString() : null,
    }
  }).filter((j) => j.url)
}

const leverProvider: AtsProvider = {
  id: 'lever',
  async fetch(entry, http) {
    const match = entry.careersUrl.match(/jobs\.lever\.co\/([^/?#]+)/)
    if (!match) throw new Error(`lever: API URL türetilemedi: ${entry.name}`)
    const apiUrl = `https://api.lever.co/v0/postings/${match[1]}`
    assertHost('lever', apiUrl, new Set(['api.lever.co']))
    const json = await http.fetchJson(apiUrl, { redirect: 'error' })
    return mapLeverJobs(json, entry.name)
  },
}

// --- Ashby --------------------------------------------------------------------
const ASHBY_TIMEOUT_MS = 30_000

export function mapAshbyJobs(json: unknown, company: string): RawJob[] {
  const jobs = Array.isArray((json as { jobs?: unknown[] })?.jobs)
    ? (json as { jobs: Record<string, unknown>[] }).jobs
    : []
  return jobs.map((j) => {
    const location = (j.location as string) ?? ''
    return {
      title: (j.title as string) ?? '',
      url: (j.jobUrl as string) ?? '',
      company,
      location,
      source: 'ashby',
      sourceJobId: j.id != null ? String(j.id) : undefined,
      remote: Boolean(j.isRemote) || isRemote(location),
      postedAt: (j.publishedAt as string) ?? null,
    }
  }).filter((j) => j.url)
}

const ashbyProvider: AtsProvider = {
  id: 'ashby',
  async fetch(entry, http) {
    const match = entry.careersUrl.match(/jobs\.ashbyhq\.com\/([^/?#]+)/)
    if (!match) throw new Error(`ashby: API URL türetilemedi: ${entry.name}`)
    const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${match[1]}?includeCompensation=true`
    assertHost('ashby', apiUrl, new Set(['api.ashbyhq.com']))
    const json = await http.fetchJson(apiUrl, { timeoutMs: ASHBY_TIMEOUT_MS })
    return mapAshbyJobs(json, entry.name)
  },
}

// --- Workable (markdown feed) -------------------------------------------------
export function parseWorkableMarkdown(text: string, company: string): RawJob[] {
  if (typeof text !== 'string') return []
  const jobs: RawJob[] = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('|') || !line.includes('[View]')) continue
    const cols = line.split('|').map((c) => c.trim())
    if (cols.length < 8) continue
    const title = cols[1]
    if (!title || title === 'Title') continue
    const location = cols[3] || ''
    const urlMatch = line.match(/\[View\]\(([^)]+)\)/)
    let url = urlMatch ? urlMatch[1] : ''
    if (url.endsWith('.md')) url = url.slice(0, -3)
    if (!url) continue
    try {
      const parsedUrl = new URL(url)
      if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'apply.workable.com') continue
      url = parsedUrl.href
    } catch {
      continue
    }
    jobs.push({ title, url, location, company, source: 'workable', remote: isRemote(location) })
  }
  return jobs
}

const workableProvider: AtsProvider = {
  id: 'workable',
  async fetch(entry, http) {
    let parsed: URL
    try {
      parsed = new URL(entry.careersUrl)
    } catch {
      throw new Error(`workable: geçersiz careers URL: ${entry.name}`)
    }
    if (parsed.hostname !== 'apply.workable.com') throw new Error(`workable: host beklenmedik: ${entry.name}`)
    const slug = parsed.pathname.split('/').filter(Boolean)[0]
    if (!slug) throw new Error(`workable: slug yok: ${entry.name}`)
    const feedUrl = `https://apply.workable.com/${slug}/jobs.md`
    assertHost('workable', feedUrl, new Set(['apply.workable.com']))
    const text = await http.fetchText(feedUrl, { redirect: 'error' })
    return parseWorkableMarkdown(text, entry.name)
  },
}

// --- Recruitee ----------------------------------------------------------------
const RECRUITEE_HOST_RE = /^[a-z0-9][a-z0-9-]*\.recruitee\.com$/

export function parseRecruiteeResponse(json: unknown, company: string): RawJob[] {
  const offers = (json as { offers?: unknown[] })?.offers
  if (!Array.isArray(offers)) return []
  return (offers as Record<string, unknown>[]).map((j) => {
    const city = (j.city as string) || ''
    const country = (j.country as string) || ''
    const remoteFlag = Boolean(j.remote)
    const location =
      (j.location as string) || [city, country, remoteFlag ? 'Remote' : ''].filter(Boolean).join(', ')
    let url = ''
    const rawUrl = (j.careers_url as string) || (j.url as string) || ''
    if (typeof rawUrl === 'string' && rawUrl) {
      try {
        const parsed = new URL(rawUrl)
        if (parsed.protocol === 'https:' && RECRUITEE_HOST_RE.test(parsed.hostname)) url = parsed.href
      } catch {
        /* malformed → '' */
      }
    }
    return {
      title: (j.title as string) ?? '',
      url,
      location,
      company,
      source: 'recruitee',
      sourceJobId: j.id != null ? String(j.id) : undefined,
      remote: remoteFlag || isRemote(location),
    }
  }).filter((j) => j.url)
}

const recruiteeProvider: AtsProvider = {
  id: 'recruitee',
  async fetch(entry, http) {
    let parsed: URL
    try {
      parsed = new URL(entry.careersUrl)
    } catch {
      throw new Error(`recruitee: geçersiz careers URL: ${entry.name}`)
    }
    if (!RECRUITEE_HOST_RE.test(parsed.hostname)) throw new Error(`recruitee: host beklenmedik: ${entry.name}`)
    const apiUrl = `https://${parsed.hostname}/api/offers/`
    const json = await http.fetchJson(apiUrl, { redirect: 'error' })
    return parseRecruiteeResponse(json, entry.name)
  },
}

// --- SmartRecruiters (paginated) ----------------------------------------------
const SR_PAGE_SIZE = 100
const SR_MAX_PAGES = 10 // career-ops 50; cron time-box için 10'a indirildi
const SR_CAREERS_HOSTS = new Set(['careers.smartrecruiters.com', 'jobs.smartrecruiters.com'])

export function parseSmartRecruitersResponse(json: unknown, company: string): RawJob[] {
  const items = (json as { content?: unknown[] })?.content
  if (!Array.isArray(items)) return []
  return (items as Record<string, unknown>[]).map((j) => {
    const loc = (j.location as Record<string, unknown>) || {}
    const fullLocation =
      (loc.fullLocation as string) ||
      [loc.city, loc.region, loc.country].filter(Boolean).join(', ')
    const remoteFlag = Boolean(loc.remote)
    const location = [fullLocation, remoteFlag ? 'Remote' : ''].filter(Boolean).join(', ')
    let url = ''
    if (typeof j.ref === 'string') {
      try {
        const parsedRef = new URL(j.ref)
        if (
          parsedRef.protocol === 'https:' &&
          parsedRef.hostname === 'api.smartrecruiters.com' &&
          parsedRef.pathname.startsWith('/v1/companies/')
        ) {
          url = `https://jobs.smartrecruiters.com/${parsedRef.pathname.slice('/v1/companies/'.length)}`
        }
      } catch {
        /* ignore */
      }
    }
    return {
      title: (j.name as string) ?? '',
      url,
      location,
      company,
      source: 'smartrecruiters',
      sourceJobId: j.id != null ? String(j.id) : undefined,
      remote: remoteFlag || isRemote(location),
    }
  }).filter((j) => j.url)
}

const smartRecruitersProvider: AtsProvider = {
  id: 'smartrecruiters',
  async fetch(entry, http) {
    let parsed: URL
    try {
      parsed = new URL(entry.careersUrl)
    } catch {
      throw new Error(`smartrecruiters: geçersiz careers URL: ${entry.name}`)
    }
    if (!SR_CAREERS_HOSTS.has(parsed.hostname)) throw new Error(`smartrecruiters: host beklenmedik: ${entry.name}`)
    const slug = parsed.pathname.split('/').filter(Boolean)[0]
    if (!slug) throw new Error(`smartrecruiters: slug yok: ${entry.name}`)

    const all: RawJob[] = []
    for (let page = 0; page < SR_MAX_PAGES; page++) {
      const apiUrl = `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=${SR_PAGE_SIZE}&offset=${page * SR_PAGE_SIZE}&status=PUBLIC`
      assertHost('smartrecruiters', apiUrl, new Set(['api.smartrecruiters.com']))
      const json = await http.fetchJson(apiUrl, { redirect: 'error' })
      const parsedJobs = parseSmartRecruitersResponse(json, entry.name)
      if (parsedJobs.length === 0) break
      all.push(...parsedJobs)
      if (parsedJobs.length < SR_PAGE_SIZE) break
    }
    return all
  },
}

export const ATS_PROVIDERS: Record<string, AtsProvider> = {
  greenhouse: greenhouseProvider,
  lever: leverProvider,
  ashby: ashbyProvider,
  workable: workableProvider,
  recruitee: recruiteeProvider,
  smartrecruiters: smartRecruitersProvider,
}

export type { AtsProvider }
export type { JobHttp }
