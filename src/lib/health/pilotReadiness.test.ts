import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Faz 7 — pilot-readiness sağlık kapısı: healthy YALNIZ tüm required kontroller
// geçince true. Gmail/OAuth/scope/hesap/transport/LIFE006/uyum eksikken false.

const gmailStatus = vi.fn()
vi.mock('@/lib/gmail/status', () => ({ getGmailStatus: () => gmailStatus() }))
const webhookInfo = vi.fn()
vi.mock('@/lib/telegram/client', () => ({ getWebhookInfo: () => webhookInfo() }))

const settingsRows: Record<string, string | null> = {}
const schemaErrors: Record<string, { message: string } | null> = {}
const lifeSelectError = { value: null as { message: string } | null }
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const filters: string[] = []
      const api: Record<string, unknown> = {}
      Object.assign(api, {
        select: () => api,
        eq: (_c: string, v: unknown) => { filters.push(String(v)); return api },
        in: (_c: string, vals: string[]) => { filters.push(...vals); return api },
        limit: () => api,
        maybeSingle: async () => {
          const key = filters[0]
          return {
            data: table === 'settings' && settingsRows[key] != null ? { value: settingsRows[key] } : null,
            error: schemaErrors[table] ?? null,
          }
        },
        then: (res: (v: unknown) => unknown) => {
          const rows = table === 'settings'
            ? filters.filter((k) => settingsRows[k] != null).map((k) => ({ key: k, value: settingsRows[k] }))
            : []
          return Promise.resolve({ data: rows, error: schemaErrors[table] ?? null }).then(res)
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
    requiredScopesOk: true, realSendTransportReady: true, sendEnabled: true,
    ingestEnabled: true, hasHistoryCursor: true,
  })
  webhookInfo.mockResolvedValue({ ok: true, info: { url: 'https://agency.example/api/telegram' } })
  settingsRows.voice_dna = JSON.stringify({ positive: ['kısa yaz'], negative: [] })
  settingsRows.ticaret_unvani = 'Ali Cem Bozma'
  settingsRows.mersis_no = '0000000000000000'
  settingsRows.gmail_last_ingest_ok = new Date().toISOString()
  lifeSelectError.value = null
}

beforeEach(() => {
  for (const k of Object.keys(settingsRows)) delete settingsRows[k]
  for (const k of Object.keys(schemaErrors)) delete schemaErrors[k]
  gmailStatus.mockReset()
  webhookInfo.mockReset()
  lifeSelectError.value = null
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'x')
  vi.stubEnv('OPENROUTER_API_KEY', 'x')
  vi.stubEnv('CRON_SECRET', 'x')
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'x')
  vi.stubEnv('TELEGRAM_CHAT_ID', '1')
  vi.stubEnv('TELEGRAM_USER_ID', '1')
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'x')
  vi.stubEnv('APP_URL', 'https://agency.example')
  vi.stubEnv('VERCEL_PRO_PLAN_CONFIRMED', 'true')
  vi.stubEnv('EXTERNAL_CRON_SCHEDULER_CONFIRMED', '')
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

  it('Voice DNA kalibre değil → ikna kişiselleştirmesi eksik, healthy:false', async () => {
    fullyReady()
    delete settingsRows.voice_dna
    const r = await getPilotReadiness()
    expect(r.healthy).toBe(false)
    expect(r.failedRequired).toContain('voice_dna')
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

  it('send bayrağı kapalı → gerçek pilot hazır sayılmaz', async () => {
    fullyReady()
    gmailStatus.mockResolvedValue({
      oauthConfigured: true, connected: true, verifiedEmail: 'ops@x.com',
      requiredScopesOk: true, realSendTransportReady: true, sendEnabled: false,
      ingestEnabled: true, hasHistoryCursor: true,
    })
    const r = await getPilotReadiness()
    expect(r.checks.find((c) => c.key === 'send_flag')?.ok).toBe(false)
    expect(r.healthy).toBe(false)
    expect(r.failedRequired).toContain('send_flag')
  })

  it('voice_dna bozuk JSON → voice check false (parse catch, healthy’yi düşürmez)', async () => {
    fullyReady()
    settingsRows.voice_dna = 'bu json değil {{{'
    const r = await getPilotReadiness()
    expect(r.checks.find((c) => c.key === 'voice_dna')?.ok).toBe(false)
    expect(r.healthy).toBe(false)
  })

  it('send bayrağı açık → send_flag check true', async () => {
    fullyReady()
    const r = await getPilotReadiness()
    expect(r.checks.find((c) => c.key === 'send_flag')?.ok).toBe(true)
  })

  it('kanonik gelir şeması eksik → healthy:false', async () => {
    fullyReady()
    schemaErrors.proposals = { message: 'relation does not exist' }
    const r = await getPilotReadiness()
    expect(r.failedRequired).toContain('revenue_schema')
  })

  it('Telegram webhook provider URL’i beklenen deploy ile eşleşmiyor → healthy:false', async () => {
    fullyReady()
    webhookInfo.mockResolvedValue({ ok: true, info: { url: 'https://eski.example/api/telegram' } })
    const r = await getPilotReadiness()
    expect(r.failedRequired).toContain('telegram_webhook')
  })

  it('ingest heartbeat 12 saatten eski → healthy:false', async () => {
    fullyReady()
    settingsRows.gmail_last_ingest_ok = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString()
    const r = await getPilotReadiness()
    expect(r.failedRequired).toContain('last_ingest')
  })

  it('Vercel Pro scheduler doğrulanmamış → sub-daily otomasyon hazır sayılmaz', async () => {
    fullyReady()
    vi.stubEnv('VERCEL_PRO_PLAN_CONFIRMED', '')
    const r = await getPilotReadiness()
    expect(r.failedRequired).toContain('scheduler_plan')
  })

  it('doğrulanmış harici scheduler → Vercel Pro olmadan hazır sayılır', async () => {
    fullyReady()
    vi.stubEnv('VERCEL_PRO_PLAN_CONFIRMED', '')
    vi.stubEnv('EXTERNAL_CRON_SCHEDULER_CONFIRMED', 'true')
    const r = await getPilotReadiness()
    expect(r.failedRequired).not.toContain('scheduler_plan')
  })
})
