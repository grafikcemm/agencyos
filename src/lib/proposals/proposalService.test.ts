import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// proposalService v2 (Sprint-3 Faz 5) — atomiklik + geçiş grafı + digest'li onay.
// In-memory DB mock: RPC (create_proposal_version_tx) + tablolar; RPC_MISSING
// bayrağıyla legacy güvenli-sıra yolu da kanıtlanır.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>
const db: Record<string, Row[]> = {
  leads: [],
  lead_evidence: [],
  proposals: [],
  proposal_versions: [],
  proposal_approvals: [],
  proposal_events: [],
}
let seq = 0
let rpcMissing = true // varsayılan: 061 v2 RPC yok → legacy yol
let rpcRejects = false
let rpcUnexpectedError = false
let schemaMissing = false
let versionInsertError: { message: string } | null = null
let bumpNoRows = false
let evidenceError: { message: string } | null = null
let leadSelectError: { message: string } | null = null
let eventInsertError: { message: string } | null = null
let statusCasNoRows = false
let approvalCasNoRows = false
let rpcNullData = false
let evidenceNullData = false
/** Tabloya SELECT hatası enjeksiyonu (görünür hata dallarını sürmek için). */
let selectErrorTables = new Set<string>()

function rpcTx(args: Record<string, unknown>) {
  if (rpcNullData) return { data: null, error: null }
  if (rpcUnexpectedError) return { data: null, error: { code: 'XX000', message: 'beklenmedik rpc hatası' } }
  if (rpcMissing) return { data: null, error: { code: 'PGRST202', message: 'fn yok' } }
  if (schemaMissing) return { data: null, error: { code: '42P01', message: 'tablo yok' } }
  if (rpcRejects) return { data: { ok: false }, error: null }
  const existing = db.proposals.find(
    (p) => p.lead_id === args.p_lead_id && ['draft', 'review', 'approved'].includes(String(p.status)),
  )
  let id: string
  let version: number
  if (existing) {
    id = existing.id as string
    version = (existing.current_version as number) + 1
    Object.assign(existing, { current_version: version, status: 'draft', contact_id: args.p_contact_id })
  } else {
    id = `prop-${++seq}`
    version = 1
    db.proposals.push({ id, lead_id: args.p_lead_id, contact_id: args.p_contact_id, status: 'draft', current_version: 1 })
  }
  db.proposal_versions.push({
    id: `ver-${++seq}`, proposal_id: id, version,
    email_subject: args.p_email_subject, email_body: args.p_email_body,
    whatsapp_text: args.p_whatsapp_text, quality_digest: args.p_quality_digest,
  })
  db.proposal_events.push({ proposal_id: id, version, event: version === 1 ? 'created' : 'revised' })
  return { data: { ok: true, proposal_id: id, version }, error: null }
}

