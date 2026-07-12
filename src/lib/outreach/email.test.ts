import { describe, it, expect, beforeEach, vi } from 'vitest'

// Faz 3 (audit bulgu #3): email satırı manuel endpoint'le 'sent' YAPILAMAZ —
// tek yürütme yolu sendGmailMessage/state machine. Kanal DB'den doğrulanır.

const rows: Array<Record<string, unknown>> = []

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => {
      const filters: Array<(r: Record<string, unknown>) => boolean> = []
      let op: 'select' | 'update' = 'select'
      let patch: Record<string, unknown> | null = null
      const api: Record<string, unknown> = {}
      Object.assign(api, {
        select: () => api,
        eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api },
        update: (p: Record<string, unknown>) => { op = 'update'; patch = p; return api },
        single: async () => {
          const m = rows.filter((r) => filters.every((f) => f(r)))
          if (op === 'update' && patch) m.forEach((r) => Object.assign(r, patch))
          return m[0] ? { data: m[0], error: null } : { data: null, error: { message: 'not found' } }
        },
        then: (resolve: (v: unknown) => unknown) => {
          const m = rows.filter((r) => filters.every((f) => f(r)))
          if (op === 'update' && patch) m.forEach((r) => Object.assign(r, patch))
          return Promise.resolve({ data: m, error: null }).then(resolve)
        },
      })
      return api
    },
  },
}))

import { markMessageSent } from './email'

beforeEach(() => {
  rows.length = 0
})

describe('markMessageSent — kanal kapısı (Faz 3)', () => {
  it("email kanalı satırı BLOKE edilir; status 'sent' OLMAZ", async () => {
    rows.push({ id: 'm1', status: 'draft', channel: 'email' })
    const r = await markMessageSent('m1')
    expect(r.ok).toBe(false)
    expect(r.blocked).toBe(true)
    expect(r.error).toContain('Gmail HITL')
    expect(rows[0].status).toBe('draft') // yazım yapılmadı
  })

  it('whatsapp kanalı satırı sent işaretlenir (gerçek manuel kanal)', async () => {
    rows.push({ id: 'm2', status: 'draft', channel: 'whatsapp' })
    const r = await markMessageSent('m2')
    expect(r.ok).toBe(true)
    expect(rows[0].status).toBe('sent')
    expect(rows[0].sent_at).toBeTruthy()
  })

  it('zaten sent (manuel kanal) → idempotent no-op', async () => {
    rows.push({ id: 'm3', status: 'sent', channel: 'instagram' })
    const r = await markMessageSent('m3')
    expect(r.ok).toBe(true)
  })

  it('bulunamayan satır → hata', async () => {
    const r = await markMessageSent('yok')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('bulunamadı')
  })
})
