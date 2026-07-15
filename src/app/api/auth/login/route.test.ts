import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

afterEach(() => vi.unstubAllEnvs())

describe('legacy parola endpoint production kapısı', () => {
  it('E2E flag yoksa istek gövdesini okumadan 404 döner', async () => {
    vi.stubEnv('E2E_PASSWORD_AUTH', '')
    const request = new Request('https://agency.example/api/auth/login', {
      method: 'POST',
      body: '{geçersiz-json',
    })
    const response = await POST(request)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Bulunamadı.' })
  })
})
