import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// sequences v2 (Sprint-3 Faz 2) — dayanıklılık kanıtları:
// authoritative insert/update · CAS-idempotency (eşzamanlı cron) ·
// task-insert-fail → adım done KALMAZ · crash-retry dedupe → task çoğalmaz ·
// reply/opt-out STOP · suppression fail-closed · iş günü ertelemesi ·
// followupAngles açı + taslak task input'unda (OTOMATİK GÖNDERİM YOK).
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>
const db: Record<string, Row[]> = {
  follow_up_sequences: [],
  agent_tasks: [],
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
let taskInsertError: { message: string } | null = null
let taskSelectError: { message: string } | null = null
let cancelUpdateError: { message: string } | null = null
let seqInsertError: { message: string } | null = null
let leadsSelectError: { message: string } | null = null
let nullReadTables = new Set<string>() // select data:null döndür (?? [] dalları)

function from(table: string) {
  const rows = (db[table] ??= [])
  const filters: Array<(r: Row) => boolean> = []
  const filterCols: string[] = []
  let op: 'select' | 'insert' | 'update' = 'select'
  let payload: Row | Row[] | null = null

  function matched(): Row[] {
    return rows.filter((r) => filters.every((f) => f(r)))
  }
  function exec(): { data: unknown; error: { message: string } | null } {
    if (op === 'insert' && payload) {
      if (table === 'agent_tasks' && taskInsertError) return { data: null, error: taskInsertError }
      if (table === 'follow_up_sequences' && seqInsertError) return { data: null, error: seqInsertError }
      const list = Array.isArray(payload) ? payload : [payload]
      for (const p of list) rows.push({ id: `${table}-${++seq}`, done: false, ...p })
      return { data: list, error: null }
    }
    if (op === 'update' && payload) {
      const patch = payload as Row
      if (table === 'follow_up_sequences') {
        // cancelOpenSteps lead_id ile filtreler; claimStep id ile — ayrıştırılabilir.
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
      }
      const m = matched()
      m.forEach((r) => Object.assign(r, patch))
      return { data: m.map((r) => ({ id: r.id })), error: null }
    }
    if (table === 'follow_up_sequences' && seqSelectError) return { data: null, error: seqSelectError }
    if (table === 'agent_tasks' && taskSelectError) return { data: null, error: taskSelectError }
    if (table === 'leads' && leadsSelectError) return { data: null, error: leadsSelectError }
    if (nullReadTables.has(table)) return { data: null, error: null }
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
    contains: (c: string, obj: Row) => {
      filters.push((r) => {
        const val = r[c] as Row | undefined
        return Boolean(val) && Object.entries(obj).every(([k, v]) => val![k] === v)
      })
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
    maybeSingle: async () => {
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

beforeEach(() => {
  for (const k of Object.keys(db)) db[k] = []
  seq = 0
  seqSelectError = null
  claimUpdateError = null
  releaseFailsOnce = false
  deferUpdateError = null
  taskInsertError = null
  taskSelectError = null
  cancelUpdateError = null
  seqInsertError = null
  leadsSelectError = null
  nullReadTables = new Set()
  suppressedSet = new Set()
  suppressionFails = false
})

describe('iş günü yardımcıları', () => {
  it('hafta sonu tespiti + sonraki iş günü', () => {
    expect(isBusinessDay(new Date(MONDAY))).toBe(true)
    expect(isBusinessDay(new Date(SATURDAY))).toBe(false)
    // Cumartesiden sonraki iş günü Pazartesi.
    expect(nextBusinessDayIso(SATURDAY).slice(0, 10)).toBe('2026-07-13')
  })
})

describe('scheduleMultiChannelSequence — idempotent + authoritative', () => {
  it('yeni lead → plan yazılır; AYNI lead\'e ikinci çağrı YENİDEN PLANLAMAZ', async () => {
    const r1 = await scheduleMultiChannelSequence({ leadId: 'l1', customerType: 'local' })
    expect(r1.scheduled).toBeGreaterThan(0)
    const count = db.follow_up_sequences.length

    const r2 = await scheduleMultiChannelSequence({ leadId: 'l1', customerType: 'local' })
    expect(r2).toMatchObject({ scheduled: 0, alreadyScheduled: true })
    expect(db.follow_up_sequences).toHaveLength(count) // duplicate satır YOK
  })

  it('kontrol sorgusu hatası GİZLENMEZ (throw)', async () => {
    seqSelectError = { message: 'db down' }
    await expect(scheduleMultiChannelSequence({ leadId: 'l1', customerType: 'local' })).rejects.toThrow(
      'sekans kontrolü başarısız',
    )
  })

  it('insert hatası GİZLENMEZ (throw)', async () => {
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

describe('processDueSequences — CAS + dedupe + stop kuralları', () => {
  it('normal terfi: adım done + task (açı + taslak gövde + auto_send:false input\'ta)', async () => {
    seedLead('l1')
    db.lead_evidence.push({ lead_id: 'l1', summary: 'sitede SSL yok' })
    seedStep('l1', 2)

    const r = await processDueSequences(10, MONDAY)
    expect(r).toMatchObject({ processed: 1, failed: 0, blocked: 0, stopped: 0 })
    expect(db.follow_up_sequences[0].done).toBe(true)
    const task = db.agent_tasks[0]
    expect(task.input).toMatchObject({
      lead_id: 'l1',
      sequence_step: 2,
      angle: 'new_evidence',
      auto_send: false,
      evidence_missing: false,
    })
    expect(String((task.input as Row).draft_body)).toContain('sitede SSL yok') // kanıt taslağa aktı
    expect(String(task.title)).toContain('new_evidence')
  })

  it('EŞZAMANLI iki cron → CAS: her adım için TEK task', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    const [a, b] = await Promise.all([processDueSequences(10, MONDAY), processDueSequences(10, MONDAY)])
    expect(db.agent_tasks).toHaveLength(1)
    expect(a.processed + b.processed).toBe(1)
  })

  it('TASK INSERT BAŞARISIZ → adım done KALMAZ (telafi) + failed sayılır; retry başarır', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    taskInsertError = { message: 'insert fail' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const r1 = await processDueSequences(10, MONDAY)
    expect(r1).toMatchObject({ processed: 0, failed: 1 })
    expect(db.follow_up_sequences[0].done).toBe(false) // ← adım kaybolmadı
    expect(db.agent_tasks).toHaveLength(0)

    taskInsertError = null
    const r2 = await processDueSequences(10, MONDAY)
    expect(r2.processed).toBe(1)
    expect(db.agent_tasks).toHaveLength(1)
    errSpy.mockRestore()
  })

  it('task insert fail + telafi de düşerse CRITICAL loglanır (gizlenmez)', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    taskInsertError = { message: 'insert fail' }
    releaseFailsOnce = true
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await processDueSequences(10, MONDAY)
    expect(r.failed).toBe(1)
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('CRITICAL'))).toBe(true)
    errSpy.mockRestore()
  })

  it('CRASH-RETRY dedupe: task kuyruktayken done=false kalan adım task ÇOĞALTMAZ', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    // Önceki koşu task'ı yazdı ama done yazımı crash'le kaybolmuş olsun:
    db.agent_tasks.push({
      id: 't-önceki',
      agent_key: 'sales_rep',
      status: 'queued',
      input: { lead_id: 'l1', sequence_step: 1 },
    })
    const r = await processDueSequences(10, MONDAY)
    expect(db.agent_tasks).toHaveLength(1) // ikinci task YOK
    expect(r.processed).toBe(0)
    expect(db.follow_up_sequences[0].done).toBe(true) // adım kapandı
  })

  it('dedupe kontrolü HATA verirse: duplicate riski ALINMAZ + adım geri açılır (failed)', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    taskSelectError = { message: 'db down' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await processDueSequences(10, MONDAY)
    expect(r.failed).toBe(1)
    expect(db.agent_tasks).toHaveLength(0)
    expect(db.follow_up_sequences[0].done).toBe(false) // sonraki cron dener
    errSpy.mockRestore()
  })

  it('OPT-OUT → sequence DURUR: tüm açık adımlar iptal, task üretilmez', async () => {
    seedLead('l1', { do_not_contact: true })
    seedStep('l1', 1)
    seedStep('l1', 2, { due_at: '2099-01-01T00:00:00.000Z' }) // ileri tarihli adım da iptal
    const r = await processDueSequences(10, MONDAY)
    expect(r.stopped).toBe(2)
    expect(db.agent_tasks).toHaveLength(0)
    expect(db.follow_up_sequences.every((s) => s.done === true)).toBe(true)
  })

  it('INBOUND REPLY → sequence DURUR', async () => {
    seedLead('l1')
    seedStep('l1', 3)
    db.email_threads.push({ id: 'th1', lead_id: 'l1' })
    db.email_messages.push({ id: 'm1', thread_id: 'th1', direction: 'inbound' })
    const r = await processDueSequences(10, MONDAY)
    expect(r.stopped).toBe(1)
    expect(db.agent_tasks).toHaveLength(0)
  })

  it('SUPPRESSION → adım bloklu (done DEĞİL, task YOK); kontrol edilemezse de FAIL-CLOSED', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    suppressedSet = new Set(['l1@ornek.com'])
    const r1 = await processDueSequences(10, MONDAY)
    expect(r1.blocked).toBe(1)
    expect(db.follow_up_sequences[0].done).toBe(false)
    expect(db.agent_tasks).toHaveLength(0)

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
    expect(db.agent_tasks).toHaveLength(0)
  })

  it('HAFTA SONU → terfi YOK; adımlar sonraki iş gününe ertelenir', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    const r = await processDueSequences(10, SATURDAY)
    expect(r).toMatchObject({ deferred: 1, processed: 0 })
    expect(db.agent_tasks).toHaveLength(0)
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
    expect(db.agent_tasks).toHaveLength(0)
    errSpy.mockRestore()
  })

  it('AÇI motoru: farklı adımlar FARKLI açı üretir; step>6 close_loop\'a düşer', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    seedStep('l1', 4)
    seedStep('l1', 9)
    await processDueSequences(10, MONDAY)
    const angles = db.agent_tasks.map((t) => (t.input as Row).angle)
    expect(angles).toContain('reminder')
    expect(angles).toContain('objection_reduction')
    expect(angles).toContain('close_loop')
    // Kopya yasak: üç taslağın gövdeleri birbirinden farklı.
    const bodies = db.agent_tasks.map((t) => String((t.input as Row).draft_body))
    expect(new Set(bodies).size).toBe(3)
  })

  it('kanıt YOKSA new_evidence adımı iddiasız üretilir ve evidence_missing işaretlenir', async () => {
    seedLead('l1')
    seedStep('l1', 2)
    await processDueSequences(10, MONDAY)
    expect((db.agent_tasks[0].input as Row).evidence_missing).toBe(true)
  })

  it('lead bağlamı okunamazsa throw (batch authoritative)', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    leadsSelectError = { message: 'db down' }
    await expect(processDueSequences(10, MONDAY)).rejects.toThrow('lead bağlamı okunamadı')
  })

  it('opt-out iptali yazılamazsa hata GÖRÜNÜR loglanır, stopped=0 sayılır', async () => {
    seedLead('l1', { do_not_contact: true })
    seedStep('l1', 1)
    cancelUpdateError = { message: 'db down' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await processDueSequences(10, MONDAY)
    expect(r.stopped).toBe(0)
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('iptali yazılamadı'))).toBe(true)
    errSpy.mockRestore()
  })

  it('leads tablosunda OLMAYAN lead: fail-closed blok (isim/e-posta bilinmiyor)', async () => {
    seedStep('hayalet-lead', 1)
    const r = await processDueSequences(10, MONDAY)
    expect(r.blocked).toBe(1)
    expect(db.agent_tasks).toHaveLength(0)
  })

  it('bağlam sorguları null data dönerse (?? [] dalları) terfi yine çalışır', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    nullReadTables = new Set(['email_threads', 'outreach_messages', 'lead_evidence'])
    const r = await processDueSequences(10, MONDAY)
    expect(r.processed).toBe(1)
  })

  it('adsız/sektörsüz lead + gövdesiz önceki mesaj: fallback\'lerle taslak üretilir', async () => {
    seedLead('l1', { business_name: null, sector: null })
    seedStep('l1', 3)
    db.outreach_messages.push({ lead_id: 'l1', status: 'sent', body: null, final_body: null })
    const r = await processDueSequences(10, MONDAY)
    expect(r.processed).toBe(1)
    expect(String((db.agent_tasks[0].input as Row).draft_body)).toContain('İşletme')
  })

  it('dedupe-hata + telafi de düşerse CRITICAL loglanır', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    taskSelectError = { message: 'db down' }
    releaseFailsOnce = true
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await processDueSequences(10, MONDAY)
    expect(r.failed).toBe(1)
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('CRITICAL'))).toBe(true)
    errSpy.mockRestore()
  })

  it('önceki GÖNDERİLMİŞ gövdeler previousBodies olarak akar (final_body ?? body)', async () => {
    seedLead('l1')
    seedStep('l1', 1)
    db.outreach_messages.push(
      { lead_id: 'l1', status: 'sent', body: 'eski gövde bir', final_body: null },
      { lead_id: 'l1', status: 'sent', body: 'x', final_body: 'düzenlenmiş gövde iki' },
    )
    db.lead_evidence.push({ lead_id: 'l1', summary: 'ilk kanıt' }, { lead_id: 'l1', summary: 'ikinci kanıt' })
    const r = await processDueSequences(10, MONDAY)
    expect(r.processed).toBe(1) // kopya kontrolü şablon-taslağı engellemedi
    expect(String((db.agent_tasks[0].input as Row).draft_body)).not.toContain('eski gövde bir')
  })
})