function from(table: string) {
  const rows = (db[table] ??= [])
  const filters: Array<(r: Row) => boolean> = []
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let payload: Row | null = null

  function exec(single: boolean): { data: unknown; error: { message: string; code?: string } | null } {
    if (table === 'lead_evidence' && evidenceError) return { data: null, error: evidenceError }
    if (table === 'lead_evidence' && evidenceNullData) return { data: null, error: null }
    if (table === 'leads' && leadSelectError) return { data: null, error: leadSelectError }
    if (schemaMissing && table.startsWith('proposal')) {
      return { data: null, error: { message: 'tablo yok', code: '42P01' } }
    }
    if (op === 'insert' && payload) {
      if (table === 'proposal_versions' && versionInsertError) return { data: null, error: versionInsertError }
      if (table === 'proposal_events' && eventInsertError) return { data: null, error: eventInsertError }
      if (
        table === 'proposal_approvals' &&
        rows.some((r) => r.proposal_id === payload!.proposal_id && r.version === payload!.version)
      ) {
        return { data: null, error: { message: 'duplicate', code: '23505' } }
      }
      const row = { id: `${table}-${++seq}`, ...payload }
      rows.push(row)
      return { data: single ? row : [row], error: null }
    }
    if (op === 'update' && payload) {
      if (table === 'proposals' && bumpNoRows && payload.current_version !== undefined) {
        bumpNoRows = false
        return { data: [], error: null }
      }
      if (table === 'proposals' && statusCasNoRows && payload.status !== undefined) {
        statusCasNoRows = false
        return { data: [], error: null }
      }
      if (table === 'proposal_approvals' && approvalCasNoRows) {
        approvalCasNoRows = false
        return { data: [], error: null }
      }
      const m = rows.filter((r) => filters.every((f) => f(r)))
      m.forEach((r) => Object.assign(r, payload))
      return { data: single ? (m[0] ?? null) : m.map((r) => ({ id: r.id })), error: null }
    }
    if (op === 'delete') {
      const keep = rows.filter((r) => !filters.every((f) => f(r)))
      db[table] = keep
      return { data: [], error: null }
    }
    if (op === 'select' && selectErrorTables.has(table)) {
      return { data: null, error: { message: `${table} select down` } }
    }
    const m = rows.filter((r) => filters.every((f) => f(r)))
    return { data: single ? (m[0] ?? null) : m, error: null }
  }

  const api: Record<string, unknown> = {}
  Object.assign(api, {
    select: () => api,
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api },
    in: (c: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[c])); return api },
    order: () => api,
    limit: () => api,
    insert: (p: Row) => { op = 'insert'; payload = p; return api },
    update: (p: Row) => { op = 'update'; payload = p; return api },
    delete: () => { op = 'delete'; return api },
    maybeSingle: async () => exec(true),
    single: async () => exec(true),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(exec(false)).then(res, rej),
  })
  return api
}

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (t: string) => from(t),
    rpc: async (fn: string, args: Record<string, unknown>) =>
      fn === 'create_proposal_version_tx' ? rpcTx(args) : { data: null, error: { code: 'PGRST202', message: 'yok' } },
  },
}))

vi.mock('@/lib/proposalBuilder', () => ({
  buildProposal: () => ({
    services: ['Web Sitesi'],
    setupPrice: 25_000,
    monthlyPrice: 5_000,
    timeline: '3 hafta',
    whatsappText: 'WA teklif metni',
    emailText: 'Email teklif metni',
  }),
}))

let gateOk = true
vi.mock('@/lib/outreach/outboundGate', () => ({
  evaluateOutboundText: async () => ({
    ok: gateOk,
    violations: gateOk ? [] : [{ code: 'GENERIC_CLICHE', detail: 'x', fix: 'y' }],
    digest: 'q-teklif-1',
  }),
}))

let recipient = {
  email: 'a@b.co',
  contactId: 'c-1' as string | null,
  contactName: 'Ayşe' as string | null,
  source: 'primary_contact' as string,
}
vi.mock('@/lib/contacts/contactService', () => ({
  resolveCanonicalRecipient: async () => recipient,
}))

import {
  createProposalDraft,
  transitionProposal,
  requestProposalApproval,
  decideProposalApproval,
  computeProposalDigest,
} from './proposalService'

const LEAD = 'lead-1'

beforeEach(() => {
  for (const k of Object.keys(db)) db[k] = []
  seq = 0
  rpcMissing = true
  rpcRejects = false
  rpcUnexpectedError = false
  schemaMissing = false
  versionInsertError = null
  bumpNoRows = false
  evidenceError = null
  leadSelectError = null
  eventInsertError = null
  statusCasNoRows = false
  approvalCasNoRows = false
  rpcNullData = false
  evidenceNullData = false
  selectErrorTables = new Set()
  gateOk = true
  recipient = { email: 'a@b.co', contactId: 'c-1', contactName: 'Ayşe', source: 'primary_contact' }
  db.leads.push({ id: LEAD, business_name: 'Denta Klinik', sector: 'klinik', pain_points: [], notes: null })
  db.lead_evidence.push({ id: 'ev-1', lead_id: LEAD })
})

