import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── in-memory contacts/leads mock ────────────────────────────────────────────
interface ContactRow {
  id: string
  lead_id: string
  full_name: string
  email: string | null
  is_primary: boolean
  created_at: string
}
let contacts: ContactRow[] = []
let leads: Array<{ id: string; email: string | null }> = []
let rpcResult: { data: unknown; error: { code: string } | null } = { data: null, error: { code: 'PGRST202' } }
let insertError: { code: string } | null = null
let demoteError: { code: string } | null = null
let idSeq = 0

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    rpc: async () => rpcResult,
    from: (table: string) => {
      if (table === 'leads') {
        const filters: Record<string, unknown> = {}
        const chain = {
          select: () => chain,
          in: (_c: string, ids: string[]) => {
            filters.ids = ids
            return Promise.resolve({ data: leads.filter((l) => (ids ?? []).includes(l.id)), error: null })
          },
          eq: (_c: string, v: string) => {
            filters.id = v
            return chain
          },
          maybeSingle: async () => ({ data: leads.find((l) => l.id === filters.id) ?? null, error: null }),
        }
        return chain
      }
      // contacts
      let mode: 'select' | 'insert' | 'update' = 'select'
      let payload: Record<string, unknown> = {}
      const f: { leadIds?: string[]; id?: string; leadId?: string; isPrimary?: boolean; neqId?: string } = {}
      const chain = {
        select: () => (mode === 'insert' ? chain : ((mode = 'select'), chain)),
        insert: (p: Record<string, unknown>) => {
          mode = 'insert'
          payload = p
          return chain
        },
        update: (p: Record<string, unknown>) => {
          mode = 'update'
          payload = p
          return chain
        },
        in: (_c: string, ids: string[]) => {
          f.leadIds = ids
          return chain
        },
        eq: (col: string, v: unknown) => {
          if (col === 'id') f.id = v as string
          if (col === 'lead_id') f.leadId = v as string
          if (col === 'is_primary') f.isPrimary = v as boolean
          return chain
        },
        neq: (_c: string, v: string) => {
          f.neqId = v
          return chain
        },
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        single: async () => {
          if (mode === 'insert') {
            if (insertError) return { data: null, error: insertError }
            const row: ContactRow = {
              id: `c-${++idSeq}`,
              lead_id: payload.lead_id as string,
              full_name: payload.full_name as string,
              email: (payload.email as string) ?? null,
              is_primary: Boolean(payload.is_primary),
              created_at: new Date(2026, 0, idSeq).toISOString(),
            }
            contacts.push(row)
            return { data: { id: row.id }, error: null }
          }
          return { data: null, error: null }
        },
        maybeSingle: async () => ({
          data: contacts.find((c) => c.id === f.id && c.lead_id === f.leadId) ?? null,
          error: null,
        }),
        then: (res: (v: { data: unknown; error: unknown }) => void) => {
          if (mode === 'update') {
            if (demoteError && payload.is_primary === false) return res({ data: null, error: demoteError })
            for (const c of contacts) {
              const match =
                (f.id ? c.id === f.id : true) &&
                (f.leadId ? c.lead_id === f.leadId : true) &&
                (f.isPrimary !== undefined ? c.is_primary === f.isPrimary : true) &&
                (f.neqId ? c.id !== f.neqId : true)
              if (match) Object.assign(c, { is_primary: payload.is_primary ?? c.is_primary })
            }
            return res({ data: [], error: null })
          }
          // select thenable (resolveCanonicalRecipients primaries sorgusu)
          const rows = contacts
            .filter((c) => (f.leadIds ?? []).includes(c.lead_id) && c.is_primary && c.email)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
          return res({ data: rows, error: null })
        },
      }
      return chain
    },
  },
}))

import { createContact, setPrimaryContact, resolveCanonicalRecipient } from './contactService'

const BASE = {
  leadId: 'l1',
  fullName: 'Ayşe Yılmaz',
  role: 'owner',
  email: 'ayse@x.com',
  source: 'manual',
  isPrimary: true,
}

