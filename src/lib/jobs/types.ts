// İş ilanı motorunun tip katmanı. career-ops `_types.js` kontratının TS portu +
// AgencyOS job_listings / job_application_drafts şema tipleri.

// Bir provider'dan dönen ham, normalize edilmiş ilan. URL dedup anahtarıdır.
export interface RawJob {
  title: string
  url: string
  company: string
  location: string
  source: string // provider id: 'greenhouse' | 'lever' | ... | 'firecrawl'
  sourceJobId?: string
  remote?: boolean
  postedAt?: string | null // ISO
  employmentType?: string | null
  description?: string | null
}

// job_listings tablosu satırı (migration 011 + 023).
// 'dismissed' = kullanıcı elle düşürdü; 'rejected' = pipeline karma elemeyle otomatik eledi.
export type JobStatus = 'new' | 'evaluating' | 'scored' | 'drafted' | 'dismissed' | 'rejected'
export type Legitimacy = 'high' | 'caution' | 'suspicious'

export interface JobListing {
  id: string
  source: string
  source_job_id: string | null
  url: string
  title: string
  company: string | null
  location: string | null
  description: string | null
  employment_type: string | null
  remote: boolean
  posted_at: string | null
  status: JobStatus
  legitimacy: Legitimacy | null
  fit_score: number | null
  fit_reasons: string[]
  scam_flags: string[]
  scanned_at: string
  created_at: string
  updated_at: string
}

// job_application_drafts satırı (migration 011).
export interface JobApplicationDraft {
  id: string
  listing_id: string
  lang: 'tr' | 'en'
  subject: string | null
  body: string
  model_used: string | null
  created_at: string
}

// Minimal HTTP istemci kontratı — provider'lara enjekte edilir (test edilebilirlik).
// career-ops Context.fetchJson/fetchText'in TS karşılığı.
export interface JobHttp {
  fetchJson(url: string, opts?: { timeoutMs?: number; redirect?: RequestRedirect }): Promise<unknown>
  fetchText(url: string, opts?: { timeoutMs?: number; redirect?: RequestRedirect }): Promise<string>
}

// Bir ATS company kaydı (greenhouse/lever/... için izlenen şirket).
export interface AtsSourceEntry {
  name: string // şirket etiketi
  provider: string // provider id
  careersUrl: string // public kariyer URL'i — provider slug'ı buradan türetir
}

// Bir provider'ın fetch fonksiyonu.
export type AtsFetch = (entry: AtsSourceEntry, http: JobHttp) => Promise<RawJob[]>
