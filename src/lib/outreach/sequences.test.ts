import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// sequences v3 (FINALIZATION Faz 3) — follow-up DİKEY akışı kanıtları:
// vadeli adım → GÖRÜNÜR canonical taslak (outreach_messages + versiyon) ·
// CAS-idempotency (eşzamanlı cron TEK taslak) · taslak/versiyon yazılamazsa
// adım done KALMAZ · reply/opt-out transactional STOP (iptal hatası yutulmaz) ·
// suppression fail-closed · iş günü ertelemesi · bağlam sorgu hataları
// fail-closed · schedule yarışı 23505 → idempotent. OTOMATİK GÖNDERİM YOK.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>
const db: Record<string, Row[]> = {
  follow_up_sequences: [],
  leads: [],
  email_threads: [],
  email_messages: [],
  outreach_messages: [],
  lead_evidence: [],
}
let seq = 0
let seqSelectError: { message: string } | null = null
let claimUpdateError: { message: string } | null = null
let releaseFailsOnce = false
let deferUpdateError: { message: string } | null = null
let cancelUpdateError: { message: string } | null = null
let seqInsertError: { message: string; code?: string } | null = null
let leadsSelectError: { message: string } | null = null
let threadsSelectError: { message: string } | null = null
let prevSelectError: { message: string } | null = null
let evidenceSelectError: { message: string } | null = null
let inboundSelectError: { message: string } | null = null
let draftInsertError: { message: string } | null = null
let linkUpdateError: { message: string } | null = null

function from(table: string) {
  const rows = (db[table] ??= [])
  const filters: Array<(r: Row) => boolean> = []
  const filterCols: string[] = []
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let payload: Row | Row[] | null = null

  function matched(): Row[] {
    return rows.filter((r) => filters.every((f) => f(r)))
  }
  function exec(): { data: unknown; error: { message: string; code?: string } | null } {
    if (op === 'insert' && payload) {
      if (table === 'follow_up_sequences' && seqInsertError) return { data: null, error: seqInsertError }
      if (table === 'outreach_messages' && draftInsertError) return { data: null, error: draftInsertError }
      const list = Array.isArray(payload) ? payload : [payload]
      const inserted = list.map((p) => {
        const row = { id: `${table}-${++seq}`, done: false, ...p }
        rows.push(row)
        return row
      })
      return { data: inserted, error: null }
    }
    if (op === 'update' && payload) {
      const patch = payload as Row
      if (table === 'follow_up_sequences') {
        if (patch.done === true && cancelUpdateError && filterCols.includes('lead_id')) {
          return { data: null, error: cancelUpdateError }
        }
        if (patch.done === true && claimUpdateError && !filterCols.includes('lead_id')) {
          return { data: null, error: claimUpdateError }
        }
        if (patch.done === false && releaseFailsOnce) {
          releaseFailsOnce = false
          return { data: [], error: null }
        }
        if (patch.due_at && deferUpdateError) return { data: null, error: deferUpdateError }
        if (patch.outreach_message_id && linkUpdateError) return { data: null, error: linkUpdateError }
      }
      const m = matched()
      m.forEach((r) => Object.assign(r, patch))
      return { data: m.map((r) => ({ id: r.id })), error: null }
    }
    if (op === 'delete') {
      const m = matched()
      for (const r of m) rows.splice(rows.indexOf(r), 1)
      return { data: m, error: null }
    }
    if (table === 'follow_up_sequences' && seqSelectError) return { data: null, error: seqSelectError }
    if (table === 'leads' && leadsSelectError) return { data: null, error: leadsSelectError }
    if (table === 'email_threads' && threadsSelectError) return { data: null, error: threadsSelectError }
    if (table === 'outreach_messages' && prevSelectError) return { data: null, error: prevSelectError }
    if (table === 'lead_evidence' && evidenceSelectError) return { data: null, error: evidenceSelectError }
    if (table === 'email_messages' && inboundSelectError) return { data: null, error: inboundSelectError }
    return { data: matched(), error: null }
  }

  const api: Record<string, unknown> = {}
  Object.assign(api, {
    select: () => api,
    eq: (c: string, v: unknown) => {
      filterCols.push(c)
      filters.push((r) => r[c] === v)
      return api
    },
    in: (c: string, vals: unknown[]) => {
      filterCols.push(c)
      filters.push((r) => vals.includes(r[c]))
      return api
    },
    lte: (c: string, v: string) => {
      filters.push((r) => String(r[c]) <= v)
      return api
    },
    order: () => api,
    limit: () => api,
    insert: (p: Row | Row[]) => {
      op = 'insert'
      payload = p
      return api
    },
    update: (p: Row) => {
      op = 'update'
      payload = p
      return api
    },
    delete: () => {
      op = 'delete'
      return api
    },
    maybeSingle: async () => {
      const r = exec()
      return { data: (r.data as Row[])?.[0] ?? null, error: r.error }
    },
    single: async () => {
      const r = exec()
      return { data: (r.data as Row[])?.[0] ?? null, error: r.error }
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(exec()).then(resolve, reject),
  })
  return api
}
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: (t: string) => from(t) } }))

