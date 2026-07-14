import { describe, it, expect, vi, beforeEach } from 'vitest'

// Canonical outbound artifact servisi (FINALIZATION Faz 1): stabil claim key,
// içerik/voice dijestleri, kanıt-uyum matrisi, deterministik remap, versiyon
// persist (yarış + telafi) ve fail-closed yükleme. In-memory DB mock — ağ yok.

let seq = 0
const db: Record<string, Array<Record<string, unknown>>> = {
  outreach_message_versions: [],
  outreach_claim_evidence: [],
  lead_evidence: [],
}

// Kontrollü hata enjeksiyonları.
let versionSelectError: { message: string; code?: string } | null = null
let versionInsertError: { message: string; code?: string } | null = null
let versionInsertErrorOnce = false
let claimSelectError: { message: string; code?: string } | null = null
let claimInsertError: { message: string; code?: string } | null = null
let evidenceSelectError: { message: string; code?: string } | null = null

function makeQuery(table: string) {
  const rows = db[table] ?? []
  const filters: Array<(r: Record<string, unknown>) => boolean> = []
  let op: 'select' | 'insert' | 'delete' = 'select'
  let payload: Record<string, unknown> | Array<Record<string, unknown>> | null = null
  let orderCol: string | null = null
  let orderAsc = true

  function exec(single: boolean): { data: unknown; error: { message: string; code?: string } | null } {
    if (op === 'select') {
      if (table === 'outreach_message_versions' && versionSelectError) return { data: null, error: versionSelectError }
      if (table === 'outreach_claim_evidence' && claimSelectError) return { data: null, error: claimSelectError }
      if (table === 'lead_evidence' && evidenceSelectError) return { data: null, error: evidenceSelectError }
      let matched = rows.filter((r) => filters.every((f) => f(r)))
      if (orderCol) {
        matched = [...matched].sort((a, b) => {
          const av = a[orderCol!] as number
          const bv = b[orderCol!] as number
          return orderAsc ? av - bv : bv - av
        })
      }
      return { data: single ? (matched[0] ?? null) : matched, error: null }
    }
    if (op === 'insert' && payload) {
      if (table === 'outreach_message_versions' && (versionInsertError || versionInsertErrorOnce)) {
        const err = versionInsertError ?? { message: 'duplicate key', code: '23505' }
        versionInsertErrorOnce = false // once bayrağı tek kullanımlık; kalıcı hata sürer
        return { data: null, error: err }
      }
      if (table === 'outreach_claim_evidence' && claimInsertError) {
        return { data: null, error: claimInsertError }
      }
      const items = Array.isArray(payload) ? payload : [payload]
      const inserted = items.map((r) => {
        // unique(outreach_message_id, version) simülasyonu.
        if (
          table === 'outreach_message_versions' &&
          rows.some((x) => x.outreach_message_id === r.outreach_message_id && x.version === r.version)
        ) {
          throw { code: '23505' }
        }
        const row = { id: `id-${++seq}`, ...r }
        rows.push(row)
        return row
      })
      return { data: single ? inserted[0] : inserted, error: null }
    }
    if (op === 'delete') {
      const matched = rows.filter((r) => filters.every((f) => f(r)))
      for (const m of matched) rows.splice(rows.indexOf(m), 1)
      return { data: matched, error: null }
    }
    return { data: null, error: null }
  }

  function safeExec(single: boolean) {
    try {
      return exec(single)
    } catch (e) {
      return { data: null, error: { message: 'duplicate key', code: (e as { code?: string }).code } }
    }
  }

  const api: Record<string, unknown> = {}
  Object.assign(api, {
    select: () => api,
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api },
    order: (c: string, opts?: { ascending?: boolean }) => { orderCol = c; orderAsc = opts?.ascending !== false; return api },
    limit: () => api,
    insert: (row: Record<string, unknown> | Array<Record<string, unknown>>) => { op = 'insert'; payload = row; return api },
    delete: () => { op = 'delete'; return api },
    maybeSingle: async () => safeExec(true),
    single: async () => safeExec(true),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(safeExec(false)).then(resolve),
  })
  return api
}

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: (t: string) => makeQuery(t) } }))

import {
  claimKey,
  computeContentDigest,
  voiceRulesDigest,
  checkClaimEvidenceCompat,
  remapClaims,
  loadClaimEntriesForMessage,
  loadEvidenceMeta,
  persistMessageVersion,
  type EvidenceMeta,
  type PersistedClaim,
} from './claimEvidence'

function ev(partial: Partial<EvidenceMeta>): EvidenceMeta {
  return { id: 'ev-1', kind: 'html_signal', source: 'scan', summary: '', payload: null, verified: false, ...partial }
}

