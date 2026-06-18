// Apollo People Search istemcisi (mixed_people/search).
// apollo/route.ts (organizations/enrich) ile aynı auth + 15s AbortController desenini izler.
// API anahtarı ASLA loglanmaz. Yalnızca Apollo'nun güvenli desteklediği alanlar gönderilir.

import 'server-only'
import type { ApolloPerson, ApolloSearchFilters } from './types'

const APOLLO_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_people/search'
const TIMEOUT_MS = 15000

export interface ApolloSearchResult {
  people: ApolloPerson[]
  /** x-rate-limit-remaining (ücretsiz-kredi guard). Header yoksa null. */
  rateLimitRemaining: number | null
  error?: string
}

// Maskeli/kilitli Apollo email'ini (email_not_unlocked@…) ayıkla.
function realEmail(email: unknown): string | null {
  if (typeof email !== 'string' || !email.includes('@')) return null
  if (email.includes('not_unlocked') || email.includes('email_not_unlocked')) return null
  // mailto: başlık enjeksiyonu (CR/LF/boşluk/tab) → reddet.
  if (/\s/.test(email)) return null
  return email
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

// tel: için yalnızca telefon karakterlerine izin ver; aksi halde null.
function safePhone(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  return /^[+\d\s\-().]+$/.test(s) ? s : null
}

/** Ham Apollo person → normalize ApolloPerson. id yoksa null (atlanır). */
export function mapApolloPerson(raw: Record<string, unknown>): ApolloPerson | null {
  const id = str(raw.id)
  const fullName = str(raw.name) ?? [str(raw.first_name), str(raw.last_name)].filter(Boolean).join(' ').trim()
  if (!id || !fullName) return null

  const org = (raw.organization ?? {}) as Record<string, unknown>
  const employees = org.estimated_num_employees
  return {
    apollo_person_id: id,
    full_name: fullName,
    title: str(raw.title),
    seniority: str(raw.seniority),
    linkedin_url: str(raw.linkedin_url),
    email: realEmail(raw.email),
    email_status: str(raw.email_status),
    phone: safePhone(raw.phone_number ?? raw.sanitized_phone),
    company_name: str(org.name),
    company_domain: str(org.primary_domain) ?? str(org.website_url),
    company_industry: str(org.industry),
    company_size: typeof employees === 'number' ? String(employees) : str(employees),
    city: str(raw.city),
    country: str(raw.country),
    raw,
  }
}

/**
 * Apollo'da kişi ara. perPage küçük tutulur (kredi koruması).
 * Anahtar yoksa boş sonuç + error döner (asla throw etmez → tarama devam eder).
 */
export async function searchPeople(
  filters: ApolloSearchFilters,
  opts: { page?: number; perPage?: number } = {},
): Promise<ApolloSearchResult> {
  const apiKey = process.env.APOLLO_API_KEY
  if (!apiKey) {
    return { people: [], rateLimitRemaining: null, error: 'APOLLO_API_KEY missing' }
  }

  const body: Record<string, unknown> = {
    page: opts.page ?? 1,
    per_page: opts.perPage ?? 10,
    person_titles: filters.person_titles,
    person_locations: filters.person_locations,
  }
  if (filters.person_seniorities?.length) body.person_seniorities = filters.person_seniorities
  if (filters.organization_num_employees_ranges?.length) {
    body.organization_num_employees_ranges = filters.organization_num_employees_ranges
  }
  if (filters.q_keywords) body.q_keywords = filters.q_keywords

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(APOLLO_SEARCH_URL, {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    const remainingHeader = res.headers.get('x-rate-limit-remaining')
    const rateLimitRemaining = remainingHeader != null ? parseInt(remainingHeader, 10) : null

    if (!res.ok) {
      // Anahtar adını referans vermeden logla.
      console.error(`Apollo People Search error: status=${res.status}, endpoint=mixed_people/search`)
      return { people: [], rateLimitRemaining, error: `Apollo status ${res.status}` }
    }

    const data = (await res.json()) as { people?: unknown[] }
    const rawPeople = Array.isArray(data.people) ? data.people : []
    const people = rawPeople
      .map((p) => mapApolloPerson(p as Record<string, unknown>))
      .filter((p): p is ApolloPerson => p !== null)

    return { people, rateLimitRemaining }
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    const name = err instanceof Error ? err.name : ''
    const msg = name === 'AbortError' ? 'Apollo timeout (15s)' : err instanceof Error ? err.message : 'Apollo fetch failed'
    console.error(`Apollo People Search exception: ${msg}`)
    return { people: [], rateLimitRemaining: null, error: msg }
  }
}
