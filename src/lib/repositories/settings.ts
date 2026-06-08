import type { Setting } from '@/lib/supabase'
import { dbGet, dbInsert, dbPatch } from './base'

export function fetchSettings(): Promise<Setting[]> {
  return dbGet<Setting>('settings')
}

export function insertSetting(key: string, value: string): Promise<Setting[]> {
  return dbInsert<Setting>('settings', { key, value })
}

export function patchSetting(id: string, value: string): Promise<Setting[]> {
  return dbPatch<Setting>('settings', { id, value })
}

// Upsert by key: look up existing rows, PATCH if found, otherwise POST.
export async function saveSetting(key: string, value: string): Promise<Setting[]> {
  const existing = await fetchSettings()
  const match = existing.find((s) => s.key === key)
  if (match) {
    return patchSetting(match.id, value)
  }
  return insertSetting(key, value)
}