beforeEach(() => {
  seq = 0
  for (const k of Object.keys(db)) db[k] = []
  versionSelectError = null
  versionInsertError = null
  versionInsertErrorOnce = false
  claimSelectError = null
  claimInsertError = null
  evidenceSelectError = null
})

describe('claimKey / dijestler', () => {
  it('claimKey: fold + boşluk-normalize → aksan/boşluk farkları aynı anahtara çözülür', () => {
    expect(claimKey('Siteniz  ÇOK   yavaş')).toBe(claimKey('siteniz cok yavas'))
    expect(claimKey('a')).not.toBe(claimKey('b'))
  })

  it('computeContentDigest: alıcı normalize (trim+lower); içerik değişince digest değişir', () => {
    const base = { channel: 'email', recipientEmail: ' A@B.com ', subject: 's', body: 'b' }
    expect(computeContentDigest(base)).toBe(computeContentDigest({ ...base, recipientEmail: 'a@b.com' }))
    expect(computeContentDigest(base)).not.toBe(computeContentDigest({ ...base, body: 'b2' }))
    expect(computeContentDigest(base)).not.toBe(computeContentDigest({ ...base, recipientEmail: 'x@y.com' }))
  })

  it('voiceRulesDigest: kural seti değişince değişir; null kurallar stabil', () => {
    const d1 = voiceRulesDigest({ positive: ['a'], negative: [] }, [])
    const d2 = voiceRulesDigest({ positive: ['a', 'b'], negative: [] }, [])
    expect(d1).not.toBe(d2)
    expect(voiceRulesDigest(null, [])).toBe(voiceRulesDigest(undefined, []))
  })
})

describe('checkClaimEvidenceCompat — deterministik uyum matrisi', () => {
  it('observation iddiası: gözlemsel tür uyumlu, alakasız tür red', () => {
    const claim = { snippet: 'inceledim', category: 'observation' as const }
    expect(checkClaimEvidenceCompat(claim, ev({ kind: 'pagespeed' })).ok).toBe(true)
    expect(checkClaimEvidenceCompat(claim, ev({ kind: 'weird_kind' })).ok).toBe(false)
  })

  it('behavioral iddiası: yalnız yorum/işletme sinyali veya vaka kaydı', () => {
    const claim = { snippet: 'müşteri kayb', category: 'behavioral' as const }
    expect(checkClaimEvidenceCompat(claim, ev({ kind: 'review_signal' })).ok).toBe(true)
    expect(checkClaimEvidenceCompat(claim, ev({ kind: 'pagespeed' })).ok).toBe(false)
  })

  it('quantified: gözlemsel türde sayı birebir kanıtta geçmeli', () => {
    const claim = { snippet: '37 yorum', category: 'quantified' as const }
    expect(checkClaimEvidenceCompat(claim, ev({ kind: 'review_signal', summary: 'Google: 4.2 puan, 37 yorum' })).ok).toBe(true)
    expect(checkClaimEvidenceCompat(claim, ev({ kind: 'review_signal', summary: 'Google: 12 yorum' })).ok).toBe(false)
  })

  it('quantified sonuç vaadi: yalnız verified vaka kaydı; sayı kanıtta geçmeli', () => {
    const claim = { snippet: '%35', category: 'quantified' as const }
    expect(checkClaimEvidenceCompat(claim, ev({ kind: 'case_study', verified: true, summary: 'dönüşüm %35 arttı' })).ok).toBe(true)
    expect(checkClaimEvidenceCompat(claim, ev({ kind: 'case_study', verified: false, summary: 'dönüşüm %35 arttı' })).ok).toBe(false)
    expect(checkClaimEvidenceCompat(claim, ev({ kind: 'case_study', verified: true, summary: 'dönüşüm %20 arttı' })).ok).toBe(false)
  })

  it('outcome vaadi: verified vaka kaydı olmadan HİÇBİR gözlemsel tür yetmez', () => {
    const claim = { snippet: 'dönüşüm artışı', category: 'outcome' as const }
    expect(checkClaimEvidenceCompat(claim, ev({ kind: 'pagespeed' })).ok).toBe(false)
    expect(checkClaimEvidenceCompat(claim, ev({ kind: 'client_result', verified: true })).ok).toBe(true)
    const withNum = { snippet: '90 günde sonuç', category: 'outcome' as const }
    expect(checkClaimEvidenceCompat(withNum, ev({ kind: 'client_result', verified: true, summary: 'proje 90 günde' })).ok).toBe(true)
    expect(checkClaimEvidenceCompat(withNum, ev({ kind: 'client_result', verified: true, summary: 'süre yok' })).ok).toBe(false)
  })

  it('payload içindeki sayı da içerme kontrolüne dahildir', () => {
    const claim = { snippet: '4 saniye', category: 'quantified' as const }
    expect(checkClaimEvidenceCompat(claim, ev({ kind: 'pagespeed', payload: { lcp_s: 4 } })).ok).toBe(true)
  })
})

