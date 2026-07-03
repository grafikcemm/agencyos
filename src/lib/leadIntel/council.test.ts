import { describe, it, expect, vi, beforeEach } from 'vitest'

// LLM + bütçe mock'ları — konsey davranışı ağsız/DB'siz test edilir.
const llmMock = vi.fn()
vi.mock('../openrouter', () => ({
  callWithOperationMultimodal: (...args: unknown[]) => llmMock(...args),
}))

const capMock = vi.fn()
vi.mock('./budget', () => ({
  isUnderDailyCap: (...args: unknown[]) => capMock(...args),
}))

import { runCouncil, computeDeterministicScores, buildEvidenceDigest, CouncilInput } from './council'
import { mergeCatalog } from '../services/catalogOverrides'
import type { PersistedEvidence } from './evidenceStore'

const EV = (id: string, kind: string, payload: Record<string, unknown> = {}, verified = true): PersistedEvidence => ({
  id, kind: kind as PersistedEvidence['kind'], source: 'html_fetch', url: null, storage_path: null,
  summary: `${kind} özeti`, payload, confidence: 0.9, verified,
})

const EVIDENCE: PersistedEvidence[] = [
  EV('ev-screenshot-01', 'screenshot', { mime: 'image/jpeg' }),
  EV('ev-pagespeed-01', 'pagespeed', { performanceScore: 30, lcpMs: 6000 }),
  EV('ev-html-01', 'html_signal', { website_quality_band: 'poor', has_whatsapp: false, has_online_booking: false, has_form: false }),
  EV('ev-review-01', 'review_signal', { rating: 4.1, review_count: 120 }),
  EV('ev-places-01', 'places_data', { has_phone: true }),
]

const INPUT: CouncilInput = {
  businessName: 'Test Güzellik Salonu',
  sector: 'beauty',
  evidence: EVIDENCE,
  screenshotSignedUrl: 'https://signed.example/shot.jpg',
  catalog: mergeCatalog([]),
  now: new Date('2026-07-03T06:00:00Z'),
  relatedLeadId: '11111111-1111-4111-8111-111111111111',
}

const VALID_DESIGN = JSON.stringify({
  design_score: 82,
  findings: [{ claim: 'Görsel hiyerarşi dağınık', evidence_id: 'ev-screenshot-01', severity: 'high', kind: 'visual' }],
  summary: 'Site eski ve dağınık.',
})
const VALID_AUTOMATION = JSON.stringify({
  ai_score: 74,
  opportunities: [{ area: 'randevu', evidence_id: 'ev-html-01', impact: 'high' }],
  summary: 'Randevu otomasyonu boşluğu.',
})
const VALID_SKEPTIC = JSON.stringify({ challenges: [{ target_claim: 'Görsel hiyerarşi dağınık', verdict: 'upheld', reason: 'Screenshot destekliyor' }], adjusted_design_score: null, adjusted_ai_score: null })
// 'sosyal-medya-paketi': beauty sektör bonusu + tasarım baz skoruyla her koşuda
// top-4 eşleşmeye GİRER (deterministik) — chair'in geçerli seçimi olarak güvenli.
const CHAIR_NOTE = 'LLM-CHAIR-NOTU: performans iddiasını ölçümle destekle.'
const VALID_CHAIR = JSON.stringify({
  decision: 'opportunity',
  primary_service_slug: 'sosyal-medya-paketi',
  secondary_service_slug: null,
  final_design_score: 82,
  final_ai_score: 74,
  oversell_warning: true,
  oversell_note: CHAIR_NOTE,
  rationale_evidence_ids: ['ev-screenshot-01', 'ev-pagespeed-01'],
})

// C1 kritikleri PARALEL koştuğu için sıra-bazlı mock kırılgan — operation-anahtarlı mock.
// Her çağrı sabit STAGE_COST maliyeti döner → maliyet muhasebesi (retry dahil) test edilir.
const STAGE_COST = 0.001
function mockByOperation(map: Record<string, string | string[]>) {
  const counters: Record<string, number> = {}
  llmMock.mockImplementation((operation: string) => {
    const entry = map[operation]
    if (entry === undefined) throw new Error(`Beklenmeyen operation: ${operation}`)
    const idx = counters[operation] ?? 0
    counters[operation] = idx + 1
    const content = Array.isArray(entry) ? entry[Math.min(idx, entry.length - 1)] : entry
    return Promise.resolve({ content, usage: { promptTokens: 1, completionTokens: 1 }, costUsd: STAGE_COST })
  })
}

