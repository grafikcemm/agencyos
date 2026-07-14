import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// FINAL PILOT BLOCKERS Faz 2 — token vault v3: refresh token DÜZ METİN tabloda
// durmaz; hesaba ÖZGÜ vault secret adı; bağlama/kaldırma TEK-TX RPC (atomik).
// GERÇEK ağ/vault yok — RPC'ler in-memory simüle (gerçek vault roundtrip +
// atomiklik DB'de Faz 8 E2E'de kanıtlanır). Simülatör, gerçek RPC'lerin
// atomik sözleşmesini taklit eder: connect = rotate/create + deactivate-others
// + active-upsert TEK adımda.

interface Account extends Record<string, unknown> {
  id: string
  email_address: string
  vault_secret_id: string | null
  scopes: string[]
  active: boolean
}
const accounts: Account[] = []
const vaultStore = new Map<string, { id: string; secret: string }>() // name → {id, secret}
let seq = 0
let connectError: { message: string } | null = null
let disconnectError: { message: string } | null = null
let vaultReadError: { message: string } | null = null
let accountReadError: { message: string } | null = null
let stateInsertError: { message: string } | null = null
let consumeStateResult = true

function findByName(name: string) {
  return vaultStore.get(name)
}
function findById(id: string) {
  for (const [name, v] of vaultStore) if (v.id === id) return { name, ...v }
  return null
}

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'gmail_connect_account') {
        if (connectError) return { data: null, error: connectError }
        const email = String(args.p_email).toLowerCase()
        const secretName = `gmail_rt::${email}`
        // 1. Vault rotate/create (hesaba özgü).
        let entry = findByName(secretName)
        if (entry) {
          entry.secret = String(args.p_refresh_token)
        } else {
          entry = { id: `vault-${++seq}`, secret: String(args.p_refresh_token) }
          vaultStore.set(secretName, entry)
        }
        // 2. Diğer hesapları deaktive et.
        for (const a of accounts) if (a.email_address !== email && a.active) a.active = false
        // 3. Bu hesabı aktif upsert.
        let acc = accounts.find((a) => a.email_address === email)
        if (acc) {
          acc.vault_secret_id = entry.id
          acc.scopes = args.p_scopes as string[]
          acc.active = true
        } else {
          acc = {
            id: `acc-${++seq}`, email_address: email, vault_secret_id: entry.id,
            scopes: args.p_scopes as string[], active: true,
          }
          accounts.push(acc)
        }
        return { data: acc.id, error: null }
      }
      if (fn === 'gmail_disconnect_account') {
        if (disconnectError) return { data: null, error: disconnectError }
        const acc = accounts.find((a) => a.id === args.p_account_id)
        if (!acc) return { data: false, error: null } // idempotent
        if (acc.vault_secret_id) {
          const e = findById(acc.vault_secret_id)
          if (e) vaultStore.delete(e.name)
        }
        acc.active = false
        acc.vault_secret_id = null
        return { data: true, error: null }
      }
      if (fn === 'gmail_vault_read') {
        if (vaultReadError) return { data: null, error: vaultReadError }
        const e = findById(String(args.p_id))
        return { data: e?.secret ?? null, error: null }
      }
      if (fn === 'gmail_consume_oauth_state') {
        return { data: consumeStateResult, error: null }
      }
      return { data: null, error: { message: `bilinmeyen rpc ${fn}` } }
    },
    from: (table: string) => {
      const filters: Array<(r: Account) => boolean> = []
      let op: 'select' | 'insert' | 'update' = 'select'
      let payload: Record<string, unknown> | null = null
      const rows = table === 'gmail_accounts' ? accounts : ([] as Account[])
      function exec(single: boolean) {
        if (table === 'gmail_accounts' && op === 'select' && accountReadError) {
          return { data: null, error: accountReadError }
        }
        if (table === 'gmail_oauth_states' && op === 'insert' && stateInsertError) {
          return { data: null, error: stateInsertError }
        }
        if (op === 'insert' && payload) return { data: single ? payload : [payload], error: null }
        if (op === 'update' && payload) {
          const m = rows.filter((r) => filters.every((f) => f(r)))
          m.forEach((r) => Object.assign(r, payload))
          return { data: m, error: null }
        }
        const m = rows.filter((r) => filters.every((f) => f(r)))
        return { data: single ? (m[0] ?? null) : m, error: null }
      }
      const api: Record<string, unknown> = {}
      Object.assign(api, {
        select: () => api,
        eq: (c: string, v: unknown) => { filters.push((r) => r[c as keyof Account] === v); return api },
        order: () => api,
        limit: () => api,
        insert: (p: Record<string, unknown>) => { op = 'insert'; payload = p; return api },
        update: (p: Record<string, unknown>) => { op = 'update'; payload = p; return api },
        maybeSingle: async () => exec(true),
        single: async () => exec(true),
        then: (res: (v: unknown) => unknown) => Promise.resolve(exec(false)).then(res),
      })
      return api
    },
  },
}))