describe('createContact (Faz 2.1)', () => {
  beforeEach(() => {
    contacts = []
    leads = [{ id: 'l1', email: 'info@isletme.com' }]
    rpcResult = { data: null, error: { code: 'PGRST202' } }
    insertError = null
    demoteError = null
    idSeq = 0
  })

  it('RPC canlı → tek transaction sonucu (atomic:true)', async () => {
    rpcResult = { data: { outcome: 'created', id: 'c-rpc' }, error: null }
    const r = await createContact(BASE)
    expect(r).toMatchObject({ ok: true, id: 'c-rpc', atomic: true })
  })

  it('RPC duplicate → 409 malzemesi (duplicate:true), eski primary korunur', async () => {
    rpcResult = { data: { outcome: 'duplicate', error: 'aynı e-posta' }, error: null }
    const r = await createContact(BASE)
    expect(r).toMatchObject({ ok: false, duplicate: true, atomic: true })
  })

  it('RPC beklenmeyen DB hatası → fail-closed (legacy yarım-yazıma DÜŞMEZ)', async () => {
    rpcResult = { data: null, error: { code: '57P01' } }
    const r = await createContact(BASE)
    expect(r.ok).toBe(false)
    expect(contacts).toHaveLength(0)
  })

  it('legacy: insert BAŞARISIZSA eski primary kaybolmaz (demote hiç çalışmadı)', async () => {
    contacts.push({ id: 'c-old', lead_id: 'l1', full_name: 'Eski', email: 'eski@x.com', is_primary: true, created_at: '2025-01-01' })
    insertError = { code: '23505' }
    const r = await createContact(BASE)
    expect(r).toMatchObject({ ok: false, duplicate: true, atomic: false })
    expect(contacts.find((c) => c.id === 'c-old')?.is_primary).toBe(true)
  })

  it('legacy başarı: yeni kayıt primary + eskiler indirilir', async () => {
    contacts.push({ id: 'c-old', lead_id: 'l1', full_name: 'Eski', email: 'eski@x.com', is_primary: true, created_at: '2025-01-01' })
    const r = await createContact(BASE)
    expect(r.ok).toBe(true)
    expect(r.atomic).toBe(false)
    expect(contacts.find((c) => c.id === 'c-old')?.is_primary).toBe(false)
    expect(contacts.find((c) => c.id === r.id)?.is_primary).toBe(true)
  })
})

describe('setPrimaryContact', () => {
  beforeEach(() => {
    contacts = [
      { id: 'c-1', lead_id: 'l1', full_name: 'A', email: 'a@x.com', is_primary: true, created_at: '2025-01-01' },
      { id: 'c-2', lead_id: 'l1', full_name: 'B', email: 'b@x.com', is_primary: false, created_at: '2025-01-02' },
    ]
    leads = [{ id: 'l1', email: null }]
    rpcResult = { data: null, error: { code: 'PGRST202' } }
    demoteError = null
  })

  it('RPC canlı → atomik devir', async () => {
    rpcResult = { data: { outcome: 'ok' }, error: null }
    const r = await setPrimaryContact('l1', 'c-2')
    expect(r).toMatchObject({ ok: true, atomic: true })
  })

  it('legacy devir: hedef promote + diğerleri demote; sahiplik dışı contact reddedilir', async () => {
    const r = await setPrimaryContact('l1', 'c-2')
    expect(r.ok).toBe(true)
    expect(contacts.find((c) => c.id === 'c-2')?.is_primary).toBe(true)
    expect(contacts.find((c) => c.id === 'c-1')?.is_primary).toBe(false)

    const bad = await setPrimaryContact('l1', 'c-baska')
    expect(bad.ok).toBe(false)
  })
})

describe('resolveCanonicalRecipient (Faz 2.3)', () => {
  beforeEach(() => {
    rpcResult = { data: null, error: { code: 'PGRST202' } }
    contacts = []
    leads = [{ id: 'l1', email: 'Fallback@Isletme.com' }]
  })

  it('primary contact email lead.email\'i ezer; normalize (lowercase) edilir', async () => {
    contacts.push({ id: 'c-1', lead_id: 'l1', full_name: 'Ayşe', email: 'AYSE@x.com', is_primary: true, created_at: '2025-01-01' })
    const r = await resolveCanonicalRecipient('l1')
    expect(r).toMatchObject({ email: 'ayse@x.com', contactId: 'c-1', source: 'primary_contact' })
  })

  it('primary yoksa lead.email fallback; o da yoksa none', async () => {
    const r = await resolveCanonicalRecipient('l1')
    expect(r).toMatchObject({ email: 'fallback@isletme.com', contactId: null, source: 'lead_email' })
    leads = [{ id: 'l1', email: null }]
    const r2 = await resolveCanonicalRecipient('l1')
    expect(r2).toMatchObject({ email: null, source: 'none' })
  })

  it('çift-primary (legacy pencere) → EN YENİ primary deterministik kazanır', async () => {
    contacts.push(
      { id: 'c-1', lead_id: 'l1', full_name: 'Eski', email: 'eski@x.com', is_primary: true, created_at: '2025-01-01' },
      { id: 'c-2', lead_id: 'l1', full_name: 'Yeni', email: 'yeni@x.com', is_primary: true, created_at: '2025-06-01' },
    )
    const r = await resolveCanonicalRecipient('l1')
    expect(r.contactId).toBe('c-2')
  })
})