describe('createProposalDraft', () => {
  it('RPC canlıysa TEK transaction (atomic:true): proposal+version+event', async () => {
    rpcMissing = false
    const r = await createProposalDraft({ leadId: LEAD, offerIds: ['website'] })
    expect(r).toMatchObject({ ok: true, version: 1, atomic: true })
    expect(db.proposal_versions).toHaveLength(1)
    expect(db.proposal_events[0]).toMatchObject({ event: 'created' })
  })

  it('RPC reddederse görünür hata (atomic:true)', async () => {
    rpcMissing = false
    rpcRejects = true
    const r = await createProposalDraft({ leadId: LEAD, offerIds: ['website'] })
    expect(r.ok).toBe(false)
    expect(r.atomic).toBe(true)
  })

  it('kalite kapısı geçmeden KALICI teklif YAZILMAZ', async () => {
    gateOk = false
    const r = await createProposalDraft({ leadId: LEAD, offerIds: ['website'] })
    expect(r.ok).toBe(false)
    expect(r.quality?.violations[0].code).toBe('GENERIC_CLICHE')
    expect(db.proposals).toHaveLength(0)
  })

  it('şema yokken (061 bekliyor) açık schemaMissing hatası — sessiz memory YOK', async () => {
    schemaMissing = true
    const r = await createProposalDraft({ leadId: LEAD, offerIds: ['website'] })
    expect(r).toMatchObject({ ok: false, schemaMissing: true })
  })

  it('legacy: v1 oluşturma + revize v2 (version önce, sonra CAS bump)', async () => {
    const r1 = await createProposalDraft({ leadId: LEAD, offerIds: ['website'] })
    expect(r1).toMatchObject({ ok: true, version: 1, atomic: false })
    const r2 = await createProposalDraft({ leadId: LEAD, offerIds: ['website'] })
    expect(r2).toMatchObject({ ok: true, version: 2 })
    expect(db.proposals[0].current_version).toBe(2)
    expect(db.proposal_versions).toHaveLength(2)
  })

  it('legacy: VERSION INSERT DÜŞERSE current_version İLERLEMEZ (Faz 5.3)', async () => {
    await createProposalDraft({ leadId: LEAD, offerIds: ['website'] }) // v1
    versionInsertError = { message: 'insert fail' }
    const r = await createProposalDraft({ leadId: LEAD, offerIds: ['website'] })
    expect(r.ok).toBe(false)
    expect(String(r.error)).toContain('current_version ilerlemedi')
    expect(db.proposals[0].current_version).toBe(1) // ← kritik iddia
    expect(db.proposal_versions).toHaveLength(1)
  })

  it('legacy: yeni teklifte version düşerse proposal telafiyle SİLİNİR (öksüz kalmaz)', async () => {
    versionInsertError = { message: 'insert fail' }
    const r = await createProposalDraft({ leadId: LEAD, offerIds: ['website'] })
    expect(r.ok).toBe(false)
    expect(db.proposals).toHaveLength(0)
  })

  it('legacy: bump CAS yarışta kaybederse görünür hata (version yazıldı, bump edilmedi)', async () => {
    await createProposalDraft({ leadId: LEAD, offerIds: ['website'] })
    bumpNoRows = true
    const r = await createProposalDraft({ leadId: LEAD, offerIds: ['website'] })
    expect(r.ok).toBe(false)
    expect(String(r.error)).toContain('current_version güncellenemedi')
  })

  it('kanıt listesi okunamazsa görünür hata; lead yoksa açık mesaj', async () => {
    evidenceError = { message: 'db down' }
    expect((await createProposalDraft({ leadId: LEAD, offerIds: ['x'] })).error).toContain('kanıt listesi')
    evidenceError = null
    expect((await createProposalDraft({ leadId: 'yok', offerIds: ['x'] })).error).toContain('bulunamadı')
  })
})

describe('transitionProposal — geçerli geçiş grafı (Faz 5.4)', () => {
  async function seedProposal(status = 'draft'): Promise<string> {
    const r = await createProposalDraft({ leadId: LEAD, offerIds: ['website'] })
    const id = r.proposalId as string
    db.proposals.find((p) => p.id === id)!.status = status
    return id
  }

  it('draft→review geçer; draft→accepted REDDEDİLİR', async () => {
    const id = await seedProposal()
    expect((await transitionProposal({ proposalId: id, to: 'review' })).ok).toBe(true)
    const id2 = await seedProposal()
    db.proposals.find((p) => p.id === id2)!.status = 'draft'
    const bad = await transitionProposal({ proposalId: id2, to: 'accepted' })
    expect(bad.ok).toBe(false)
    expect(String(bad.error)).toContain('geçersiz geçiş')
  })

  it("'approved'a transition ile GEÇİLEMEZ (yalnız onay yolu)", async () => {
    const id = await seedProposal('review')
    // @ts-expect-error — kasıtlı: API şeması da 'approved' kabul etmez.
    const r = await transitionProposal({ proposalId: id, to: 'approved' })
    expect(r.ok).toBe(false)
  })

  it('terminal durumlardan çıkış yok; accepted/rejected/expired event AUDIT edilir', async () => {
    const id = await seedProposal('approved')
    expect((await transitionProposal({ proposalId: id, to: 'accepted' })).ok).toBe(true)
    expect(db.proposal_events.some((e) => e.event === 'accepted')).toBe(true)
    const again = await transitionProposal({ proposalId: id, to: 'rejected' })
    expect(again.ok).toBe(false)
  })

  it('teklif yoksa açık hata', async () => {
    expect((await transitionProposal({ proposalId: 'yok', to: 'review' })).ok).toBe(false)
  })
})

