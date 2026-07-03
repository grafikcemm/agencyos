// Lead Intelligence Council — aşama koşucusu.
// C1: Design Critic (multimodal: screenshot signed URL) ∥ Automation Analyst (paralel)
// C2: Offer Matcher (deterministik, kod)
// C3: Skeptic/Verifier   C4: Chair/Judge
//
// Güvenlik rayları:
// - Her LLM çağrısı öncesi günlük tavan ($0.40) kontrolü; aşımda kalan koşu deterministik.
// - Aylık $20 hard-cap callOpenRouter'da throw eder → burada yakalanır → deterministik.
// - Tüm çıktılar zod + parse-sonrası KOD validasyonundan geçer; geçersiz JSON'da
//   hata ekli 1 retry, yine olmazsa deterministik. Bu modül ASLA throw etmez.
// - Serbest metin karar verisi değildir; yalnız şema alanları kullanılır.

import { callWithOperationMultimodal, ContentPart } from '../openrouter'
import { isUnderDailyCap } from './budget'
import {
  DesignCriticOut, AutomationOut, SkepticOut, ChairOut,
  DesignCriticOutSchema, AutomationOutSchema, SkepticOutSchema, ChairOutSchema,
  parseWithSchema, validateDesignCritic, validateAutomation, validateChair,
  EvidenceContext,
} from './schemas'
import { matchServices, ServiceMatch, MatcherEvidence } from './offerMatcher'
import type { ResolvedServicePackage } from '../types'
import type { PersistedEvidence } from './evidenceStore'

export interface CouncilInput {
  businessName: string
  sector: string
  evidence: PersistedEvidence[]
  screenshotSignedUrl: string | null
  catalog: ResolvedServicePackage[]
  now?: Date
  // ai_cost_logs.related_lead_id yalnız gerçek leads.id UUID'sini taşır.
  relatedLeadId?: string | null
}

export interface CouncilResult {
  mode: 'council' | 'deterministic'
  designScore: number
  aiScore: number
  designCritic: DesignCriticOut | null
  automation: AutomationOut | null
  skeptic: SkepticOut | null
  chair: ChairOut
  matches: ServiceMatch[]
  notes: string[]
  // Bu assessment'ın GERÇEK LLM maliyeti (retry çağrıları dahil, USD).
  costUsd: number
}

// ── Deterministik fırsat skorları (LLM'siz taban / düşüş yolu) ───────────────
// Skor semantiği: "bu hizmeti satma fırsatı ne kadar güçlü" (0-100).

