import { describe, it, expect, vi, beforeEach } from 'vitest'

// eval.outreach.send_gmail (26 Senaryo 2/5/6 · 21 T5/T6/T8):
// approval-yokken bloke · double-execute→tek gönderim · suppression-honor ·
// digest-lock · dry-run tam akış. In-memory DB mock — ağ/DB yok.

let seq = 0
const db: Record<string, Array<Record<string, unknown>>> = {
  outreach_messages: [], leads: [], approval_requests: [],
  email_threads: [], email_messages: [], settings: [], suppression_list: [], gmail_accounts: [],
}

function makeQuery(table: string) {
  const rows = db[table]
  const filters: Array<(r: Record<string, unknown>) => boolean> = []
  let op: 'select' | 'insert' | 'update' | 'upsert' = 'select'
  let payload: Record<string, unknown> | null = null
  let conflictKey: string | null = null

  function exec(single: boolean): { data: unknown; error: { message: string; code?: string } | null } {
    if (op === 'insert' && payload) {
      if (table === 'email_messages' && payload.gmail_message_id &&
        rows.some((r) => r.gmail_message_id === payload!.gmail_message_id)) {
        return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } }
      }
      if (table === 'approval_requests' &&
        rows.some((r) => r.idempotency_key === payload!.idempotency_key)) {
        return { data: null, error: { message: 'duplicate key', code: '23505' } }
      }
      const row = { id: `id-${++seq}`, ...payload }
      rows.push(row)
      return { data: single ? row : [row], error: null }
    }
    if (op === 'update' && payload) {
      const matched = rows.filter((r) => filters.every((f) => f(r)))
      matched.forEach((r) => Object.assign(r, payload))
      return { data: matched, error: null }
    }
    if (op === 'upsert' && payload) {
      const existing = conflictKey ? rows.find((r) => r[conflictKey!] === payload![conflictKey!]) : undefined
      if (existing) { Object.assign(existing, payload); return { data: single ? existing : [existing], error: null } }
      const row = { id: `id-${++seq}`, ...payload }
      rows.push(row)
      return { data: single ? row : [row], error: null }
    }
    const matched = rows.filter((r) => filters.every((f) => f(r)))
    return { data: single ? (matched[0] ?? null) : matched, error: null }
  }

  const api: Record<string, unknown> = {}
  Object.assign(api, {
    select: () => api,
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api },
    ilike: (c: string, v: string) => { filters.push((r) => String(r[c]).toLowerCase() === v.toLowerCase()); return api },
    limit: () => api,
    order: () => api,
    insert: (row: Record<string, unknown>) => { op = 'insert'; payload = row; return api },
    update: (patch: Record<string, unknown>) => { op = 'update'; payload = patch; return api },
    upsert: (row: Record<string, unknown>, opts?: { onConflict?: string }) => {
      op = 'upsert'; payload = row; conflictKey = opts?.onConflict ?? null; return api
    },
    maybeSingle: async () => exec(true),
    single: async () => exec(true),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(exec(false)).then(resolve),
  })
  return api
}

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: (t: string) => makeQuery(t) } }))

import { requestSendApproval, sendGmailMessage, computeSendArgs, SEND_GMAIL_ACTION, buildRawMessage } from './gmail'
import { computeActionDigest } from '@/lib/brain/gate'
import { OPT_OUT_MARKER } from './auditCompliance'

const LEAD_ID = 'lead-1'
const DRAFT_ID = 'draft-1'
const VALID_BODY = `Merhaba,\n\nöneri...\n\n—\nGrafikcem | MERSİS: 1\nBu tür e-postaları almak istemezseniz "ret" yazarak ${OPT_OUT_MARKER}.`

function seed() {
  seq = 0
  for (const key of Object.keys(db)) db[key] = []
  db.leads.push({ id: LEAD_ID, business_name: 'Test Klinik', email: 'info@testklinik.com', do_not_contact: false })
  db.outreach_messages.push({
    id: DRAFT_ID, lead_id: LEAD_ID, channel: 'email', status: 'draft',
    subject: 'Web siteniz', body: VALID_BODY, final_body: null,
    sent_at: null, gmail_message_id: null, gmail_thread_id: null, error: null,
  })
}

function approve(approvalId: string) {
  const row = db.approval_requests.find((r) => r.id === approvalId)!
  row.status = 'approved'
  row.approved_digest = row.action_digest
}

beforeEach(() => {
  seed()
  delete process.env.GMAIL_SEND_ENABLED
})