beforeEach(() => {
  llmMock.mockReset()
  capMock.mockReset()
  capMock.mockResolvedValue({ under: true, spentUsd: 0, capUsd: 0.4 })
})

describe('runCouncil — konsey modu', () => {
  it('4 aşama koşar, chair kararı ve eşleşmeler döner', async () => {
    mockByOperation({
      lead_intel_design_critic: VALID_DESIGN,
      lead_intel_automation_analyst: VALID_AUTOMATION,
      lead_intel_skeptic: VALID_SKEPTIC,
      lead_intel_chair: VALID_CHAIR,
    })

    const result = await runCouncil(INPUT)
    expect(result.mode).toBe('council')
    expect(result.designScore).toBe(82)
    expect(result.aiScore).toBe(74)
    expect(result.chair.decision).toBe('opportunity')
    expect(result.chair.primary_service_slug).toBe('sosyal-medya-paketi')
    // Deterministik chair DEĞİL, LLM chair'in kararı kullanılmış (nota bakarak ayırt).
    expect(result.chair.oversell_note).toBe(CHAIR_NOTE)
    expect(result.matches.length).toBeGreaterThan(0)
    expect(result.matches.map((m) => m.service_slug)).toContain('sosyal-medya-paketi')
    // Design Critic multimodal: design çağrısının parçalarında image_url olmalı
    const designCall = llmMock.mock.calls.find((c) => c[0] === 'lead_intel_design_critic')!
    const designParts = designCall[2] as Array<{ type: string }>
    expect(designParts.some((p) => p.type === 'image_url')).toBe(true)
    // Maliyet muhasebesi: 4 aşama × 1 çağrı = 4 × STAGE_COST.
    expect(result.costUsd).toBeCloseTo(4 * STAGE_COST, 6)
    // Telemetri: ajan kimliği sabit, lead ilişkisi ayrı UUID alanındadır.
    const meta = designCall[4] as { agentKey?: string; relatedLeadId?: string | null }
    expect(meta.agentKey).toBe('lead_intel_design_critic')
    expect(meta.relatedLeadId).toBe(INPUT.relatedLeadId)
    for (const call of llmMock.mock.calls) {
      const operation = call[0] as string
      const callMeta = call[4] as { agentKey?: string; relatedLeadId?: string | null }
      expect(callMeta.agentKey).toBe(operation)
      expect(callMeta.relatedLeadId).toBe(INPUT.relatedLeadId)
    }
  })

  it('signed URL yoksa Design Critic metin-modda koşar (image part yok)', async () => {
    mockByOperation({
      lead_intel_design_critic: VALID_DESIGN,
      lead_intel_automation_analyst: VALID_AUTOMATION,
      lead_intel_skeptic: VALID_SKEPTIC,
      lead_intel_chair: VALID_CHAIR,
    })
    const result = await runCouncil({ ...INPUT, screenshotSignedUrl: null })
    const designCall = llmMock.mock.calls.find((c) => c[0] === 'lead_intel_design_critic')!
    const designParts = designCall[2] as Array<{ type: string }>
    expect(designParts.every((p) => p.type === 'text')).toBe(true)
    // Görüntü iletilmediği için visual bulgu KOD tarafından düşürülmüş olmalı.
    expect(result.designCritic?.findings ?? []).toHaveLength(0)
  })

  it('geçersiz JSON → 1 retry → yine geçersiz → o aşama deterministik', async () => {
    mockByOperation({
      lead_intel_design_critic: ['bozuk yanıt', 'yine bozuk'],
      lead_intel_automation_analyst: VALID_AUTOMATION,
      lead_intel_skeptic: VALID_SKEPTIC,
      lead_intel_chair: VALID_CHAIR,
    })

    const result = await runCouncil(INPUT)
    expect(result.designCritic).toBeNull() // design düştü
    expect(result.automation).not.toBeNull()
    expect(result.mode).toBe('council') // automation ayakta → konsey modu
    expect(result.notes.join(' ')).toContain('lead_intel_design_critic')
    // Design skoru deterministik tabandan gelir, automation LLM'den.
    expect(result.aiScore).toBe(74)
    // RETRY MALİYETİ DAHİL: design 2 çağrı (bozuk+retry) + automation 1 + skeptic 1 + chair 1 = 5.
    expect(result.costUsd).toBeCloseTo(5 * STAGE_COST, 6)
  })

  it('Chair eşleşme dışı slug döndürürse deterministik chair devreye girer', async () => {
    const badChair = JSON.stringify({ ...JSON.parse(VALID_CHAIR), primary_service_slug: 'uydurma-hizmet' })
    mockByOperation({
      lead_intel_design_critic: VALID_DESIGN,
      lead_intel_automation_analyst: VALID_AUTOMATION,
      lead_intel_skeptic: VALID_SKEPTIC,
      lead_intel_chair: badChair,
    })

    const result = await runCouncil(INPUT)
    // Deterministik chair: matcher'ın 1. sırası + temkinli oversell uyarısı
    expect(result.chair.primary_service_slug).toBe(result.matches[0].service_slug)
    expect(result.chair.oversell_warning).toBe(true)
    expect(result.notes.join(' ')).toContain('deterministik chair')
  })
})