import {
  storeGmailTokens, readRefreshToken, getAccessToken, revokeGmailTokens,
  recordOAuthState, consumeOAuthState,
} from './tokenVault'
import { ALLOWED_GMAIL_SCOPES } from '@/lib/outreach/gmailScopes'

const BOTH = [...ALLOWED_GMAIL_SCOPES]

beforeEach(() => {
  accounts.length = 0
  vaultStore.clear()
  seq = 0
  connectError = null
  disconnectError = null
  vaultReadError = null
  accountReadError = null
  stateInsertError = null
  consumeStateResult = true
})
afterEach(() => vi.unstubAllEnvs())

describe('storeGmailTokens (tek-tx connect)', () => {
  it('token VAULT\'a gider; satır YALNIZ vault_secret_id taşır (düz metin YOK); identity scope envantere girmez', async () => {
    const r = await storeGmailTokens({
      emailAddress: 'Ali@Ornek.com',
      refreshToken: 'REFRESH-GIZLI',
      grantedScopes: [...BOTH, 'openid'],
    })
    expect(r.ok).toBe(true)
    expect(accounts).toHaveLength(1)
    expect(accounts[0].email_address).toBe('ali@ornek.com')
    expect(accounts[0].vault_secret_id).toBe('vault-1')
    expect(JSON.stringify(accounts)).not.toContain('REFRESH-GIZLI')
    expect(accounts[0].scopes).toEqual(BOTH)
  })

  it('allowlist DIŞI scope: token SAKLANMAZ (fail-closed)', async () => {
    const r = await storeGmailTokens({
      emailAddress: 'a@b.c', refreshToken: 'X',
      grantedScopes: ['https://mail.google.com/', ...BOTH],
    })
    expect(r.ok).toBe(false)
    expect(vaultStore.size).toBe(0)
    expect(accounts).toHaveLength(0)
  })

  it('ZORUNLU scope eksik (yalnız send): token SAKLANMAZ (readonly şart)', async () => {
    const r = await storeGmailTokens({
      emailAddress: 'a@b.c', refreshToken: 'X',
      grantedScopes: ['https://www.googleapis.com/auth/gmail.send'],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('zorunlu scope eksik')
    expect(accounts).toHaveLength(0)
  })

  it('unknown@unknown / geçersiz e-posta: token SAKLANMAZ', async () => {
    const r = await storeGmailTokens({ emailAddress: 'unknown@unknown', refreshToken: 'X', grantedScopes: BOTH })
    expect(r.ok).toBe(false)
    const r2 = await storeGmailTokens({ emailAddress: '   ', refreshToken: 'X', grantedScopes: BOTH })
    expect(r2.ok).toBe(false)
    expect(accounts).toHaveLength(0)
  })

  it('ROTATION: aynı hesaba ikinci store → aynı secret id, YENİ değer; ikinci satır açılmaz', async () => {
    await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'ESKI', grantedScopes: BOTH })
    await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'YENI', grantedScopes: BOTH })
    expect(accounts).toHaveLength(1)
    const read = await readRefreshToken()
    expect(read.ok).toBe(true)
    if (read.ok) expect(read.refreshToken).toBe('YENI')
  })

  it('İKİNCİ FARKLI hesap: eski hesap token eşleşmesi BOZULMAZ; yalnız yeni hesap aktif', async () => {
    await storeGmailTokens({ emailAddress: 'birinci@x.com', refreshToken: 'RT-BIR', grantedScopes: BOTH })
    const firstAcc = accounts.find((a) => a.email_address === 'birinci@x.com')!
    const firstSecretId = firstAcc.vault_secret_id as string

    await storeGmailTokens({ emailAddress: 'ikinci@y.com', refreshToken: 'RT-IKI', grantedScopes: BOTH })

    // İki ayrı hesap, İKİ ayrı secret; birincinin secret'ı ikincinin token'ına
    // İŞARET ETMEZ (audit bulgu #6 giderildi).
    expect(accounts).toHaveLength(2)
    const stillFirst = accounts.find((a) => a.email_address === 'birinci@x.com')!
    expect(stillFirst.vault_secret_id).toBe(firstSecretId)
    expect(stillFirst.active).toBe(false) // tek-aktif: yeni hesap devraldı
    const second = accounts.find((a) => a.email_address === 'ikinci@y.com')!
    expect(second.active).toBe(true)
    expect(second.vault_secret_id).not.toBe(firstSecretId)
    // Birincinin secret değeri hâlâ kendi token'ı.
    const firstEntry = findById(firstSecretId)
    expect(firstEntry?.secret).toBe('RT-BIR')
  })

  it('connect RPC hatası: açık hata, token değeri hata metnine SIZMAZ; kalıcı yazım YOK', async () => {
    connectError = { message: 'tx aborted' }
    const r = await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'COK-GIZLI', grantedScopes: BOTH })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).not.toContain('COK-GIZLI')
    expect(accounts).toHaveLength(0)
    expect(vaultStore.size).toBe(0)
  })
})