describe('remapClaims — edit sonrası güvenli taşıma', () => {
  const prior: PersistedClaim[] = [
    { claim_key: claimKey('sitenize baktım, mobilde 8 saniyede açılıyor'), claim_text: 'sitenize baktım, mobilde 8 saniyede açılıyor', claim_category: 'observation', evidence_id: 'ev-1' },
    { claim_key: claimKey('Google yorumlarınızı inceledim'), claim_text: 'Google yorumlarınızı inceledim', claim_category: 'observation', evidence_id: 'ev-2' },
  ]

  it('değişmeyen iddia: bağ taşınır (entries + matchedPrior)', () => {
    const r = remapClaims('Merhaba, sitenize baktım, mobilde 8 saniyede açılıyor.', prior)
    expect(r.unmatched).toEqual([])
    expect(r.entries).toHaveLength(1)
    expect(r.entries[0].evidenceIds).toEqual(['ev-1'])
    expect(r.matchedPrior).toHaveLength(1)
    expect(r.matchedPrior[0].evidence_id).toBe('ev-1')
  })

  it('yeni eklenen iddia: eşlenemez → unmatched (gate bloklar)', () => {
    const r = remapClaims('Cironuz %40 artacak.', prior)
    expect(r.entries).toEqual([])
    expect(r.unmatched).toContain('%40')
  })

  it('iddia metni silinmiş: bağ TAŞINMAZ, entries boş kalır', () => {
    const r = remapClaims('Kısa bir görüşme uygun musunuz?', prior)
    expect(r.entries).toEqual([])
    expect(r.unmatched).toEqual([])
    expect(r.matchedPrior).toEqual([])
  })

  it('aynı iddia birden çok kanıda bağlıysa evidenceIds birleşir', () => {
    const multi: PersistedClaim[] = [
      ...prior,
      { claim_key: prior[0].claim_key, claim_text: prior[0].claim_text, claim_category: 'observation', evidence_id: 'ev-9' },
    ]
    const r = remapClaims('sitenize baktım, mobilde 8 saniyede açılıyor', multi)
    expect(r.entries[0].evidenceIds.sort()).toEqual(['ev-1', 'ev-9'])
  })
})

describe('loadClaimEntriesForMessage — fail-closed yükleme', () => {
  it('versiyonlu yol: EN SON versiyonun bağları döner', async () => {
    db.outreach_message_versions.push(
      { id: 'v1', outreach_message_id: 'm1', version: 1 },
      { id: 'v2', outreach_message_id: 'm1', version: 2 },
    )
    db.outreach_claim_evidence.push(
      { message_version_id: 'v1', claim_key: 'k1', claim_text: 'eski', claim_category: null, evidence_id: 'e1' },
      { message_version_id: 'v2', claim_key: 'k2', claim_text: 'yeni', claim_category: 'observation', evidence_id: 'e2' },
    )
    const r = await loadClaimEntriesForMessage('m1')
    expect(r.schemaMissing).toBe(false)
    expect(r.claims).toHaveLength(1)
    expect(r.claims[0].claim_text).toBe('yeni')
  })

  it('şema yok (42P01): schemaMissing=true, claims boş', async () => {
    versionSelectError = { message: 'relation does not exist', code: '42P01' }
    claimSelectError = { message: 'relation does not exist', code: '42P01' }
    const r = await loadClaimEntriesForMessage('m1')
    expect(r.schemaMissing).toBe(true)
    expect(r.claims).toEqual([])
  })

  it('gerçek okuma hatası: FIRLATIR (yutulmaz)', async () => {
    versionSelectError = { message: 'connection reset', code: 'XX000' }
    await expect(loadClaimEntriesForMessage('m1')).rejects.toThrow(/okunamadı/)
  })

  it('legacy mesaj-düzeyi satırlar: claim_key yoksa türetilir', async () => {
    db.outreach_claim_evidence.push({ outreach_message_id: 'm1', claim_text: 'baktım', evidence_id: 'e1' })
    const r = await loadClaimEntriesForMessage('m1')
    expect(r.schemaMissing).toBe(false)
    expect(r.claims[0].claim_key).toBe(claimKey('baktım'))
  })
})


it('legacy yol gerçek okuma hatası: fırlatır (versiyon tablosu yok, claim tablosu hasta)', async () => {
  versionSelectError = { message: 'relation does not exist', code: '42P01' }
  claimSelectError = { message: 'connection reset', code: 'XX000' }
  await expect(loadClaimEntriesForMessage('m1')).rejects.toThrow(/okunamadı/)
})

