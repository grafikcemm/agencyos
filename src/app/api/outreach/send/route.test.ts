import { describe, it, expect, beforeEach, vi } from 'vitest'

// GERÇEK auth katmanıyla route-seviyesi entegrasyon: yetkisiz istek iş
// mantığına ULAŞMADAN 401 almalı (Faz 1 P0 doğrulaması). Yalnız DB katmanı
// (markMessageSent) mock'lanır; @/lib/auth mock'lanmaz.

const markMessageSentMock = vi.fn()
vi.mock('@/lib/outreach/email', () => ({
  markMessageSent: (...args: unknown[]) => markMessageSentMock(...args),
}))

import { POST } from './route'

const API_TOKEN = 'operator-api-token-en-az-32-karakter-uzunlukta'
const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'

function makeRequest(opts: { auth?: boolean; body?: unknown; origin?: string } = {}): Request {
  const headers: Record<string, string> = {
    host: 'localhost:3000',
    origin: opts.origin ?? 'http://localhost:3000',
    'content-type': 'application/json',
  }
  if (opts.auth) headers.authorization = `Bearer ${API_TOKEN}`
  return new Request('http://localhost:3000/api/outreach/send', {
    method: 'POST',
    headers,
    body: JSON.stringify(opts.body ?? { message_id: VALID_UUID }),
  })
}

beforeEach(() => {
  markMessageSentMock.mockReset()
  markMessageSentMock.mockResolvedValue({ ok: true })
  vi.unstubAllEnvs()
  vi.stubEnv('LOCAL_OPERATOR_MODE', '')
  vi.stubEnv('APP_SESSION_SECRET', '')
  vi.stubEnv('OPERATOR_API_TOKEN', API_TOKEN)
})

describe('POST /api/outreach/send — auth + input validation', () => {
  it('yetkisiz istek 401 alır; iş mantığı ÇALIŞMAZ', async () => {
    const res = await POST(makeRequest({ auth: false }))
    expect(res.status).toBe(401)
    expect(markMessageSentMock).not.toHaveBeenCalled()
  })

  it('yetkili + geçerli gövde → markMessageSent çağrılır', async () => {
    const res = await POST(makeRequest({ auth: true }))
    expect(res.status).toBe(200)
    expect(markMessageSentMock).toHaveBeenCalledWith(VALID_UUID)
  })

  it('geçersiz message_id (uuid değil) → 400, iş mantığı çalışmaz', async () => {
    const res = await POST(makeRequest({ auth: true, body: { message_id: 'abc' } }))
    expect(res.status).toBe(400)
    expect(markMessageSentMock).not.toHaveBeenCalled()
  })

  it('bilinmeyen alan taşıyan gövde → 400 (strict allowlist)', async () => {
    const res = await POST(makeRequest({ auth: true, body: { message_id: VALID_UUID, force: true } }))
    expect(res.status).toBe(400)
  })

  it('cross-origin istek 403 alır', async () => {
    const res = await POST(makeRequest({ auth: true, origin: 'https://kotu-site.example' }))
    expect(res.status).toBe(403)
    expect(markMessageSentMock).not.toHaveBeenCalled()
  })
})
