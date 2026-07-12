import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resolveE2EDbEnv, extractProjectRef, PROD_APP_DB_REF } from '../../e2e/env'

// E2E test-DB guard'ı (Faz 7.1): production App DB'ye işaret eden ya da eksik
// E2E env'i suite başlamadan fail-fast eder — canlı DB'ye yazım yapısal imkânsız.

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe('extractProjectRef', () => {
  it('supabase URL\'inden ref çıkarır', () => {
    expect(extractProjectRef('https://abcdefghijklmnopqrst.supabase.co')).toBe('abcdefghijklmnopqrst')
    expect(extractProjectRef('https://ABCDEFGHIJKLMNOPQRST.supabase.co/rest/v1')).toBe('abcdefghijklmnopqrst')
  })
  it('desen dışı URL → null', () => {
    expect(extractProjectRef('https://example.com')).toBeNull()
    expect(extractProjectRef('bozuk')).toBeNull()
  })
})

describe('resolveE2EDbEnv', () => {
  const TEST_URL = 'https://testrefabcdefghijkl.supabase.co'

  it('üç E2E_* anahtarıyla çözülür', () => {
    vi.stubEnv('E2E_SUPABASE_URL', TEST_URL)
    vi.stubEnv('E2E_SUPABASE_ANON_KEY', 'anon')
    vi.stubEnv('E2E_SUPABASE_SERVICE_ROLE_KEY', 'srv')
    const db = resolveE2EDbEnv()
    expect(db.projectRef).toBe('testrefabcdefghijkl')
    expect(db.url).toBe(TEST_URL)
  })

  it('eksik anahtar → açıklayıcı throw (sessiz fallback YOK)', () => {
    vi.stubEnv('E2E_SUPABASE_URL', TEST_URL)
    vi.stubEnv('E2E_SUPABASE_ANON_KEY', '')
    vi.stubEnv('E2E_SUPABASE_SERVICE_ROLE_KEY', '')
    expect(() => resolveE2EDbEnv()).toThrow(/E2E_SUPABASE_ANON_KEY/)
  })

  it('PRODUCTION App DB ref\'i → REDDEDİLİR (fail-fast)', () => {
    vi.stubEnv('E2E_SUPABASE_URL', `https://${PROD_APP_DB_REF}.supabase.co`)
    vi.stubEnv('E2E_SUPABASE_ANON_KEY', 'anon')
    vi.stubEnv('E2E_SUPABASE_SERVICE_ROLE_KEY', 'srv')
    expect(() => resolveE2EDbEnv()).toThrow(/production App DB/)
  })

  it('ref çıkarılamayan URL → throw', () => {
    vi.stubEnv('E2E_SUPABASE_URL', 'https://example.com')
    vi.stubEnv('E2E_SUPABASE_ANON_KEY', 'anon')
    vi.stubEnv('E2E_SUPABASE_SERVICE_ROLE_KEY', 'srv')
    expect(() => resolveE2EDbEnv()).toThrow(/ref çıkarılamadı/)
  })
})