describe('onay akışı — approved YALNIZ approval satırı + versiyon + digest ile (Faz 5.5)', () => {
  async function seedWithApprovalRequest(): Promise<{ id: string; version: number }> {
    const r = await createProposalDraft({ leadId: LEAD, offerIds: ['website'] })
    const id = r.proposalId as string
    const req = await requestProposalApproval({ proposalId: id })
    expect(req.ok).toBe(true)
    return { id, version: req.version as number }
  }

  it('istek: pending approval + digest yazılır; teklif review durumuna geçer', async () => {
    const { id } = await seedWithApprovalRequest()
    expect(db.proposal_approvals[0]).toMatchObject({ proposal_id: id, decision: 'pending' })
    expect(db.proposals[0].status).toBe('review')
  })

  it('aynı versiyona ikinci istek idempotent (23505 → ok)', async () => {
    const { id } = await seedWithApprovalRequest()
    const again = await requestProposalApproval({ proposalId: id })
    expect(again.ok).toBe(true)
    expect(db.proposal_approvals).toHaveLength(1)
  })

  it('karar: doğru versiyon + digest → approved + event', async () => {
    const { id, version } = await seedWithApprovalRequest()
    const r = await decideProposalApproval({ proposalId: id, version, decision: 'approved' })
    expect(r.ok).toBe(true)
    expect(db.proposals[0].status).toBe('approved')
    expect(db.proposal_events.some((e) => e.event === 'approved')).toBe(true)
  })

  it('APPROVAL SATIRI YOKSA approved geçişi YAPILAMAZ', async () => {
    const r0 = await createProposalDraft({ leadId: LEAD, offerIds: ['website'] })
    const r = await decideProposalApproval({ proposalId: r0.proposalId as string, version: 1, decision: 'approved' })
    expect(r.ok).toBe(false)
    expect(String(r.error)).toContain('onay kaydı yok')
  })

  it('İÇERİK onaydan sonra değişirse digest uyuşmazlığı → approved REDDEDİLİR', async () => {
    const { id, version } = await seedWithApprovalRequest()
    db.proposal_versions.find((v) => v.proposal_id === id && v.version === version)!.email_body = 'DEĞİŞTİ'
    const r = await decideProposalApproval({ proposalId: id, version, decision: 'approved' })
    expect(r.ok).toBe(false)
    expect(String(r.error)).toContain('digest uyuşmazlığı')
    expect(db.proposals[0].status).toBe('review') // approved OLMADI
  })

  it('ALICI (contact) değişirse de digest uyuşmazlığı', async () => {
    const { id, version } = await seedWithApprovalRequest()
    db.proposals.find((p) => p.id === id)!.contact_id = 'c-baska'
    const r = await decideProposalApproval({ proposalId: id, version, decision: 'approved' })
    expect(r.ok).toBe(false)
    expect(String(r.error)).toContain('digest uyuşmazlığı')
  })

  it('teklif YENİ versiyona ilerlediyse eski versiyonun onayı geçmez', async () => {
    const { id, version } = await seedWithApprovalRequest()
    // revize → current_version=2
    db.proposals.find((p) => p.id === id)!.status = 'draft'
    await createProposalDraft({ leadId: LEAD, offerIds: ['website'] })
    const r = await decideProposalApproval({ proposalId: id, version, decision: 'approved' })
    expect(r.ok).toBe(false)
    expect(String(r.error)).toContain('YENİDEN onay')
  })

  it('rejected kararı: teklif rejected + approval karara bağlanır; ikinci karar reddedilir', async () => {
    const { id, version } = await seedWithApprovalRequest()
    expect((await decideProposalApproval({ proposalId: id, version, decision: 'rejected' })).ok).toBe(true)
    expect(db.proposals[0].status).toBe('rejected')
    const again = await decideProposalApproval({ proposalId: id, version, decision: 'approved' })
    expect(again.ok).toBe(false)
    expect(String(again.error)).toContain('zaten karara bağlı')
  })

  it('versiyon satırı yoksa onay İSTEĞİ bağlanamaz', async () => {
    const r0 = await createProposalDraft({ leadId: LEAD, offerIds: ['website'] })
    db.proposal_versions = [] // versiyon izi kayboldu
    const r = await requestProposalApproval({ proposalId: r0.proposalId as string })
    expect(r.ok).toBe(false)
    expect(String(r.error)).toContain('bulunamadı')
  })

  it('draft/review dışındaki durumda onay istenemez', async () => {
    const r0 = await createProposalDraft({ leadId: LEAD, offerIds: ['website'] })
    db.proposals[0].status = 'accepted'
    const r = await requestProposalApproval({ proposalId: r0.proposalId as string })
    expect(r.ok).toBe(false)
  })
})

