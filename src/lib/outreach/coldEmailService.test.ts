import { describe, it, expect, vi, beforeEach } from 'vitest'

// FINAL PILOT BLOCKERS Faz 5 — canonical cold-email ÜRETİM servisi doğrudan
// test edilir (web + Telegram ORTAK yol). Tüm bağımlılıklar enjekte/mocklu;
// gerçek LLM/DB SIFIR. Fail-closed: settings/VoiceDNA/canonical zorunlu yolları
// SESSİZCE degrade OLMAZ; ok:true yalnız izlenebilir taslak oluştuğunda.

// ── DB mock: tablo-bazlı hata enjeksiyonu + zincir ───────────────────────────
type Row = Record<string, unknown>
const db: Record<string, Row[]> = {
  leads: [], contacts: [], lead_evidence: [], settings: [], outreach_messages: [],
}
const errs: Record<string, { message: string } | null> = {}
let insertDraftError: { message: string } | null = null

function from(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let op: 'select' | 'insert' = 'select'
  let payload: Row | null = null
  function exec(single: boolean) {
    const e = errs[`${table}:${op}`]
    if (e) return { data: null, error: e }
    if (op === 'insert' && payload) {
      if (table === 'outreach_messages' && insertDraftError) return { data: null, error: insertDraftError }
      const row = { id: `${table}-1`, created_at: '2026-07-14T00:00:00Z', ...payload }
      ;(db[table] ??= []).push(row)
      return { data: single ? row : [row], error: null }
    }
    const rows = (db[table] ?? []).filter((r) => filters.every((f) => f(r)))
    return { data: single ? (rows[0] ?? null) : rows, error: null }
  }
  const api: Record<string, unknown> = {}
  Object.assign(api, {
    select: () => api,
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api },
    in: () => api,
    limit: () => api,
    insert: (p: Row) => { op = 'insert'; payload = p; return api },
    maybeSingle: async () => exec(true),
    single: async () => exec(true),
    then: (res: (v: unknown) => unknown) => Promise.resolve(exec(false)).then(res),
  })
  return api
}
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: (t: string) => from(t) } }))

// ── Bağımlılık mockları ──────────────────────────────────────────────────────
const llm = vi.fn()
vi.mock('@/lib/openrouter', () => ({ callWithOperation: (...a: unknown[]) => llm(...a) }))

const gate = vi.fn()
vi.mock('@/lib/outreach/outboundGate', () => ({ evaluateOutboundText: (...a: unknown[]) => gate(...a) }))

const voice = vi.fn()
vi.mock('@/lib/outreach/voiceDna', () => ({ getApprovedStyleRules: (...a: unknown[]) => voice(...a) }))

const resolveRecipient = vi.fn()
vi.mock('@/lib/contacts/contactService', () => ({ resolveCanonicalRecipient: (...a: unknown[]) => resolveRecipient(...a) }))

const persistVersion = vi.fn()
vi.mock('@/lib/outreach/claimEvidence', () => ({
  persistMessageVersion: (...a: unknown[]) => persistVersion(...a),
  voiceRulesDigest: () => 'vdigest',
}))

// Şablon + prompt + parse gerçek (saf); yalnız LLM içeriğini biz kontrol ederiz.
vi.mock('@/lib/coldEmailTemplates', () => ({
  COLD_EMAIL_TEMPLATES: { generic: { id: 'generic' } },
  selectColdEmailTemplate: () => 'generic',
}))
vi.mock('@/lib/coldEmail', async () => {
  const actual = await vi.importActual<typeof import('@/lib/coldEmail')>('@/lib/coldEmail')
  return {
    ...actual,
    buildColdEmailSystemPrompt: () => 'sys',
    buildColdEmailUserPrompt: () => 'user',
    buildSignatureBlock: () => 'İMZA',
    buildComplianceFooter: () => 'FOOTER',
  }
})

import { generateColdEmailDraft } from './coldEmailService'

const LEAD_ID = 'lead-1'
const GOOD_CONTENT = JSON.stringify({
  subject: 'Kısa bir gözlem',
  body: 'Merhaba, sitenizde bir şey fark ettim.',
  claims: [{ text: 'Siteniz mobil uyumsuz', evidenceId: 'ev-1' }],
})

function seedLead() {
  db.leads.push({ id: LEAD_ID, business_name: 'Test İşletme', sector: 'kafe' })
}

beforeEach(() => {
  for (const k of Object.keys(db)) db[k] = []
  for (const k of Object.keys(errs)) errs[k] = null
  insertDraftError = null
  llm.mockReset().mockResolvedValue({ content: GOOD_CONTENT })
  gate.mockReset().mockResolvedValue({ ok: true, digest: 'gdigest', violations: [] })
  voice.mockReset().mockResolvedValue({ preferred: [], banned: [] })
  resolveRecipient.mockReset().mockResolvedValue({ source: 'lead_email', email: 'a@b.com', contactId: null, contactName: null })
  persistVersion.mockReset().mockResolvedValue({ schemaMissing: false })
})

