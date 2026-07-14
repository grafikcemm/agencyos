import { describe, it, expect, vi, beforeEach } from 'vitest'

// FINAL PILOT BLOCKERS Faz 3 — inbound ingest: attribution + GÖNDEREN doğrulama
// + dedupe/karantina + FSM yan etkileri + cursor ilerletme + fail-closed hata
// disiplini. In-memory DB mock; provider yok (fake transport).

type Row = Record<string, unknown>
const db: Record<string, Row[]> = {
  email_messages: [],
  outreach_send_attempts: [],
  outreach_messages: [],
  email_threads: [],
  suppression_list: [],
  leads: [],
  gmail_inbound_quarantine: [],
  gmail_accounts: [],
}
let seq = 0
const errors: Record<string, { message: string; code?: string } | null> = {}
let quarantineRpcError: { message: string } | null = null
let forceEmailInsert23505 = false

function from(table: string) {
  const rows = (db[table] ??= [])
  const filters: Array<(r: Row) => boolean> = []
  let op: 'select' | 'insert' | 'update' = 'select'
  let payload: Row | null = null

  function exec(single: boolean) {
    const err = errors[`${table}:${op}`]
    if (err) return { data: null, error: err }
    if (op === 'insert' && payload) {
      if (table === 'suppression_list' && rows.some((r) => r.address === payload!.address)) {
        return { data: null, error: { message: 'duplicate', code: '23505' } }
      }
      if (table === 'email_messages' && forceEmailInsert23505) {
        return { data: null, error: { message: 'duplicate', code: '23505' } }
      }
      if (table === 'email_messages' && payload.gmail_message_id &&
        rows.some((r) => r.gmail_message_id === payload!.gmail_message_id)) {
        return { data: null, error: { message: 'duplicate', code: '23505' } }
      }
      const row = { id: `id-${++seq}`, ...payload }
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
    in: (c: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[c])); return api },
    limit: () => api,
    order: () => api,
    insert: (p: Row) => { op = 'insert'; payload = p; return api },
    update: (p: Row) => { op = 'update'; payload = p; return api },
    maybeSingle: async () => exec(true),
    then: (res: (v: unknown) => unknown) => Promise.resolve(exec(false)).then(res),
  })
  return api
}

async function rpc(fn: string, args: Record<string, unknown>) {
  if (fn === 'gmail_quarantine_inbound') {
    if (quarantineRpcError) return { data: null, error: quarantineRpcError }
    const existing = db.gmail_inbound_quarantine.find((r) => r.gmail_message_id === args.p_gmail_message_id)
    if (existing) {
      existing.seen_count = (existing.seen_count as number) + 1
      existing.reason = args.p_reason
    } else {
      db.gmail_inbound_quarantine.push({
        gmail_message_id: args.p_gmail_message_id, reason: args.p_reason,
        from_address: args.p_from_address, subject: args.p_subject, rfc_refs: args.p_rfc_refs, seen_count: 1,
      })
    }
    return { data: null, error: null }
  }
  return { data: null, error: { message: `bilinmeyen rpc ${fn}` } }
}

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: (t: string) => from(t), rpc } }))

const stopMock = vi.fn()
vi.mock('@/lib/outreach/sequences', () => ({
  stopSequencesForLead: (...a: unknown[]) => stopMock(...a),
}))

import { ingestInboundReplies, normalizeEmail, type InboundMessage, type InboundTransport } from './replyIngest'
import { extractTextPlain } from './gmailInboundTransport'

const RFC = '<outreach-om-1@agencyos.grafikcem>'
const LEAD_EMAIL = 'musteri@ornek.com'

function msg(over: Partial<InboundMessage> = {}): InboundMessage {
  return {
    gmailMessageId: `g-${++seq}`,
    threadId: 'th-g',
    fromAddress: LEAD_EMAIL,
    subject: 'Re: teklif',
    bodyText: 'Fiyat bilgisi alabilir miyim?',
    inReplyTo: RFC,
    references: null,
    internalDateMs: 1_700_000_000_000,
    ...over,
  }
}
function transport(messages: InboundMessage[], nextHistoryId: string | null = null): InboundTransport {
  return { kind: 'fake', listInbound: async () => ({ messages, nextHistoryId }) }
}

