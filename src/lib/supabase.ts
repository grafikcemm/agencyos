import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