export function computeDeterministicScores(evidence: PersistedEvidence[]): {
  design: number
  ai: number
  reasons: string[]
} {
  const reasons: string[] = []
  let design = 40
  let ai = 35

  const byKind = new Map(evidence.filter((e) => e.verified).map((e) => [e.kind, e]))
  const html = byKind.get('html_signal')
  const htmlPayload = (html?.payload ?? {}) as Record<string, unknown>
  const psi = byKind.get('pagespeed')
  const psiPayload = (psi?.payload ?? {}) as Record<string, unknown>
  const review = byKind.get('review_signal')
  const reviewPayload = (review?.payload ?? {}) as Record<string, unknown>
  const cta = byKind.get('cta_analysis')
  const ctaPayload = (cta?.payload ?? {}) as Record<string, unknown>

  // Tasarım fırsatı: site yok/ölü/kötü → güçlü tasarım pitch'i.
  if (!html) {
    design += 20
    reasons.push('Site kanıtı yok → tasarım fırsatı yüksek')
  } else if (htmlPayload.fetch_failed) {
    design += 30
    reasons.push('Site yüklenemiyor → web sitesi fırsatı çok güçlü')
  } else {
    const band = String(htmlPayload.website_quality_band ?? 'ok')
    if (band === 'poor') {
      design += 25
      reasons.push('Kötü site kalite bandı → yeniden tasarım fırsatı')
    }
    if (htmlPayload.has_social_link === false) {
      design += 5
      reasons.push('Sosyal bağlantı yok → marka görünürlüğü zayıf')
    }
  }
  const perfScore = typeof psiPayload.performanceScore === 'number' ? (psiPayload.performanceScore as number) : null
  if (perfScore != null && perfScore < 50) {
    design += 15
    reasons.push(`Düşük PageSpeed (${perfScore}/100) → performans/yenileme fırsatı`)
  }

  // AI/otomasyon fırsatı: mesaj hacmi + eksik yanıt kanalları.
  const reviewCount = typeof reviewPayload.review_count === 'number' ? (reviewPayload.review_count as number) : 0
  if (reviewCount >= 50) {
    ai += 15
    reasons.push(`${reviewCount} yorum → yüksek müşteri etkileşim hacmi`)
  } else if (reviewCount >= 15) {
    ai += 8
  }
  if (html && !htmlPayload.fetch_failed) {
    if (htmlPayload.has_whatsapp === false) {
      ai += 12
      reasons.push('WhatsApp kanalı yok → hızlı yanıt fırsatı')
    }
    if (htmlPayload.has_online_booking === false) {
      ai += 12
      reasons.push('Online randevu yok → randevu otomasyonu fırsatı')
    }
    if (htmlPayload.has_form === false) {
      ai += 8
      reasons.push('Form yok → lead yakalama fırsatı')
    }
  }
  const waLinks = typeof ctaPayload.waLinks === 'number' ? (ctaPayload.waLinks as number) : null
  if (waLinks === 0) ai += 5

  return {
    design: Math.max(0, Math.min(100, Math.round(design))),
    ai: Math.max(0, Math.min(100, Math.round(ai))),
    reasons,
  }
}

// ── Kanıt özeti (ajan girdisi — asla ham HTML) ──────────────────────────────

