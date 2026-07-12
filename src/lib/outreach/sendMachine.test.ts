import { describe, it, expect, beforeEach, vi } from 'vitest'

// sendMachine birim testleri — hata-enjeksiyonlu mock: CAS kaybı, insert
// hatası, RPC hatası ve reconcile dallarını gmail.test.ts'in kapsamadığı
// noktalarda doğrular.

interface Row extends Record<string, unknown> {
  id: string
}
let rows: Row[] = []
let seq = 0
let insertError: { message: string } | null = null
let updateError: { message: string } | null = null
let updateMatchesNothing = false
let rpcResult: { data: unknown; error: { message: string } | null } = { data: { ok: true }, error: null }
const rpcCalls: Array<Record<string, unknown>> = []

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => {
      const filters: Array<(r: Row) => boolean> = []
      let op: 'select' | 'insert' | 'update' = 'select'
      let payload: Record<string, unknown> | null = null
      const api: Record<string, unknown> = {}
      const exec = (single: boolean) => {
        if (op === 'insert' && payload) {
          if (insertError) return { data: null, error: insertError }
          if (rows.some((r) => r.outreach_message_id === payload!.outreach_message_id)) {
            return { data: null, error: { message: 'duplicate key value violates unique constraint 23505' } }
          }
          const row = { id: `att-${++seq}`, attempt_count: 1, finalized: false, sent_at: null,
            provider_message_id: null, provider_thread_id: null, last_error: null, ...payload } as Row
          rows.push(row)
          return { data: single ? row : [row], error: null }
        }
        if (op === 'update' && payload) {
          if (updateError) return { data: null, error: updateError }
          const matched = updateMatchesNothing ? [] : rows.filter((r) => filters.every((f) => f(r)))
          matched.forEach((r) => Object.assign(r, payload))
          return { data: single ? (matched[0] ?? null) : matched, error: null }
        }
        const matched = rows.filter((r) => filters.every((f) => f(r)))
        return { data: single ? (matched[0] ?? null) : matched, error: null }
      }
      Object.assign(api, {
        select: () => api,
        eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api },
        in: (c: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[c])); return api },
        insert: (p: Record<string, unknown>) => { op = 'insert'; payload = p; return api },
        update: (p: Record<string, unknown>) => { op = 'update'; payload = p; return api },
        maybeSingle: async () => exec(true),
        then: (res: (v: unknown) => unknown) => Promise.resolve(exec(false)).then(res),
      })
      return api
    },
    rpc: async (_fn: string, args: Record<string, unknown>) => {
      rpcCalls.push(args)
      return rpcResult
    },
  },
}))

import {
  claimSendAttempt, markSending, markFailed, finalizeSend, reconcileSendAttempt,
  buildRfcMessageId, createDryRunTransport, type SendAttempt, type GmailTransport,
} from './sendMachine'

const OID = 'out-1'

function seedAttempt(patch: Partial<SendAttempt> = {}): SendAttempt {
  const att = {
    id: `att-${++seq}`, outreach_message_id: OID, approval_id: 'app-1',
    action_digest: 'd', rfc_message_id: buildRfcMessageId(OID),
    state: 'claimed', claim_token: 'tok-1', attempt_count: 1,
    claimed_at: new Date().toISOString(), sent_at: null,
    provider_message_id: null, provider_thread_id: null, finalized: false, last_error: null,
    reconcile_search_count: 0, last_searched_at: null,
    ...patch,
  } as SendAttempt
  rows.push(att as unknown as Row)
  return att
}

function content() {
  return { approvalId: 'app-1', fromAddress: 'f@x', toAddress: 't@y', subject: 'K', body: 'G' }
}

beforeEach(() => {
  rows = []
  seq = 0
  insertError = null
  updateError = null
  updateMatchesNothing = false
  rpcResult = { data: { ok: true }, error: null }
  rpcCalls.length = 0
})

describe('claimSendAttempt kenar durumları', () => {
  it('unique-dışı insert hatası → kind:error (sessiz yutulmaz)', async () => {
    insertError = { message: 'connection reset' }
    const r = await claimSendAttempt({ outreachMessageId: OID, approvalId: 'app-1', actionDigest: 'd' })
    expect(r.kind).toBe('error')
  })

  it('failed satırda re-claim CAS kaybedilirse inProgress döner', async () => {
    seedAttempt({ state: 'failed' })
    updateMatchesNothing = true // başka process önce davrandı simülasyonu
    const r = await claimSendAttempt({ outreachMessageId: OID, approvalId: 'app-1', actionDigest: 'd' })
    expect(r.kind).toBe('inProgress')
  })
})

describe('CAS geçişleri', () => {
  it('markSending: update hatası → null (provider ÇAĞRILMAMALI sinyali)', async () => {
    const att = seedAttempt()
    updateError = { message: 'db down' }
    expect(await markSending(att)).toBeNull()
  })

  it('markFailed: yanlış claim_token → null (yalnız sahibi geçirebilir)', async () => {
    const att = seedAttempt()
    const stolen = { ...att, claim_token: 'baska-token' }
    expect(await markFailed(stolen, 'x')).toBeNull()
  })
})