beforeEach(() => {
  for (const k of Object.keys(db)) db[k] = []
  for (const k of Object.keys(errors)) errors[k] = null
  seq = 0
  quarantineRpcError = null
  forceEmailInsert23505 = false
  stopMock.mockReset().mockResolvedValue(1)
  db.outreach_send_attempts.push({ outreach_message_id: 'om-1', rfc_message_id: RFC })
  db.outreach_messages.push({ id: 'om-1', lead_id: 'lead-1', gmail_thread_id: 'th-g' })
  db.email_threads.push({ id: 'thread-row-1', gmail_thread_id: 'th-g' })
  db.leads.push({ id: 'lead-1', status: 'contacted', do_not_contact: false, email: LEAD_EMAIL })
})

describe('ingest — attribution + gönderen doğrulama + FSM yan etkileri', () => {
  it('pozitif cevap (gönderen=alıcı): inbound kayıt + responded + follow-up DURUR + thread bağı', async () => {
    const c = await ingestInboundReplies(transport([msg()]))
    expect(c).toMatchObject({ scanned: 1, ingested: 1, responded: 1, failed: 0, unmatched: 0, senderMismatch: 0 })
    expect(db.email_messages[0]).toMatchObject({
      direction: 'inbound', outreach_message_id: 'om-1', thread_id: 'thread-row-1', from_address: LEAD_EMAIL,
    })
    expect(db.leads[0].status).toBe('responded')
    expect(stopMock).toHaveBeenCalledWith('lead-1')
    expect(c.classes.positive_interest).toBe(1)
  })

  it('GÖNDEREN UYUŞMAZLIĞI: bilinen In-Reply-To ama farklı From → karantina, lead DOKUNULMAZ', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = await ingestInboundReplies(transport([msg({ fromAddress: 'yabanci@baska.com', bodyText: 'ret' })]))
    expect(c.senderMismatch).toBe(1)
    expect(c.quarantined).toBe(1)
    expect(c.optOuts).toBe(0)
    expect(c.responded).toBe(0)
    expect(db.leads[0].status).toBe('contacted') // DEĞİŞMEDİ
    expect(db.leads[0].do_not_contact).toBe(false)
    expect(db.suppression_list).toHaveLength(0)
    expect(db.gmail_inbound_quarantine[0]).toMatchObject({ reason: 'sender_mismatch' })
    expect(db.email_messages).toHaveLength(0)
    warnSpy.mockRestore()
  })

  it('gönderen köşeli-parantez/büyük-harf farkı normalize edilir → eşleşir', async () => {
    const c = await ingestInboundReplies(transport([msg({ fromAddress: `Müşteri <${LEAD_EMAIL.toUpperCase()}>` })]))
    expect(c.ingested).toBe(1)
    expect(c.senderMismatch).toBe(0)
  })

  it('OPT-OUT ("ret", gönderen=alıcı): suppression + do_not_contact + follow-up iptal', async () => {
    const c = await ingestInboundReplies(transport([msg({ bodyText: 'Ret. Bir daha mail atmayın.' })]))
    expect(c.optOuts).toBe(1)
    expect(db.suppression_list[0]).toMatchObject({ address: LEAD_EMAIL, source: 'gmail_ingest' })
    expect(db.leads[0].do_not_contact).toBe(true)
    expect(stopMock).toHaveBeenCalledWith('lead-1')
  })

  it('AUTO-REPLY: kayıt edilir ama HİÇBİR mutasyon yok (takip devam)', async () => {
    const c = await ingestInboundReplies(transport([msg({ bodyText: 'Out of office — yıllık izindeyim' })]))
    expect(c.autoReplies).toBe(1)
    expect(c.responded).toBe(0)
    expect(db.leads[0].status).toBe('contacted')
    expect(stopMock).not.toHaveBeenCalled()
    expect(db.email_messages).toHaveLength(1)
  })

  it('DEDUPE (email_messages): aynı gmail_message_id ikinci turda işlenmez', async () => {
    const m = msg()
    await ingestInboundReplies(transport([m]))
    stopMock.mockClear()
    const c2 = await ingestInboundReplies(transport([m]))
    expect(c2.deduped).toBe(1)
    expect(c2.ingested).toBe(0)
    expect(stopMock).not.toHaveBeenCalled()
    expect(db.email_messages).toHaveLength(1)
  })

  it('KARANTİNA dedupe: karantinadaki mesaj full-sync fallback\'te YENİDEN işlenmez', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const m = msg({ inReplyTo: '<baska@x>', references: null })
    const c1 = await ingestInboundReplies(transport([m]))
    expect(c1.unmatched).toBe(1)
    expect(c1.quarantined).toBe(1)
    // İkinci tur: aynı mesaj → alreadySeen (karantina) → deduped, tekrar quarantine YOK
    const c2 = await ingestInboundReplies(transport([m]))
    expect(c2.deduped).toBe(1)
    expect(c2.quarantined).toBe(0)
    expect(db.gmail_inbound_quarantine).toHaveLength(1)
    warnSpy.mockRestore()
  })

  it('ATTRIBUTION edilemeyen mesaj: unmatched + karantina, HİÇBİR lead\'e yapıştırılmaz', async () => {
    const c = await ingestInboundReplies(transport([msg({ inReplyTo: '<baska@x>', references: null })]))
    expect(c.unmatched).toBe(1)
    expect(c.quarantined).toBe(1)
    expect(db.email_messages).toHaveLength(0)
    expect(db.leads[0].status).toBe('contacted')
    expect(db.gmail_inbound_quarantine[0]).toMatchObject({ reason: 'unmatched' })
  })

  it('References header üzerinden de eşleşir (In-Reply-To boşken)', async () => {
    const c = await ingestInboundReplies(transport([msg({ inReplyTo: null, references: `<önce@x> ${RFC}` })]))
    expect(c.ingested).toBe(1)
  })

  it('outreach lead_id NULL (lead\'siz eşleşme): leadEmail yok → sender_mismatch karantina', async () => {
    db.outreach_messages[0].lead_id = null
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = await ingestInboundReplies(transport([msg()]))
    expect(c.senderMismatch).toBe(1)
    expect(c.ingested).toBe(0)
    warnSpy.mockRestore()
  })

  it('gmail_thread_id NULL: thread_id null yazılır ama mesaj ingest edilir', async () => {
    db.outreach_messages[0].gmail_thread_id = null
    const c = await ingestInboundReplies(transport([msg()]))
    expect(c.ingested).toBe(1)
    expect(db.email_messages[0].thread_id).toBeNull()
  })

  it('internalDateMs null → sent_at null (kayıt yine oluşur)', async () => {
    const c = await ingestInboundReplies(transport([msg({ internalDateMs: null })]))
    expect(c.ingested).toBe(1)
    expect(db.email_messages[0].sent_at).toBeNull()
  })

  it('lead e-postası okuma hatası → satır failed (fail-closed)', async () => {
    errors['leads:select'] = { message: 'lead read down' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = await ingestInboundReplies(transport([msg()]))
    expect(c.failed).toBe(1)
    errSpy.mockRestore()
  })

  it('SUPPRESSION YAZILAMAZSA: mesaj kaydedilmez (fail-closed) → failed + retry şansı', async () => {
    errors['suppression_list:insert'] = { message: 'db down', code: 'XX000' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = await ingestInboundReplies(transport([msg({ bodyText: 'ret' })]))
    expect(c.failed).toBe(1)
    expect(db.email_messages).toHaveLength(0)
    errSpy.mockRestore()
  })

  it('lead responded yazılamazsa: failed + mesaj kaydedilmez', async () => {
    errors['leads:update'] = { message: 'db down' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = await ingestInboundReplies(transport([msg()]))
    expect(c.failed).toBe(1)
    expect(db.email_messages).toHaveLength(0)
    errSpy.mockRestore()
  })

  it('converted lead responded\'a ÇEKİLMEZ (yalnız new/contacted)', async () => {
    db.leads[0].status = 'converted'
    const c = await ingestInboundReplies(transport([msg()]))
    expect(c.ingested).toBe(1)
    expect(db.leads[0].status).toBe('converted')
  })

  it('attribution sorgusu hatası: satır failed (görünür), diğer mesajlar işlenir', async () => {
    errors['outreach_send_attempts:select'] = { message: 'osa down' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = await ingestInboundReplies(transport([msg(), msg()]))
    expect(c.failed).toBe(2)
    errSpy.mockRestore()
  })

  it('insert yarışı (23505, alreadySeen sonrası): deduped sayılır, hata değil', async () => {
    forceEmailInsert23505 = true
    const c = await ingestInboundReplies(transport([msg({ bodyText: 'Merhaba, teşekkürler' })]))
    expect(c.deduped).toBe(1)
    expect(c.failed).toBe(0)
    expect(c.ingested).toBe(0)
  })

  it('inbound insert non-23505 hatası → failed (fail-closed)', async () => {
    errors['email_messages:insert'] = { message: 'disk full', code: 'XX000' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = await ingestInboundReplies(transport([msg({ bodyText: 'Merhaba teşekkürler' })]))
    expect(c.failed).toBe(1)
    errSpy.mockRestore()
  })

  it('karantina RPC hatası → satır failed (görünür)', async () => {
    quarantineRpcError = { message: 'rpc down' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = await ingestInboundReplies(transport([msg({ inReplyTo: '<baska@x>', references: null })]))
    expect(c.failed).toBe(1)
    errSpy.mockRestore()
  })
})

describe('cursor ilerletme (yalnız batch güvenli işlenince)', () => {
  it('failed=0 → advanceCursor çağrılır, cursorAdvanced true', async () => {
    const advance = vi.fn().mockResolvedValue(undefined)
    const t: InboundTransport = {
      kind: 'gmail',
      listInbound: async () => ({ messages: [msg()], nextHistoryId: 'h-42' }),
      advanceCursor: advance,
    }
    const c = await ingestInboundReplies(t)
    expect(c.cursorAdvanced).toBe(true)
    expect(advance).toHaveBeenCalledWith('h-42')
  })

  it('failed>0 → cursor İLERLEMEZ (pencere yeniden taranır)', async () => {
    errors['leads:update'] = { message: 'db down' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const advance = vi.fn().mockResolvedValue(undefined)
    const t: InboundTransport = {
      kind: 'gmail',
      listInbound: async () => ({ messages: [msg()], nextHistoryId: 'h-42' }),
      advanceCursor: advance,
    }
    const c = await ingestInboundReplies(t)
    expect(c.failed).toBe(1)
    expect(c.cursorAdvanced).toBe(false)
    expect(advance).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('nextHistoryId null (fake/full-sync) → cursor ilerletilmez', async () => {
    const c = await ingestInboundReplies(transport([msg()], null))
    expect(c.cursorAdvanced).toBe(false)
  })
})

describe('MIME + normalize yardımcıları', () => {
  it('extractTextPlain iç içe multipart ağacında text/plain bulur', () => {
    const tree = {
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'multipart/alternative', parts: [
          { mimeType: 'text/html', body: { data: 'aHRtbA' } },
          { mimeType: 'text/plain', body: { data: Buffer.from('merhaba').toString('base64url') } },
        ] },
        { mimeType: 'application/pdf', body: { data: 'x' } },
      ],
    }
    const data = extractTextPlain(tree)
    expect(data).toBeTruthy()
    expect(Buffer.from(data!, 'base64url').toString('utf8')).toBe('merhaba')
  })

  it('extractTextPlain text/plain yoksa null', () => {
    expect(extractTextPlain({ mimeType: 'text/html', body: { data: 'x' } })).toBeNull()
    expect(extractTextPlain(undefined)).toBeNull()
  })

  it('normalizeEmail köşeli parantez + büyük harf + boşluk', () => {
    expect(normalizeEmail('  Ali <A@B.COM> ')).toBe('a@b.com')
    expect(normalizeEmail('a@b.com')).toBe('a@b.com')
    expect(normalizeEmail(null)).toBe('')
  })
})
