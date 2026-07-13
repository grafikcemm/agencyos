import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── in-memory mock ────────────────────────────────────────────────────────────
let leadRow: { id: string; business_name: string; status: string; expected_monthly_value_tl: number | null } | null
let projects: Array<{ id: string; lead_id: string; created_at: string }> = []
let rpcResult: { data: unknown; error: { code: string } | null } = { data: null, error: { code: 'PGRST202' } }
let leadUpdateRows: Array<{ id: string }> = [{ id: 'l1' }]
const audits: Array<Record<string, unknown>> = []
let idSeq = 0

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    rpc: async () => rpcResult,
    from: (table: string) => {
      if (table === 'leads') {
        const chain = {
          select: () => chain,
          update: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: leadRow, error: null }),
          then: (res: (v: unknown) => void) => res({ data: leadUpdateRows, error: null }),
        }
        return chain
      }
      if (table === 'projects') {
        let inserted: Record<string, unknown> | null = null
        const chain = {
          select: () => chain,
          insert: (p: Record<string, unknown>) => {
            inserted = p
            return chain
          },
          delete: () => chain,
          eq: (_c: string, v: string) => {
            // delete yolunda id filtresi
            if (inserted === null && chain._deleting) {
              projects = projects.filter((x) => x.id !== v)
            }
            return chain
          },
          _deleting: false,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: projects.find((p) => p.lead_id === leadRow?.id) ?? null, error: null }),
          single: async () => {
            const row = { id: `p-${++idSeq}`, lead_id: inserted!.lead_id as string, created_at: new Date(2026, 0, idSeq).toISOString() }
            projects.push(row)
            return { data: { id: row.id }, error: null }
          },
          then: (res: (v: unknown) => void) =>
            res({ data: projects.filter((p) => p.lead_id === leadRow?.id), error: null }),
        }
        return chain
      }
      // lead_action_audit
      return {
        insert: async (p: Record<string, unknown>) => {
          audits.push(p)
          return { error: null }
        },
      }
    },
  },
}))

import { convertLeadToProject } from './convertLead'

describe('convertLeadToProject (Faz 3.1)', () => {
  beforeEach(() => {
    leadRow = { id: 'l1', business_name: 'Test İşletme', status: 'meeting', expected_monthly_value_tl: 15000 }
    projects = []
    rpcResult = { data: null, error: { code: 'PGRST202' } }
    leadUpdateRows = [{ id: 'l1' }]
    audits.length = 0
    idSeq = 0
  })

  it('RPC canlı → atomik created (proje + converted + audit tek transaction)', async () => {
    rpcResult = { data: { outcome: 'created', project_id: 'p-rpc' }, error: null }
    const r = await convertLeadToProject({ leadId: 'l1', actor: 'op' })
    expect(r).toMatchObject({ ok: true, outcome: 'created', projectId: 'p-rpc', atomic: true })
  })

  it('RPC already → ikinci tık yeni proje ÜRETMEZ', async () => {
    rpcResult = { data: { outcome: 'already', project_id: 'p-var' }, error: null }
    const r = await convertLeadToProject({ leadId: 'l1', actor: 'op' })
    expect(r).toMatchObject({ ok: true, outcome: 'already', projectId: 'p-var' })
  })

  it('legacy: proje + audit (revenue attribution: project_id + beklenen aylık değer)', async () => {
    const r = await convertLeadToProject({ leadId: 'l1', actor: 'op' })
    expect(r.ok).toBe(true)
    expect(r.outcome).toBe('created')
    expect(r.atomic).toBe(false)
    expect(projects).toHaveLength(1)
    expect(audits[0]).toMatchObject({ action: 'convert', actor: 'op' })
    expect((audits[0].after_state as { project_id: string }).project_id).toBe(r.projectId)
    expect((audits[0].after_state as { expected_monthly_value_tl: number }).expected_monthly_value_tl).toBe(15000)
  })

  it('legacy: mevcut proje varsa already — mutasyon yok', async () => {
    projects.push({ id: 'p-eski', lead_id: 'l1', created_at: '2025-01-01' })
    const r = await convertLeadToProject({ leadId: 'l1', actor: 'op' })
    expect(r).toMatchObject({ ok: true, outcome: 'already', projectId: 'p-eski' })
    expect(projects).toHaveLength(1)
  })

  it('lost/archived lead reddedilir; lead bulunamazsa hata', async () => {
    leadRow = { ...leadRow!, status: 'lost' }
    const r = await convertLeadToProject({ leadId: 'l1', actor: 'op' })
    expect(r.ok).toBe(false)
    expect(projects).toHaveLength(0)

    leadRow = null
    const r2 = await convertLeadToProject({ leadId: 'yok', actor: 'op' })
    expect(r2.ok).toBe(false)
  })

  it('legacy: lead update başarısız → proje oluştu ama "dönüştü" DENMEZ (görünür hata)', async () => {
    leadUpdateRows = []
    const r = await convertLeadToProject({ leadId: 'l1', actor: 'op' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('lead güncellenemedi')
  })
})