export function buildEvidenceDigest(evidence: PersistedEvidence[]): string {
  return evidence
    .map((e) => {
      const metrics = Object.entries(e.payload ?? {})
        .filter(([, v]) => typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string')
        .slice(0, 8)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')
      return `- [${e.id}] (${e.kind}${e.verified ? ', doğrulanmış' : ', DOĞRULANMAMIŞ'}) ${e.summary}${metrics ? ` | ${metrics}` : ''}`
    })
    .join('\n')
}

// ── LLM aşama yardımcısı: bütçe kontrolü + çağrı + parse + 1 retry ──────────

async function runLlmStage<T>(opts: {
  operation: string
  systemPrompt: string
  parts: ContentPart[]
  schema: Parameters<typeof parseWithSchema<T>>[0]
  maxTokens: number
  now: Date
  notes: string[]
  relatedLeadId?: string | null
  // Retry'lar DAHİL her çağrının maliyeti buraya eklenir (assessment muhasebesi).
  addCost: (usd: number) => void
}): Promise<T | null> {
  try {
    const budget = await isUnderDailyCap(opts.now)
    if (!budget.under) {
      opts.notes.push(`${opts.operation}: günlük tavan aşıldı ($${budget.spentUsd.toFixed(3)}) → atlandı`)
      return null
    }
    const first = await callWithOperationMultimodal(opts.operation, opts.systemPrompt, opts.parts, opts.maxTokens, {
      agentKey: opts.operation,
      relatedLeadId: opts.relatedLeadId,
    })
    opts.addCost(first.costUsd)
    const parsed = parseWithSchema<T>(opts.schema, first.content)
    if (parsed.ok) return parsed.data

    // Hata ekli tek retry — maliyeti de sayılır.
    const retryParts: ContentPart[] = [
      ...opts.parts,
      { type: 'text', text: `\nÖNCEKİ YANITIN GEÇERSİZDİ: ${parsed.error}\nYALNIZ geçerli JSON döndür.` },
    ]
    const second = await callWithOperationMultimodal(opts.operation, opts.systemPrompt, retryParts, opts.maxTokens, {
      agentKey: opts.operation,
      relatedLeadId: opts.relatedLeadId,
    })
    opts.addCost(second.costUsd)
    const reparsed = parseWithSchema<T>(opts.schema, second.content)
    if (reparsed.ok) return reparsed.data
    opts.notes.push(`${opts.operation}: geçersiz JSON (retry sonrası) → deterministik`)
    return null
  } catch (error) {
    // Aylık cap throw'u veya ağ hatası — asla yukarı fırlatma.
    opts.notes.push(`${opts.operation}: ${error instanceof Error ? error.message : 'hata'} → deterministik`)
    return null
  }
}

// ── Promptlar (TR; kodda yaşar — test/versiyon) ─────────────────────────────

const COMMON_RULES = `KURALLAR:
- YALNIZ geçerli JSON döndür, başka hiçbir şey yazma.
- Her iddia için evidence_id alanına aşağıdaki kanıt listesindeki köşeli parantez içi id'lerden birini yaz.
- Kanıt listesinde OLMAYAN hiçbir şeyi iddia etme. Emin değilsen iddia etme.
- Yüzde, ROI, kat gibi ölçülmemiş vaatler YASAK.`

function designCriticSystem(hasImage: boolean): string {
  return `Sen kıdemli bir tasarım eleştirmenisin (Design Critic). Bir işletmenin dijital varlığını SOMUT kanıtlara dayanarak değerlendirip tasarım hizmeti satış fırsatını puanlıyorsun (design_score: 0=fırsat yok, 100=çok güçlü fırsat).
${hasImage ? 'Ekteki ekran görüntüsü sitenin masaüstü halidir — görsel bulgularını (kind:"visual") BU görüntüye dayandır.' : 'Ekran görüntüsü YOK — kind:"visual" bulgu ÜRETME.'}
${COMMON_RULES}
JSON şeması: {"design_score": 0-100, "findings": [{"claim": "...", "evidence_id": "...", "severity": "low|medium|high", "kind": "visual|performance|cta|form|content"}], "summary": "≤400 karakter"}`
}

const AUTOMATION_SYSTEM = `Sen bir otomasyon analistisin (Automation Analyst). Bir işletmenin AI/otomasyon hizmeti satış fırsatını SOMUT kanıtlara dayanarak puanlıyorsun (ai_score: 0=fırsat yok, 100=çok güçlü fırsat). Yorum hacmi, eksik yanıt kanalları (WhatsApp/form/randevu), operasyonel yük sinyallerine bak.
${COMMON_RULES}
JSON şeması: {"ai_score": 0-100, "opportunities": [{"area": "lead_yaniti|randevu|takip|yorum|icerik|belge", "evidence_id": "...", "impact": "low|medium|high"}], "summary": "≤400 karakter"}`

const SKEPTIC_SYSTEM = `Sen şüpheci bir doğrulayıcısın (Skeptic). Aşağıdaki bulguları kanıtlarla karşılaştır: kanıtın desteklemediği, abartılı veya çelişkili iddiaları REDDET (verdict:"rejected"). Sağlam olanları ONAYLA (verdict:"upheld"). Gerekiyorsa skorları düzelt.
${COMMON_RULES}
JSON şeması: {"challenges": [{"target_claim": "...", "verdict": "upheld|rejected", "reason": "..."}], "adjusted_design_score": 0-100 veya null, "adjusted_ai_score": 0-100 veya null}`

const CHAIR_SYSTEM = `Sen konsey başkanısın (Chair/Judge). Kritik, analist ve şüphecinin çıktılarıyla deterministik hizmet eşleşmelerini değerlendirip NİHAİ kararı veriyorsun.
- primary_service_slug ve secondary_service_slug YALNIZ verilen eşleşme listesindeki slug'lardan seçilebilir.
- Kanıt zayıfsa veya şüpheci güçlü itirazlar sunduysa decision:"reject" ver.
- Satış vaadi kanıtı aşıyorsa oversell_warning:true + kısa oversell_note yaz ("satma" uyarısı).
- rationale_evidence_ids: kararını dayandırdığın kanıt id'leri (opportunity için en az 1 zorunlu).
${COMMON_RULES}
JSON şeması: {"decision": "opportunity|reject", "primary_service_slug": "...", "secondary_service_slug": "... veya null", "final_design_score": 0-100, "final_ai_score": 0-100, "oversell_warning": true|false, "oversell_note": "... veya null", "rationale_evidence_ids": ["..."]}`

// ── Deterministik Chair düşüşü ───────────────────────────────────────────────

function deterministicChair(
  matches: ServiceMatch[],
  designScore: number,
  aiScore: number
): ChairOut {
  const primary = matches[0]
  if (!primary) {
    return {
      decision: 'reject',
      primary_service_slug: 'yok',
      secondary_service_slug: null,
      final_design_score: designScore,
      final_ai_score: aiScore,
      oversell_warning: false,
      oversell_note: null,
      rationale_evidence_ids: [],
    }
  }
  const secondary = matches.find((m) => m.service_slug !== primary.service_slug && m.domain !== primary.domain)
  return {
    decision: 'opportunity',
    primary_service_slug: primary.service_slug,
    secondary_service_slug: secondary?.service_slug ?? null,
    final_design_score: designScore,
    final_ai_score: aiScore,
    // Deterministik modda LLM doğrulaması yok → temkinli satış uyarısı her zaman açık.
    oversell_warning: true,
    oversell_note: 'Deterministik mod: iddiaları görüşme öncesi kanıtlarla tek tek doğrula.',
    rationale_evidence_ids: primary.evidence_refs.slice(0, 5),
  }
}

// ── Ana koşucu ───────────────────────────────────────────────────────────────

export async function runCouncil(input: CouncilInput): Promise<CouncilResult> {
  const now = input.now ?? new Date()
  const notes: string[] = []
  const detScores = computeDeterministicScores(input.evidence)

  // Maliyet muhasebesi: agent_key sabit uzmanı, related_lead_id gerçek lead'i taşır.
  let costUsd = 0
  const addCost = (usd: number) => {
    costUsd += usd
  }

  const evidenceIds = new Set(input.evidence.map((e) => e.id))
  const hasScreenshot = input.evidence.some((e) => e.kind === 'screenshot' && e.verified)
  const screenshotDelivered = Boolean(input.screenshotSignedUrl) && hasScreenshot
  const hasPagespeed = input.evidence.some((e) => e.kind === 'pagespeed' && e.verified)
  const ctx: EvidenceContext = { evidenceIds, hasScreenshot, screenshotDelivered, hasPagespeed }

  const digest = buildEvidenceDigest(input.evidence)
  const baseInfo = `İşletme: ${input.businessName}\nSektör: ${input.sector}\n\nKANIT LİSTESİ:\n${digest}`

  // C1 — paralel kritikler. Design Critic multimodal (signed URL varsa).
  const designParts: ContentPart[] = [{ type: 'text', text: baseInfo }]
  if (screenshotDelivered && input.screenshotSignedUrl) {
    designParts.push({ type: 'image_url', image_url: { url: input.screenshotSignedUrl } })
  }
  const [designRaw, automationRaw] = await Promise.all([
    runLlmStage<DesignCriticOut>({
      operation: 'lead_intel_design_critic',
      systemPrompt: designCriticSystem(screenshotDelivered),
      parts: designParts,
      schema: DesignCriticOutSchema,
      maxTokens: 900,
      now,
      notes,
      relatedLeadId: input.relatedLeadId,
      addCost,
    }),
    runLlmStage<AutomationOut>({
      operation: 'lead_intel_automation_analyst',
      systemPrompt: AUTOMATION_SYSTEM,
      parts: [{ type: 'text', text: baseInfo }],
      schema: AutomationOutSchema,
      maxTokens: 900,
      now,
      notes,
      relatedLeadId: input.relatedLeadId,
      addCost,
    }),
  ])

  const design = designRaw ? validateDesignCritic(designRaw, ctx) : null
  const automation = automationRaw ? validateAutomation(automationRaw, ctx) : null
  if (design && design.droppedCount > 0) notes.push(`Design Critic: ${design.droppedCount} kanıtsız bulgu düşürüldü`)
  if (automation && automation.droppedCount > 0) notes.push(`Automation: ${automation.droppedCount} kanıtsız fırsat düşürüldü`)

  // Skorlar: LLM varsa LLM, yoksa deterministik.
  let designScore = design?.cleaned.design_score ?? detScores.design
  let aiScore = automation?.cleaned.ai_score ?? detScores.ai
  const councilMode = Boolean(design || automation)

  // C2 — deterministik Offer Matcher (bedava, her zaman koşar).
  const matcherEvidence: MatcherEvidence[] = input.evidence.map((e) => ({ id: e.id, kind: e.kind, verified: e.verified }))
  let matches = matchServices({
    designScore,
    aiScore,
    sector: input.sector,
    evidence: matcherEvidence,
    catalog: input.catalog,
  })

  // C3 — Skeptic (yalnız konsey modunda ve bulgu varsa anlamlı).
  let skeptic: SkepticOut | null = null
  if (councilMode) {
    const findingsBlock = JSON.stringify(
      {
        design_findings: design?.cleaned.findings ?? [],
        design_score: designScore,
        automation_opportunities: automation?.cleaned.opportunities ?? [],
        ai_score: aiScore,
      },
      null,
      1
    )
    skeptic = await runLlmStage<SkepticOut>({
      operation: 'lead_intel_skeptic',
      systemPrompt: SKEPTIC_SYSTEM,
      parts: [{ type: 'text', text: `${baseInfo}\n\nDEĞERLENDİRİLECEK BULGULAR:\n${findingsBlock}` }],
      schema: SkepticOutSchema,
      maxTokens: 800,
      now,
      notes,
      relatedLeadId: input.relatedLeadId,
      addCost,
    })
    if (skeptic) {
      if (typeof skeptic.adjusted_design_score === 'number') designScore = skeptic.adjusted_design_score
      if (typeof skeptic.adjusted_ai_score === 'number') aiScore = skeptic.adjusted_ai_score
      // Skor düzeltmesi eşleşme sırasını değiştirebilir → matcher'ı yeniden koş.
      matches = matchServices({
        designScore,
        aiScore,
        sector: input.sector,
        evidence: matcherEvidence,
        catalog: input.catalog,
      })
    }
  }

  // C4 — Chair. Konsey modunda LLM; değilse veya geçersizse deterministik.
  const allowedSlugs = new Set(matches.map((m) => m.service_slug))
  let chair: ChairOut | null = null
  if (councilMode && matches.length > 0) {
    const chairInput = JSON.stringify(
      {
        design: design?.cleaned ?? null,
        automation: automation?.cleaned ?? null,
        skeptic,
        service_matches: matches,
        design_score: designScore,
        ai_score: aiScore,
      },
      null,
      1
    )
    const chairRaw = await runLlmStage<ChairOut>({
      operation: 'lead_intel_chair',
      systemPrompt: CHAIR_SYSTEM,
      parts: [{ type: 'text', text: `${baseInfo}\n\nKONSEY ÇIKTILARI + EŞLEŞMELER:\n${chairInput}` }],
      schema: ChairOutSchema,
      maxTokens: 700,
      now,
      notes,
      relatedLeadId: input.relatedLeadId,
      addCost,
    })
    if (chairRaw) {
      chair = validateChair(chairRaw, { evidenceIds, allowedSlugs })
      if (!chair) notes.push('Chair: geçersiz slug/kanıt referansı → deterministik chair')
    }
  }
  if (!chair) chair = deterministicChair(matches, designScore, aiScore)

  return {
    mode: councilMode ? 'council' : 'deterministic',
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
    designScore,
    aiScore,
    designCritic: design?.cleaned ?? null,
    automation: automation?.cleaned ?? null,
    skeptic,
    chair,
    matches,
    notes: [...notes, ...(!councilMode ? detScores.reasons : [])],
  }
}
