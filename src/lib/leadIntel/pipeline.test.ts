import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock altyapısı: tablo-yönlendirmeli sahte supabase + modül mock'ları ─────

const dbState = {
  runs: new Map<string, { id: string; stage: string; candidates: unknown[]; cost_usd?: number; error?: string | null }>(),
  assessments: [] as Array<Record<string, unknown>>,
  matches: [] as Array<Record<string, unknown>>,
  leadsWrites: 0, // SHADOW İNVARYANTI: bu sayaç 0 kalmalı
}

function fakeTable(table: string) {
  const ctx: Record<string, unknown> = {}
  const chain = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      ctx[col] = val
      return chain
    },
    gte: () => chain,
    lt: () => chain,
    limit: () => Promise.resolve({ data: [], error: null }),
    contains: () => Promise.resolve({ data: [], error: null }),
    maybeSingle: () => {
      if (table === 'lead_intel_runs') {
        const run = dbState.runs.get(ctx.run_date as string)
        return Promise.resolve({ data: run ?? null, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    },
    single: () => Promise.resolve({ data: { id: `${table}-${Math.random().toString(36).slice(2, 8)}` }, error: null }),
    insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
      const list = Array.isArray(rows) ? rows : [rows]
      if (table === 'lead_assessments') dbState.assessments.push(...list)
      if (table === 'lead_service_matches') dbState.matches.push(...list)
      return {
        select: () => ({
          single: () => Promise.resolve({ data: { id: `assess-${dbState.assessments.length}` }, error: null }),
        }),
      }
    },
    update: () => {
      if (table === 'leads') dbState.leadsWrites++
      return { eq: () => Promise.resolve({ data: null, error: null }) }
    },
    upsert: (row: Record<string, unknown>) => {
      if (table === 'lead_intel_runs') {
        const key = row.run_date as string
        const prev = dbState.runs.get(key)
        dbState.runs.set(key, {
          id: prev?.id ?? 'run-1',
          stage: (row.stage as string) ?? prev?.stage ?? 'discovered',
          candidates: (row.candidates as unknown[]) ?? prev?.candidates ?? [],
          cost_usd: (row.cost_usd as number) ?? prev?.cost_usd ?? 0,
          error: (row.error as string) ?? prev?.error ?? null,
        })
      }
      return {
        select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'run-1' }, error: null }) }),
      }
    },
  }
  return chain
}

vi.mock('../supabase', () => ({
  supabaseAdmin: { from: (table: string) => fakeTable(table) },
}))

const collectMock = vi.fn()
vi.mock('./evidenceCollector', () => ({
  collectEvidence: (...args: unknown[]) => collectMock(...args),
  countVerified: (items: Array<{ verified: boolean }>) => items.filter((i) => i.verified).length,
}))

const persistMock = vi.fn()
vi.mock('./evidenceStore', () => ({
  persistEvidence: (...args: unknown[]) => persistMock(...args),
  signedUrlFor: () => Promise.resolve('https://signed.example/x.jpg'),
  cleanupOldScreenshots: () => Promise.resolve(0),
}))

const councilMock = vi.fn()
vi.mock('./council', () => ({
  runCouncil: (...args: unknown[]) => councilMock(...args),
}))

vi.mock('./budget', () => ({
  getLeadIntelDailySpend: () => Promise.resolve(0.004),
}))

vi.mock('../services/catalogOverrides', () => ({
  getCatalog: () => Promise.resolve([]),
}))

import { runLeadIntelPipeline, PoolCandidate } from './pipeline'

const POOL: PoolCandidate[] = [1, 2, 3, 4, 5, 6, 7].map((i) => ({
  placeId: `place-${i}`,
  businessName: `İşletme ${i}`,
  sector: 'beauty',
  city: 'İstanbul',
  district: 'Kadıköy',
  phone: '+90 555 000 000' + i,
  website: `https://isletme${i}.com`,
  rating: 4,
  reviewCount: 50,
  qualityScore: 90 - i * 5, // 85, 80, 75, 70, 65, 60, 55
  leadId: i <= 2 ? `lead-${i}` : null,
  acceptedByLegacyGate: i <= 2,
}))

