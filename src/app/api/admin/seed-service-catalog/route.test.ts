import { describe, it, expect, vi, beforeEach } from 'vitest'

// Auth ve DB mock — CSRF katmanı izole test edilir.
const requireApiAccessMock = vi.fn()
vi.mock('@/lib/auth', () => ({
  requireApiAccess: (...args: unknown[]) => requireApiAccessMock(...args),
}))

const upsertMock = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => ({ upsert: (...args: unknown[]) => upsertMock(...args) }),
  },
}))

import { POST } from './route'

function makeRequest(origin: string | null): Request {
  const headers: Record<string, string> = { host: 'localhost:3100' }
  if (origin) headers.origin = origin
  return new Request('http://localhost:3100/api/admin/seed-service-catalog', {
    method: 'POST',
    headers,
  })
}

beforeEach(() => {
  requireApiAccessMock.mockReset()
  upsertMock.mockReset()
  requireApiAccessMock.mockResolvedValue({ ok: true })
  upsertMock.mockResolvedValue({ error: null })
})

describe('POST /api/admin/seed-service-catalog — CSRF', () => {
  it('cross-origin istek 403 ile reddedilir, DB\'ye DOKUNULMAZ', async () => {
    const res = await POST(makeRequest('https://kotu-site.example'))
    expect(res.status).toBe(403)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('same-origin istek seed\'i çalıştırır (38 paket senkronlanır)', async () => {
    const res = await POST(makeRequest('http://localhost:3100'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.synced).toBeGreaterThanOrEqual(30)
    expect(upsertMock).toHaveBeenCalledTimes(1)
  })

  it('yetkisiz istek CSRF\'ten ÖNCE 401 alır', async () => {
    const { NextResponse } = await import('next/server')
    requireApiAccessMock.mockResolvedValue({ response: NextResponse.json({ error: 'Yetkisiz' }, { status: 401 }) })
    const res = await POST(makeRequest('http://localhost:3100'))
    expect(res.status).toBe(401)
    expect(upsertMock).not.toHaveBeenCalled()
  })
})
