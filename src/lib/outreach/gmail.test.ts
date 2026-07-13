import { describe, it, expect, vi, beforeEach } from 'vitest'

// eval.outreach.send_gmail (26 Senaryo 2/5/6 · 21 T5/T6/T8):
// approval-yokken bloke · double-execute→tek gönderim · suppression-honor ·
// digest-lock · dry-run tam akış. In-memory DB mock — ağ/DB yok.

let seq = 0
const db: Record<string, Array<Record<string, unknown>>> = {
  outreach_messages: [], leads: [], approval_requests: [], contacts: [],
  email_threads: [], email_messages: [], settings: [], suppression_list: [], gmail_accounts: [],
  outreach_send_attempts: [],
}

// finalize_outreach_send RPC simülasyonu — mig 054 SQL fonksiyonunun in-memory
// aynası (tek-transaction semantiği: approval geçişi başarısızsa HİÇBİR yazım
// uygulanmaz). rpcFailNext ile "provider başarılı, finalize başarısız" senaryosu.
let rpcFailNext = false
let sentCasFailsOnce = false
function rpcFinalize(args: Record<string, unknown>) {
  const attempt = db.outreach_send_attempts.find(
    (a) => a.outreach_message_id === args.p_outreach_message_id && a.claim_token === args.p_claim_token
  )
  if (!attempt) return { data: { ok: false, error: 'attempt_veya_claim_token_uyusmuyor' }, error: null }
  // mig 056: onay kimliği attempt'e bağlı onayla birebir eşleşmeli.
  if (attempt.approval_id !== args.p_approval_id) {
    return { data: { ok: false, error: 'approval_id_attempt_ile_uyusmuyor' }, error: null }
  }
  if (attempt.finalized) return { data: { ok: true, already: true }, error: null }
  if (!['sending', 'sent', 'unknown'].includes(String(attempt.state))) {
    return { data: { ok: false, error: `finalize_gecersiz_state_${attempt.state}` }, error: null }
  }
  if (rpcFailNext) {
    rpcFailNext = false
    return { data: null, error: { message: 'simüle edilmiş finalize/DB hatası' } }
  }
  const approval = db.approval_requests.find((r) => r.id === args.p_approval_id)
  if (!approval || !['approved', 'executed'].includes(String(approval.status))) {
    // SQL'de RAISE EXCEPTION → transaction rollback: hiçbir yazım uygulanmaz.
    return { data: null, error: { message: 'approval_executed_gecisi_basarisiz' } }
  }
  const om = db.outreach_messages.find((r) => r.id === args.p_outreach_message_id)!
  Object.assign(om, {
    gmail_message_id: args.p_gmail_message_id, gmail_thread_id: args.p_gmail_thread_id,
    final_body: args.p_body, status: 'sent', sent_at: om.sent_at ?? args.p_sent_at, error: null,
  })
  let thread = db.email_threads.find((t) => t.gmail_thread_id === args.p_gmail_thread_id)
  if (!thread) {
    thread = { id: `id-${++seq}`, lead_id: om.lead_id, gmail_thread_id: args.p_gmail_thread_id, subject: args.p_subject || null }
    db.email_threads.push(thread)
  }
  if (!db.email_messages.some((m) => m.gmail_message_id === args.p_gmail_message_id)) {
    db.email_messages.push({
      id: `id-${++seq}`, thread_id: thread.id, outreach_message_id: om.id,
      gmail_message_id: args.p_gmail_message_id, direction: 'outbound',
      to_address: args.p_to_address, subject: args.p_subject || null,
      body: args.p_body, sent_at: args.p_sent_at,
    })
  }
  if (approval.status === 'approved') {
    approval.status = 'executed'
    approval.executed_at = args.p_sent_at
  }
  Object.assign(attempt, {
    state: (args.p_final_state as string) ?? 'sent', finalized: true,
    sent_at: attempt.sent_at ?? args.p_sent_at,
    provider_message_id: args.p_gmail_message_id, provider_thread_id: args.p_gmail_thread_id,
    last_error: null,
  })
  return { data: { ok: true }, error: null }
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
      // outreach_message_id UNIQUE = atomik claim çekirdeği (mig 054).
      if (table === 'outreach_send_attempts' &&
        rows.some((r) => r.outreach_message_id === payload!.outreach_message_id)) {
        return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } }
      }
      // Tablo default'ları (mig 054+056): finalized=false, attempt_count=1 vb.
      if (table === 'outreach_send_attempts') {
        payload = {
          attempt_count: 1, finalized: false, sent_at: null,
          provider_message_id: null, provider_thread_id: null, last_error: null,
          reconcile_search_count: 0, last_searched_at: null,
          ...payload,
        }
      }
      const row = { id: `id-${++seq}`, ...payload }
      rows.push(row)
      return { data: single ? row : [row], error: null }
    }
    if (op === 'update' && payload) {
      // Yarış simülasyonu: provider başarısı SONRASI sent-CAS'inin kaybı.
      if (table === 'outreach_send_attempts' && payload.state === 'sent' && sentCasFailsOnce) {
        sentCasFailsOnce = false
        return { data: null, error: null }
      }
      const matched = rows.filter((r) => filters.every((f) => f(r)))
      matched.forEach((r) => Object.assign(r, payload))
      return { data: single ? (matched[0] ?? null) : matched, error: null }
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
    in: (c: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[c])); return api },
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

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (t: string) => makeQuery(t),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'finalize_outreach_send') return rpcFinalize(args)
      return { data: null, error: { message: `bilinmeyen rpc: ${fn}` } }
    },
  },
}))

