import { describe, it, expect, beforeEach, vi } from 'vitest'

// Üretim auth kapısı davranış testleri. Kritik garanti: fail-closed —
// oturum yok / secret yok / production'da bypass denemesi → 401.

const cookieStore = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name)
      return value === undefined ? undefined : { name, value }
    },
  }),
}))

import { requireApiAccess, requireApiUser, getCurrentUser, assertSession } from './auth'
import { createSessionToken, SESSION_COOKIE_NAME } from './session'

const TEST_SECRET = 'test-secret-uzunlugu-en-az-32-karakter-olsun'
const API_TOKEN = 'operator-api-token-en-az-32-karakter-uzunlukta'

beforeEach(() => {
  cookieStore.clear()
  vi.unstubAllEnvs()
  vi.stubEnv('APP_SESSION_SECRET', TEST_SECRET)
  vi.stubEnv('LOCAL_OPERATOR_MODE', '')
  vi.stubEnv('OPERATOR_API_TOKEN', '')
})

function bearerRequest(token: string): Request {
  return new Request('http://localhost:3000/api/x', {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  })
}

describe('fail-closed varsayılan', () => {
  it('oturum yokken requireApiAccess 401 döner', async () => {
    const result = await requireApiAccess()
    expect('response' in result && result.response.status).toBe(401)
  })

  it('oturum yokken requireApiUser 401, getCurrentUser null, assertSession throw', async () => {
    const user = await requireApiUser()
    expect('response' in user && user.response.status).toBe(401)
    expect(await getCurrentUser()).toBeNull()
    await expect(assertSession()).rejects.toThrow('Yetkisiz')
  })

  it('APP_SESSION_SECRET yokken geçerli-görünümlü cookie bile reddedilir (fail-closed)', async () => {
    const token = await createSessionToken()
    cookieStore.set(SESSION_COOKIE_NAME, token)
    vi.stubEnv('APP_SESSION_SECRET', '')
    const result = await requireApiAccess()
    expect('response' in result && result.response.status).toBe(401)
  })
})

describe('oturum cookie yolu', () => {
  it('geçerli imzalı cookie → ok', async () => {
    cookieStore.set(SESSION_COOKIE_NAME, await createSessionToken())
    const result = await requireApiAccess()
    expect('ok' in result && result.ok).toBe(true)
    expect(await getCurrentUser()).not.toBeNull()
  })

  it('oynanmış cookie → 401', async () => {
    const token = await createSessionToken()
    cookieStore.set(SESSION_COOKIE_NAME, token.slice(0, -4) + 'XXXX')
    const result = await requireApiAccess()
    expect('response' in result && result.response.status).toBe(401)
  })
})

describe('LOCAL_OPERATOR_MODE bypass kuralları', () => {
  it('NODE_ENV=test + LOCAL_OPERATOR_MODE=true → bypass çalışır (dev deneyimi)', async () => {
    vi.stubEnv('LOCAL_OPERATOR_MODE', 'true')
    const result = await requireApiAccess()
    expect('ok' in result && result.ok).toBe(true)
  })

  it('NODE_ENV=production iken LOCAL_OPERATOR_MODE=true HÜKÜMSÜZ → 401', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('LOCAL_OPERATOR_MODE', 'true')
    const result = await requireApiAccess()
    expect('response' in result && result.response.status).toBe(401)
  })

  it("LOCAL_OPERATOR_MODE='1' gibi gevşek değerler bypass AÇMAZ (yalnız 'true')", async () => {
    vi.stubEnv('LOCAL_OPERATOR_MODE', '1')
    const result = await requireApiAccess()
    expect('response' in result && result.response.status).toBe(401)
  })
})

describe('Bearer token yolu (OPERATOR_API_TOKEN)', () => {
  it('doğru Bearer + env set → ok', async () => {
    vi.stubEnv('OPERATOR_API_TOKEN', API_TOKEN)
    const result = await requireApiAccess(bearerRequest(API_TOKEN))
    expect('ok' in result && result.ok).toBe(true)
  })

  it('yanlış Bearer → 401', async () => {
    vi.stubEnv('OPERATOR_API_TOKEN', API_TOKEN)
    const result = await requireApiAccess(bearerRequest('yanlis-token-ama-ayni-uzunlukta-degil'))
    expect('response' in result && result.response.status).toBe(401)
  })

  it('env kısa (<32) ise Bearer yolu tamamen kapalı', async () => {
    vi.stubEnv('OPERATOR_API_TOKEN', 'kisa-token')
    const result = await requireApiAccess(bearerRequest('kisa-token'))
    expect('response' in result && result.response.status).toBe(401)
  })

  it('env boşken herhangi bir Bearer reddedilir', async () => {
    const result = await requireApiAccess(bearerRequest(API_TOKEN))
    expect('response' in result && result.response.status).toBe(401)
  })
})
