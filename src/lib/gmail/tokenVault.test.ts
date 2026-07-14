import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// FINALIZATION Faz 7 — token vault: refresh token DÜZ METİN tabloda durmaz
// (yalnız vault RPC'lerine gider), scope allowlist fail-closed, rotation/revoke.
// GERÇEK ağ/vault yok — mock; gerçek vault roundtrip DB'de ayrıca kanıtlandı
// (Faz 7 migration uygulaması: roundtrip_ok=true).

type Row = Record<string, unknown>
const accounts: Row[] = []
const vaultStore = new Map<string, { id: string; secret: string }>()
let seq = 0
let rpcError: { message: string } | null = null
let accountReadError: { message: string } | null = null

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (rpcError) return { data: null, error: rpcError }
      if (fn === 'gmail_vault_store') {
        const name = String(args.p_name)
        const existing = vaultStore.get(name)
        if (existing) {
          existing.secret = String(args.p_secret) // rotation: aynı isim → yeni değer
          return { data: existing.id, error: null }
        }
        const id = `vault-${++seq}`
        vaultStore.set(name, { id, secret: String(args.p_secret) })
        return { data: id, error: null }
      }
      if (fn === 'gmail_vault_read') {
        for (const v of vaultStore.values()) if (v.id === args.p_id) return { data: v.secret, error: null }
        return { data: null, error: null }
      }
      if (fn === 'gmail_vault_delete') {
        for (const [k, v] of vaultStore) if (v.id === args.p_id) { vaultStore.delete(k); return { data: true, error: null } }
        return { data: false, error: null }
      }
      return { data: null, error: { message: `bilinmeyen rpc ${fn}` } }
    },
    from: (table: string) => {
      const filters: Array<(r: Row) => boolean> = []
      let op: 'select' | 'insert' | 'update' = 'select'
      let payload: Row | null = null
      const rows = table === 'gmail_accounts' ? accounts : []
      function exec(single: boolean) {
        if (table === 'gmail_accounts' && op === 'select' && accountReadError) {
          return { data: null, error: accountReadError }
        }
        if (op === 'insert' && payload) {
          const row = { id: `acc-${++seq}`, ...payload }
          rows.push(row)
          return { data: single ? row : [row], error: null }
        }
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
        eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api },
        order: () => api,
        limit: () => api,
        insert: (p: Row) => { op = 'insert'; payload = p; return api },
        update: (p: Row) => { op = 'update'; payload = p; return api },
        maybeSingle: async () => exec(true),
        single: async () => exec(true),
        then: (res: (v: unknown) => unknown) => Promise.resolve(exec(false)).then(res),
      })
      return api
    },
  },
}))

import { storeGmailTokens, readRefreshToken, getAccessToken, revokeGmailTokens } from './tokenVault'
import { ALLOWED_GMAIL_SCOPES } from '@/lib/outreach/gmailScopes'

beforeEach(() => {
  accounts.length = 0
  vaultStore.clear()
  seq = 0
  rpcError = null
  accountReadError = null
})
afterEach(() => vi.unstubAllEnvs())

describe('storeGmailTokens', () => {
  it('token VAULT\'a gider; gmail_accounts satırı YALNIZ vault_secret_id taşır (düz metin YOK)', async () => {
    const r = await storeGmailTokens({
      emailAddress: 'Ali@Ornek.com',
      refreshToken: 'REFRESH-GIZLI',
      grantedScopes: [...ALLOWED_GMAIL_SCOPES, 'openid'],
    })
    expect(r.ok).toBe(true)
    expect(accounts).toHaveLength(1)
    expect(accounts[0].email_address).toBe('ali@ornek.com')
    expect(accounts[0].vault_secret_id).toBe('vault-1')
    expect(JSON.stringify(accounts)).not.toContain('REFRESH-GIZLI') // düz metin tablo yok
    expect(accounts[0].scopes).toEqual([...ALLOWED_GMAIL_SCOPES]) // identity scope envantere girmez
  })

  it('allowlist DIŞI scope: token SAKLANMAZ (fail-closed)', async () => {
    const r = await storeGmailTokens({
      emailAddress: 'a@b.c',
      refreshToken: 'X',
      grantedScopes: ['https://mail.google.com/'],
    })
    expect(r.ok).toBe(false)
    expect(vaultStore.size).toBe(0)
    expect(accounts).toHaveLength(0)
  })

  it('ROTATION: aynı hesaba ikinci store → aynı secret id, YENİ değer; ikinci satır açılmaz', async () => {
    await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'ESKI', grantedScopes: [...ALLOWED_GMAIL_SCOPES] })
    await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'YENI', grantedScopes: [...ALLOWED_GMAIL_SCOPES] })
    expect(accounts).toHaveLength(1)
    const read = await readRefreshToken()
    expect(read.ok).toBe(true)
    if (read.ok) expect(read.refreshToken).toBe('YENI')
  })

  it('vault RPC hatası: açık hata, token değeri hata metnine SIZMAZ', async () => {
    rpcError = { message: 'vault down' }
    const r = await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'COK-GIZLI', grantedScopes: [...ALLOWED_GMAIL_SCOPES] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).not.toContain('COK-GIZLI')
  })
})

describe('readRefreshToken / getAccessToken', () => {
  it('aktif hesap yok → actionable hata (OAuth kullanıcı aksiyonu)', async () => {
    const r = await readRefreshToken()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('OAuth')
  })

  it('env eksikken access token istenemez (actionable)', async () => {
    const r = await getAccessToken()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('GOOGLE_CLIENT_ID')
  })

  it('access token: refresh token gönderilir, kısa ömürlü token döner (fetch enjekte)', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'csec')
    await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'RT', grantedScopes: [...ALLOWED_GMAIL_SCOPES] })
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
    await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'RT-GIZLI', grantedScopes: [...ALLOWED_GMAIL_SCOPES] })
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant RT-GIZLI' }), { status: 400 }),
    )
    const r = await getAccessToken(fakeFetch as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).not.toContain('RT-GIZLI')
  })
})

describe('revokeGmailTokens', () => {
  it('revoke: Google endpoint + vault silme + hesap pasif (fetch enjekte)', async () => {
    await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'RT', grantedScopes: [...ALLOWED_GMAIL_SCOPES] })
    const fakeFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const r = await revokeGmailTokens(fakeFetch as unknown as typeof fetch)
    expect(r.ok).toBe(true)
    expect(vaultStore.size).toBe(0)
    expect(accounts[0].active).toBe(false)
    expect(accounts[0].vault_secret_id).toBeNull()
    expect(String(fakeFetch.mock.calls[0][0])).toContain('/revoke')
  })

  it('Google revoke erişilemese bile yerel temizlik yapılır (görünür uyarı)', async () => {
    await storeGmailTokens({ emailAddress: 'a@b.c', refreshToken: 'RT', grantedScopes: [...ALLOWED_GMAIL_SCOPES] })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failFetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const r = await revokeGmailTokens(failFetch as unknown as typeof fetch)
    expect(r.ok).toBe(true)
    expect(vaultStore.size).toBe(0)
    warnSpy.mockRestore()
  })
})
