import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// GERÇEK Gmail REST transport contract testleri (Faz 1). Fake HTTP sınırı —
// gerçek ağ çağrısı SIFIR. Sözleşme: 4xx kesin, timeout/ağ/5xx/bozuk-gövde
// belirsiz; arama hatası ≠ not-found; pagination deterministik; token/PII
// hata metnine sızmaz; reconcile YALNIZ arama endpoint'ine çıkar.
// ─────────────────────────────────────────────────────────────────────────────

interface Row extends Record<string, unknown> {
  id: string
}
let rows: Row[] = []
let seq = 0

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => {
      const filters: Array<(r: Row) => boolean> = []
      let op: 'select' | 'insert' | 'update' = 'select'
      let payload: Record<string, unknown> | null = null
      const api: Record<string, unknown> = {}
      const exec = (single: boolean) => {
        if (op === 'update' && payload) {
          const matched = rows.filter((r) => filters.every((f) => f(r)))
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
        order: () => api,
        limit: () => api,
        insert: (p: Record<string, unknown>) => { op = 'insert'; payload = p; return api },
        update: (p: Record<string, unknown>) => { op = 'update'; payload = p; return api },
        maybeSingle: async () => exec(true),
        then: (res: (v: unknown) => unknown) => Promise.resolve(exec(false)).then(res),
      })
      return api
    },
    rpc: async () => ({ data: { ok: true }, error: null }),
  },
}))

import { createGmailRestTransport, sanitizeProviderDetail, GMAIL_SEARCH_MAX_PAGES } from './gmailRestTransport'
import {
  GmailTransportError,
  reconcileSendAttempt,
  buildRfcMessageId,
  type SendAttempt,
} from './sendMachine'

const ACCOUNT = { email_address: 'ops@ajans.example' }
const okToken = async () => ({ ok: true as const, accessToken: 'ya29.SECRET-ACCESS' })
const failToken = async () => ({ ok: false as const, error: 'aktif gmail hesabı yok — önce OAuth bağlantısı (kullanıcı aksiyonu)' })

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

type FetchCall = { url: string; init?: RequestInit }
function recordingFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: FetchCall[] = []
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return handler(String(url), init)
  }) as typeof fetch
  return { impl, calls }
}

beforeEach(() => {
  rows = []
  seq = 0
})

describe('send() — gerçek REST sözleşmesi', () => {
  it('başarı: users.messages.send + Bearer + {raw}; {id, threadId} döner', async () => {
    const { impl, calls } = recordingFetch(() => jsonResponse(200, { id: 'gm-1', threadId: 'th-1' }))
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: impl, getAccessTokenImpl: okToken })
    const res = await t.send({ fromAddress: ACCOUNT.email_address, raw: 'BASE64RAW' })
    expect(res).toEqual({ id: 'gm-1', threadId: 'th-1' })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send')
    expect((calls[0].init!.headers as Record<string, string>).Authorization).toBe('Bearer ya29.SECRET-ACCESS')
    expect(JSON.parse(calls[0].init!.body as string)).toEqual({ raw: 'BASE64RAW' })
  })

  it('token alınamadı → ambiguous=false ve provider fetch HİÇ çağrılmaz', async () => {
    const { impl, calls } = recordingFetch(() => jsonResponse(200, {}))
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: impl, getAccessTokenImpl: failToken })
    const err = await t.send({ fromAddress: ACCOUNT.email_address, raw: 'x' }).catch((e) => e)
    expect(err).toBeInstanceOf(GmailTransportError)
    expect((err as GmailTransportError).ambiguous).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('4xx → ambiguous=false; hata metninde token/raw/e-posta YOK', async () => {
    const { impl } = recordingFetch(() =>
      jsonResponse(403, { error: { status: 'PERMISSION_DENIED', message: 'Delegation denied for kisi@musteri.example' } }),
    )
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: impl, getAccessTokenImpl: okToken })
    const err = (await t.send({ fromAddress: ACCOUNT.email_address, raw: 'GIZLIRAW' }).catch((e) => e)) as GmailTransportError
    expect(err.ambiguous).toBe(false)
    expect(err.message).toContain('403')
    expect(err.message).toContain('PERMISSION_DENIED')
    expect(err.message).not.toContain('ya29')
    expect(err.message).not.toContain('GIZLIRAW')
    expect(err.message).not.toContain('kisi@musteri.example')
    expect(err.message).toContain('<redacted-email>')
  })

  it('5xx → ambiguous=true (mail gitmiş olabilir)', async () => {
    const { impl } = recordingFetch(() => jsonResponse(503, { error: { status: 'UNAVAILABLE' } }))
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: impl, getAccessTokenImpl: okToken })
    const err = (await t.send({ fromAddress: ACCOUNT.email_address, raw: 'x' }).catch((e) => e)) as GmailTransportError
    expect(err.ambiguous).toBe(true)
    expect(err.message).toContain('503')
  })

  it('timeout (AbortController) → ambiguous=true', async () => {
    const hangingFetch = ((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('The operation was aborted')
          e.name = 'AbortError'
          reject(e)
        })
      })) as typeof fetch
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: hangingFetch, getAccessTokenImpl: okToken, timeoutMs: 5 })
    const err = (await t.send({ fromAddress: ACCOUNT.email_address, raw: 'x' }).catch((e) => e)) as GmailTransportError
    expect(err).toBeInstanceOf(GmailTransportError)
    expect(err.ambiguous).toBe(true)
    expect(err.message).toContain('timeout')
  })

  it('ağ hatası → ambiguous=true; hata metni yalnız hata SINIFI taşır', async () => {
    const netFail = (async () => {
      const e = new Error('connect ECONNRESET 142.250.0.1:443 raw=SECRETBODY')
      e.name = 'FetchError'
      throw e
    }) as typeof fetch
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: netFail, getAccessTokenImpl: okToken })
    const err = (await t.send({ fromAddress: ACCOUNT.email_address, raw: 'x' }).catch((e) => e)) as GmailTransportError
    expect(err.ambiguous).toBe(true)
    expect(err.message).toContain('FetchError')
    expect(err.message).not.toContain('SECRETBODY')
  })

  it('4xx + error nesnesi olmayan gövde → "detay yok"; ambiguous=false', async () => {
    const { impl } = recordingFetch(() => jsonResponse(400, {}))
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: impl, getAccessTokenImpl: okToken })
    const err = (await t.send({ fromAddress: ACCOUNT.email_address, raw: 'x' }).catch((e) => e)) as GmailTransportError
    expect(err.ambiguous).toBe(false)
    expect(err.message).toContain('400')
    expect(err.message).toContain('detay yok')
  })

  it('4xx + JSON olmayan hata gövdesi → "detay ayrıştırılamadı"', async () => {
    const { impl } = recordingFetch(() => new Response('<html>gateway</html>', { status: 429 }))
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: impl, getAccessTokenImpl: okToken })
    const err = (await t.send({ fromAddress: ACCOUNT.email_address, raw: 'x' }).catch((e) => e)) as GmailTransportError
    expect(err.message).toContain('429')
    expect(err.message).toContain('ayrıştırılamadı')
  })

  it('2xx ama bozuk gövde (id/threadId yok) → ambiguous=true', async () => {
    const { impl } = recordingFetch(() => new Response('not-json{', { status: 200 }))
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: impl, getAccessTokenImpl: okToken })
    const err = (await t.send({ fromAddress: ACCOUNT.email_address, raw: 'x' }).catch((e) => e)) as GmailTransportError
    expect(err.ambiguous).toBe(true)
    expect(err.message).toContain('belirsiz')
  })
})