// Faz 1.3: kalite kapısı gmail çekirdeğinde BLOCKING. Bu suite send-machine'e
// odaklı — kapı kararı kontrol edilebilir mock'tur (kapının kendi mantığı
// qualityLint.test'te). gateThrow → fail-closed senaryosu.
let gateResult = { ok: true, violations: [] as Array<{ code: string; detail: string; fix: string }>, digest: 'q-digest-1' }
let gateThrow = false
vi.mock('@/lib/outreach/outboundGate', () => ({
  evaluateOutboundText: async () => {
    if (gateThrow) throw new Error('gate down')
    return gateResult
  },
}))
vi.mock('@/lib/outreach/voiceDna', () => ({
  recordVoiceDelta: async () => {},
  recordStyleDelta: async () => {},
  getBannedPhrases: async () => [],
}))

// Faz 2.3: canonical recipient — in-memory db üzerinden gerçek sıralamayla
// (primary contact email → lead.email). contactService'in kendi birim testleri ayrı.
vi.mock('@/lib/contacts/contactService', () => ({
  resolveCanonicalRecipient: async (leadId: string) => {
    const primaries = db.contacts
      .filter((c) => c.lead_id === leadId && c.is_primary && c.email)
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
    if (primaries[0]) {
      return {
        email: String(primaries[0].email).toLowerCase(),
        contactId: primaries[0].id as string,
        contactName: (primaries[0].full_name as string) ?? null,
        source: 'primary_contact',
      }
    }
    const lead = db.leads.find((l) => l.id === leadId)
    if (lead?.email) {
      return { email: String(lead.email).toLowerCase(), contactId: null, contactName: null, source: 'lead_email' }
    }
    return { email: null, contactId: null, contactName: null, source: 'none' }
  },
}))

import { requestSendApproval, findSendApproval, sendGmailMessage, reconcileOutreachSend, computeSendArgs, SEND_GMAIL_ACTION, buildRawMessage } from './gmail'
import { GmailTransportError, type GmailTransport } from './sendMachine'
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
  rpcFailNext = false
  sentCasFailsOnce = false
  gateResult = { ok: true, violations: [], digest: 'q-digest-1' }
  gateThrow = false
  delete process.env.GMAIL_SEND_ENABLED
})

