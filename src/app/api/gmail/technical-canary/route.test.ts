import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const requireApiUserMock = vi.fn()
const canaryMock = vi.fn()
const reconcileMock = vi.fn()

vi.mock('@/lib/auth', () => ({
  requireApiUser: (...args: unknown[]) => requireApiUserMock(...args),
}))
vi.mock('@/lib/gmail/technicalCanary', () => ({
  runTechnicalGmailCanary: (...args: unknown[]) => canaryMock(...args),
  reconcileTechnicalGmailCanaryReply: (...args: unknown[]) => reconcileMock(...args),
}))

import { POST } from './route'

function request(origin: string | null): Request {
  const headers: Record<string, string> = { host: 'agency.example' }
  if (origin) headers.origin = origin
  return new Request('https://agency.example/api/gmail/technical-canary', { method: 'POST', headers })
}

beforeEach(() => {
  requireApiUserMock.mockReset()
  canaryMock.mockReset()
  requireApiUserMock.mockResolvedValue({ user: { id: 'operator' } })
  canaryMock.mockResolvedValue({ ok: true, sent: true, deduplicated: false, transport: 'gmail', replied: false })
  reconcileMock.mockResolvedValue({ replied: false })
  process.env.GMAIL_CANARY_RECIPIENT = 'operator-test@example.com'
})

describe('POST /api/gmail/technical-canary', () => {
  it('yetkisiz isteği provider çağrısından önce reddeder', async () => {
    requireApiUserMock.mockResolvedValue({ response: NextResponse.json({ error: 'Yetkisiz' }, { status: 401 }) })
    const res = await POST(request('https://agency.example'))
    expect(res.status).toBe(401)
    expect(reconcileMock).not.toHaveBeenCalled()
    expect(canaryMock).not.toHaveBeenCalled()
  })

  it('cross-origin isteği reddeder', async () => {
    const res = await POST(request('https://evil.example'))
    expect(res.status).toBe(403)
    expect(reconcileMock).not.toHaveBeenCalled()
    expect(canaryMock).not.toHaveBeenCalled()
  })

  it('alıcıyı request yerine yalnız deployment ayarından alır', async () => {
    const res = await POST(request('https://agency.example'))
    expect(res.status).toBe(200)
    expect(reconcileMock).toHaveBeenCalledWith('operator-test@example.com')
    expect(canaryMock).toHaveBeenCalledWith('operator-test@example.com')
  })

  it('alıcı ayarı yoksa fail-closed kalır', async () => {
    delete process.env.GMAIL_CANARY_RECIPIENT
    const res = await POST(request('https://agency.example'))
    expect(res.status).toBe(503)
    expect(canaryMock).not.toHaveBeenCalled()
  })

  it('karantinada doğrulanmış reply varsa yeni mesaj göndermez', async () => {
    reconcileMock.mockResolvedValue({ replied: true })
    const res = await POST(request('https://agency.example'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.result.replied).toBe(true)
    expect(canaryMock).not.toHaveBeenCalled()
  })
})