let suppressedSet = new Set<string>()
let suppressionFails = false
vi.mock('./auditCompliance', () => ({
  getSuppressedSet: async (addresses: string[]) => {
    if (suppressionFails) return new Set(addresses.map((a) => a.trim().toLowerCase())) // fail-closed davranışı
    return suppressedSet
  },
}))

// Gate + canonical persist + voice mock'ları (kendi birim testleri ayrı dosyalarda).
let gateResult = { ok: true, violations: [] as Array<{ code: string; detail: string; fix: string }>, digest: 'g1' }
let gateThrow = false
const gateCalls: Array<Record<string, unknown>> = []
vi.mock('./outboundGate', () => ({
  evaluateOutboundText: async (opts: Record<string, unknown>) => {
    if (gateThrow) throw new Error('gate down')
    gateCalls.push(opts)
    return gateResult
  },
}))

const persistCalls: Array<Record<string, unknown>> = []
let persistError: string | null = null
let persistThrowRaw = false // Error olmayan fırlatma ('unknown' dalları)
vi.mock('./claimEvidence', () => ({
  persistMessageVersion: async (input: Record<string, unknown>) => {
    if (persistThrowRaw) throw 'ham-hata'
    if (persistError) throw new Error(persistError)
    persistCalls.push(input)
    return { versionId: 'v1', version: 1, contentDigest: 'cd', schemaMissing: false }
  },
  voiceRulesDigest: () => 'vd-1',
}))

let voiceThrow = false
vi.mock('./voiceDna', () => ({
  getVoiceContext: async () => {
    if (voiceThrow) throw new Error('voice okunamadı')
    return { rules: { positive: [], negative: [] }, banned: [] }
  },
}))

let primaryContactLeads = new Set<string>()
vi.mock('@/lib/contacts/contactService', () => ({
  resolveCanonicalRecipient: async (leadId: string) => {
    if (primaryContactLeads.has(leadId)) {
      return { email: 'sahip@ornek.com', contactId: 'c-1', contactName: 'Ali Veli', source: 'primary_contact' }
    }
    const lead = db.leads.find((l) => l.id === leadId)
    if (lead?.email) {
      return { email: String(lead.email).toLowerCase(), contactId: null, contactName: null, source: 'lead_email' }
    }
    return { email: null, contactId: null, contactName: null, source: 'none' }
  },
}))

import {
  scheduleMultiChannelSequence,
  scheduleFollowUp,
  processDueSequences,
  isBusinessDay,
  nextBusinessDayIso,
} from './sequences'

// 2026-07-13 Pazartesi (iş günü), 2026-07-11 Cumartesi.
const MONDAY = Date.parse('2026-07-13T10:00:00Z')
const SATURDAY = Date.parse('2026-07-11T10:00:00Z')
const PAST = '2026-07-01T00:00:00.000Z'

function seedLead(id: string, over: Row = {}) {
  db.leads.push({
    id,
    business_name: `İşletme ${id}`,
    email: `${id}@ornek.com`,
    do_not_contact: false,
    sector: 'klinik',
    ...over,
  })
}
function seedStep(leadId: string, step: number, over: Row = {}) {
  db.follow_up_sequences.push({
    id: `fus-${++seq}`,
    lead_id: leadId,
    step,
    channel: 'email',
    due_at: PAST,
    done: false,
    ...over,
  })
}
function drafts(): Row[] {
  return db.outreach_messages.filter((m) => m.created_by === 'agent:followup')
}

