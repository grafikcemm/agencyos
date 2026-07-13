import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── LIFE mock: rpc (006 durum makinesi) + tablo (legacy/select/CAS update) ────
type RpcResult = {
  data: Array<{ acquired: boolean; attempt: number; claim_token: string | null }> | null
  error: { code: string } | null
}
let rpcResult: RpcResult
let selectStatus: string | null = null
let insertError: { code: string } | null = null
let insertThrows = false
let finalizeThrows = false
// finalize CAS mock: kaç satır etkilendi + hata
let finalizeRows: Array<{ update_id: number }> = [{ update_id: 1 }]
let finalizeError: { code: string } | null = null
const finalizeCalls: Array<{ patch: Record<string, unknown>; filters: Array<[string, unknown]> }> = []

vi.mock('@/lib/lifeSupabaseAdmin', () => ({
  lifeSupabaseAdmin: {
    rpc: async () => rpcResult,
    from: () => ({
      insert: async () => {
        if (insertThrows) throw new Error('bağlantı koptu')
        return { error: insertError }
      },
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: selectStatus ? { status: selectStatus } : null, error: null }) }),
      }),
      update: (patch: Record<string, unknown>) => {
        const filters: Array<[string, unknown]> = []
        const chain = {
          eq: (col: string, val: unknown) => {
            filters.push([col, val])
            return chain
          },
          select: async () => {
            if (finalizeThrows) throw new Error('finalize bağlantısı koptu')
            finalizeCalls.push({ patch, filters })
            return { data: finalizeError ? null : finalizeRows, error: finalizeError }
          },
        }
        return chain
      },
    }),
  },
}))

import {
  acquireUpdateClaim,
  completeUpdateClaim,
  failUpdateClaim,
  _resetMemoryClaims,
  type ClaimFence,
} from './updateClaims'