describe('generateColdEmailDraft — hata yolları (fail-closed)', () => {
  it('lead DB hatası → ok:false (notFound DEĞİL)', async () => {
    errs['leads:select'] = { message: 'db down' }
    const r = await generateColdEmailDraft(LEAD_ID)
    expect(r.ok).toBe(false)
    expect(r.notFound).toBeFalsy()
    expect(r.error).toContain('db down')
  })

  it('lead yok → notFound', async () => {
    const r = await generateColdEmailDraft(LEAD_ID)
    expect(r.ok).toBe(false)
    expect(r.notFound).toBe(true)
  })

  it('contact rol sorgusu hatası → ok:false', async () => {
    seedLead()
    resolveRecipient.mockResolvedValue({ source: 'primary_contact', email: 'c@d.com', contactId: 'con-1', contactName: 'Ali' })
    errs['contacts:select'] = { message: 'rol down' }
    const r = await generateColdEmailDraft(LEAD_ID)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('rol')
  })

  it('evidence sorgusu hatası → ok:false', async () => {
    seedLead()
    errs['lead_evidence:select'] = { message: 'ev down' }
    const r = await generateColdEmailDraft(LEAD_ID)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('kanıt')
  })

  it('settings sorgusu hatası → ok:false (uyum footer eksik gitmesin)', async () => {
    seedLead()
    errs['settings:select'] = { message: 'settings down' }
    const r = await generateColdEmailDraft(LEAD_ID)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('ayar')
  })

  it('Voice DNA okuma hatası → SESSİZ değil: voiceDegraded görünür ama üretim devam', async () => {
    seedLead()
    voice.mockRejectedValue(new Error('voice read fail'))
    const r = await generateColdEmailDraft(LEAD_ID)
    expect(r.ok).toBe(true)
    expect(r.voiceDegraded).toBe(true)
  })

  it('model bozuk JSON → modelFailed', async () => {
    seedLead()
    llm.mockResolvedValue({ content: 'bu json değil {{{' })
    const r = await generateColdEmailDraft(LEAD_ID)
    expect(r.ok).toBe(false)
    expect(r.modelFailed).toBe(true)
  })

  it('model timeout (throw) → yukarı fırlar (retry/cost log openrouter katmanında)', async () => {
    seedLead()
    llm.mockRejectedValue(new Error('model timeout'))
    await expect(generateColdEmailDraft(LEAD_ID)).rejects.toThrow(/timeout/)
  })

  it('taslak insert hatası → ok:false', async () => {
    seedLead()
    insertDraftError = { message: 'insert down' }
    const r = await generateColdEmailDraft(LEAD_ID)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('insert down')
  })
})

describe('generateColdEmailDraft — kalite + canonical iz', () => {
  it('kalite FAIL: taslak yine saklanır ama quality.ok=false GÖRÜNÜR (onaya gidemez)', async () => {
    seedLead()
    gate.mockResolvedValue({ ok: false, digest: 'd', violations: [{ code: 'CLAIM_WITHOUT_EVIDENCE', detail: 'x', fix: 'y' }] })
    const r = await generateColdEmailDraft(LEAD_ID)
    expect(r.ok).toBe(true) // taslak oluştu
    expect(r.quality?.ok).toBe(false) // ama kalite açıkça FAIL
    expect(r.quality?.violations).toHaveLength(1)
    expect(db.outreach_messages).toHaveLength(1)
  })

  it('canonical persist başarılı → claimPersisted:true (izlenebilir)', async () => {
    seedLead()
    db.lead_evidence.push({ id: 'ev-1', lead_id: LEAD_ID, summary: 'mobil uyumsuz', kind: 'html_signal', source: 'website' })
    const r = await generateColdEmailDraft(LEAD_ID)
    expect(r.ok).toBe(true)
    expect(r.claimPersisted).toBe(true)
    expect(persistVersion).toHaveBeenCalledOnce()
  })

  it('canonical şema canlı değil → canonicalPending:true (beklenen; downstream gate bloklar)', async () => {
    seedLead()
    persistVersion.mockResolvedValue({ schemaMissing: true })
    const r = await generateColdEmailDraft(LEAD_ID)
    expect(r.ok).toBe(true)
    expect(r.claimPersisted).toBe(false)
    expect(r.canonicalPending).toBe(true)
  })

  it('canonical BEKLENMEDİK hata → canonicalError GÖRÜNÜR (sessiz değil)', async () => {
    seedLead()
    persistVersion.mockRejectedValue(new Error('version write boom'))
    const r = await generateColdEmailDraft(LEAD_ID)
    expect(r.ok).toBe(true)
    expect(r.claimPersisted).toBe(false)
    expect(r.canonicalError).toContain('boom')
  })

  it('alakasız kanıt (evidenceId listede yok) canonical claim\'e GİRMEZ', async () => {
    seedLead()
    db.lead_evidence.push({ id: 'baska-ev', lead_id: LEAD_ID, summary: 'x', kind: 'html_signal', source: 'website' })
    // claim evidenceId 'ev-1' ama evidence 'baska-ev' → filtrelenir.
    await generateColdEmailDraft(LEAD_ID)
    const call = persistVersion.mock.calls[0][0] as { claims: unknown[] }
    expect(call.claims).toHaveLength(0)
  })
})