describe('runCouncil — bütçe/hata düşüşleri', () => {
  it('günlük tavan aşılmışsa LLM HİÇ çağrılmaz, mod deterministik', async () => {
    capMock.mockResolvedValue({ under: false, spentUsd: 0.41, capUsd: 0.4 })
    const result = await runCouncil(INPUT)
    expect(llmMock).not.toHaveBeenCalled()
    expect(result.mode).toBe('deterministic')
    expect(result.chair.decision).toBe('opportunity') // deterministik yol yine karar üretir
    expect(result.chair.oversell_warning).toBe(true)
    expect(result.matches.length).toBeGreaterThan(0)
  })

  it('aylık cap throw\'u yakalanır → deterministik (asla yukarı fırlamaz)', async () => {
    llmMock.mockImplementation(() => {
      throw new Error('Aylık AI maliyet limiti aşıldı ($20).')
    })
    const result = await runCouncil(INPUT)
    expect(result.mode).toBe('deterministic')
    expect(result.notes.join(' ')).toContain('Aylık AI maliyet limiti')
  })

  it('eşleşme yoksa chair reject döner, kota zorla doldurulmaz', async () => {
    capMock.mockResolvedValue({ under: false, spentUsd: 1, capUsd: 0.4 })
    const result = await runCouncil({ ...INPUT, evidence: [], screenshotSignedUrl: null })
    expect(result.chair.decision).toBe('reject')
    expect(result.matches).toHaveLength(0)
  })
})

describe('computeDeterministicScores', () => {
  it('kötü site + yüksek yorum → yüksek tasarım VE AI fırsat skorları', () => {
    const scores = computeDeterministicScores(EVIDENCE)
    expect(scores.design).toBeGreaterThanOrEqual(70)
    expect(scores.ai).toBeGreaterThanOrEqual(70)
    expect(scores.reasons.length).toBeGreaterThan(0)
  })

  it('kanıt yoksa temkinli taban skorlar', () => {
    const scores = computeDeterministicScores([])
    expect(scores.design).toBeLessThanOrEqual(70)
    expect(scores.ai).toBeLessThanOrEqual(50)
  })
})

describe('buildEvidenceDigest', () => {
  it('id + kind + doğrulanma + özet içerir, ham HTML içermez', () => {
    const digest = buildEvidenceDigest(EVIDENCE)
    expect(digest).toContain('[ev-screenshot-01]')
    expect(digest).toContain('doğrulanmış')
    expect(digest).toContain('pagespeed')
    expect(digest.length).toBeLessThan(3000)
  })
})