describe('findByRfcMessageId() — arama sözleşmesi', () => {
  const RFC = buildRfcMessageId('out-1')

  it('boş sonuç (tüm sayfalar) → null; sorgu rfc822msgid içerir', async () => {
    const { impl, calls } = recordingFetch(() => jsonResponse(200, { messages: [] }))
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: impl, getAccessTokenImpl: okToken })
    expect(await t.findByRfcMessageId(RFC)).toBeNull()
    expect(calls[0].url).toContain(encodeURIComponent(`rfc822msgid:${RFC}`))
  })

  it('pagination: 2 sayfa birleşir; sonuç id-sıralı DETERMİNİSTİK ilk kayıt', async () => {
    const { impl, calls } = recordingFetch((url) => {
      if (!url.includes('pageToken')) {
        return jsonResponse(200, { messages: [{ id: 'zzz', threadId: 'tz' }], nextPageToken: 'p2' })
      }
      return jsonResponse(200, { messages: [{ id: 'aaa', threadId: 'ta' }] })
    })
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: impl, getAccessTokenImpl: okToken })
    const found = await t.findByRfcMessageId(RFC)
    expect(found).toEqual({ id: 'aaa', threadId: 'ta' }) // 2. sayfadan gelse de id-sıralı ilk
    expect(calls).toHaveLength(2)
    expect(calls[1].url).toContain('pageToken=p2')
  })

  it('eksik-alanlı mesaj (threadId yok) atlanır; geçerli kayıt seçilir', async () => {
    const { impl } = recordingFetch(() =>
      jsonResponse(200, { messages: [{ id: 'partial' }, { id: 'gm-ok', threadId: 'th-ok' }] }),
    )
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: impl, getAccessTokenImpl: okToken })
    expect(await t.findByRfcMessageId(RFC)).toEqual({ id: 'gm-ok', threadId: 'th-ok' })
  })

  it('yalnız eksik-alanlı mesaj varsa → null (geçerli sonuç yok)', async () => {
    const { impl } = recordingFetch(() => jsonResponse(200, { messages: [{ id: 'partial' }] }))
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: impl, getAccessTokenImpl: okToken })
    expect(await t.findByRfcMessageId(RFC)).toBeNull()
  })

  it('provider hatası (500) → THROW; asla null/not-found sayılmaz', async () => {
    const { impl } = recordingFetch(() => jsonResponse(500, { error: { status: 'INTERNAL' } }))
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: impl, getAccessTokenImpl: okToken })
    await expect(t.findByRfcMessageId(RFC)).rejects.toBeInstanceOf(GmailTransportError)
  })

  it('pagination üst sınırı aşılırsa THROW (yarım arama not-found olamaz)', async () => {
    const { impl, calls } = recordingFetch(() => jsonResponse(200, { messages: [], nextPageToken: 'daha-var' }))
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: impl, getAccessTokenImpl: okToken })
    await expect(t.findByRfcMessageId(RFC)).rejects.toThrow(/tamamlanamadı/)
    expect(calls).toHaveLength(GMAIL_SEARCH_MAX_PAGES)
  })

  it('bozuk arama gövdesi → THROW (belirsiz)', async () => {
    const { impl } = recordingFetch(() => new Response('bozuk', { status: 200 }))
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: impl, getAccessTokenImpl: okToken })
    await expect(t.findByRfcMessageId(RFC)).rejects.toThrow(/ayrıştırılamadı/)
  })

  it('token alınamadı → THROW ambiguous=false; fetch çağrılmaz', async () => {
    const { impl, calls } = recordingFetch(() => jsonResponse(200, {}))
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: impl, getAccessTokenImpl: failToken })
    const err = (await t.findByRfcMessageId(RFC).catch((e) => e)) as GmailTransportError
    expect(err.ambiguous).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