/** Provider çağrılarını sayan test transport'u. */
function countingTransport(behavior?: {
  failWith?: GmailTransportError
  onSend?: () => void
}): { transport: GmailTransport; calls: () => number } {
  let count = 0
  return {
    transport: {
      async send() {
        count += 1
        behavior?.onSend?.()
        if (behavior?.failWith) throw behavior.failWith
        return { id: `prov-${DRAFT_ID}`, threadId: `prov-thread-${DRAFT_ID}` }
      },
      async findByRfcMessageId() {
        return null
      },
    },
    calls: () => count,
  }
}

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

  it('Faz 1.3: kalite kapısı GEÇMEZSE approval OLUŞMAZ (blocking, advisory değil)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    gateResult = {
      ok: false,
      violations: [{ code: 'CLAIM_WITHOUT_EVIDENCE', detail: 'iddia kanıtsız', fix: 'iddiayı sil' }],
      digest: 'q-bad',
    }
    const r = await requestSendApproval(DRAFT_ID)
    expect(r.ok).toBe(false)
    expect(r.blockedReasons).toContain('CLAIM_WITHOUT_EVIDENCE')
    expect(r.quality?.violations[0].fix).toBe('iddiayı sil')
    expect(db.approval_requests).toHaveLength(0) // onay kartı DOĞMADI
    warnSpy.mockRestore()
  })

  it('Faz 1.3: kalite servisi HATA verirse fail-closed — onay isteği oluşmaz', async () => {
    gateThrow = true
    const r = await requestSendApproval(DRAFT_ID)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('fail-closed')
    expect(db.approval_requests).toHaveLength(0)
  })

  it('Faz 1.3: onaydan SONRA kalite girdisi değişirse (digest farklı) gönderim bloke', async () => {
    const req = await requestSendApproval(DRAFT_ID)
    approve(req.approvalId as string)
    // Onay sonrası yasaklı-ifade listesi değişti → kalite dijesti farklı.
    gateResult = { ok: true, violations: [], digest: 'q-digest-DEGISTI' }
    const out = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId: req.approvalId as string })
    expect(out.ok).toBe(false)
    expect(out.error).toContain('Digest uyuşmazlığı')
  })

  it('Faz 2.3: primary contact e-postası lead.email\'i EZER (canonical resolver)', async () => {
    db.contacts.push({ id: 'c-1', lead_id: LEAD_ID, full_name: 'Ayşe Yılmaz', email: 'AYSE@klinik.com', is_primary: true, created_at: '2026-07-13' })
    const r = await requestSendApproval(DRAFT_ID)
    expect(r.ok).toBe(true)
    expect(String(db.approval_requests[0].redacted_preview)).toContain('alıcı-domain: klinik.com')
  })

  it('Faz 2.3: onaydan SONRA primary contact değişirse approval GEÇERSİZ (digest mismatch)', async () => {
    const req = await requestSendApproval(DRAFT_ID) // lead.email ile onaylandı
    approve(req.approvalId as string)
    // Alıcı değişti: yeni primary contact eklendi.
    db.contacts.push({ id: 'c-2', lead_id: LEAD_ID, full_name: 'Yeni Kişi', email: 'yeni@klinik.com', is_primary: true, created_at: '2026-07-13' })
    const out = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId: req.approvalId as string })
    expect(out.ok).toBe(false)
    expect(out.error).toContain('Digest uyuşmazlığı')
  })

  it('Faz 1.3: gönderim ANINDA kalite geçmiyorsa bloke (onay olsa bile)', async () => {
    const req = await requestSendApproval(DRAFT_ID)
    approve(req.approvalId as string)
    gateResult = { ok: false, violations: [{ code: 'VOICE_BANNED_PHRASE', detail: 'x', fix: 'y' }], digest: 'q-digest-1' }
    const out = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId: req.approvalId as string })
    expect(out.ok).toBe(false)
    expect(out.blockedReasons).toContain('VOICE_BANNED_PHRASE')
  })

  it('email-dışı kanal / zaten-gönderilmiş / lead\'siz taslak → açıklayıcı red', async () => {
    db.outreach_messages.push(
      { id: 'wa-1', lead_id: LEAD_ID, channel: 'whatsapp', status: 'draft', subject: 'x', body: VALID_BODY, final_body: null, sent_at: null, gmail_message_id: null, gmail_thread_id: null, error: null },
      { id: 'sent-1', lead_id: LEAD_ID, channel: 'email', status: 'sent', subject: 'x', body: VALID_BODY, final_body: null, sent_at: new Date().toISOString(), gmail_message_id: 'g', gmail_thread_id: 't', error: null },
      { id: 'orphan-1', lead_id: null, channel: 'email', status: 'draft', subject: 'x', body: VALID_BODY, final_body: null, sent_at: null, gmail_message_id: null, gmail_thread_id: null, error: null },
    )
    expect((await requestSendApproval('wa-1')).error).toContain('email kanalı')
    expect((await requestSendApproval('sent-1')).error).toContain('zaten gönderilmiş')
    expect((await requestSendApproval('orphan-1')).error).toContain('lead bağı yok')
    expect((await requestSendApproval('yok-1')).error).toContain('bulunamadı')
  })

  it('e-postasız lead → adres iste; findSendApproval onayı idempotency ile bulur', async () => {
    db.leads.push({ id: 'lead-2', business_name: 'X', email: null, do_not_contact: false })
    db.outreach_messages.push({ id: 'draft-2', lead_id: 'lead-2', channel: 'email', status: 'draft', subject: 'x', body: VALID_BODY, final_body: null, sent_at: null, gmail_message_id: null, gmail_thread_id: null, error: null })
    expect((await requestSendApproval('draft-2')).error).toContain('e-posta adresi yok')

    const req = await requestSendApproval(DRAFT_ID)
    const found = await findSendApproval(DRAFT_ID)
    expect(found?.id).toBe(req.approvalId)
    expect(await findSendApproval('yok-boyle')).toBeNull()
    expect(await findSendApproval('draft-2')).toBeNull() // e-postasız lead
  })

  it('düzenleme persist edilir ve digest düzenleme-sonrası içeriğe bağlanır', async () => {
    const edited = `${VALID_BODY}\n\nEK PARAGRAF.`
    const r = await requestSendApproval(DRAFT_ID, { finalBody: edited })
    expect(r.ok).toBe(true)
    const row = db.outreach_messages[0]
    expect(row.final_body).toBe(edited)
    // Faz 1.3: digest içerik + KALİTE dijesti üzerinden hesaplanır.
    const expected = computeActionDigest(SEND_GMAIL_ACTION, computeSendArgs(DRAFT_ID, 'info@testklinik.com', 'Web siteniz', edited, 'q-digest-1'))
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

  it('deterministik Message-ID header taşır (reconciliation ankrajı)', () => {
    const raw = buildRawMessage({
      from: 'me@ajans.com', to: 'sen@klinik.com', subject: 'Öneri', body: 'Merhaba',
      messageId: `<outreach-${DRAFT_ID}@agencyos.grafikcem>`,
    })
    const decoded = Buffer.from(raw, 'base64url').toString('utf8')
    expect(decoded).toContain(`Message-ID: <outreach-${DRAFT_ID}@agencyos.grafikcem>`)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ZORUNLU YARIŞ TESTLERİ (Faz 2 — at-most-once state machine, mig 054)
// ─────────────────────────────────────────────────────────────────────────────
describe('at-most-once state machine (yarış + provider hataları)', () => {
  async function approvedDraft(): Promise<string> {
    const req = await requestSendApproval(DRAFT_ID)
    approve(req.approvalId!)
    return req.approvalId!
  }

  it('Promise.all ile İKİ eşzamanlı send → provider transport TAM 1 kez çağrılır', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const approvalId = await approvedDraft()
    const { transport, calls } = countingTransport()

    const [a, b] = await Promise.all([
      sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId, transport }),
      sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId, transport }),
    ])

    expect(calls()).toBe(1)
    const outcomes = [a, b]
    expect(outcomes.filter((o) => o.ok && !o.alreadySent && !o.inProgress)).toHaveLength(1)
    // Kaybeden: inProgress ya da alreadySent — ama asla ikinci gönderim değil.
    const loser = outcomes.find((o) => !(o.ok && !o.alreadySent && !o.inProgress))!
    expect(loser.inProgress || loser.alreadySent).toBe(true)
    expect(db.email_messages).toHaveLength(1)
    logSpy.mockRestore()
  })

  it('provider başarılı + finalize/DB hatası → retry provider\'ı İKİNCİ KEZ ÇAĞIRMAZ', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const approvalId = await approvedDraft()
    const { transport, calls } = countingTransport()

    rpcFailNext = true
    const first = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId, transport })
    expect(first.ok).toBe(true)
    expect(first.finalizePending).toBe(true)
    expect(calls()).toBe(1)
    // Kalıcı kayıt eksik ama attempt 'sent' + provider id güvencede.
    const attempt = db.outreach_send_attempts[0]
    expect(attempt.state).toBe('sent')
    expect(attempt.finalized).toBe(false)
    expect(attempt.provider_message_id).toBe(`prov-${DRAFT_ID}`)

    // Retry: provider'a DOKUNMADAN yalnız finalize onarılır.
    const second = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId, transport })
    expect(calls()).toBe(1) // ← kritik iddia: ek provider çağrısı YOK
    expect(second.alreadySent).toBe(true)
    expect(db.outreach_send_attempts[0].finalized).toBe(true)
    expect(db.email_messages).toHaveLength(1)
    expect(db.approval_requests[0].status).toBe('executed')
    logSpy.mockRestore()
    errSpy.mockRestore()
  })

  it('claim alınmışken (sending) ikinci istek → inProgress, provider 0 çağrı', async () => {
    const approvalId = await approvedDraft()
    db.outreach_send_attempts.push({
      id: 'att-1', outreach_message_id: DRAFT_ID, approval_id: approvalId,
      action_digest: 'x', rfc_message_id: `<outreach-${DRAFT_ID}@agencyos.grafikcem>`,
      state: 'sending', claim_token: 'tok-1', attempt_count: 1,
      claimed_at: new Date().toISOString(), sent_at: null,
      provider_message_id: null, provider_thread_id: null, finalized: false, last_error: null,
    })
    const { transport, calls } = countingTransport()

    const r = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId, transport })
    expect(r.ok).toBe(false)
    expect(r.inProgress).toBe(true)
    expect(calls()).toBe(0)
  })

  it('approval executed geçişi başarısız → finalize rollback, durum KAYBOLMAZ ve reconcile edilebilir', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const approvalId = await approvedDraft()
    // Provider send sırasında onay durumu bozulur (yarış/operatör müdahalesi
    // simülasyonu) → RPC approval geçişini yapamaz → TÜM finalize geri alınır.
    const { transport, calls } = countingTransport({
      onSend: () => {
        db.approval_requests[0].status = 'rejected'
      },
    })

    const r = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId, transport })
    expect(calls()).toBe(1)
    expect(r.finalizePending).toBe(true)
    // Rollback: outreach 'sent' OLMADI, email_messages YOK — ama provider
    // gerçeği attempt'te duruyor (state=sent, provider_message_id dolu).
    expect(db.outreach_messages[0].status).toBe('draft')
    expect(db.email_messages).toHaveLength(0)
    const attempt = db.outreach_send_attempts[0]
    expect(attempt.state).toBe('sent')
    expect(attempt.finalized).toBe(false)
    expect(attempt.provider_message_id).toBe(`prov-${DRAFT_ID}`)

    // Onarım: onay tekrar approved yapılırsa reconcile finalize'ı tamamlar.
    db.approval_requests[0].status = 'approved'
    const rec = await reconcileOutreachSend(DRAFT_ID)
    expect(rec.ok).toBe(true)
    expect(rec.outcome).toBe('reconciled_sent')
    expect(db.outreach_send_attempts[0].finalized).toBe(true)
    expect(db.email_messages).toHaveLength(1)
    errSpy.mockRestore()
  })

  it('suppression onaydan SONRA eklendi → provider 0 kez çağrılır', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const approvalId = await approvedDraft()
    db.suppression_list.push({ id: 's1', scope: 'email', address: 'info@testklinik.com', reason: 'opt_out' })
    const { transport, calls } = countingTransport()

    const r = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId, transport })
    expect(r.ok).toBe(false)
    expect(r.blockedReasons).toBeDefined()
    expect(calls()).toBe(0)
    expect(db.outreach_send_attempts).toHaveLength(0) // claim bile alınmadı
    warnSpy.mockRestore()
  })

  it('digest uyuşmazlığı → provider 0 kez çağrılır', async () => {
    const approvalId = await approvedDraft()
    db.outreach_messages[0].final_body = `${VALID_BODY}\n\nSONRADAN DEĞİŞTİ.`
    const { transport, calls } = countingTransport()

    const r = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId, transport })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Digest uyuşmazlığı')
    expect(calls()).toBe(0)
  })

  it('belirsiz hata → unknown; reconcile KADEMELİ: grace → 2×arama → operatör onayı → failed → re-claim → başarı', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const approvalId = await approvedDraft()
    const failing = countingTransport({ failWith: new GmailTransportError('timeout', true) })

    const r1 = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId, transport: failing.transport })
    expect(r1.ok).toBe(false)
    expect(r1.needsReconciliation).toBe(true)
    expect(db.outreach_send_attempts[0].state).toBe('unknown')

    // Belirsizken retry provider'ı ÇAĞIRMAZ:
    const r2 = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId, transport: failing.transport })
    expect(r2.needsReconciliation).toBe(true)
    expect(failing.calls()).toBe(1)

    // Reconcile arama transport'u: her zaman "yok" der (enjekte test dikişi).
    const searchEmpty: GmailTransport = {
      async send() { throw new Error('çağrılmamalı') },
      async findByRfcMessageId() { return null },
    }

    // 1) Grace period içinde: "yok" sonucu HÜKÜMSÜZ, sayaç bile artmaz.
    const g = await reconcileOutreachSend(DRAFT_ID, { transport: searchEmpty })
    expect(g.ok).toBe(true)
    expect(g.outcome).toBe('no_action')
    expect(db.outreach_send_attempts[0].state).toBe('unknown')

    // 2) Grace sonrası ilk "yok": karar YOK (min arama dolmadı).
    const later = Date.now() + 6 * 60_000
    const n1 = await reconcileOutreachSend(DRAFT_ID, { transport: searchEmpty, nowMs: later })
    expect(n1.outcome).toBe('not_found_unconfirmed')
    expect(db.outreach_send_attempts[0].state).toBe('unknown')

    // 3) İkinci "yok": karar hâlâ OPERATÖRDE.
    const n2 = await reconcileOutreachSend(DRAFT_ID, { transport: searchEmpty, nowMs: later })
    expect(n2.outcome).toBe('not_found_needs_confirmation')
    expect(db.outreach_send_attempts[0].state).toBe('unknown')

    // 4) Açık onayla → failed (yeniden denenebilir).
    const n3 = await reconcileOutreachSend(DRAFT_ID, { transport: searchEmpty, nowMs: later, confirmNotFound: true })
    expect(n3.outcome).toBe('not_found_marked_failed')
    expect(db.outreach_send_attempts[0].state).toBe('failed')

    // Yeniden deneme: failed → re-claim → başarı; attempt_count artar.
    const ok = countingTransport()
    const r3 = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId, transport: ok.transport })
    expect(r3.ok).toBe(true)
    expect(ok.calls()).toBe(1)
    expect(db.outreach_send_attempts[0].attempt_count).toBe(2)
    expect(db.email_messages).toHaveLength(1)
    logSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('GMAIL_SEND_ENABLED=false iken enjekte-transport OLMADAN unknown attempt failed YAPILAMAZ', async () => {
    const approvalId = await approvedDraft()
    db.outreach_send_attempts.push({
      id: 'att-dr', outreach_message_id: DRAFT_ID, approval_id: approvalId,
      action_digest: 'x', rfc_message_id: `<outreach-${DRAFT_ID}@agencyos.grafikcem>`,
      state: 'unknown', claim_token: 'tok-dr', attempt_count: 1,
      claimed_at: new Date(Date.now() - 10 * 60_000).toISOString(), sent_at: null,
      provider_message_id: null, provider_thread_id: null, finalized: false, last_error: null,
      reconcile_search_count: 5, last_searched_at: null,
    })
    const r = await reconcileOutreachSend(DRAFT_ID, { confirmNotFound: true })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('GMAIL_SEND_ENABLED=false')
    expect(db.outreach_send_attempts[0].state).toBe('unknown') // durum korunur
  })

  it('eşzamanlı iki confirm-reconcile → failed geçişini TEK biri kazanır (CAS)', async () => {
    const approvalId = await approvedDraft()
    db.outreach_send_attempts.push({
      id: 'att-race', outreach_message_id: DRAFT_ID, approval_id: approvalId,
      action_digest: 'x', rfc_message_id: `<outreach-${DRAFT_ID}@agencyos.grafikcem>`,
      state: 'unknown', claim_token: 'tok-race', attempt_count: 1,
      claimed_at: new Date(Date.now() - 10 * 60_000).toISOString(), sent_at: null,
      provider_message_id: null, provider_thread_id: null, finalized: false, last_error: null,
      reconcile_search_count: 2, last_searched_at: null,
    })
    const searchEmpty: GmailTransport = {
      async send() { throw new Error('çağrılmamalı') },
      async findByRfcMessageId() { return null },
    }
    const later = Date.now()
    const [a, b] = await Promise.all([
      reconcileOutreachSend(DRAFT_ID, { transport: searchEmpty, nowMs: later, confirmNotFound: true }),
      reconcileOutreachSend(DRAFT_ID, { transport: searchEmpty, nowMs: later, confirmNotFound: true }),
    ])
    const outcomes = [a.outcome, b.outcome]
    expect(outcomes.filter((o) => o === 'not_found_marked_failed')).toHaveLength(1)
    expect(db.outreach_send_attempts[0].state).toBe('failed')
  })

  it('finalize RPC: approval_id attempt ile uyuşmazsa DB seviyesinde reddedilir (mig 056)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const approvalId = await approvedDraft()
    // İkinci (yanlış) onay kaydı:
    db.approval_requests.push({
      id: 'app-yanlis', action: SEND_GMAIL_ACTION, status: 'approved',
      action_digest: 'd', approved_digest: 'd',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    })
    // Attempt DOĞRU onayla claim'li; finalize YANLIŞ onayla çağrılıyor —
    // bunu tetiklemek için attempt'i elle 'sent' bırakıp repair'i yanlış
    // approval'a bağlarız: attempt.approval_id = approvalId, çağrı app-yanlis.
    db.outreach_send_attempts.push({
      id: 'att-mm', outreach_message_id: DRAFT_ID, approval_id: approvalId,
      action_digest: 'x', rfc_message_id: '<x>', state: 'sent', claim_token: 'tok-mm', attempt_count: 1,
      claimed_at: new Date().toISOString(), sent_at: new Date().toISOString(),
      provider_message_id: 'g-mm', provider_thread_id: 't-mm', finalized: false, last_error: null,
      reconcile_search_count: 0, last_searched_at: null,
    })
    const rpc = rpcFinalize({
      p_outreach_message_id: DRAFT_ID, p_approval_id: 'app-yanlis', p_claim_token: 'tok-mm',
      p_gmail_message_id: 'g-mm', p_gmail_thread_id: 't-mm', p_from_address: 'f', p_to_address: 't',
      p_subject: 's', p_body: 'b', p_sent_at: new Date().toISOString(), p_final_state: 'sent',
    })
    expect((rpc.data as { ok: boolean; error?: string }).ok).toBe(false)
    expect((rpc.data as { error?: string }).error).toContain('approval_id_attempt_ile_uyusmuyor')
    expect(db.outreach_messages[0].status).toBe('draft') // hiçbir yazım uygulanmadı
    errSpy.mockRestore()
  })

  it('kesin provider reddi (4xx) → failed; yeniden deneme serbest', async () => {
    const approvalId = await approvedDraft()
    const failing = countingTransport({ failWith: new GmailTransportError('invalid recipient', false) })

    const r = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId, transport: failing.transport })
    expect(r.ok).toBe(false)
    expect(r.needsReconciliation).toBeUndefined()
    expect(db.outreach_send_attempts[0].state).toBe('failed')
  })

  it('BAYAT claim (sending, 10 dk önce) → unknown\'a düşürülür + needsReconciliation; provider 0', async () => {
    const approvalId = await approvedDraft()
    db.outreach_send_attempts.push({
      id: 'att-stale', outreach_message_id: DRAFT_ID, approval_id: approvalId,
      action_digest: 'x', rfc_message_id: `<outreach-${DRAFT_ID}@agencyos.grafikcem>`,
      state: 'sending', claim_token: 'tok-stale', attempt_count: 1,
      claimed_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), sent_at: null,
      provider_message_id: null, provider_thread_id: null, finalized: false, last_error: null,
    })
    const { transport, calls } = countingTransport()

    const r = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId, transport })
    expect(r.ok).toBe(false)
    expect(r.needsReconciliation).toBe(true)
    expect(calls()).toBe(0)
    expect(db.outreach_send_attempts[0].state).toBe('unknown')
  })

  it('GMAIL_SEND_ENABLED=true + aktif hesap: OAuth\'suz REST transport KESİN hata → failed (sessiz düşüş yok)', async () => {
    process.env.GMAIL_SEND_ENABLED = 'true'
    db.gmail_accounts.push({
      id: 'acc-1', email_address: 'ali@grafikcem.agency', vault_secret_id: 'vault-1',
      active: true, created_at: new Date().toISOString(),
    })
    const approvalId = await approvedDraft()

    const r = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('OAuth')
    expect(db.outreach_send_attempts[0].state).toBe('failed')
    expect(db.email_messages).toHaveLength(0)
  })

  it('reconcileOutreachSend: attempt kaydı yoksa açıklayıcı hata', async () => {
    const r = await reconcileOutreachSend(DRAFT_ID)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('denemesi kaydı yok')
  })

  it('send ön-kontrol dalları: satır yok / lead bağı yok / farklı-eylem onayı', async () => {
    const approvalId = await approvedDraft()
    expect((await sendGmailMessage({ outreachMessageId: 'yok-9', approvalId })).error).toContain('bulunamadı')

    db.outreach_messages.push({ id: 'orphan-9', lead_id: null, channel: 'email', status: 'draft', subject: 'x', body: VALID_BODY, final_body: null, sent_at: null, gmail_message_id: null, gmail_thread_id: null, error: null })
    expect((await sendGmailMessage({ outreachMessageId: 'orphan-9', approvalId })).error).toContain('lead bağı yok')

    db.approval_requests.push({ id: 'app-x', action: 'baska-eylem', status: 'approved', action_digest: 'd', approved_digest: 'd', expires_at: new Date(Date.now() + 60_000).toISOString() })
    expect((await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId: 'app-x' })).error).toContain('farklı bir eyleme')
  })

  it('konu boş + işletme adsız lead → preview yine üretilir (konu yok/— dalları)', async () => {
    db.leads.push({ id: 'lead-3', business_name: null, email: 'a@b.co', do_not_contact: false })
    db.outreach_messages.push({ id: 'draft-3', lead_id: 'lead-3', channel: 'email', status: 'draft', subject: null, body: VALID_BODY, final_body: null, sent_at: null, gmail_message_id: null, gmail_thread_id: null, error: null })
    const r = await requestSendApproval('draft-3')
    expect(r.ok).toBe(true)
    const preview = String(db.approval_requests.find((a) => a.id === r.approvalId)!.redacted_preview)
    expect(preview).toContain('(konu yok)')
    expect(preview).toContain('işletme: —')
  })

  it('provider başarı + sent-CAS kaybı → yine ASLA ikinci gönderim; finalize sentetik attempt\'la tamamlanır', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const approvalId = await approvedDraft()
    const { transport, calls } = countingTransport()
    sentCasFailsOnce = true

    const r = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId, transport })
    expect(calls()).toBe(1)
    expect(r.ok).toBe(true)
    // finalize RPC claim_token hâlâ bizde → kalıcı kayıt tamamlanır.
    expect(db.email_messages).toHaveLength(1)
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('sent_state_write_failed'))).toBe(true)
    logSpy.mockRestore()
    errSpy.mockRestore()
  })

  it('alreadySent + finalize onarımı da BAŞARISIZ → finalizePending raporlanır, provider 0', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const approvalId = await approvedDraft()
    const { transport, calls } = countingTransport()
    rpcFailNext = true
    await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId, transport }) // sent, finalized=false

    rpcFailNext = true // onarım da başarısız
    const r = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId, transport })
    expect(calls()).toBe(1)
    expect(r.alreadySent).toBe(true)
    expect(r.finalizePending).toBe(true)
    logSpy.mockRestore()
    errSpy.mockRestore()
  })

  it('reconcile: outreach satırı silinmişse açıklayıcı hata (attempt var)', async () => {
    const approvalId = await approvedDraft()
    db.outreach_send_attempts.push({
      id: 'att-x', outreach_message_id: 'silinmis-1', approval_id: approvalId,
      action_digest: 'x', rfc_message_id: '<x>', state: 'unknown', claim_token: 't', attempt_count: 1,
      claimed_at: new Date().toISOString(), sent_at: null,
      provider_message_id: null, provider_thread_id: null, finalized: false, last_error: null,
    })
    const r = await reconcileOutreachSend('silinmis-1')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('bulunamadı')
  })

  it('GMAIL_SEND_ENABLED=true reconcile: REST araması OAuth\'suz → outcome error (durum korunur; arama hatası ≠ not-found)', async () => {
    process.env.GMAIL_SEND_ENABLED = 'true'
    db.gmail_accounts.push({ id: 'acc-1', email_address: 'ali@x.co', vault_secret_id: 'v1', active: true, created_at: new Date().toISOString() })
    const approvalId = await approvedDraft()
    db.outreach_send_attempts.push({
      id: 'att-u', outreach_message_id: DRAFT_ID, approval_id: approvalId,
      action_digest: 'x', rfc_message_id: `<outreach-${DRAFT_ID}@agencyos.grafikcem>`,
      state: 'unknown', claim_token: 'tok-u', attempt_count: 1,
      claimed_at: new Date(Date.now() - 10 * 60_000).toISOString(), sent_at: null,
      provider_message_id: null, provider_thread_id: null, finalized: false, last_error: null,
      reconcile_search_count: 0, last_searched_at: null,
    })
    const r = await reconcileOutreachSend(DRAFT_ID)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('OAuth')
    expect(db.outreach_send_attempts[0].state).toBe('unknown')
    expect(db.outreach_send_attempts[0].reconcile_search_count).toBe(0) // hata sayaç ARTIRMAZ
  })

  it('alreadySent + provider id\'siz attempt → dryRun bilinmez (undefined), repair atlanır', async () => {
    const approvalId = await approvedDraft()
    db.outreach_send_attempts.push({
      id: 'att-s', outreach_message_id: DRAFT_ID, approval_id: approvalId,
      action_digest: 'x', rfc_message_id: '<x>', state: 'sent', claim_token: 'tok-s', attempt_count: 1,
      claimed_at: new Date().toISOString(), sent_at: new Date().toISOString(),
      provider_message_id: null, provider_thread_id: null, finalized: true, last_error: null,
    })
    const { transport, calls } = countingTransport()
    const r = await sendGmailMessage({ outreachMessageId: DRAFT_ID, approvalId, transport })
    expect(r.alreadySent).toBe(true)
    expect(r.dryRun).toBeUndefined()
    expect(calls()).toBe(0)
  })

  it('reconcile: state=claimed (taze) → no_action', async () => {
    const approvalId = await approvedDraft()
    db.outreach_send_attempts.push({
      id: 'att-c', outreach_message_id: DRAFT_ID, approval_id: approvalId,
      action_digest: 'x', rfc_message_id: `<outreach-${DRAFT_ID}@agencyos.grafikcem>`,
      state: 'claimed', claim_token: 'tok-c', attempt_count: 1,
      claimed_at: new Date().toISOString(), sent_at: null,
      provider_message_id: null, provider_thread_id: null, finalized: false, last_error: null,
    })
    const r = await reconcileOutreachSend(DRAFT_ID)
    expect(r.ok).toBe(true)
    expect(r.outcome).toBe('no_action')
  })
})
