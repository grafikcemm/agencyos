import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── LIFE mock: rpc (006 durum makinesi) + tablo (legacy/select/update) ────────
type RpcResult = { data: Array<{ acquired: boolean; attempt: number }> | null; error: { code: string } | null }
let rpcResult: RpcResult
let selectStatus: string | null = null
let insertError: { code: string } | null = null
const updates: Array<Record<string, unknown>> = []

vi.mock('@/lib/lifeSupabaseAdmin', () => ({
  lifeSupabaseAdmin: {
    rpc: async () => rpcResult,
    from: () => ({
      insert: async () => ({ error: insertError }),
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: selectStatus ? { status: selectStatus } : null, error: null }) }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: () => ({
          eq: async () => {
            updates.push(payload)
            return { error: null }
          },
        }),
      }),
    }),
  },
}))

import {
  acquireUpdateClaim,
  completeUpdateClaim,
  failUpdateClaim,
  _resetMemoryClaims,
} from './updateClaims'

describe('telegram claim durum makinesi (Faz 0.3)', () => {
  beforeEach(() => {
    _resetMemoryClaims()
    rpcResult = { data: [{ acquired: true, attempt: 1 }], error: null }
    selectStatus = null
    insertError = null
    updates.length = 0
    vi.stubEnv('NODE_ENV', 'test')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('yeni update → state modunda acquired (processing lease)', async () => {
    const r = await acquireUpdateClaim(1)
    expect(r).toEqual({ acquired: true, mode: 'state', attempt: 1 })
  })

  it('completed update → KESİN no-op (duplicate)', async () => {
    rpcResult = { data: [], error: null }
    selectStatus = 'completed'
    const r = await acquireUpdateClaim(2)
    expect(r).toEqual({ acquired: false, reason: 'duplicate' })
  })

  it('taze processing (başka instance lease içinde) → in_progress, işleme YOK', async () => {
    rpcResult = { data: [], error: null }
    selectStatus = 'processing'
    const r = await acquireUpdateClaim(3)
    expect(r).toEqual({ acquired: false, reason: 'in_progress' })
  })

  it('crash-after-claim senaryosu: failed satır YENİDEN devralınır (attempt artar) — mesaj kaybolmaz', async () => {
    // RPC'nin ON CONFLICT ... WHERE failed dalını simüle eder.
    rpcResult = { data: [{ acquired: true, attempt: 2 }], error: null }
    const r = await acquireUpdateClaim(4)
    expect(r).toEqual({ acquired: true, mode: 'state', attempt: 2 })
  })

  it('iki instance yarışı: RPC atomik — kaybeden boş set + processing görür → in_progress', async () => {
    const first = await acquireUpdateClaim(5)
    rpcResult = { data: [], error: null }
    selectStatus = 'processing'
    _resetMemoryClaims() // ikinci instance'ın belleği ayrı
    const second = await acquireUpdateClaim(5)
    expect(first.acquired).toBe(true)
    expect(second).toEqual({ acquired: false, reason: 'in_progress' })
  })

  it('RPC yok (006 onay bekliyor, PGRST202) → legacy insert claim çalışır', async () => {
    rpcResult = { data: null, error: { code: 'PGRST202' } }
    const r = await acquireUpdateClaim(6)
    expect(r).toEqual({ acquired: true, mode: 'legacy', attempt: 1 })
    // legacy duplicate:
    _resetMemoryClaims()
    insertError = { code: '23505' }
    const r2 = await acquireUpdateClaim(6)
    expect(r2).toEqual({ acquired: false, reason: 'duplicate' })
  })

  it('PRODUCTION + durable erişilemez → FAIL-CLOSED unavailable (memory başarı taklidi YOK)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    rpcResult = { data: null, error: { code: '57P01' } } // DB down benzeri
    const r = await acquireUpdateClaim(7)
    expect(r).toEqual({ acquired: false, reason: 'unavailable' })
  })

  it('dev + durable erişilemez → memory modu (açık etiketli), duplicate yakalar', async () => {
    rpcResult = { data: null, error: { code: '57P01' } }
    const r1 = await acquireUpdateClaim(8)
    expect(r1).toEqual({ acquired: true, mode: 'memory', attempt: 1 })
    const r2 = await acquireUpdateClaim(8)
    expect(r2).toEqual({ acquired: false, reason: 'duplicate' })
  })

  it('complete → status completed CAS (yalnız processing satır); fail → failed + last_error', async () => {
    await completeUpdateClaim(9)
    await failUpdateClaim(10, 'x'.repeat(400))
    expect(updates[0]).toMatchObject({ status: 'completed' })
    expect(updates[1]).toMatchObject({ status: 'failed' })
    expect(String(updates[1].last_error)).toHaveLength(300) // truncate
  })
})
