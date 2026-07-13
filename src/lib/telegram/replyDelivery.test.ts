import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── in-memory ledger mock: gerçek CAS/23505 semantiği ───────────────────────
type Row = Record<string, unknown>
const ledger = new Map<string, Row>()
let insertErrorOverride: { code: string; message?: string } | null = null
let insertThrows = false
let updateErrorNext: { code: string } | null = null
let updateNoRowsNext = false
let readErrorNext = false

function lifeFrom() {
  let op: 'select' | 'insert' | 'update' = 'select'
  let patch: Row | null = null
  const eqs: Array<[string, unknown]> = []

  function matched(): Row[] {
    return [...ledger.values()].filter((r) => eqs.every(([c, v]) => r[c] === v))
  }
  function exec(): { data: unknown; error: { code?: string; message?: string } | null } {
    if (op === 'update' && patch) {
      if (updateErrorNext) {
        const e = updateErrorNext
        updateErrorNext = null
        return { data: null, error: e }
      }
      if (updateNoRowsNext) {
        updateNoRowsNext = false
        return { data: [], error: null }
      }
      const rows = matched()
      rows.forEach((r) => Object.assign(r, patch))
      return { data: rows.map((r) => ({ id: r.delivery_key })), error: null }
    }
    return { data: matched(), error: null }
  }

  const api: Record<string, unknown> = {}
  Object.assign(api, {
    insert: async (payload: Row) => {
      if (insertThrows) throw new Error('ledger bağlantısı koptu')
      if (insertErrorOverride) return { error: insertErrorOverride }
      const key = String(payload.delivery_key)
      if (ledger.has(key)) return { error: { code: '23505', message: 'duplicate key' } }
      ledger.set(key, { ...payload })
      return { error: null }
    },
    select: () => api,
    update: (p: Row) => {
      op = 'update'
      patch = p
      return api
    },
    eq: (c: string, v: unknown) => {
      eqs.push([c, v])
      return api
    },
    order: () => api,
    limit: () => api,
    maybeSingle: async () => {
      if (readErrorNext) {
        readErrorNext = false
        return { data: null, error: { message: 'read fail' } }
      }
      const rows = matched()
      return { data: rows[0] ?? null, error: null }
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(exec()).then(resolve, reject),
  })
  return api
}

vi.mock('@/lib/lifeSupabaseAdmin', () => ({
  lifeSupabaseAdmin: { from: () => lifeFrom() },
}))

const sendMock = vi.fn()
vi.mock('@/lib/telegram/client', () => ({
  sendTelegramMessage: (...args: unknown[]) => sendMock(...args),
}))

import { sendReplyOnce, replyDeliveryKey, SENDING_LEASE_MS } from './replyDelivery'

const KEY = (u: number, s: number) => replyDeliveryKey(u, s)

function seedRow(key: string, over: Row = {}): Row {
  const row: Row = {
    delivery_key: key,
    update_id: 1,
    purpose: 'webhook_reply',
    status: 'sending',
    attempt_count: 1,
    claimed_at: new Date().toISOString(),
    message_id: null,
    last_error: null,
    ...over,
  }
  ledger.set(key, row)
  return row
}

describe('sendReplyOnce v2 — durable outbox durum makinesi (Sprint-3 Faz 1)', () => {
  beforeEach(() => {
    ledger.clear()
    insertErrorOverride = null
    insertThrows = false
    updateErrorNext = null
    updateNoRowsNext = false
    readErrorNext = false
    sendMock.mockReset().mockResolvedValue({ ok: true, status: 200, messageId: 42 })
    vi.stubEnv('NODE_ENV', 'test')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('normal akış: claim(sending) → provider → sent; delivered + countsAsDelivered', async () => {
    const r = await sendReplyOnce({ updateId: 10, seq: 1, text: 'merhaba' })
    expect(r).toMatchObject({ kind: 'sent', delivered: true, countsAsDelivered: true })
    expect(ledger.get(KEY(10, 1))).toMatchObject({ status: 'sent', message_id: 42 })
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('mevcut satır SENT → gerçek dedupe (deduped_sent), provider ÇAĞRILMAZ', async () => {
    seedRow(KEY(10, 1), { status: 'sent', message_id: 7 })
    const r = await sendReplyOnce({ updateId: 10, seq: 1, text: 'merhaba' })
    expect(r).toMatchObject({ kind: 'deduped_sent', delivered: true, countsAsDelivered: true })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('mevcut satır FAILED → sent SAYILMAZ; kontrollü takeover AYNI key ile provider çağırır (attempt 2)', async () => {
    seedRow(KEY(11, 1), { status: 'failed', last_error: 'http 400' })
    const r = await sendReplyOnce({ updateId: 11, seq: 1, text: 'x' })
    expect(sendMock).toHaveBeenCalledTimes(1) // yeni delivery key DEĞİL, aynı satır
    expect(r.kind).toBe('sent')
    expect(ledger.get(KEY(11, 1))).toMatchObject({ status: 'sent', attempt_count: 2 })
  })

  it('FAILED takeover yarışı kaybedilirse → in_progress, provider 0', async () => {
    seedRow(KEY(11, 1), { status: 'failed' })
    updateNoRowsNext = true // CAS'i başka worker kazandı
    const r = await sendReplyOnce({ updateId: 11, seq: 1, text: 'x' })
    expect(r).toMatchObject({ kind: 'in_progress', delivered: false, countsAsDelivered: false })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('mevcut satır UNKNOWN → OTOMATİK ikinci provider çağrısı ASLA', async () => {
    seedRow(KEY(12, 1), { status: 'unknown' })
    const r = await sendReplyOnce({ updateId: 12, seq: 1, text: 'x' })
    expect(r).toMatchObject({ kind: 'unknown', delivered: false, countsAsDelivered: false })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('mevcut satır SENDING + taze lease → in_progress, provider 0', async () => {
    seedRow(KEY(13, 1), { status: 'sending', claimed_at: new Date().toISOString() })
    const r = await sendReplyOnce({ updateId: 13, seq: 1, text: 'x' })
    expect(r.kind).toBe('in_progress')
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('mevcut satır SENDING + BAYAT lease (worker crash) → unknown\'a düşürülür, resend YOK', async () => {
    seedRow(KEY(14, 1), {
      status: 'sending',
      claimed_at: new Date(Date.now() - SENDING_LEASE_MS - 5_000).toISOString(),
    })
    const r = await sendReplyOnce({ updateId: 14, seq: 1, text: 'x' })
    expect(r.kind).toBe('unknown')
    expect(sendMock).not.toHaveBeenCalled()
    expect(ledger.get(KEY(14, 1))).toMatchObject({ status: 'unknown' })
  })

  it('İLK ÇAĞRI TELEGRAM\'A ULAŞTI ama cevap KAYBOLDU (timeout, ambiguous) → unknown; failed DEĞİL', async () => {
    sendMock.mockResolvedValue({ ok: false, status: 0, error: 'timeout', retryable: true, ambiguous: true })
    const r = await sendReplyOnce({ updateId: 15, seq: 1, text: 'x' })
    expect(r).toMatchObject({ kind: 'unknown', delivered: false, countsAsDelivered: false })
    expect(ledger.get(KEY(15, 1))).toMatchObject({ status: 'unknown' })
    // Aynı key ile ikinci çağrı → unknown kuralı: provider bir daha ÇAĞRILMAZ.
    const r2 = await sendReplyOnce({ updateId: 15, seq: 1, text: 'x' })
    expect(r2.kind).toBe('unknown')
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('5xx (ambiguous) → unknown; 4xx (kesin) → failed', async () => {
    sendMock.mockResolvedValue({ ok: false, status: 502, error: 'bad gateway', retryable: true, ambiguous: true })
    const a = await sendReplyOnce({ updateId: 16, seq: 1, text: 'x' })
    expect(a.kind).toBe('unknown')

    sendMock.mockResolvedValue({ ok: false, status: 400, error: 'parse error', retryable: false, ambiguous: false })
    const b = await sendReplyOnce({ updateId: 16, seq: 2, text: 'x' })
    expect(b.kind).toBe('failed')
    expect(ledger.get(KEY(16, 2))).toMatchObject({ status: 'failed' })
  })

  it('provider başarılı + ledger finalize DB HATASI → sent_unrecorded (delivered ama claim COMPLETE EDEMEZ)', async () => {
    updateErrorNext = { code: '57P01' }
    const r = await sendReplyOnce({ updateId: 17, seq: 1, text: 'x' })
    expect(r).toMatchObject({ kind: 'sent_unrecorded', delivered: true, countsAsDelivered: false })
  })

  it('provider başarılı + finalize 0 satır (fence tutmadı) → sent_unrecorded', async () => {
    updateNoRowsNext = true
    // updateNoRowsNext ilk update'te tükenir — insert yeni satır yarattı, finalize CAS'i simüle kaybettir.
    const r = await sendReplyOnce({ updateId: 18, seq: 1, text: 'x' })
    expect(r.kind).toBe('sent_unrecorded')
    expect(r.countsAsDelivered).toBe(false)
  })

  it('ledger tablosu yok (42P01, 006 bekliyor) → unledgered gönderim; belirsiz sonuç başarı SAYILMAZ', async () => {
    insertErrorOverride = { code: '42P01' }
    const ok = await sendReplyOnce({ updateId: 19, seq: 1, text: 'x' })
    expect(ok).toMatchObject({ kind: 'unledgered_sent', delivered: true, countsAsDelivered: true })

    sendMock.mockResolvedValue({ ok: false, status: 0, error: 'timeout', retryable: true, ambiguous: true })
    const amb = await sendReplyOnce({ updateId: 19, seq: 2, text: 'x' })
    expect(amb).toMatchObject({ kind: 'unledgered_failed', delivered: false, countsAsDelivered: false })
  })

  it('PROD + ledger claim yazılamıyor → provider HİÇ çağrılmaz (fail-closed)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    insertErrorOverride = { code: '57P01' }
    const r = await sendReplyOnce({ updateId: 20, seq: 1, text: 'x' })
    expect(r).toMatchObject({ kind: 'ledger_unavailable', delivered: false })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('PROD + claim exception → fail-closed; test ortamında unledgered devam', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    insertThrows = true
    const r = await sendReplyOnce({ updateId: 21, seq: 1, text: 'x' })
    expect(r.kind).toBe('ledger_unavailable')
    expect(sendMock).not.toHaveBeenCalled()

    vi.stubEnv('NODE_ENV', 'test')
    const r2 = await sendReplyOnce({ updateId: 21, seq: 2, text: 'x' })
    expect(r2.kind).toBe('unledgered_sent')
  })

  it('23505 sonrası satır okunamazsa → in_progress (güvenli taraf), provider 0', async () => {
    seedRow(KEY(22, 1), { status: 'sent' })
    readErrorNext = true // maybeSingle data:null döner
    const r = await sendReplyOnce({ updateId: 22, seq: 1, text: 'x' })
    expect(r.kind).toBe('in_progress')
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('eşzamanlı AYNI update+seq → provider TAM 1 kez (insert unique yarışı)', async () => {
    const [a, b] = await Promise.all([
      sendReplyOnce({ updateId: 23, seq: 1, text: 'x' }),
      sendReplyOnce({ updateId: 23, seq: 1, text: 'x' }),
    ])
    expect(sendMock).toHaveBeenCalledTimes(1)
    const kinds = [a.kind, b.kind].sort()
    expect(kinds).toContain('sent')
    // Kaybeden: in_progress (taze sending) ya da deduped_sent (kazanan bitirdiyse).
    expect(['deduped_sent', 'in_progress']).toContain(kinds.find((k) => k !== 'sent'))
  })

  it('deterministik anahtar: aynı update+seq → aynı key', () => {
    expect(replyDeliveryKey(99, 2)).toBe('update:99:reply:2')
  })

  it('TEST ortamı + beklenmedik insert hatası → unledgered devam (prod değil)', async () => {
    insertErrorOverride = { code: '57P01' }
    const r = await sendReplyOnce({ updateId: 24, seq: 1, text: 'x' })
    expect(r.kind).toBe('unledgered_sent')
  })

  it('provider KESİN başarısız + failure-finalize hatası → yine failed döner (yutulmaz, loglanır)', async () => {
    sendMock.mockResolvedValue({ ok: false, status: 400, error: 'parse', retryable: false, ambiguous: false })
    updateErrorNext = { code: '57P01' }
    const r = await sendReplyOnce({ updateId: 25, seq: 1, text: 'x' })
    expect(r.kind).toBe('failed')
    expect(r.countsAsDelivered).toBe(false)
  })

  it('PGRST205 (şema önbelleği tabloyu görmüyor) da unledgered sayılır', async () => {
    insertErrorOverride = { code: 'PGRST205' }
    const r = await sendReplyOnce({ updateId: 26, seq: 1, text: 'x' })
    expect(r.kind).toBe('unledgered_sent')
  })
})