beforeEach(() => {
  for (const k of Object.keys(db)) db[k] = []
  seq = 0
  seqSelectError = null
  claimUpdateError = null
  releaseFailsOnce = false
  deferUpdateError = null
  cancelUpdateError = null
  seqInsertError = null
  leadsSelectError = null
  threadsSelectError = null
  prevSelectError = null
  evidenceSelectError = null
  inboundSelectError = null
  draftInsertError = null
  linkUpdateError = null
  suppressedSet = new Set()
  suppressionFails = false
  gateResult = { ok: true, violations: [], digest: 'g1' }
  gateThrow = false
  gateCalls.length = 0
  persistCalls.length = 0
  persistError = null
  persistThrowRaw = false
  primaryContactLeads = new Set()
  voiceThrow = false
})

describe('iş günü yardımcıları', () => {
  it('hafta sonu tespiti + sonraki iş günü', () => {
    expect(isBusinessDay(new Date(MONDAY))).toBe(true)
    expect(isBusinessDay(new Date(SATURDAY))).toBe(false)
    expect(nextBusinessDayIso(SATURDAY).slice(0, 10)).toBe('2026-07-13')
  })
})

describe('scheduleMultiChannelSequence — idempotent + authoritative + yarış', () => {
  it("yeni lead → plan yazılır; AYNI lead'e ikinci çağrı YENİDEN PLANLAMAZ", async () => {
    const r1 = await scheduleMultiChannelSequence({ leadId: 'l1', customerType: 'local' })
    expect(r1.scheduled).toBeGreaterThan(0)
    const count = db.follow_up_sequences.length

    const r2 = await scheduleMultiChannelSequence({ leadId: 'l1', customerType: 'local' })
    expect(r2).toMatchObject({ scheduled: 0, alreadyScheduled: true })
    expect(db.follow_up_sequences).toHaveLength(count) // duplicate satır YOK
  })

  it('EŞZAMANLI schedule yarışı: 23505 (mig 063 kısmi unique) → alreadyScheduled, hata değil', async () => {
    seqInsertError = { message: 'duplicate key value violates unique constraint', code: '23505' }
    const r = await scheduleMultiChannelSequence({ leadId: 'l1', customerType: 'local' })
    expect(r).toMatchObject({ scheduled: 0, alreadyScheduled: true })
  })

  it('kontrol sorgusu hatası GİZLENMEZ (throw)', async () => {
    seqSelectError = { message: 'db down' }
    await expect(scheduleMultiChannelSequence({ leadId: 'l1', customerType: 'local' })).rejects.toThrow(
      'sekans kontrolü başarısız',
    )
  })

  it('insert hatası (23505 dışı) GİZLENMEZ (throw)', async () => {
    seqInsertError = { message: 'kolon yok' }
    await expect(scheduleMultiChannelSequence({ leadId: 'l1', customerType: 'local' })).rejects.toThrow(
      'sekans yazılamadı',
    )
  })
})

describe('scheduleFollowUp — authoritative insert', () => {
  it('başarı → satır yazılır; hata → throw (sessiz kayıp yok)', async () => {
    await scheduleFollowUp({ leadId: 'l1', step: 2, dueInDays: 3 })
    expect(db.follow_up_sequences).toHaveLength(1)
    seqInsertError = { message: 'db down' }
    await expect(scheduleFollowUp({ leadId: 'l1', step: 3, dueInDays: 3 })).rejects.toThrow('planlanamadı')
  })
})