const EVIDENCE = [
  { id: 'e1', kind: 'pagespeed', verified: true, payload: {}, summary: '', source: 'psi_v5', url: null, storage_path: null, confidence: 0.9 },
  { id: 'e2', kind: 'html_signal', verified: true, payload: { has_whatsapp: true }, summary: '', source: 'html_fetch', url: null, storage_path: null, confidence: 0.9 },
  { id: 'e3', kind: 'places_data', verified: true, payload: {}, summary: '', source: 'google_places', url: null, storage_path: null, confidence: 0.9 },
]

const ASSESSMENT_COST = 0.002

function councilResult(designScore: number, aiScore: number, slug = 'web-sitesi') {
  return {
    mode: 'council',
    designScore,
    aiScore,
    designCritic: null,
    automation: null,
    skeptic: null,
    chair: {
      decision: 'opportunity',
      primary_service_slug: slug,
      secondary_service_slug: null,
      final_design_score: designScore,
      final_ai_score: aiScore,
      oversell_warning: false,
      oversell_note: null,
      rationale_evidence_ids: ['e1'],
    },
    matches: [{ service_slug: slug, domain: 'tasarim', rank: 1, score: designScore, evidence_refs: ['e1'], reasons: [] }],
    notes: [],
    costUsd: ASSESSMENT_COST,
  }
}

beforeEach(() => {
  dbState.runs.clear()
  dbState.assessments = []
  dbState.matches = []
  dbState.leadsWrites = 0
  collectMock.mockReset()
  persistMock.mockReset()
  councilMock.mockReset()
  collectMock.mockResolvedValue({ items: EVIDENCE, notes: [] })
  persistMock.mockResolvedValue(EVIDENCE)
  councilMock.mockResolvedValue(councilResult(85, 60))
  // PSI key shadow/active için zorunlu — testler koşabilsin diye sahte key.
  process.env.PAGESPEED_API_KEY = 'test-psi-key'
})

