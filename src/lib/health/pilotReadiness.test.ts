import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Faz 7 — pilot-readiness sağlık kapısı: healthy YALNIZ tüm required kontroller
// geçince true. Gmail/OAuth/scope/hesap/transport/LIFE006/uyum eksikken false.

const gmailStatus = vi.fn()
vi.mock('@/lib/gmail/status', () => ({ getGmailStatus: () => gmailStatus() }))

const settingsRows: Record<string, string | null> = {}
const lifeSelectError = { value: null as { message: string } | null }
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => {
      const filters: string[] = []
      const api: Record<string, unknown> = {}
      Object.assign(api, {
        select: () => api,
        eq: (_c: string, v: unknown) => { filters.push(String(v)); return api },
        in: (_c: string, vals: string[]) => { filters.push(...vals); return api },
        limit: () => api,
        maybeSingle: async () => {
          const key = filters[0]
          return { data: settingsRows[key] != null ? { value: settingsRows[key] } : null, error: null }
        },
        then: (res: (v: unknown) => unknown) => {
          const rows = filters.filter((k) => settingsRows[k] != null).map((k) => ({ key: k, value: settingsRows[k] }))
          return Promise.resolve({ data: rows, error: null }).then(res)
        },
      })
      return api
    },
  },
}))
vi.mock('@/lib/lifeSupabaseAdmin', () => ({
  lifeSupabaseAdmin: {
    from: () => ({ select: () => ({ limit: async () => ({ error: lifeSelectError.value }) }) }),
  },
}))

import { getPilotReadiness } from './pilotReadiness'

function fullyReady() {
  gmailStatus.mockResolvedValue({
    oauthConfigured: true, connected: true, verifiedEmail: 'ops@x.com',
    requiredScopesOk: true, realSendTransportReady: true,
  })
  settingsRows.voice_dna = JSON.stringify({ positive: ['kısa yaz'], negative: [] })
  settingsRows.ticaret_unvani = 'Ali Cem Bozma'
  settingsRows.mersis_no = '0000000000000000'
  settingsRows.gmail_last_ingest_ok = '2026-07-14T00:00:00Z'
  lifeSelectError.value = null
}

beforeEach(() => {
  for (const k of Object.keys(settingsRows)) delete settingsRows[k]
  gmailStatus.mockReset()
  lifeSelectError.value = null
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'x')
  vi.stubEnv('OPENROUTER_API_KEY', 'x')
  vi.stubEnv('CRON_SECRET', 'x')
  vi.stubEnv('GMAIL_SEND_ENABLED', '')
})
afterEach(() => vi.unstubAllEnvs())

describe('getPilotReadiness', () => {
  it('her şey hazır → healthy:true, failedRequired boş', async () => {
    fullyReady()
    const r = await getPilotReadiness()
    expect(r.healthy).toBe(true)
    expect(r.failedRequired).toHaveLength(0)
  })

  it('Gmail bağlı değil → healthy:false (required transport/account fail)', async () => {
    fullyReady()
    gmailStatus.mockResolvedValue({ oauthConfigured: true, connected: false, verifiedEmail: null, requiredScopesOk: false, realSendTransportReady: false })
    const r = await getPilotReadiness()
    expect(r.healthy).toBe(false)
    expect(r.failedRequired).toContain('gmail_account')
    expect(r.failedRequired).toContain('gmail_transport')
  })

  it('LIFE 006 yok (code kolonu erişilemez) → healthy:false', async () => {
    fullyReady()
    lifeSelectError.value = { message: 'column "code" does not exist' }
    const r = await getPilotReadiness()
    expect(r.healthy).toBe(false)
    expect(r.failedRequired).toContain('life006')
  })

  it('uyum bilgisi eksik (MERSİS boş) → healthy:false', async () => {
    fullyReady()
    settingsRows.mersis_no = ''
    const r = await getPilotReadiness()
    expect(r.healthy).toBe(false)
    expect(r.failedRequired).toContain('compliance')
  })

  it('Voice DNA kalibre değil → required DEĞİL (healthy’yi düşürmez ama check false)', async () => {
    fullyReady()
    delete settingsRows.voice_dna
    const r = await getPilotReadiness()
    expect(r.healthy).toBe(true) // voice required değil
    expect(r.checks.find((c) => c.key === 'voice_dna')?.ok).toBe(false)
  })

  it('çekirdek env eksik → healthy:false', async () => {
    fullyReady()
    vi.stubEnv('OPENROUTER_API_KEY', '')
    const r = await getPilotReadiness()
    expect(r.healthy).toBe(false)
    expect(r.failedRequired).toContain('core_env')
  })

  it('gmail status throw → gmail kontrolleri false (fail-closed)', async () => {
    fullyReady()
    gmailStatus.mockRejectedValue(new Error('db down'))
    const r = await getPilotReadiness()
    expect(r.healthy).toBe(false)
    expect(r.failedRequired).toContain('gmail_oauth')
  })

  it('send bayrağı required DEĞİL; kapalıyken bile healthy olabilir', async () => {
    fullyReady()
    const r = await getPilotReadiness()
    expect(r.checks.find((c) => c.key === 'send_flag')?.ok).toBe(false)
    expect(r.healthy).toBe(true)
  })

  it('voice_dna bozuk JSON → voice check false (parse catch, healthy’yi düşürmez)', async () => {
    fullyReady()
    settingsRows.voice_dna = 'bu json değil {{{'
    const r = await getPilotReadiness()
    expect(r.checks.find((c) => c.key === 'voice_dna')?.ok).toBe(false)
    expect(r.healthy).toBe(true) // voice required değil
  })

  it('send bayrağı açık → send_flag check true', async () => {
    fullyReady()
    vi.stubEnv('GMAIL_SEND_ENABLED', 'true')
    const r = await getPilotReadiness()
    expect(r.checks.find((c) => c.key === 'send_flag')?.ok).toBe(true)
  })
})