describe('finalizeSend', () => {
  it('rpc taşıma hatası → ok:false + mesaj', async () => {
    const att = seedAttempt({ state: 'sent' })
    rpcResult = { data: null, error: { message: 'tx aborted' } }
    const r = await finalizeSend({ attempt: att, ...content(), gmailMessageId: 'g1', gmailThreadId: 't1', sentAtIso: att.claimed_at })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('tx aborted')
  })

  it('rpc ok:false gövdesi → ok:false + rpc nedeni', async () => {
    const att = seedAttempt({ state: 'sent' })
    rpcResult = { data: { ok: false, error: 'attempt_veya_claim_token_uyusmuyor' }, error: null }
    const r = await finalizeSend({ attempt: att, ...content(), gmailMessageId: 'g1', gmailThreadId: 't1', sentAtIso: att.claimed_at })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('uyusmuyor')
  })
})

describe('reconcileSendAttempt', () => {
  it('sent + finalized=false → yalnız finalize onarımı (transport HİÇ aranmaz)', async () => {
    const att = seedAttempt({ state: 'sent', provider_message_id: 'g-9', provider_thread_id: 't-9' })
    let searched = false
    const transport: GmailTransport = {
      async send() { throw new Error('çağrılmamalı') },
      async findByRfcMessageId() { searched = true; return null },
    }
    const r = await reconcileSendAttempt({ attempt: att, transport, ...content() })
    expect(r.outcome).toBe('reconciled_sent')
    expect(searched).toBe(false)
    expect(rpcCalls).toHaveLength(1)
  })

  it('grace period içinde "yok" sonucu HÜKÜMSÜZ → no_action, sayaç artmaz', async () => {
    const att = seedAttempt({ state: 'unknown' }) // claimed_at = şimdi
    const r = await reconcileSendAttempt({ attempt: att, transport: createDryRunTransport(OID), ...content() })
    expect(r.outcome).toBe('no_action')
    expect(String((r as { reason?: string }).reason)).toContain('grace')
    expect(rows[0].reconcile_search_count ?? 0).toBe(0)
  })

  it('unknown + aramada BULUNDU → reconciled finalize (p_final_state=reconciled)', async () => {
    const att = seedAttempt({ state: 'unknown', claimed_at: new Date(Date.now() - 10 * 60_000).toISOString() })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const transport: GmailTransport = {
      async send() { throw new Error('çağrılmamalı') },
      async findByRfcMessageId(id) {
        expect(id).toBe(buildRfcMessageId(OID))
        return { id: 'g-found', threadId: 't-found' }
      },
    }
    const r = await reconcileSendAttempt({ attempt: att, transport, ...content() })
    expect(r.outcome).toBe('reconciled_sent')
    expect(rpcCalls[0].p_final_state).toBe('reconciled')
    expect(rpcCalls[0].p_gmail_message_id).toBe('g-found')
    warnSpy.mockRestore()
  })

  it('arama transport hatası → outcome:error; durum ve SAYAÇ değişmez (hata ≠ not-found)', async () => {
    const att = seedAttempt({ state: 'unknown', claimed_at: new Date(Date.now() - 10 * 60_000).toISOString() })
    const transport: GmailTransport = {
      async send() { throw new Error('x') },
      async findByRfcMessageId() { throw new Error('readonly OAuth yok') },
    }
    const r = await reconcileSendAttempt({ attempt: att, transport, ...content() })
    expect(r.outcome).toBe('error')
    expect(rows[0].state).toBe('unknown')
    expect(rows[0].reconcile_search_count ?? 0).toBe(0)
  })

  it('kademeli not-found: 1. arama unconfirmed → 2. arama needs_confirmation → confirm ile failed', async () => {
    const old = new Date(Date.now() - 10 * 60_000).toISOString()
    seedAttempt({ state: 'unknown', claimed_at: old })
    const dry = createDryRunTransport(OID) // find → null

    const r1 = await reconcileSendAttempt({ attempt: rows[0] as unknown as SendAttempt, transport: dry, ...content() })
    expect(r1.outcome).toBe('not_found_unconfirmed')
    expect(rows[0].reconcile_search_count).toBe(1)
    expect(rows[0].state).toBe('unknown')

    const r2 = await reconcileSendAttempt({ attempt: rows[0] as unknown as SendAttempt, transport: dry, ...content() })
    expect(r2.outcome).toBe('not_found_needs_confirmation')
    expect(rows[0].state).toBe('unknown') // confirm'süz failed YAZILMAZ

    const r3 = await reconcileSendAttempt({
      attempt: rows[0] as unknown as SendAttempt, transport: dry, ...content(), confirmNotFound: true,
    })
    expect(r3.outcome).toBe('not_found_marked_failed')
    expect(rows[0].state).toBe('failed')
  })

  it('bulunamadı + confirm ama failed CAS kaybedildi → error (yeniden kontrol iste)', async () => {
    const att = seedAttempt({
      state: 'unknown',
      claimed_at: new Date(Date.now() - 10 * 60_000).toISOString(),
      reconcile_search_count: 2,
    })
    updateMatchesNothing = true
    const r = await reconcileSendAttempt({
      attempt: att, transport: createDryRunTransport(OID), ...content(), confirmNotFound: true,
    })
    expect(r.outcome).toBe('error')
  })

  it('finalize hatasında repair yolu error döner (kayıp yok)', async () => {
    const att = seedAttempt({ state: 'sent', provider_message_id: 'g-9' })
    rpcResult = { data: null, error: { message: 'tx fail' } }
    const r = await reconcileSendAttempt({ attempt: att, transport: createDryRunTransport(OID), ...content() })
    expect(r.outcome).toBe('error')
  })
})