// ── Reconcile entegrasyonu: GERÇEK transport + fake HTTP + mock DB ────────────

function seedAttempt(patch: Partial<SendAttempt> = {}): SendAttempt {
  const att = {
    id: `att-${++seq}`, outreach_message_id: 'out-1', approval_id: 'app-1',
    action_digest: 'd', rfc_message_id: buildRfcMessageId('out-1'),
    state: 'unknown', claim_token: 'tok-1', attempt_count: 1,
    claimed_at: new Date(Date.now() - 10 * 60_000).toISOString(), sent_at: null,
    provider_message_id: null, provider_thread_id: null, finalized: false, last_error: null,
    reconcile_search_count: 0, last_searched_at: null,
    ...patch,
  } as SendAttempt
  rows.push(att as unknown as Row)
  return att
}

const reconcileContent = () => ({
  approvalId: 'app-1',
  fromAddress: ACCOUNT.email_address,
  toAddress: 'alici@musteri.example',
  subject: 'Konu',
  body: 'Gövde',
})

describe('reconcile × gerçek transport (fake HTTP)', () => {
  it('unknown → aramada BULUNDU → reconciled_sent; yalnız ARAMA endpoint’i çağrılır (send asla)', async () => {
    const att = seedAttempt()
    const { impl, calls } = recordingFetch(() =>
      jsonResponse(200, { messages: [{ id: 'gm-found', threadId: 'th-found' }] }),
    )
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: impl, getAccessTokenImpl: okToken })
    const r = await reconcileSendAttempt({ attempt: att, transport: t, ...reconcileContent() })
    expect(r).toEqual({ outcome: 'reconciled_sent', providerMessageId: 'gm-found' })
    expect(calls.every((c) => !c.url.endsWith('/messages/send'))).toBe(true)
    expect(calls.some((c) => c.url.includes('rfc822msgid'))).toBe(true)
  })

  it('unknown → not-found zinciri: 1. arama unconfirmed → 2. arama confirmation bekler → confirmNotFound=true ile failed', async () => {
    const att = seedAttempt()
    const { impl } = recordingFetch(() => jsonResponse(200, { messages: [] }))
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: impl, getAccessTokenImpl: okToken })

    const r1 = await reconcileSendAttempt({ attempt: att, transport: t, ...reconcileContent() })
    expect(r1).toEqual({ outcome: 'not_found_unconfirmed', searchCount: 1 })

    const att2 = { ...att, reconcile_search_count: 1 }
    const r2 = await reconcileSendAttempt({ attempt: att2, transport: t, ...reconcileContent() })
    expect(r2).toEqual({ outcome: 'not_found_needs_confirmation', searchCount: 2 })

    const att3 = { ...att, reconcile_search_count: 2 }
    const r3 = await reconcileSendAttempt({ attempt: att3, transport: t, ...reconcileContent(), confirmNotFound: true })
    expect(r3).toEqual({ outcome: 'not_found_marked_failed' })
  })

  it('arama provider hatası → outcome error; sayaç/karar İLERLEMEZ', async () => {
    const att = seedAttempt()
    const { impl } = recordingFetch(() => jsonResponse(503, { error: { status: 'UNAVAILABLE' } }))
    const t = createGmailRestTransport(ACCOUNT, { fetchImpl: impl, getAccessTokenImpl: okToken })
    const r = await reconcileSendAttempt({ attempt: att, transport: t, ...reconcileContent() })
    expect(r.outcome).toBe('error')
    const row = rows.find((x) => x.id === att.id)!
    expect(row.reconcile_search_count).toBe(0)
    expect(row.state).toBe('unknown')
  })
})

describe('sanitizeProviderDetail', () => {
  it('e-postaları söker ve uzun metni kırpar', () => {
    const out = sanitizeProviderDetail(`hata: kisi@x.example ile ${'a'.repeat(300)}`)
    expect(out).toContain('<redacted-email>')
    expect(out.length).toBeLessThanOrEqual(161)
  })
})
