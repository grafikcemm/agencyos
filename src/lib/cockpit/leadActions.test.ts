import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── supabaseAdmin zincir mock'u ───────────────────────────────────────────────
interface LeadRow {
  id: string
  status: string
  next_follow_up_at: string | null
  last_contact_at: string | null
  notes: string | null
}
let leadRow: LeadRow | null = null
let auditInsertError: { code: string } | null = null
let updateRows: Array<{ id: string }> = [{ id: 'l1' }]
let lastUpdatePatch: Record<string, unknown> | null = null
const auditInserts: Array<Record<string, unknown>> = []
const auditDeletes: string[] = []

let rpcResult: { data: unknown; error: { code: string } | null } = { data: null, error: { code: 'PGRST202' } }

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    rpc: async () => rpcResult,
    from: (table: string) => {
      if (table === 'leads') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: leadRow, error: null }) }),
          }),
          update: (patch: Record<string, unknown>) => {
            lastUpdatePatch = patch
            return {
              eq: () => ({
                eq: () => ({
                  select: async () => ({ data: updateRows, error: null }),
                }),
              }),
            }
          },
        }
      }
      // lead_action_audit
      return {
        insert: (payload: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              if (auditInsertError) return { data: null, error: auditInsertError }
              auditInserts.push(payload)
              return { data: { id: `audit-${auditInserts.length}` }, error: null }
            },
          }),
        }),
        delete: () => ({
          eq: (_col: string, id: string) => {
            auditDeletes.push(id)
            return Promise.resolve({ error: null })
          },
        }),
      }
    },
  },
}))

import { applyLeadAction } from './leadActions'

const NOW = Date.parse('2026-07-13T09:00:00Z')

function freshLead(status = 'new'): LeadRow {
  return { id: 'l1', status, next_follow_up_at: null, last_contact_at: null, notes: null }
}

describe('applyLeadAction (Faz B6/C1 — geçiş + audit + idempotency)', () => {
  beforeEach(() => {
    leadRow = freshLead()
    rpcResult = { data: null, error: { code: 'PGRST202' } } // varsayılan: RPC yok → legacy
    auditInsertError = null
    updateRows = [{ id: 'l1' }]
    lastUpdatePatch = null
    auditInserts.length = 0
    auditDeletes.length = 0
  })

  it('called: new → contacted + last_contact_at + 3 gün follow-up + audit before/after', async () => {
    const r = await applyLeadAction({
      leadId: 'l1', action: 'called', actor: 'op', channel: 'ui', nowMs: NOW,
    })
    expect(r.ok).toBe(true)
    expect(r.audit).toBe('recorded')
    expect(lastUpdatePatch?.status).toBe('contacted')
    expect(lastUpdatePatch?.last_contact_at).toBe(new Date(NOW).toISOString())
    expect(r.before?.status).toBe('new')
    expect(r.after?.status).toBe('contacted')
    expect(Date.parse(r.after!.next_follow_up_at!)).toBe(NOW + 3 * 86_400_000)
    // audit satırı before/after taşır
    expect(auditInserts[0].before_state).toEqual({ status: 'new', next_follow_up_at: null })
  })

  it('no_answer: statü DEĞİŞMEZ, follow-up +1 gün', async () => {
    leadRow = freshLead('contacted')
    const r = await applyLeadAction({
      leadId: 'l1', action: 'no_answer', actor: 'op', channel: 'telegram', nowMs: NOW,
    })
    expect(r.ok).toBe(true)
    expect(lastUpdatePatch?.status).toBeUndefined()
    expect(Date.parse(r.after!.next_follow_up_at!)).toBe(NOW + 86_400_000)
  })

  it('meeting: → status meeting', async () => {
    leadRow = freshLead('responded')
    const r = await applyLeadAction({ leadId: 'l1', action: 'meeting', actor: 'op', channel: 'ui', nowMs: NOW })
    expect(r.ok).toBe(true)
    expect(r.after?.status).toBe('meeting')
  })

  it('later: gelecek tarih zorunlu; geçmiş tarih reddedilir (mutasyon yok)', async () => {
    const past = new Date(NOW - 1000).toISOString()
    const r = await applyLeadAction({
      leadId: 'l1', action: 'later', actor: 'op', channel: 'ui', laterAtIso: past, nowMs: NOW,
    })
    expect(r.ok).toBe(false)
    expect(lastUpdatePatch).toBeNull()

    const future = new Date(NOW + 86_400_000).toISOString()
    const r2 = await applyLeadAction({
      leadId: 'l1', action: 'later', actor: 'op', channel: 'ui', laterAtIso: future, nowMs: NOW,
    })
    expect(r2.ok).toBe(true)
    expect(r2.after?.next_follow_up_at).toBe(future)
  })

  it('note: nota zaman+kanal damgası eklenir; boş not reddedilir', async () => {
    leadRow = { ...freshLead('contacted'), notes: 'eski not' }
    const r = await applyLeadAction({
      leadId: 'l1', action: 'note', actor: 'op', channel: 'telegram', note: 'web sitesi konuşuldu', nowMs: NOW,
    })
    expect(r.ok).toBe(true)
    expect(String(lastUpdatePatch?.notes)).toContain('eski not\n[')
    expect(String(lastUpdatePatch?.notes)).toContain('telegram] web sitesi konuşuldu')

    const r2 = await applyLeadAction({ leadId: 'l1', action: 'note', actor: 'op', channel: 'ui', note: '  ', nowMs: NOW })
    expect(r2.ok).toBe(false)
  })

  it('geçersiz geçiş: won lead’e "called" reddedilir', async () => {
    leadRow = freshLead('won')
    const r = await applyLeadAction({ leadId: 'l1', action: 'called', actor: 'op', channel: 'ui', nowMs: NOW })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('geçersiz geçiş')
    expect(lastUpdatePatch).toBeNull()
  })

  it('idempotency: aynı anahtar ikinci kez (23505) → replay, MUTASYON TEKRARLANMAZ', async () => {
    auditInsertError = { code: '23505' }
    const r = await applyLeadAction({
      leadId: 'l1', action: 'called', actor: 'op', channel: 'telegram',
      idempotencyKey: 'tg-1-l1-called', nowMs: NOW,
    })
    expect(r.ok).toBe(true)
    expect(r.idempotentReplay).toBe(true)
    expect(lastUpdatePatch).toBeNull() // update HİÇ çağrılmadı
  })

  it('audit tablosu yok (42P01) → aksiyon yine uygulanır, audit degraded', async () => {
    auditInsertError = { code: '42P01' }
    const r = await applyLeadAction({ leadId: 'l1', action: 'called', actor: 'op', channel: 'ui', nowMs: NOW })
    expect(r.ok).toBe(true)
    expect(r.audit).toBe('degraded')
  })

  it('CAS yarışı: update 0 satır etkiler → hata + audit claim geri alınır', async () => {
    updateRows = []
    const r = await applyLeadAction({ leadId: 'l1', action: 'called', actor: 'op', channel: 'ui', nowMs: NOW })
    expect(r.ok).toBe(false)
    expect(auditDeletes).toHaveLength(1) // claim edilen audit satırı silindi
  })

  it('lead bulunamadı → hata', async () => {
    leadRow = null
    const r = await applyLeadAction({ leadId: 'yok', action: 'called', actor: 'op', channel: 'ui', nowMs: NOW })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('lead bulunamadı')
  })
})


