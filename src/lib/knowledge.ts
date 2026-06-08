import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'

// Knowledge docs live in the `knowledge_docs` table (migration 004), not on
// disk — the markdown is git-ignored so it never deployed to Vercel. Reads go
// through supabaseAdmin (service role, bypasses RLS) and are cached per-process
// for TTL_MS so a warm lambda doesn't refetch the same doc on every call.
//
// All readers return '' on a miss/error so callers can inject optional context
// without guarding every call site. On a DB error a stale cache entry (if any)
// is preferred over an empty string.

interface CacheEntry {
  content: string
  ts: number
}

const cache = new Map<string, CacheEntry>()
const TTL_MS = 5 * 60 * 1000

function freshContent(key: string): string | null {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.content
  return null
}

// Single doc by key (filename, e.g. 'PRICING_RULES.md'). '' when missing.
export async function getKnowledgeDoc(key: string): Promise<string> {
  const cached = freshContent(key)
  if (cached !== null) return cached
  try {
    const { data, error } = await supabaseAdmin
      .from('knowledge_docs')
      .select('content')
      .eq('key', key)
      .maybeSingle<{ content: string }>()
    if (error) return cache.get(key)?.content ?? ''
    const content = typeof data?.content === 'string' ? data.content : ''
    cache.set(key, { content, ts: Date.now() })
    return content
  } catch {
    return cache.get(key)?.content ?? ''
  }
}

// Batch fetch. Returns a key→content map with '' for any missing key.
export async function getKnowledgeDocs(keys: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  const misses: string[] = []
  for (const key of keys) {
    const cached = freshContent(key)
    if (cached !== null) result[key] = cached
    else misses.push(key)
  }
  if (misses.length === 0) return result

  try {
    const { data, error } = await supabaseAdmin
      .from('knowledge_docs')
      .select('key, content')
      .in('key', misses)
      .returns<{ key: string; content: string }[]>()
    if (!error && data) {
      const now = Date.now()
      for (const row of data) {
        const content = typeof row.content === 'string' ? row.content : ''
        cache.set(row.key, { content, ts: now })
        result[row.key] = content
      }
    }
  } catch {
    // fall through — unresolved misses default to '' below
  }

  for (const key of misses) {
    if (!(key in result)) result[key] = cache.get(key)?.content ?? ''
  }
  return result
}
