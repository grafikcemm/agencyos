import type { Lead } from '@/lib/supabase'
import { dbGet, dbPatch, type QueryParams } from './base'

export function fetchLeads(params?: QueryParams): Promise<Lead[]> {
  return dbGet<Lead>('leads', params)
}

export function updateLead(id: string, updates: Partial<Lead>): Promise<Lead[]> {
  return dbPatch<Lead>('leads', { id, ...updates })
}