describe('readRefreshToken / getAccessToken', () => {
  it('aktif hesap yok → actionable hata (OAuth kullanıcı aksiyonu)', async () => {
    const r = await readRefreshToken()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('OAuth')
  })

  it('hesap okuma DB hatası → FIRLATIR (sessiz düşüş yok)', async () => {
    accountReadError = { message: 'db down' }
    await expect(readRefreshToken()).rejects.toThrow(/okunamadı/)
  })

  it('vault read hatası → ok:false (açık hata)', async () => {
    await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'RT', grantedScopes: BOTH })
    vaultReadError = { message: 'vault kilitli' }
    const r = await readRefreshToken()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('vault okunamadı')
  })

  it('vault secret bulunamadı (revoke edilmiş) → ok:false', async () => {
    await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'RT', grantedScopes: BOTH })
    vaultStore.clear() // secret dışarıdan silinmiş
    const r = await readRefreshToken()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('bulunamadı')
  })

  it('token endpoint ağ hatası → ok:false; refresh token metne SIZMAZ', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'csec')
    await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'RT-COK-GIZLI', grantedScopes: BOTH })
    const failFetch = vi.fn().mockRejectedValue(new Error('ECONNRESET RT-COK-GIZLI'))
    const r = await getAccessToken(failFetch as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain('erişilemedi')
      expect(r.error).not.toContain('RT-COK-GIZLI')
    }
  })

  it('env eksikken access token istenemez (actionable)', async () => {
    const r = await getAccessToken()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('GOOGLE_CLIENT_ID')
  })

  it('access token: refresh token gönderilir, kısa ömürlü token döner (fetch enjekte)', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'csec')
    await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'RT', grantedScopes: BOTH })
    const fakeFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'AT-1' }), { status: 200 }))
    const r = await getAccessToken(fakeFetch as unknown as typeof fetch)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.accessToken).toBe('AT-1')
    const body = new URLSearchParams(String(fakeFetch.mock.calls[0][1].body))
    expect(body.get('grant_type')).toBe('refresh_token')
  })

  it('token yenileme hatası: refresh token değeri hata metnine SIZMAZ', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'csec')
    await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'RT-GIZLI', grantedScopes: BOTH })
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant RT-GIZLI' }), { status: 400 }),
    )
    const r = await getAccessToken(fakeFetch as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).not.toContain('RT-GIZLI')
  })

  it('token endpoint 400 + error alanı YOK → "bilinmeyen" ile ok:false', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'csec')
    await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'RT', grantedScopes: BOTH })
    const fakeFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 400 }))
    const r = await getAccessToken(fakeFetch as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('bilinmeyen')
  })

  it('token endpoint non-Error throw → "network" dalı', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'csec')
    await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'RT', grantedScopes: BOTH })
    const failFetch = vi.fn().mockRejectedValue('kaba-string-hata')
    const r = await getAccessToken(failFetch as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('network')
  })
})

