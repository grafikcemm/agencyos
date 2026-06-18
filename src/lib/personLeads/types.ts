// person_leads motoru — paylaşılan tipler.
// Apollo People Search (mixed_people/search) çıktısını normalize eder ve
// person_leads tablosu satır şekline (PersonLeadRow) eşler.

export type PersonLeadPurpose = 'b2b_sell' | 'job_application'

/** Apollo mixed_people/search body filtreleri (preset.filters → bu şekil). */
export interface ApolloSearchFilters {
  person_titles: string[]
  person_seniorities?: string[]
  organization_industries?: string[]
  organization_num_employees_ranges?: string[]
  person_locations: string[]
  q_keywords?: string
}

/** Apollo person objesinden ihtiyacımız olan normalize alt küme. */
export interface ApolloPerson {
  apollo_person_id: string
  full_name: string
  title: string | null
  seniority: string | null
  linkedin_url: string | null
  /** Maskeli (email_not_unlocked@…) değilse gerçek email; aksi halde null. */
  email: string | null
  email_status: string | null
  /** tel: güvenli (yalnızca telefon karakterleri) ya da null. */
  phone: string | null
  company_name: string | null
  company_domain: string | null
  company_industry: string | null
  company_size: string | null
  city: string | null
  country: string | null
  /** Ham Apollo objesi — denetim/ROI için person_leads.raw'a yazılır. */
  raw: Record<string, unknown>
}

/** person_leads tablosundan okunan tam satır (UI/DB read). */
export interface PersonLead {
  id: string
  source: string
  purpose: PersonLeadPurpose
  preset_id: string | null
  b2b_filter_label: string | null
  apollo_person_id: string | null
  full_name: string
  title: string | null
  seniority: string | null
  linkedin_url: string | null
  email: string | null
  email_status: string | null
  phone: string | null
  company_name: string | null
  company_domain: string | null
  company_industry: string | null
  company_size: string | null
  city: string | null
  country: string | null
  difficulty_score: number | null
  market_score: number | null
  earning_score: number | null
  person_score: number | null
  person_tier: 'A' | 'B' | 'C' | 'D' | null
  expected_monthly_value_tl: number | null
  why_now: string | null
  next_action: string | null
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}

/** person_leads tablosuna upsert edilen satır. */
export interface PersonLeadRow extends ApolloPerson {
  source: 'apollo' | 'firecrawl'
  purpose: PersonLeadPurpose
  preset_id: string
  b2b_filter_label: string
  difficulty_score: number
  market_score: number
  earning_score: number
  person_score: number
  person_tier: 'A' | 'B' | 'C' | 'D'
  expected_monthly_value_tl: number
  why_now: string
  next_action: string
  status: 'new'
}