const TOKEN = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('telegram claim durum makinesi (Faz 0.1 — fencing)', () => {
  beforeEach(() => {
    _resetMemoryClaims()
    rpcResult = { data: [{ acquired: true, attempt: 1, claim_token: TOKEN }], error: null }
    selectStatus = null
    insertError = null
    insertThrows = false
    finalizeThrows = false
    finalizeRows = [{ update_id: 1 }]
    finalizeError = null
    finalizeCalls.length = 0
    vi.stubEnv('NODE_ENV', 'test')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('yeni update → state modunda acquired + fence (token+attempt)', async () => {
    const r = await acquireUpdateClaim(1)
    expect(r).toEqual({
      acquired: true,
      mode: 'state',
      attempt: 1,
      fence: { updateId: 1, token: TOKEN, attempt: 1 },
    })
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

  it('lease takeover: failed/stale satır YENİ token + attempt ile devralınır', async () => {
    rpcResult = { data: [{ acquired: true, attempt: 2, claim_token: 'yeni-token' }], error: null }
    const r = await acquireUpdateClaim(4)
    expect(r).toMatchObject({ acquired: true, mode: 'state', attempt: 2 })
    if (r.acquired && r.mode === 'state') {
      expect(r.fence.token).toBe('yeni-token')
      expect(r.fence.attempt).toBe(2)
    }
  })

  it('iki instance yarışı: kaybeden boş set + processing görür → in_progress', async () => {
    const first = await acquireUpdateClaim(5)
    rpcResult = { data: [], error: null }
    selectStatus = 'processing'
    _resetMemoryClaims()
    const second = await acquireUpdateClaim(5)
    expect(first.acquired).toBe(true)
    expect(second).toEqual({ acquired: false, reason: 'in_progress' })
  })

  it('RPC var ama token dönmüyor (eski 006) → PROD reddeder (fail-closed)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    rpcResult = { data: [{ acquired: true, attempt: 1, claim_token: null }], error: null }
    const r = await acquireUpdateClaim(11)
    expect(r).toEqual({ acquired: false, reason: 'unavailable' })
  })

  it('RPC yok (006 onay bekliyor, PGRST202) → legacy insert claim (fence yok)', async () => {
    rpcResult = { data: null, error: { code: 'PGRST202' } }
    const r = await acquireUpdateClaim(6)
    expect(r).toEqual({ acquired: true, mode: 'legacy', attempt: 1, fence: null })
    _resetMemoryClaims()
    insertError = { code: '23505' }
    const r2 = await acquireUpdateClaim(6)
    expect(r2).toEqual({ acquired: false, reason: 'duplicate' })
  })

  it('legacy insert BEKLENMEDİK hata → dev\'de memory moduna düşer; PROD\'da unavailable', async () => {
    rpcResult = { data: null, error: { code: 'PGRST202' } }
    insertError = { code: '57P01' }
    const r = await acquireUpdateClaim(21)
    expect(r).toEqual({ acquired: true, mode: 'memory', attempt: 1, fence: null })

    vi.stubEnv('NODE_ENV', 'production')
    _resetMemoryClaims()
    const r2 = await acquireUpdateClaim(22)
    expect(r2).toEqual({ acquired: false, reason: 'unavailable' })
  })

  it('legacy insert exception → memory fallback (dev)', async () => {
    rpcResult = { data: null, error: { code: 'PGRST202' } }
    insertThrows = true
    const r = await acquireUpdateClaim(23)
    expect(r).toEqual({ acquired: true, mode: 'memory', attempt: 1, fence: null })
  })

  it('PRODUCTION + durable erişilemez → FAIL-CLOSED unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    rpcResult = { data: null, error: { code: '57P01' } }
    const r = await acquireUpdateClaim(7)
    expect(r).toEqual({ acquired: false, reason: 'unavailable' })
  })

  it('dev + durable erişilemez → memory modu, duplicate yakalar', async () => {
    rpcResult = { data: null, error: { code: '57P01' } }
    const r1 = await acquireUpdateClaim(8)
    expect(r1).toEqual({ acquired: true, mode: 'memory', attempt: 1, fence: null })
    const r2 = await acquireUpdateClaim(8)
    expect(r2).toEqual({ acquired: false, reason: 'duplicate' })
  })
})

describe('finalize fencing (Faz 0.1 — complete/fail authoritative)', () => {
  const fence: ClaimFence = { updateId: 9, token: TOKEN, attempt: 3 }

  beforeEach(() => {
    finalizeRows = [{ update_id: 9 }]
    finalizeError = null
    finalizeCalls.length = 0
    vi.stubEnv('NODE_ENV', 'test')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('complete: CAS update_id+processing+token+attempt DÖRTLÜSÜNÜ filtreler, 1 satır → ok', async () => {
    const r = await completeUpdateClaim(fence)
    expect(r).toEqual({ ok: true })
    expect(finalizeCalls[0].patch).toMatchObject({ status: 'completed' })
    expect(finalizeCalls[0].filters).toEqual([
      ['update_id', 9],
      ['status', 'processing'],
      ['claim_token', TOKEN],
      ['attempt_count', 3],
    ])
  })

  it('fail: failed + last_error (300 truncate), aynı fence filtresi', async () => {
    const r = await failUpdateClaim(fence, 'x'.repeat(400))
    expect(r).toEqual({ ok: true })
    expect(finalizeCalls[0].patch).toMatchObject({ status: 'failed' })
    expect(String(finalizeCalls[0].patch.last_error)).toHaveLength(300)
  })

  it('complete DB hatası → ok:false reason db_error (route 200 DÖNEMEZ)', async () => {
    finalizeError = { code: '57P01' }
    const r = await completeUpdateClaim(fence)
    expect(r).toEqual({ ok: false, reason: 'db_error' })
  })

  it('fail DB hatası → ok:false reason db_error', async () => {
    finalizeError = { code: '57P01' }
    const r = await failUpdateClaim(fence, 'boom')
    expect(r).toEqual({ ok: false, reason: 'db_error' })
  })

  it('stale worker finalize: lease devralındı (0 satır etkilendi) → ok:false fenced', async () => {
    finalizeRows = [] // yeni worker token+attempt değiştirdi → eski fence 0 satır bulur.
    const r = await completeUpdateClaim(fence)
    expect(r).toEqual({ ok: false, reason: 'fenced' })
  })

  it('finalize EXCEPTION (bağlantı koptu) → ok:false db_error (route 200 dönemez)', async () => {
    finalizeThrows = true
    const r = await completeUpdateClaim(fence)
    expect(r).toEqual({ ok: false, reason: 'db_error' })
  })

  it('fence=null (legacy/memory) → yazılacak durum yok, ok:true (005 sınırı dokümante)', async () => {
    const r = await completeUpdateClaim(null)
    expect(r).toEqual({ ok: true })
    expect(finalizeCalls).toHaveLength(0)
  })
})
