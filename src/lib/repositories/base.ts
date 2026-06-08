// Framework-agnostic client-side data access against the /api/db/[table] proxy.
// No React here — usable from React Query hooks or directly.

type QueryParams = Record<string, string | number | boolean | undefined | null>

function buildQuery(params?: QueryParams): string {
  if (!params) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

async function parseError(res: Response): Promise<never> {
  let message = `Request failed (${res.status})`
  try {
    const body = await res.json()
    if (body?.error) message = body.error
  } catch {
    /* response had no JSON body — keep the status-based message */
  }
  throw new Error(message)
}

export async function dbGet<T>(table: string, params?: QueryParams): Promise<T[]> {
  const res = await fetch(`/api/db/${table}${buildQuery(params)}`, {
    method: 'GET',
    credentials: 'include',
  })
  if (!res.ok) return parseError(res)
  return res.json() as Promise<T[]>
}

export async function dbInsert<T>(table: string, body: unknown): Promise<T[]> {
  const res = await fetch(`/api/db/${table}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return parseError(res)
  return res.json() as Promise<T[]>
}

export async function dbPatch<T>(table: string, body: { id: string } & Record<string, unknown>): Promise<T[]> {
  const res = await fetch(`/api/db/${table}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return parseError(res)
  return res.json() as Promise<T[]>
}

export type { QueryParams }
