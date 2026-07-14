import { describe, it, expect, vi } from 'vitest'
import {
  runEnrichment,
  CONFIDENCE_PRIMARY_THRESHOLD,
  SOURCE_CONFIDENCE,
  type EnrichmentDeps,
  type CandidateLead,
  type FoundContact,
  type FoundEvidence,
} from './enrichmentOrchestrator'

// FINAL PILOT BLOCKERS Faz 4 — enrichment orkestrasyonu: HARD cap, kaynak sırası
// (web→Apollo), UYDURMA YOK, güven-eşikli primary/HITL, duplicate dedup, görünür
// hata/maliyet. Tüm I/O enjekte (fake) — gerçek web/Apollo/DB SIFIR.

function lead(over: Partial<CandidateLead> = {}): CandidateLead {
  return {
    leadId: `lead-${Math.random().toString(36).slice(2, 8)}`,
    businessName: 'Test İşletme', website: 'https://ornek.com', city: 'İstanbul',
    sector: 'kafe', hasRecipient: false, hasEvidence: false, priority: 10, ...over,
  }
}
function contact(over: Partial<FoundContact> = {}): FoundContact {
  return {
    fullName: 'Ali Veli', role: 'owner', email: 'ali@ornek.com', source: 'website',
    confidence: SOURCE_CONFIDENCE.website, fetchedAt: '2026-07-14T00:00:00Z', ...over,
  }
}
function evidence(over: Partial<FoundEvidence> = {}): FoundEvidence {
  return {
    kind: 'html_signal', source: 'website', url: 'https://ornek.com', summary: 'Site mobil uyumsuz',
    verified: false, confidence: 0.6, fetchedAt: '2026-07-14T00:00:00Z', ...over,
  }
}

function fakeDeps(over: Partial<EnrichmentDeps> = {}): { deps: EnrichmentDeps; saved: { contacts: unknown[]; evidence: unknown[]; summary: unknown } } {
  const saved = { contacts: [] as unknown[], evidence: [] as unknown[], summary: null as unknown }
  const deps: EnrichmentDeps = {
    selectCandidates: async () => [],
    findContactsFromWeb: async () => [],
    findContactsFromApollo: async () => [],
    collectEvidenceFor: async () => [],
    saveContact: async (i) => { saved.contacts.push(i); return { ok: true } },
    saveEvidence: async (_l, items) => { saved.evidence.push(...items); return { saved: items.length } },
    recordRunSummary: async (s) => { saved.summary = s },
    ...over,
  }
  return { deps, saved }
}

const CAPS = { maxLeads: 5, maxApolloCalls: 3 }

describe('runEnrichment — recipient', () => {
  it('web yüksek-güven e-posta → OTOMATİK primary (Apollo çağrılmaz)', async () => {
    const apollo = vi.fn(async () => [])
    const { deps, saved } = fakeDeps({
      selectCandidates: async () => [lead()],
      findContactsFromWeb: async () => [contact({ confidence: 0.75 })], // eşik üstü
      findContactsFromApollo: apollo,
    })
    const s = await runEnrichment(deps, CAPS)
    expect(s.contactsAdded).toBe(1)
    expect(s.primaryAutoSet).toBe(1)
    expect(s.apolloCalls).toBe(0)
    expect(apollo).not.toHaveBeenCalled()
    expect((saved.contacts[0] as { isPrimary: boolean }).isPrimary).toBe(true)
  })

  it('web DÜŞÜK güven → contact yazılır ama primary DEĞİL, HITL bekler', async () => {
    const { deps } = fakeDeps({
      selectCandidates: async () => [lead()],
      findContactsFromWeb: async () => [contact({ confidence: SOURCE_CONFIDENCE.website })], // 0.6 < 0.7
    })
    const s = await runEnrichment(deps, CAPS)
    expect(s.contactsAdded).toBe(1)
    expect(s.primaryAutoSet).toBe(0)
    expect(s.hitlPending).toBe(1)
  })

  it('web boş → Apollo çağrılır (cap içinde); Apollo verified → primary', async () => {
    const { deps } = fakeDeps({
      selectCandidates: async () => [lead()],
      findContactsFromWeb: async () => [],
      findContactsFromApollo: async () => [contact({ source: 'apollo', confidence: SOURCE_CONFIDENCE.apollo_verified, email: 'ceo@ornek.com' })],
    })
    const s = await runEnrichment(deps, CAPS)
    expect(s.apolloCalls).toBe(1)
    expect(s.primaryAutoSet).toBe(1)
  })

  it('UYDURMA YOK: geçersiz/boş e-posta olan aday contact OLMAZ → HITL', async () => {
    const { deps } = fakeDeps({
      selectCandidates: async () => [lead()],
      findContactsFromWeb: async () => [
        contact({ email: 'gecersiz-eposta' }),
        contact({ email: '', fullName: 'İsimsiz' }),
      ],
    })
    const s = await runEnrichment(deps, CAPS)
    expect(s.contactsAdded).toBe(0)
    expect(s.hitlPending).toBe(1)
  })

  it('duplicate e-posta → transaction dedup (duplicatesSkipped), hata değil', async () => {
    const { deps } = fakeDeps({
      selectCandidates: async () => [lead()],
      findContactsFromWeb: async () => [contact({ confidence: 0.8 })],
      saveContact: async () => ({ ok: false, duplicate: true }),
    })
    const s = await runEnrichment(deps, CAPS)
    expect(s.duplicatesSkipped).toBe(1)
    expect(s.contactsAdded).toBe(0)
    expect(s.errors).toHaveLength(0)
  })

  it('HARD CAP: Apollo çağrısı maxApolloCalls\'ı aşmaz (kalan leadler HITL)', async () => {
    const leads = Array.from({ length: 5 }, (_, i) => lead({ leadId: `l-${i}` }))
    const apollo = vi.fn(async () => [] as FoundContact[])
    const { deps } = fakeDeps({
      selectCandidates: async () => leads,
      findContactsFromWeb: async () => [], // hep web boş → Apollo denenir
      findContactsFromApollo: apollo,
    })
    const s = await runEnrichment(deps, { maxLeads: 5, maxApolloCalls: 2 })
    expect(s.apolloCalls).toBe(2) // 5 lead ama YALNIZ 2 Apollo çağrısı
    expect(apollo).toHaveBeenCalledTimes(2)
  })

  it('HARD CAP: selectCandidates fazlası cappedOut olarak görünür (sessiz kesme yok)', async () => {
    const leads = Array.from({ length: 8 }, (_, i) => lead({ leadId: `l-${i}`, hasRecipient: true, hasEvidence: true }))
    const { deps } = fakeDeps({ selectCandidates: async () => leads })
    const s = await runEnrichment(deps, { maxLeads: 3, maxApolloCalls: 5 })
    expect(s.scanned).toBe(3)
    expect(s.cappedOut).toBe(5)
    expect(s.leads).toHaveLength(3)
  })

  it('saveContact hatası → görünür error (koşu devam eder)', async () => {
    const { deps } = fakeDeps({
      selectCandidates: async () => [lead()],
      findContactsFromWeb: async () => [contact({ confidence: 0.8 })],
      saveContact: async () => ({ ok: false, error: 'db down' }),
    })
    const s = await runEnrichment(deps, CAPS)
    expect(s.errors.some((e) => e.includes('db down'))).toBe(true)
  })

  it('findContactsFromWeb throw → görünür error, evidence yine denenir', async () => {
    const { deps } = fakeDeps({
      selectCandidates: async () => [lead()],
      findContactsFromWeb: async () => { throw new Error('web patladı') },
      collectEvidenceFor: async () => [evidence({ url: 'https://x', verified: true })],
    })
    const s = await runEnrichment(deps, CAPS)
    expect(s.errors.some((e) => e.includes('web patladı'))).toBe(true)
    expect(s.evidenceAdded).toBe(1) // evidence bağımsız devam etti
  })
})