describe('requestSendApproval (HITL onay isteği)', () => {
  it('geçerli taslak → pending onay; alıcı domain preview\'de görünür (T10)', async () => {
    const r = await requestSendApproval(DRAFT_ID)
    expect(r.ok).toBe(true)
    expect(r.status).toBe('pending')
    const approval = db.approval_requests[0]
    expect(String(approval.redacted_preview)).toContain('alıcı-domain: testklinik.com')
    expect(approval.action).toBe(SEND_GMAIL_ACTION)
  })

  it('idempotent: aynı içerik ikinci istekte yeni kart doğurmaz', async () => {
    const r1 = await requestSendApproval(DRAFT_ID)
    const r2 = await requestSendApproval(DRAFT_ID)
    expect(r2.approvalId).toBe(r1.approvalId)
    expect(db.approval_requests).toHaveLength(1)
  })

  it('suppress edilmiş lead → onay kartı bile doğmaz (T8)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    db.suppression_list.push({ id: 's1', scope: 'email', address: 'info@testklinik.com', reason: 'opt_out' })
    const r = await requestSendApproval(DRAFT_ID)
    expect(r.ok).toBe(false)
    expect(r.blockedReasons?.some((f) => f.includes('suppression'))).toBe(true)
    expect(db.approval_requests).toHaveLength(0)
    warnSpy.mockRestore()
  })

  it('düzenleme persist edilir ve digest düzenleme-sonrası içeriğe bağlanır', async () => {
    const edited = `${VALID_BODY}\n\nEK PARAGRAF.`
    const r = await requestSendApproval(DRAFT_ID, { finalBody: edited })
    expect(r.ok).toBe(true)
    const row = db.outreach_messages[0]
    expect(row.final_body).toBe(edited)
    const expected = computeActionDigest(SEND_GMAIL_ACTION, computeSendArgs(DRAFT_ID, 'info@testklinik.com', 'Web siteniz', edited))
    expect(db.approval_requests[0].action_digest).toBe(expected)
  })
})

describe('sendGmailMessage (T5/T6/T8 + dry-run)', () => {
  it('onay YOKKEN gönderim yapısal bloke (T5)', async () => {
    const r = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId: 'yok-boyle-onay' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Onay kaydı bulunamadı')
    expect(db.email_messages).toHaveLength(0)
  })

  it('pending onayla gönderilemez — approved şart', async () => {
    const req = await requestSendApproval(DRAFT_ID)
    const r = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId: req.approvalId! })
    expect(r.ok).toBe(false)
    expect(r.error).toContain("'pending'")
  })

  it('tam dry-run akışı: onayla → gönder → kayıtlar + executed (Senaryo 2)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const req = await requestSendApproval(DRAFT_ID)
    approve(req.approvalId!)

    const r = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId: req.approvalId! })
    expect(r.ok).toBe(true)
    expect(r.dryRun).toBe(true)
    expect(r.gmailMessageId).toBe(`dryrun-${DRAFT_ID}`)

    const row = db.outreach_messages[0]
    expect(row.status).toBe('sent')
    expect(row.sent_at).toBeTruthy()
    expect(row.gmail_message_id).toBe(`dryrun-${DRAFT_ID}`)
    expect(db.email_threads).toHaveLength(1)
    expect(db.email_messages).toHaveLength(1)
    expect(db.approval_requests[0].status).toBe('executed')
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('[email.sent]'))).toBe(true)
    logSpy.mockRestore()
  })

  it('double-execute → ikinci çağrı no-op, TEK email_messages satırı (T6, Senaryo 5)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const req = await requestSendApproval(DRAFT_ID)
    approve(req.approvalId!)
    const first = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId: req.approvalId! })
    expect(first.ok).toBe(true)

    const second = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId: req.approvalId! })
    expect(second.ok).toBe(true)
    expect(second.alreadySent).toBe(true)
    expect(db.email_messages).toHaveLength(1)
    logSpy.mockRestore()
  })

  it('onaydan SONRA suppression eklendi → gönderim yine bloke (T8, Senaryo 6)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const req = await requestSendApproval(DRAFT_ID)
    approve(req.approvalId!)
    db.suppression_list.push({ id: 's1', scope: 'email', address: 'info@testklinik.com', reason: 'opt_out' })

    const r = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId: req.approvalId! })
    expect(r.ok).toBe(false)
    expect(r.blockedReasons?.some((f) => f.includes('suppression'))).toBe(true)
    expect(db.email_messages).toHaveLength(0)
    expect(String(db.outreach_messages[0].error)).toContain('audit-compliance bloke')
    warnSpy.mockRestore()
  })

  it('onaydan sonra içerik değişti → digest uyuşmazlığı bloke (§13)', async () => {
    const req = await requestSendApproval(DRAFT_ID)
    approve(req.approvalId!)
    db.outreach_messages[0].final_body = `${VALID_BODY}\n\nSONRADAN DEĞİŞTİ.`

    const r = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId: req.approvalId! })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Digest uyuşmazlığı')
  })

  it('süresi dolmuş onay → bloke', async () => {
    const req = await requestSendApproval(DRAFT_ID)
    approve(req.approvalId!)
    db.approval_requests[0].expires_at = new Date(Date.now() - 60_000).toISOString()

    const r = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId: req.approvalId! })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('süresi dolmuş')
  })

  it('GMAIL_SEND_ENABLED=true ama aktif hesap yok → açıklayıcı hata (sessiz düşüş yok)', async () => {
    process.env.GMAIL_SEND_ENABLED = 'true'
    const req = await requestSendApproval(DRAFT_ID)
    approve(req.approvalId!)

    const r = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId: req.approvalId! })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('aktif gmail_accounts kaydı yok')
    expect(db.email_messages).toHaveLength(0)
  })
})

describe('buildRawMessage', () => {
  it('RFC 2822 başlıkları + base64url üretir', () => {
    const raw = buildRawMessage({ from: 'me@ajans.com', to: 'sen@klinik.com', subject: 'Öneri', body: 'Merhaba' })
    const decoded = Buffer.from(raw, 'base64url').toString('utf8')
    expect(decoded).toContain('To: sen@klinik.com')
    expect(decoded).toContain('MIME-Version: 1.0')
    expect(decoded).toContain('Merhaba')
  })
})
