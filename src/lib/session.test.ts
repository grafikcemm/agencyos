import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createSessionToken,
  verifySessionToken,
  verifyPassword,
  timingSafeEqual,
} from './session'

// HMAC oturum jetonu: üretim auth kapısının çekirdeği. Fail-closed davranış
// (secret yok → throw → çağıran katman 401'e çevirir) burada kanıtlanır.

const TEST_SECRET = 'test-secret-uzunlugu-en-az-32-karakter-olsun'

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv('APP_SESSION_SECRET', TEST_SECRET)
})

describe('createSessionToken / verifySessionToken', () => {
  it('üretilen jeton doğrulanır (roundtrip)', async () => {
    const token = await createSessionToken()
    expect(await verifySessionToken(token)).toBe(true)
  })

  it('süresi geçmiş jeton reddedilir', async () => {
    const token = await createSessionToken(-10)
    expect(await verifySessionToken(token)).toBe(false)
  })

  it('imzası bozulmuş jeton reddedilir', async () => {
    const token = await createSessionToken()
    const [v, exp] = token.split('.')
    expect(await verifySessionToken(`${v}.${exp}.sahte-imza`)).toBe(false)
  })

  it('payload oynanmış jeton reddedilir (expiry uzatma denemesi)', async () => {
    const token = await createSessionToken()
    const [v, exp, sig] = token.split('.')
    const extended = String(Number(exp) + 999999)
    expect(await verifySessionToken(`${v}.${extended}.${sig}`)).toBe(false)
  })

  it('boş/eksik jeton reddedilir', async () => {
    expect(await verifySessionToken(undefined)).toBe(false)
    expect(await verifySessionToken('')).toBe(false)
    expect(await verifySessionToken('tek-parca')).toBe(false)
  })

  it('secret yok → throw (fail-closed; sessiz geçiş YOK)', async () => {
    vi.stubEnv('APP_SESSION_SECRET', '')
    await expect(createSessionToken()).rejects.toThrow('APP_SESSION_SECRET')
  })

  it('kısa secret (<32) → throw', async () => {
    vi.stubEnv('APP_SESSION_SECRET', 'kisa')
    await expect(createSessionToken()).rejects.toThrow()
  })

  it('farklı secret ile imzalanan jeton reddedilir', async () => {
    const token = await createSessionToken()
    vi.stubEnv('APP_SESSION_SECRET', 'baska-bir-secret-en-az-32-karakter-uzun!')
    expect(await verifySessionToken(token)).toBe(false)
  })
})

describe('verifyPassword', () => {
  it('doğru parola true, yanlış parola false', async () => {
    vi.stubEnv('APP_PASSWORD', 'gizli-parola')
    expect(await verifyPassword('gizli-parola')).toBe(true)
    expect(await verifyPassword('yanlis')).toBe(false)
    expect(await verifyPassword('')).toBe(false)
  })

  it('APP_PASSWORD yok → throw (yapılandırma hatası gizlenmez)', async () => {
    vi.stubEnv('APP_PASSWORD', '')
    await expect(verifyPassword('x')).rejects.toThrow('APP_PASSWORD')
  })
})

describe('timingSafeEqual', () => {
  it('eşit/eşit-olmayan/farklı-uzunluk', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
  })
})