describe('revokeGmailTokens (tek-tx disconnect, idempotent)', () => {
  it('revoke: Google endpoint + vault silme + hesap pasif (fetch enjekte)', async () => {
    await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'RT', grantedScopes: BOTH })
    const fakeFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const r = await revokeGmailTokens(fakeFetch as unknown as typeof fetch)
    expect(r.ok).toBe(true)
    expect(vaultStore.size).toBe(0)
    expect(accounts[0].active).toBe(false)
    expect(accounts[0].vault_secret_id).toBeNull()
    expect(String(fakeFetch.mock.calls[0][0])).toContain('/revoke')
  })

  it('Google revoke erişilemese bile yerel temizlik yapılır (görünür uyarı)', async () => {
    await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'RT', grantedScopes: BOTH })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failFetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const r = await revokeGmailTokens(failFetch as unknown as typeof fetch)
    expect(r.ok).toBe(true)
    expect(vaultStore.size).toBe(0)
    warnSpy.mockRestore()
  })

  it('Google revoke non-ok status (400) → yine yerel temizlik + uyarı', async () => {
    await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'RT', grantedScopes: BOTH })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fakeFetch = vi.fn().mockResolvedValue(new Response('nope', { status: 400 }))
    const r = await revokeGmailTokens(fakeFetch as unknown as typeof fetch)
    expect(r.ok).toBe(true)
    expect(vaultStore.size).toBe(0)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('disconnect RPC hatası → açık hata (yerel durum korunur)', async () => {
    await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'RT', grantedScopes: BOTH })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    disconnectError = { message: 'db down' }
    const fakeFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const r = await revokeGmailTokens(fakeFetch as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('kaldırılamadı')
    warnSpy.mockRestore()
  })

  it('aktif hesap yoksa revoke → ok:false (okunamayan token)', async () => {
    const r = await revokeGmailTokens(vi.fn() as unknown as typeof fetch)
    expect(r.ok).toBe(false)
  })
})

describe('OAuth state kaydı (recordOAuthState / consumeOAuthState)', () => {
  it('kayıt başarılı → ok:true', async () => {
    const r = await recordOAuthState('nonce-1', Date.now() + 600_000)
    expect(r.ok).toBe(true)
  })

  it('kayıt DB hatası → ok:false', async () => {
    stateInsertError = { message: 'insert fail' }
    const r = await recordOAuthState('nonce-1', Date.now() + 600_000)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('insert fail')
  })

  it('tüketim RPC true → true; RPC false → false (replay reddi)', async () => {
    consumeStateResult = true
    expect(await consumeOAuthState('nonce-1')).toBe(true)
    consumeStateResult = false
    expect(await consumeOAuthState('nonce-1')).toBe(false)
  })
})