describe('loadEvidenceMeta', () => {
  it('lead kanıt metası döner; hata FIRLATIR', async () => {
    db.lead_evidence.push({ id: 'e1', lead_id: 'L1', kind: 'pagespeed', source: 's', summary: 'x', payload: null, verified: false })
    const r = await loadEvidenceMeta('L1')
    expect(r).toHaveLength(1)
    evidenceSelectError = { message: 'down' }
    await expect(loadEvidenceMeta('L1')).rejects.toThrow(/okunamadı/)
    expect(await loadEvidenceMeta(null)).toEqual([])
  })
})

describe('persistMessageVersion — immutable versiyon + telafi', () => {
  const baseInput = {
    outreachMessageId: 'm1',
    channel: 'email',
    recipient: { kind: 'primary_contact' as const, contactId: 'c1', email: 'A@B.com' },
    subject: 'konu',
    body: 'gövde',
    voiceDigest: 'vd',
    gate: { ok: true, digest: 'gd', violations: [] },
    source: 'generator:cold_email',
    claims: [
      { text: 'sitenize baktım', category: 'observation' as const, evidenceId: 'e1', evidenceType: 'html_signal', evidenceSource: 'scan' },
    ],
  }

  it('ilk versiyon 1; alıcı normalize; claim satırları claim_key ile yazılır', async () => {
    const r = await persistMessageVersion(baseInput)
    expect(r.schemaMissing).toBe(false)
    expect(r.version).toBe(1)
    const ver = db.outreach_message_versions[0]
    expect(ver.recipient_email).toBe('a@b.com')
    expect(ver.gate_ok).toBe(true)
    const claim = db.outreach_claim_evidence[0]
    expect(claim.message_version_id).toBe(ver.id)
    expect(claim.claim_key).toBe(claimKey('sitenize baktım'))
    expect(claim.claim_category).toBe('observation')
  })

  it('ikinci çağrı versiyon 2 üretir (immutable zincir)', async () => {
    await persistMessageVersion(baseInput)
    const r2 = await persistMessageVersion({ ...baseInput, body: 'gövde v2', claims: [] })
    expect(r2.version).toBe(2)
    expect(db.outreach_message_versions).toHaveLength(2)
  })

  it('23505 yarışı: bir kez yeniden dener ve başarır', async () => {
    await persistMessageVersion(baseInput)
    versionInsertErrorOnce = true // ilk insert düşer → retry max+1'i yeniden okur
    const r = await persistMessageVersion({ ...baseInput, claims: [] })
    expect(r.version).toBe(2)
  })

  it('şema canlı değil: schemaMissing=true, iz yazılmaz, hata YOK', async () => {
    versionSelectError = { message: 'relation does not exist', code: '42P01' }
    const r = await persistMessageVersion(baseInput)
    expect(r.schemaMissing).toBe(true)
    expect(r.versionId).toBeNull()
    expect(db.outreach_message_versions).toHaveLength(0)
  })

  it('claim insert hatası: versiyon satırı TELAFİYLE silinir + hata fırlar', async () => {
    claimInsertError = { message: 'db down', code: 'XX000' }
    await expect(persistMessageVersion(baseInput)).rejects.toThrow(/iddia bağları yazılamadı/)
    expect(db.outreach_message_versions).toHaveLength(0)
  })

  it('versiyon insert kalıcı hata (şema-dışı): fırlatır', async () => {
    versionInsertError = { message: 'permission denied', code: '42501' }
    await expect(persistMessageVersion(baseInput)).rejects.toThrow(/mesaj versiyonu yazılamadı/)
  })


  it('versiyon numarası okunamazsa (şema-dışı): fırlatır', async () => {
    versionSelectError = { message: 'connection reset', code: 'XX000' }
    await expect(persistMessageVersion(baseInput)).rejects.toThrow(/versiyon numarası okunamadı/)
  })

  it('versiyon insert 42P01 (şema yarı-canlı): schemaMissing=true döner', async () => {
    versionInsertError = { message: 'relation does not exist', code: '42P01' }
    const r = await persistMessageVersion(baseInput)
    expect(r.schemaMissing).toBe(true)
    expect(r.versionId).toBeNull()
  })

  it('23505 İKİ denemede de: yarış kaybedildi hatası', async () => {
    versionInsertError = { message: 'duplicate key', code: '23505' }
    await expect(persistMessageVersion({ ...baseInput, claims: [] })).rejects.toThrow(
      /yarışı iki denemede de kaybedildi/,
    )
  })

  it('contentDigest edit ile değişir → eski onay/kanıt bağları yeni içeriğe taşınamaz', async () => {
    const r1 = await persistMessageVersion(baseInput)
    const r2 = await persistMessageVersion({ ...baseInput, body: 'düzenlenmiş gövde', claims: [] })
    expect(r1.contentDigest).not.toBe(r2.contentDigest)
  })
})
