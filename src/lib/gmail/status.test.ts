import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Faz 2 — Gmail durum özeti: SADECE boolean/adres/scope; secret dönmez.
// realSendTransportReady = bağlı + iki zorunlu scope + OAuth env.

let accountRow: Record<string, unknown> | null = null

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => {
      const api: Record<string, unknown> = {}
      Object.assign(api, {
        select: () => api,
        eq: () => api,
        order: () => api,
        limit: () => api,
        maybeSingle: async () => ({ data: accountRow, error: null }),
      })
      return api
    },
  },
}))

import { getGmailStatus, isOAuthConfigured } from './status'
import { ALLOWED_GMAIL_SCOPES } from '@/lib/outreach/gmailScopes'

const BOTH = [...ALLOWED_GMAIL_SCOPES]

beforeEach(() => {
  accountRow = null
  vi.unstubAllEnvs()
})
afterEach(() => vi.unstubAllEnvs())

function stubOAuthEnv() {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'cid')
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'csec')
  vi.stubEnv('GMAIL_OAUTH_REDIRECT_URI', 'https://x/cb')
}

describe('getGmailStatus', () => {
  it('hesap yok → connected:false, transport hazır değil', async () => {
    const s = await getGmailStatus()
    expect(s.connected).toBe(false)
    expect(s.verifiedEmail).toBeNull()
    expect(s.realSendTransportReady).toBe(false)
    expect(s.requiredScopesOk).toBe(false)
  })

  it('bağlı + iki scope + OAuth env → realSendTransportReady:true; secret ALANI YOK', async () => {
    accountRow = { email_address: 'ops@ajans.example', scopes: BOTH, vault_secret_id: 'vault-1', last_history_id: 'h-9' }
    stubOAuthEnv()
    const s = await getGmailStatus()
    expect(s.connected).toBe(true)
    expect(s.verifiedEmail).toBe('ops@ajans.example')
    expect(s.requiredScopesOk).toBe(true)
    expect(s.oauthConfigured).toBe(true)
    expect(s.realSendTransportReady).toBe(true)
    expect(s.hasHistoryCursor).toBe(true)
    expect(JSON.stringify(s)).not.toContain('vault-1') // secret referansı SIZMAZ
  })

  it('bağlı ama tek scope → requiredScopesOk:false, transport hazır DEĞİL', async () => {
    accountRow = {
      email_address: 'ops@ajans.example',
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      vault_secret_id: 'v', last_history_id: null,
    }
    stubOAuthEnv()
    const s = await getGmailStatus()
    expect(s.requiredScopesOk).toBe(false)
    expect(s.realSendTransportReady).toBe(false)
    expect(s.hasHistoryCursor).toBe(false)
  })

  it('bağlı + scope tam ama OAuth env yok → transport hazır DEĞİL', async () => {
    accountRow = { email_address: 'a@b.c', scopes: BOTH, vault_secret_id: 'v', last_history_id: null }
    const s = await getGmailStatus()
    expect(s.oauthConfigured).toBe(false)
    expect(s.realSendTransportReady).toBe(false)
  })

  it('bayraklar env’den okunur (send/ingest)', async () => {
    accountRow = { email_address: 'a@b.c', scopes: BOTH, vault_secret_id: 'v', last_history_id: null }
    vi.stubEnv('GMAIL_SEND_ENABLED', 'true')
    vi.stubEnv('GMAIL_INGEST_ENABLED', 'true')
    const s = await getGmailStatus()
    expect(s.sendEnabled).toBe(true)
    expect(s.ingestEnabled).toBe(true)
  })
})

describe('isOAuthConfigured', () => {
  it('üç env de dolu → true; biri boş → false', () => {
    expect(isOAuthConfigured()).toBe(false)
    stubOAuthEnv()
    expect(isOAuthConfigured()).toBe(true)
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '')
    expect(isOAuthConfigured()).toBe(false)
  })
})
