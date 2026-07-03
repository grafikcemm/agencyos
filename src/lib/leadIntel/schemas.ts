// Konsey çıktı şemaları (zod) + toleranslı JSON parse + parse-SONRASI kod validasyonu.
// KURAL: serbest metin asla karar verisi olmaz — yalnız şema alanları persist/kullanılır.
// KURAL: her iddia mevcut bir evidence_id referanslamak zorunda; screenshot kanıtı
// (ve modele gerçekten iletilmiş görüntü) olmadan 'visual' bulgu yaşayamaz;
// 'performance' bulgu pagespeed kanıtı ister. LLM'e güvenilmez — hepsi kodda doğrulanır.

import { z } from 'zod'

export const FindingSchema = z.object({
  claim: z.string().min(3).max(500),
  evidence_id: z.string().min(8),
  severity: z.enum(['low', 'medium', 'high']),
  kind: z.enum(['visual', 'performance', 'cta', 'form', 'content']),
})
export type Finding = z.infer<typeof FindingSchema>

export const DesignCriticOutSchema = z.object({
  design_score: z.number().int().min(0).max(100),
  findings: z.array(FindingSchema).max(12),
  summary: z.string().max(400),
})
export type DesignCriticOut = z.infer<typeof DesignCriticOutSchema>

export const AutomationOutSchema = z.object({
  ai_score: z.number().int().min(0).max(100),
  opportunities: z
    .array(
      z.object({
        area: z.enum(['lead_yaniti', 'randevu', 'takip', 'yorum', 'icerik', 'belge']),
        evidence_id: z.string().min(8),
        impact: z.enum(['low', 'medium', 'high']),
      })
    )
    .max(10),
  summary: z.string().max(400),
})
export type AutomationOut = z.infer<typeof AutomationOutSchema>

export const SkepticOutSchema = z.object({
  challenges: z
    .array(
      z.object({
        target_claim: z.string().max(500),
        verdict: z.enum(['upheld', 'rejected']),
        reason: z.string().max(300),
      })
    )
    .max(12),
  adjusted_design_score: z.number().int().min(0).max(100).nullish(),
  adjusted_ai_score: z.number().int().min(0).max(100).nullish(),
})
export type SkepticOut = z.infer<typeof SkepticOutSchema>

export const ChairOutSchema = z
  .object({
    decision: z.enum(['opportunity', 'reject']),
    primary_service_slug: z.string(),
    secondary_service_slug: z.string().nullish(),
    final_design_score: z.number().int().min(0).max(100),
    final_ai_score: z.number().int().min(0).max(100),
    oversell_warning: z.boolean(),
    oversell_note: z.string().max(300).nullish(),
    rationale_evidence_ids: z.array(z.string().min(8)),
  })
  .refine((v) => v.decision !== 'opportunity' || v.rationale_evidence_ids.length > 0, {
    message: 'opportunity kararı en az 1 kanıt referansı ister',
  })
export type ChairOut = z.infer<typeof ChairOutSchema>

// ── Toleranslı JSON çıkarımı (planParser fence-strip deyimi) ────────────────

export function extractJsonBlock(text: string): string | null {
  let cleaned = text.trim()
  cleaned = cleaned.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return cleaned.slice(start, end + 1)
}

export function parseWithSchema<T>(
  schema: z.ZodType<T>,
  text: string | null | undefined
): { ok: true; data: T } | { ok: false; error: string } {
  if (!text) return { ok: false, error: 'Boş yanıt' }
  const block = extractJsonBlock(text)
  if (!block) return { ok: false, error: 'JSON bloğu bulunamadı' }
  let parsed: unknown
  try {
    parsed = JSON.parse(block)
  } catch (e) {
    return { ok: false, error: `JSON parse hatası: ${e instanceof Error ? e.message : 'bilinmeyen'}` }
  }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  }
  return { ok: true, data: result.data }
}

// ── Parse-SONRASI kod validasyonu (LLM'e güvenilmez) ────────────────────────

export interface EvidenceContext {
  evidenceIds: Set<string>
  hasScreenshot: boolean
  // Görüntü modele GERÇEKTEN iletildi mi (signed URL üretildi + prompt'a eklendi).
  screenshotDelivered: boolean
  hasPagespeed: boolean
}

// Design Critic bulgularını kanıt bağlamına göre temizler:
// - bilinmeyen evidence_id → bulgu düşer
// - kind 'visual' → screenshot kanıtı VE modele iletilmiş görüntü şart
// - kind 'performance' → pagespeed kanıtı şart
export function validateDesignCritic(
  out: DesignCriticOut,
  ctx: EvidenceContext
): { cleaned: DesignCriticOut; droppedCount: number } {
  const kept = out.findings.filter((f) => {
    if (!ctx.evidenceIds.has(f.evidence_id)) return false
    if (f.kind === 'visual' && (!ctx.hasScreenshot || !ctx.screenshotDelivered)) return false
    if (f.kind === 'performance' && !ctx.hasPagespeed) return false
    return true
  })
  return {
    cleaned: { ...out, findings: kept },
    droppedCount: out.findings.length - kept.length,
  }
}

export function validateAutomation(
  out: AutomationOut,
  ctx: EvidenceContext
): { cleaned: AutomationOut; droppedCount: number } {
  const kept = out.opportunities.filter((o) => ctx.evidenceIds.has(o.evidence_id))
  return {
    cleaned: { ...out, opportunities: kept },
    droppedCount: out.opportunities.length - kept.length,
  }
}

export interface ChairContext {
  evidenceIds: Set<string>
  // Chair YALNIZ deterministik Offer Matcher'ın önerdiği slug'lar arasından seçebilir.
  allowedSlugs: Set<string>
}

// Chair kararını doğrular; herhangi bir ihlal → null (deterministik moda düşülür).
// Chair hizmet UYDURAMASI, olmayan kanıta dayanamaz.
export function validateChair(out: ChairOut, ctx: ChairContext): ChairOut | null {
  if (out.decision === 'opportunity') {
    if (!ctx.allowedSlugs.has(out.primary_service_slug)) return null
    if (out.secondary_service_slug && !ctx.allowedSlugs.has(out.secondary_service_slug)) return null
    for (const id of out.rationale_evidence_ids) {
      if (!ctx.evidenceIds.has(id)) return null
    }
  }
  return out
}
