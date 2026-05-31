import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let publicClient: SupabaseClient | null = null
let adminClient: SupabaseClient | null = null

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required. Add it to the deployment environment variables.`)
  }
  return value
}

function getPublicClient() {
  if (!publicClient) {
    publicClient = createClient(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    )
  }
  return publicClient
}

function getAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('supabaseAdmin is server-only.')
  }

  if (!adminClient) {
    adminClient = createClient(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    )
  }
  return adminClient
}

function lazyClient(getClient: () => SupabaseClient) {
  return new Proxy({} as SupabaseClient, {
    get(_target, prop, receiver) {
      const client = getClient()
      const value = Reflect.get(client, prop, receiver)
      return typeof value === 'function' ? value.bind(client) : value
    },
  })
}

export const supabase = lazyClient(getPublicClient)
export const supabaseAdmin = lazyClient(getAdminClient)


export type Lead = {
  id: string
  business_name: string
  sector: string | null
  city: string | null
  district: string | null
  phone: string | null
  website: string | null
  email: string | null
  google_place_id: string | null
  latitude: number | null
  longitude: number | null
  rating: number | null
  review_count: number
  status: 'new' | 'contacted' | 'responded' | 'meeting' | 'proposal' | 'converted' | 'lost'
  potential_score: number
  ai_analysis: string | null
  pitch: string | null
  notes: string | null
  has_website: boolean
  created_at: string
  updated_at: string
}

export type Project = {
  id: string
  lead_id: string | null
  business_name: string
  status: 'active' | 'paused' | 'completed' | 'cancelled'
  services: string[] | null
  setup_fee: number
  monthly_fee: number
  currency: string
  start_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type Playbook = {
  id: string
  name: string
  category: string | null
  description: string | null
  setup_fee: number
  monthly_fee: number
  pitch_template: string | null
  steps: string[] | null
  is_active: boolean
  created_at: string
}

export type Setting = {
  id: string
  key: string
  value: string | null
  updated_at: string
}