describe('generateColdEmailDraft — kanal simetrisi + recipient', () => {
  it('primary_contact recipient: contact bilgisiyle üretir', async () => {
    seedLead()
    db.contacts.push({ id: 'con-1', role: 'owner' })
    resolveRecipient.mockResolvedValue({ source: 'primary_contact', email: 'c@d.com', contactId: 'con-1', contactName: 'Ayşe' })
    const r = await generateColdEmailDraft(LEAD_ID)
    expect(r.ok).toBe(true)
    const call = persistVersion.mock.calls[0][0] as { recipient: { kind: string } }
    expect(call.recipient.kind).toBe('primary_contact')
  })

  it('recipient yok (none): kind=none ile iz yazılır (taslak yine oluşur)', async () => {
    seedLead()
    resolveRecipient.mockResolvedValue({ source: 'none', email: null, contactId: null, contactName: null })
    const r = await generateColdEmailDraft(LEAD_ID)
    expect(r.ok).toBe(true)
    const call = persistVersion.mock.calls[0][0] as { recipient: { kind: string } }
    expect(call.recipient.kind).toBe('none')
  })

  it('settings satırı boş değerli → atlanır (üretim yine tamam)', async () => {
    seedLead()
    db.settings.push({ key: 'signature_website', value: '' }) // boş → atlanır
    db.settings.push({ key: 'signature_email', value: 'info@x.com' })
    const r = await generateColdEmailDraft(LEAD_ID)
    expect(r.ok).toBe(true)
  })

  it('primary contact rolü null → "other" varsayılır', async () => {
    seedLead()
    db.contacts.push({ id: 'con-1', role: null })
    resolveRecipient.mockResolvedValue({ source: 'primary_contact', email: 'c@d.com', contactId: 'con-1', contactName: 'Rolsüz' })
    const r = await generateColdEmailDraft(LEAD_ID)
    expect(r.ok).toBe(true)
  })

  it('Voice DNA non-Error throw → voiceDegraded (unknown dalı)', async () => {
    seedLead()
    voice.mockRejectedValue('kaba string hata')
    const r = await generateColdEmailDraft(LEAD_ID)
    expect(r.ok).toBe(true)
    expect(r.voiceDegraded).toBe(true)
  })

  it('kanıt null alanları (summary/kind/source) → güvenli null; eşleşen claim izde kalır', async () => {
    seedLead()
    db.lead_evidence.push({ id: 'ev-1', lead_id: LEAD_ID, summary: null, kind: null, source: null })
    const r = await generateColdEmailDraft(LEAD_ID)
    expect(r.ok).toBe(true)
    const call = persistVersion.mock.calls[0][0] as { claims: Array<{ evidenceType: unknown; evidenceSource: unknown }> }
    expect(call.claims).toHaveLength(1)
    expect(call.claims[0].evidenceType).toBeNull()
    expect(call.claims[0].evidenceSource).toBeNull()
  })

  it('canonical non-Error throw → canonicalError düz metinle görünür', async () => {
    seedLead()
    persistVersion.mockRejectedValue('vault patladı string')
    const r = await generateColdEmailDraft(LEAD_ID)
    expect(r.ok).toBe(true)
    expect(r.canonicalError).toContain('canonical yazım hatası')
  })

  it('AYNI servis iki kez (web + Telegram simülasyonu) → AYNI result contract', async () => {
    seedLead()
    const web = await generateColdEmailDraft(LEAD_ID)
    for (const k of Object.keys(db)) if (k !== 'leads') db[k] = []
    seedLead()
    db.leads.splice(0, 1) // tek lead kalsın
    db.leads.push({ id: LEAD_ID, business_name: 'Test İşletme', sector: 'kafe' })
    const tg = await generateColdEmailDraft(LEAD_ID)
    // İki çağrı da AYNI alan kümesini döndürür (ok/draft/quality/claims/claimPersisted).
    expect(Object.keys(web).sort()).toEqual(Object.keys(tg).sort())
    expect(web.ok).toBe(tg.ok)
  })
})