describe('computeProposalDigest', () => {
  it('içerik/alıcı değişimi dijesti değiştirir; aynı girdi deterministik', () => {
    const base = { emailSubject: 's', emailBody: 'b', whatsappText: 'w', qualityDigest: 'q', contactId: 'c' }
    expect(computeProposalDigest(base)).toBe(computeProposalDigest({ ...base }))
    expect(computeProposalDigest({ ...base, emailBody: 'b2' })).not.toBe(computeProposalDigest(base))
    expect(computeProposalDigest({ ...base, contactId: null })).not.toBe(computeProposalDigest(base))
  })

  it('null alanlar deterministik boş-değer olarak dijeste girer', () => {
    const n = { emailSubject: null, emailBody: null, whatsappText: null, qualityDigest: null, contactId: null }
    expect(computeProposalDigest(n)).toBe(computeProposalDigest({ ...n }))
  })
})

describe('kenar dallar (hata yolları görünür)', () => {
  it('lead sorgu hatası + RPC beklenmedik hata görünür', async () => {
    leadSelectError = { message: 'db down' }
    expect((await createProposalDraft({ leadId: LEAD, offerIds: ['x'] })).error).toBe('db down')
    leadSelectError = null
    rpcMissing = false
    rpcUnexpectedError = true
    expect((await createProposalDraft({ leadId: LEAD, offerIds: ['x'] })).error).toContain('beklenmedik')
  })

  it('adı/sektörü boş lead fallback değerlerle çalışır', async () => {
    db.leads[0].business_name = null
    db.leads[0].sector = null
    const r = await createProposalDraft({ leadId: LEAD, offerIds: ['x'] })
    expect(r.ok).toBe(true)
  })

  it('event insert hatası akışı düşürmez ama loglanır (create + transition)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    eventInsertError = { message: 'event fail' }
    const r = await createProposalDraft({ leadId: LEAD, offerIds: ['x'] })
    expect(r.ok).toBe(true)
    const t = await transitionProposal({ proposalId: r.proposalId as string, to: 'review' })
    expect(t.ok).toBe(true)
    expect(errSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
    errSpy.mockRestore()
  })

  it('transition CAS yarışta kaybederse görünür hata', async () => {
    const r = await createProposalDraft({ leadId: LEAD, offerIds: ['x'] })
    statusCasNoRows = true
    const t = await transitionProposal({ proposalId: r.proposalId as string, to: 'review' })
    expect(t.ok).toBe(false)
    expect(String(t.error)).toContain('yarış')
  })

  it('requestProposalApproval: teklif yoksa açık hata', async () => {
    const r = await requestProposalApproval({ proposalId: 'yok' })
    expect(r.ok).toBe(false)
    expect(String(r.error)).toContain('bulunamadı')
  })

  it('decide: teklif/versiyon satırı silinmişse açık hata', async () => {
    const r0 = await createProposalDraft({ leadId: LEAD, offerIds: ['x'] })
    await requestProposalApproval({ proposalId: r0.proposalId as string })
    db.proposal_versions = []
    const r = await decideProposalApproval({ proposalId: r0.proposalId as string, version: 1, decision: 'approved' })
    expect(r.ok).toBe(false)
  })

  it('bilinmeyen durumdan geçiş reddedilir (?? [] dalı)', async () => {
    const r0 = await createProposalDraft({ leadId: LEAD, offerIds: ['x'] })
    db.proposals[0].status = 'garip-durum'
    const t = await transitionProposal({ proposalId: r0.proposalId as string, to: 'review' })
    expect(t.ok).toBe(false)
  })

  it('onay kararı CAS yarışta kaybederse görünür hata', async () => {
    const r0 = await createProposalDraft({ leadId: LEAD, offerIds: ['x'] })
    const req = await requestProposalApproval({ proposalId: r0.proposalId as string })
    approvalCasNoRows = true
    const r = await decideProposalApproval({
      proposalId: r0.proposalId as string,
      version: req.version as number,
      decision: 'approved',
    })
    expect(r.ok).toBe(false)
    expect(String(r.error)).toContain('yarışta')
  })

  it('RPC data:null dönerse görünür ret; evidence null-data (?? []) çökmeden geçer', async () => {
    rpcMissing = false
    rpcNullData = true
    const r = await createProposalDraft({ leadId: LEAD, offerIds: ['x'] })
    expect(r.ok).toBe(false)
    rpcNullData = false
    rpcMissing = true
    evidenceNullData = true
    const r2 = await createProposalDraft({ leadId: LEAD, offerIds: ['x'] })
    expect(r2.ok).toBe(true)
  })

  it('select hataları GÖRÜNÜR: proposals/versions/approvals okunamayınca açık mesaj', async () => {
    const r0 = await createProposalDraft({ leadId: LEAD, offerIds: ['x'] })
    const id = r0.proposalId as string

    selectErrorTables = new Set(['proposals'])
    expect((await transitionProposal({ proposalId: id, to: 'review' })).ok).toBe(false)
    expect((await requestProposalApproval({ proposalId: id })).ok).toBe(false)

    selectErrorTables = new Set(['proposal_versions'])
    const reqErr = await requestProposalApproval({ proposalId: id })
    expect(reqErr.ok).toBe(false)

    await (async () => {
      selectErrorTables = new Set()
      await requestProposalApproval({ proposalId: id })
    })()
    selectErrorTables = new Set(['proposal_approvals'])
    const dec = await decideProposalApproval({ proposalId: id, version: 1, decision: 'approved' })
    expect(dec.ok).toBe(false)
  })

  it('review durumundayken onay isteği transition tetiklemez; current_version null → ?? 1', async () => {
    const r0 = await createProposalDraft({ leadId: LEAD, offerIds: ['x'] })
    db.proposals[0].status = 'review'
    const req = await requestProposalApproval({ proposalId: r0.proposalId as string })
    expect(req.ok).toBe(true)
    expect(db.proposals[0].status).toBe('review')

    // current_version NULL olan bozuk legacy satır: ?? 1 varsayımıyla v2 denenir,
    // CAS null satırı eşlemez → GÖRÜNÜR hata (sessiz ilerleme YOK; veri onarımı ister).
    db.proposals[0].status = 'draft'
    db.proposals[0].current_version = null
    const r2 = await createProposalDraft({ leadId: LEAD, offerIds: ['x'] })
    expect(r2.ok).toBe(false)
    expect(String(r2.error)).toContain('current_version güncellenemedi')
  })

  it('pain_points null lead fallback ile çalışır', async () => {
    db.leads[0].pain_points = null
    expect((await createProposalDraft({ leadId: LEAD, offerIds: ['x'] })).ok).toBe(true)
  })

  it('null içerikli versiyon satırıyla onay isteği digest kurar (?? boş-değer dalları)', async () => {
    const r0 = await createProposalDraft({ leadId: LEAD, offerIds: ['x'] })
    const v = db.proposal_versions.find((x) => x.proposal_id === r0.proposalId)!
    Object.assign(v, { email_subject: null, email_body: null, whatsapp_text: null, quality_digest: null })
    db.proposals[0].contact_id = null
    const req = await requestProposalApproval({ proposalId: r0.proposalId as string })
    expect(req.ok).toBe(true)
    const d = await decideProposalApproval({ proposalId: r0.proposalId as string, version: 1, decision: 'approved' })
    expect(d.ok).toBe(true)
  })
})
