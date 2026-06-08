import type { Project } from '@/lib/supabase'
import { dbGet, type QueryParams } from './base'

export function fetchProjects(params?: QueryParams): Promise<Project[]> {
  return dbGet<Project>('projects', params)
}