// ── Faz 0.2: atomik RPC yolu (mig 058) ────────────────────────────────────────
describe('applyLeadAction — atomik RPC (Faz 0.2)', () => {
  beforeEach(() => {
    leadRow = freshLead()
    updateRows = [{ id: 'l1' }]
    lastUpdatePatch = null
    auditInsertError = null
    auditInserts.length = 0
  })

  it('RPC canlıysa tek-transaction sonucu döner (atomic:true), legacy yol HİÇ çalışmaz', async () => {
    rpcResult = {
      data: { outcome: 'applied', before: { status: 'new', next_follow_up_at: null }, after: { status: 'contacted', next_follow_up_at: 'x' } },
      error: null,
    }
    const r = await applyLeadAction({ leadId: 'l1', action: 'called', actor: 'op', channel: 'ui', nowMs: NOW })
    expect(r).toMatchObject({ ok: true, atomic: true, audit: 'recorded' })
    expect(lastUpdatePatch).toBeNull() // legacy update çağrılmadı
    expect(auditInserts).toHaveLength(0)
  })

  it('RPC replay → idempotentReplay:true, mutasyon yok', async () => {
    rpcResult = { data: { outcome: 'replayed', before: { status: 'new', next_follow_up_at: null }, after: { status: 'contacted', next_follow_up_at: 'x' } }, error: null }
    const r = await applyLeadAction({ leadId: 'l1', action: 'called', actor: 'op', channel: 'telegram', idempotencyKey: 'k', nowMs: NOW })
    expect(r).toMatchObject({ ok: true, idempotentReplay: true, atomic: true })
  })

  it('RPC rejected → ok:false + hata metni', async () => {
    rpcResult = { data: { outcome: 'rejected', error: 'geçersiz geçiş: won → called' }, error: null }
    const r = await applyLeadAction({ leadId: 'l1', action: 'called', actor: 'op', channel: 'ui', nowMs: NOW })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('geçersiz geçiş')
  })

  it('RPC beklenmedik DB hatası → legacy yola düşer (görünür log) ve iş yine tamamlanır', async () => {
    rpcResult = { data: null, error: { code: '57P01' } }
    const r = await applyLeadAction({ leadId: 'l1', action: 'called', actor: 'op', channel: 'ui', nowMs: NOW })
    expect(r.ok).toBe(true)
    expect(r.atomic).toBeUndefined() // legacy
  })
})