describe('runLeadIntelPipeline — shadow invaryantları', () => {
  it('shadow: leads tablosuna SIFIR yazım, selected ≤ 2, en iyi 4 audit edilir', async () => {
    const result = await runLeadIntelPipeline({ pool: POOL, runDate: '2026-07-03', mode: 'shadow' })
    expect(result.ran).toBe(true)
    expect(result.stage).toBe('done')
    expect(dbState.leadsWrites).toBe(0) // ← shadow hiçbir lead'e dokunmaz
    expect(result.selected.length).toBeLessThanOrEqual(2)
    expect(result.audited).toBe(4) // top 6 → top 4 audit
    expect(dbState.assessments.length).toBe(4)
    // shadow bayrağı yazılmış
    expect(dbState.assessments.every((a) => a.shadow === true)).toBe(true)
    // seçilenler işaretli
    expect(dbState.assessments.filter((a) => a.selected === true).length).toBe(result.selected.length)
  })

  it('off: hiçbir şey koşmaz', async () => {
    const result = await runLeadIntelPipeline({ pool: POOL, runDate: '2026-07-03', mode: 'off' })
    expect(result.ran).toBe(false)
    expect(collectMock).not.toHaveBeenCalled()
    expect(dbState.assessments).toHaveLength(0)
  })

  it('idempotency: stage=done koşu tekrar audit/konsey ÇALIŞTIRMAZ', async () => {
    dbState.runs.set('2026-07-03', { id: 'run-1', stage: 'done', candidates: [] })
    const result = await runLeadIntelPipeline({ pool: POOL, runDate: '2026-07-03', mode: 'shadow' })
    expect(result.stage).toBe('done')
    expect(collectMock).not.toHaveBeenCalled()
    expect(councilMock).not.toHaveBeenCalled()
  })

  it('active: yalnız eski kapının kabul ettikleri seçilebilir; seçilen lead\'e v2 kolonları yazılır', async () => {
    const result = await runLeadIntelPipeline({ pool: POOL, runDate: '2026-07-03', mode: 'active' })
    expect(result.stage).toBe('done')
    // Kabul edilenler place-1/place-2 → seçim onlardan; leads update ≥1 kez.
    expect(result.selected.length).toBeLessThanOrEqual(2)
    for (const name of result.selected) {
      expect(['İşletme 1', 'İşletme 2']).toContain(name)
    }
    expect(dbState.leadsWrites).toBeGreaterThan(0)
  })

  it('kanıt persist edilemezse (migration yok) aday atlanır, koşu düşmez', async () => {
    persistMock.mockResolvedValue([])
    const result = await runLeadIntelPipeline({ pool: POOL, runDate: '2026-07-03', mode: 'shadow' })
    expect(result.stage).toBe('done')
    expect(result.assessed).toBe(0)
    expect(result.selected).toHaveLength(0) // kota zorla doldurulmadı
  })

  it('taban geçemeyen adaylar seçilmez (konsey reject)', async () => {
    councilMock.mockResolvedValue({ ...councilResult(85, 60), chair: { ...councilResult(85, 60).chair, decision: 'reject' } })
    const result = await runLeadIntelPipeline({ pool: POOL, runDate: '2026-07-03', mode: 'shadow' })
    expect(result.selected).toHaveLength(0)
    expect(dbState.assessments.filter((a) => a.selected === true)).toHaveLength(0)
  })

  it('MALİYET TUTARLILIĞI: run cost_usd = Σ assessment cost_usd (retry dahil council muhasebesi)', async () => {
    const result = await runLeadIntelPipeline({ pool: POOL, runDate: '2026-07-03', mode: 'shadow' })
    expect(result.stage).toBe('done')
    const assessmentSum = dbState.assessments.reduce((s, a) => s + Number(a.cost_usd ?? 0), 0)
    expect(assessmentSum).toBeCloseTo(4 * ASSESSMENT_COST, 6) // 4 aday audit edildi
    expect(result.costUsd).toBeCloseTo(assessmentSum, 6)
    expect(dbState.runs.get('2026-07-03')?.cost_usd).toBeCloseTo(assessmentSum, 6)
    // Her assessment gerçek council maliyetini taşır.
    expect(dbState.assessments.every((a) => a.cost_usd === ASSESSMENT_COST)).toBe(true)
  })

  it('PAGESPEED_API_KEY yoksa shadow/active koşusu GÖZLEMLENEBİLİR hata ile atlanır', async () => {
    delete process.env.PAGESPEED_API_KEY
    const result = await runLeadIntelPipeline({ pool: POOL, runDate: '2026-07-03', mode: 'shadow' })
    expect(result.stage).toBe('error')
    expect(result.notes.join(' ')).toContain('PAGESPEED_API_KEY')
    expect(collectMock).not.toHaveBeenCalled() // audit hiç başlamadı
    expect(dbState.runs.get('2026-07-03')?.stage).toBe('error')
    expect(dbState.runs.get('2026-07-03')?.error).toContain('PAGESPEED_API_KEY')
  })

  it('kanıt toplama notları (PSI hatası) assessment council jsonb\'sine persist edilir', async () => {
    collectMock.mockResolvedValue({ items: EVIDENCE, notes: ['PSI başarısız (İşletme 1): PSI HTTP 429 — pagespeed/screenshot kanıtı üretilmedi'] })
    const result = await runLeadIntelPipeline({ pool: POOL, runDate: '2026-07-03', mode: 'shadow' })
    expect(result.notes.join(' ')).toContain('429') // run notlarında
    const councils = dbState.assessments.map((a) => a.council as { collection_notes?: string[] })
    expect(councils.some((c) => (c.collection_notes ?? []).join(' ').includes('429'))).toBe(true)
  })
})