describe('processDueSequences — dikey akış: due → GÖRÜNÜR canonical taslak', () => {
  it('normal terfi: adım done + outreach draft + versiyon + adım↔taslak bağı', async () => {
    seedLead('l1')
    db.lead_evidence.push({ id: 'ev-1', lead_id: 'l1', summary: 'sitede SSL yok' })
    seedStep('l1', 2)

    const r = await processDueSequences(10, MONDAY)
    expect(r).toMatchObject({ processed: 1, failed: 0, blocked: 0, stopped: 0 })
    expect(db.follow_up_sequences[0].done).toBe(true)

    // Görünür taslak: /bugun paneli outreach_messages draft'larını listeler.
    const d = drafts()
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ lead_id: 'l1', channel: 'email', status: 'draft', sequence_step: 2 })
    expect(String(d[0].body)).toContain('sitede SSL yok') // kanıt taslağa aktı
    expect(String(d[0].body)).toContain('istemiyorsanız') // email opt-out zorunlu
    expect(String(d[0].subject)).toContain('İşletme l1')

    // Canonical versiyon izi: kaynak generator:followup + iddia→kanıt bağı.
    expect(persistCalls).toHaveLength(1)
    expect(persistCalls[0]).toMatchObject({ source: 'generator:followup', voiceDigest: 'vd-1' })
    expect((persistCalls[0].claims as Row[])[0]).toMatchObject({ evidenceId: 'ev-1' })

    // Adım "tamamlandı" diye KAYBOLMAZ: taslağa bağlandı (lifecycle görünür).
    expect(db.follow_up_sequences[0].outreach_message_id).toBe(d[0].id)

    // Gate iddia eşlemesiyle çağrıldı (kanıtlı üretim).
    expect(gateCalls).toHaveLength(1)
    expect((gateCalls[0].claimEvidence as Row[])[0]).toMatchObject({ evidenceIds: ['ev-1'] })
  })

  it('EŞZAMANLI iki cron → CAS: her adım için TEK taslak (exactly-once)', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    const [a, b] = await Promise.all([processDueSequences(10, MONDAY), processDueSequences(10, MONDAY)])
    expect(drafts()).toHaveLength(1)
    expect(a.processed + b.processed).toBe(1)
  })

  it('TASLAK INSERT BAŞARISIZ → adım done KALMAZ (telafi) + failed; retry başarır', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    draftInsertError = { message: 'insert fail' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const r1 = await processDueSequences(10, MONDAY)
    expect(r1).toMatchObject({ processed: 0, failed: 1 })
    expect(db.follow_up_sequences[0].done).toBe(false) // ← adım kaybolmadı
    expect(drafts()).toHaveLength(0)

    draftInsertError = null
    const r2 = await processDueSequences(10, MONDAY)
    expect(r2.processed).toBe(1)
    expect(drafts()).toHaveLength(1)
    errSpy.mockRestore()
  })

  it('VERSİYON yazılamazsa: taslak TELAFİYLE SİLİNİR + adım geri açılır (yarım artifact yok)', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    persistError = 'versiyon down'
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await processDueSequences(10, MONDAY)
    expect(r.failed).toBe(1)
    expect(drafts()).toHaveLength(0) // taslak izi bırakılmadı
    expect(db.follow_up_sequences[0].done).toBe(false)
    errSpy.mockRestore()
  })

  it('taslak-fail + telafi de düşerse CRITICAL loglanır (gizlenmez)', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    draftInsertError = { message: 'insert fail' }
    releaseFailsOnce = true
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await processDueSequences(10, MONDAY)
    expect(r.failed).toBe(1)
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('CRITICAL'))).toBe(true)
    errSpy.mockRestore()
  })

  it('adım↔taslak BAĞI yazılamazsa: duplicate üretilmez, CRITICAL loglanır, taslak kalır', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    linkUpdateError = { message: 'db down' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await processDueSequences(10, MONDAY)
    expect(r.processed).toBe(1)
    expect(drafts()).toHaveLength(1)
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('adım-taslak bağı yazılamadı'))).toBe(true)
    errSpy.mockRestore()
  })

  it('OPT-OUT → sequence DURUR: tüm açık adımlar iptal, taslak üretilmez', async () => {
    seedLead('l1', { do_not_contact: true })
    seedStep('l1', 1)
    seedStep('l1', 2, { due_at: '2099-01-01T00:00:00.000Z' }) // ileri tarihli adım da iptal
    const r = await processDueSequences(10, MONDAY)
    expect(r.stopped).toBe(2)
    expect(drafts()).toHaveLength(0)
    expect(db.follow_up_sequences.every((s) => s.done === true)).toBe(true)
  })

  it('INBOUND REPLY → sequence DURUR (taslak yok)', async () => {
    seedLead('l1')
    seedStep('l1', 3)
    db.email_threads.push({ id: 'th1', lead_id: 'l1' })
    db.email_messages.push({ id: 'm1', thread_id: 'th1', direction: 'inbound' })
    const r = await processDueSequences(10, MONDAY)
    expect(r.stopped).toBe(1)
    expect(drafts()).toHaveLength(0)
  })

  it('iptal YAZILAMAZSA: adım işlenmiş sayılmaz — failed + görünür hata (sessiz devam YOK)', async () => {
    seedLead('l1', { do_not_contact: true })
    seedStep('l1', 1)
    cancelUpdateError = { message: 'db down' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await processDueSequences(10, MONDAY)
    expect(r.stopped).toBe(0)
    expect(r.failed).toBe(1)
    expect(drafts()).toHaveLength(0)
    errSpy.mockRestore()
  })

  it('SUPPRESSION → adım bloklu (done DEĞİL, taslak YOK); kontrol edilemezse de FAIL-CLOSED', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    suppressedSet = new Set(['l1@ornek.com'])
    const r1 = await processDueSequences(10, MONDAY)
    expect(r1.blocked).toBe(1)
    expect(db.follow_up_sequences[0].done).toBe(false)
    expect(drafts()).toHaveLength(0)

    suppressedSet = new Set()
    suppressionFails = true // getSuppressedSet fail-closed hepsi-bloklu döner
    const r2 = await processDueSequences(10, MONDAY)
    expect(r2.blocked).toBe(1)
  })

  it('e-postasız lead: suppression DOĞRULANAMAZ → fail-closed blok', async () => {
    seedLead('l1', { email: null })
    seedStep('l1', 1)
    const r = await processDueSequences(10, MONDAY)
    expect(r.blocked).toBe(1)
    expect(drafts()).toHaveLength(0)
  })

  it('HAFTA SONU → terfi YOK; adımlar sonraki iş gününe ertelenir', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    const r = await processDueSequences(10, SATURDAY)
    expect(r).toMatchObject({ deferred: 1, processed: 0 })
    expect(drafts()).toHaveLength(0)
    expect(String(db.follow_up_sequences[0].due_at).slice(0, 10)).toBe('2026-07-13') // Pazartesi
    expect(db.follow_up_sequences[0].done).toBe(false)
  })

  it('erteleme yazılamazsa throw (sessiz kayıp yok)', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    deferUpdateError = { message: 'db down' }
    await expect(processDueSequences(10, SATURDAY)).rejects.toThrow('iş günü ertelemesi')
  })

  it('vadeli sorgu hatası throw; boş liste → sıfır sonuç', async () => {
    seqSelectError = { message: 'db down' }
    await expect(processDueSequences(10, MONDAY)).rejects.toThrow('vadeli adımlar okunamadı')
    seqSelectError = null
    expect(await processDueSequences(10, MONDAY)).toMatchObject({ processed: 0 })
  })

  it('claim CAS hatası satır-bazlı failed sayılır, diğer adımlar etkilenmez', async () => {
    seedLead('l1')
    seedLead('l2')
    seedStep('l1', 1)
    seedStep('l2', 1)
    claimUpdateError = { message: 'db down' } // tüm done=true update'leri hata verir
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await processDueSequences(10, MONDAY)
    expect(r.failed).toBe(2)
    expect(drafts()).toHaveLength(0)
    errSpy.mockRestore()
  })

  it("AÇI motoru: farklı adımlar FARKLI açı/gövde üretir; step>6 close_loop'a düşer", async () => {
    seedLead('l1')
    seedStep('l1', 1)
    seedStep('l1', 4)
    seedStep('l1', 9)
    await processDueSequences(10, MONDAY)
    const bodies = drafts().map((d) => String(d.body))
    expect(bodies).toHaveLength(3)
    expect(new Set(bodies).size).toBe(3) // kopya yasak
    expect(bodies.some((b) => b.includes('gözünüzden kaçmış'))).toBe(true) // reminder
    expect(bodies.some((b) => b.includes('önceliğimiz değil'))).toBe(true) // objection_reduction
    expect(bodies.some((b) => b.includes('son mesajım'))).toBe(true) // close_loop
  })

  it('kanıt YOKSA new_evidence adımı SAHTE gözlem cümlesi ÜRETMEZ ve iddiasız kalır', async () => {
    seedLead('l1')
    seedStep('l1', 2)
    await processDueSequences(10, MONDAY)
    const body = String(drafts()[0].body)
    expect(body).not.toMatch(/fark ettim|somut bir gözlem/)
    expect(persistCalls[0].claims).toEqual([])
    expect((gateCalls[0].claimEvidence as Row[]).length).toBe(0)
  })

  // ── Bağlam sorgu hataları: HİÇBİRİ yutulmaz (fail-closed, görünür) ──────────
  it('lead bağlamı okunamazsa throw', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    leadsSelectError = { message: 'db down' }
    await expect(processDueSequences(10, MONDAY)).rejects.toThrow('lead bağlamı okunamadı')
  })

  it('thread bağlamı okunamazsa throw (cevap bilinmeden takip işlenmez)', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    threadsSelectError = { message: 'db down' }
    await expect(processDueSequences(10, MONDAY)).rejects.toThrow('thread bağlamı okunamadı')
  })

  it('inbound cevap sorgusu hata verirse throw', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    db.email_threads.push({ id: 'th1', lead_id: 'l1' })
    inboundSelectError = { message: 'db down' }
    await expect(processDueSequences(10, MONDAY)).rejects.toThrow('inbound cevap bağlamı okunamadı')
  })

  it('önceki gövdeler okunamazsa throw', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    prevSelectError = { message: 'db down' }
    await expect(processDueSequences(10, MONDAY)).rejects.toThrow('önceki gövdeler okunamadı')
  })

  it('kanıt bağlamı okunamazsa throw', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    evidenceSelectError = { message: 'db down' }
    await expect(processDueSequences(10, MONDAY)).rejects.toThrow('kanıt bağlamı okunamadı')
  })

  it('Voice bağlamı okunamazsa batch fail-closed durur (denetimsiz üretim yok)', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    voiceThrow = true
    await expect(processDueSequences(10, MONDAY)).rejects.toThrow('voice okunamadı')
  })

  it('GATE hatası: satır failed + adım geri açılır (taslak izi yok)', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    gateThrow = true
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await processDueSequences(10, MONDAY)
    expect(r.failed).toBe(1)
    expect(drafts()).toHaveLength(0)
    expect(db.follow_up_sequences[0].done).toBe(false)
    errSpy.mockRestore()
  })

  it('gate BLOKE sonucu taslağı yine üretir (panelde düzeltilecek) ve versiyona gate_ok=false yazar', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    gateResult = { ok: false, violations: [{ code: 'VOICE_BANNED_PHRASE', detail: 'x', fix: 'y' }], digest: 'g2' }
    const r = await processDueSequences(10, MONDAY)
    expect(r.processed).toBe(1)
    expect(drafts()).toHaveLength(1)
    expect((persistCalls[0].gate as Row).ok).toBe(false)
  })

  it('leads tablosunda OLMAYAN lead: fail-closed blok (isim/e-posta bilinmiyor)', async () => {
    seedStep('hayalet-lead', 1)
    const r = await processDueSequences(10, MONDAY)
    expect(r.blocked).toBe(1)
    expect(drafts()).toHaveLength(0)
  })

  it('önceki GÖNDERİLMİŞ gövdeler previousBodies olarak akar (final_body ?? body)', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    db.outreach_messages.push(
      { id: 'om-a', lead_id: 'l1', status: 'sent', body: 'eski gövde bir', final_body: null },
      { id: 'om-b', lead_id: 'l1', status: 'sent', body: 'x', final_body: 'düzenlenmiş gövde iki' },
    )
    db.lead_evidence.push({ id: 'ev-1', lead_id: 'l1', summary: 'ilk kanıt' })
    const r = await processDueSequences(10, MONDAY)
    expect(r.processed).toBe(1)
    const newDraft = drafts()[0]
    expect(String(newDraft.body)).not.toContain('eski gövde bir')
  })

  it('primary contact olan lead: versiyon alıcısı primary_contact + contact bağı', async () => {
    seedLead('l1')
    primaryContactLeads = new Set(['l1'])
    seedStep('l1', 1)
    const r = await processDueSequences(10, MONDAY)
    expect(r.processed).toBe(1)
    expect((persistCalls[0].recipient as Row)).toMatchObject({ kind: 'primary_contact', contactId: 'c-1' })
  })

  it('Error OLMAYAN fırlatma da telafiyle işlenir (unknown mesaj dalı)', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    persistThrowRaw = true
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await processDueSequences(10, MONDAY)
    expect(r.failed).toBe(1)
    expect(db.follow_up_sequences[0].done).toBe(false)
    errSpy.mockRestore()
  })

  it('whatsapp kanalı adımı: gövdeye email opt-out satırı EKLENMEZ', async () => {
    seedLead('l1')
    seedStep('l1', 1, { channel: 'whatsapp' })
    const r = await processDueSequences(10, MONDAY)
    expect(r.processed).toBe(1)
    expect(String(drafts()[0].body)).not.toContain('istemiyorsanız')
  })

  it('Error olmayan fırlatma + telafi de düşerse CRITICAL (raw) dalı', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    persistThrowRaw = true
    releaseFailsOnce = true
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await processDueSequences(10, MONDAY)
    expect(r.failed).toBe(1)
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('CRITICAL'))).toBe(true)
    errSpy.mockRestore()
  })

  it('adsız/sektörsüz lead: fallback ile taslak üretilir', async () => {
    seedLead('l1', { business_name: null, sector: null })
    seedStep('l1', 3)
    const r = await processDueSequences(10, MONDAY)
    expect(r.processed).toBe(1)
    expect(String(drafts()[0].body)).toContain('İşletme')
  })
})