describe('runEnrichment — evidence', () => {
  it('doğrulanabilir kanıt (url VEYA verified) yazılır; summary\'siz atlanır', async () => {
    const { deps } = fakeDeps({
      selectCandidates: async () => [lead({ hasRecipient: true })],
      collectEvidenceFor: async () => [
        evidence({ url: 'https://ornek.com', summary: 'geçerli' }),
        evidence({ url: null, verified: false, summary: 'kanıtsız (atlanır)' }),
        evidence({ url: null, verified: true, summary: 'doğrulanmış' }),
        evidence({ url: 'https://x', summary: '   ' }), // boş summary → atlanır
      ],
    })
    const s = await runEnrichment(deps, CAPS)
    expect(s.evidenceAdded).toBe(2) // yalnız url'li geçerli + verified
  })

  it('zaten evidence\'ı olan lead için evidence toplanmaz', async () => {
    const collect = vi.fn(async () => [] as FoundEvidence[])
    const { deps } = fakeDeps({
      selectCandidates: async () => [lead({ hasEvidence: true, hasRecipient: true })],
      collectEvidenceFor: collect,
    })
    await runEnrichment(deps, CAPS)
    expect(collect).not.toHaveBeenCalled()
  })

  it('recipient ZATEN varsa contact aranmaz', async () => {
    const web = vi.fn(async () => [] as FoundContact[])
    const { deps } = fakeDeps({
      selectCandidates: async () => [lead({ hasRecipient: true })],
      findContactsFromWeb: web,
    })
    await runEnrichment(deps, CAPS)
    expect(web).not.toHaveBeenCalled()
  })

  it('saveEvidence error → görünür', async () => {
    const { deps } = fakeDeps({
      selectCandidates: async () => [lead({ hasRecipient: true })],
      collectEvidenceFor: async () => [evidence({ url: 'https://x' })],
      saveEvidence: async () => ({ saved: 0, error: 'storage down' }),
    })
    const s = await runEnrichment(deps, CAPS)
    expect(s.errors.some((e) => e.includes('storage down'))).toBe(true)
  })
})

describe('runEnrichment — özet kalıcılık', () => {
  it('recordRunSummary çağrılır (kokpit görünürlüğü)', async () => {
    const record = vi.fn(async () => {})
    const { deps } = fakeDeps({ selectCandidates: async () => [], recordRunSummary: record })
    await runEnrichment(deps, CAPS)
    expect(record).toHaveBeenCalledOnce()
  })

  it('eşik sabitleri makul (0<primary<1)', () => {
    expect(CONFIDENCE_PRIMARY_THRESHOLD).toBeGreaterThan(0)
    expect(CONFIDENCE_PRIMARY_THRESHOLD).toBeLessThan(1)
    expect(SOURCE_CONFIDENCE.apollo_verified).toBeGreaterThan(CONFIDENCE_PRIMARY_THRESHOLD)
  })
})
