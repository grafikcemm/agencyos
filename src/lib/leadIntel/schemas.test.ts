import { describe, it, expect } from 'vitest'
import {
  DesignCriticOutSchema, ChairOutSchema,
  parseWithSchema, extractJsonBlock,
  validateDesignCritic, validateAutomation, validateChair,
  DesignCriticOut, AutomationOut, ChairOut,
} from './schemas'

const EV_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const EV_B = 'aaaaaaaa-0000-0000-0000-000000000002'

const baseCtx = {
  evidenceIds: new Set([EV_A, EV_B]),
  hasScreenshot: true,
  screenshotDelivered: true,
  hasPagespeed: true,
}

describe('extractJsonBlock / parseWithSchema (toleranslı parse)', () => {
  it('fence\'li ve gevezelik içeren yanıttan JSON çıkarır', () => {
    const messy = 'İşte değerlendirmem:\n```json\n{"design_score": 70, "findings": [], "summary": "ok"}\n```\nUmarım yardımcı olur!'
    const result = parseWithSchema(DesignCriticOutSchema, messy)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.design_score).toBe(70)
  })

  it('geçersiz JSON ve şema ihlali ok=false döner', () => {
    expect(parseWithSchema(DesignCriticOutSchema, 'hiç json yok').ok).toBe(false)
    expect(parseWithSchema(DesignCriticOutSchema, '{"design_score": 150, "findings": [], "summary": ""}').ok).toBe(false)
    expect(parseWithSchema(DesignCriticOutSchema, null).ok).toBe(false)
    expect(extractJsonBlock('düz metin')).toBeNull()
  })
})

describe('validateDesignCritic — kanıt kuralları (KOD, LLM\'e güven yok)', () => {
  const out = (findings: DesignCriticOut['findings']): DesignCriticOut => ({
    design_score: 80,
    findings,
    summary: 'test',
  })

  it('screenshot kanıtı yoksa visual bulgu DÜŞER', () => {
    const result = validateDesignCritic(
      out([{ claim: 'Tasarım eski görünüyor', evidence_id: EV_A, severity: 'high', kind: 'visual' }]),
      { ...baseCtx, hasScreenshot: false, screenshotDelivered: false }
    )
    expect(result.cleaned.findings).toHaveLength(0)
    expect(result.droppedCount).toBe(1)
  })

  it('screenshot VAR ama modele İLETİLMEMİŞSE visual bulgu yine düşer', () => {
    const result = validateDesignCritic(
      out([{ claim: 'Görsel hiyerarşi zayıf', evidence_id: EV_A, severity: 'medium', kind: 'visual' }]),
      { ...baseCtx, screenshotDelivered: false }
    )
    expect(result.cleaned.findings).toHaveLength(0)
  })

  it('pagespeed kanıtı yoksa performance bulgu düşer', () => {
    const result = validateDesignCritic(
      out([{ claim: 'Site çok yavaş', evidence_id: EV_A, severity: 'high', kind: 'performance' }]),
      { ...baseCtx, hasPagespeed: false }
    )
    expect(result.cleaned.findings).toHaveLength(0)
  })

  it('bilinmeyen evidence_id\'li bulgu düşer; geçerli olan kalır', () => {
    const result = validateDesignCritic(
      out([
        { claim: 'CTA eksik', evidence_id: 'bilinmeyen-id-123', severity: 'medium', kind: 'cta' },
        { claim: 'Form yok', evidence_id: EV_B, severity: 'medium', kind: 'form' },
      ]),
      baseCtx
    )
    expect(result.cleaned.findings).toHaveLength(1)
    expect(result.cleaned.findings[0].evidence_id).toBe(EV_B)
  })
})

describe('validateAutomation', () => {
  it('bilinmeyen evidence_id\'li fırsat düşer', () => {
    const out: AutomationOut = {
      ai_score: 70,
      opportunities: [
        { area: 'randevu', evidence_id: EV_A, impact: 'high' },
        { area: 'takip', evidence_id: 'uydurma-id', impact: 'low' },
      ],
      summary: 'test',
    }
    const result = validateAutomation(out, baseCtx)
    expect(result.cleaned.opportunities).toHaveLength(1)
    expect(result.droppedCount).toBe(1)
  })
})

describe('ChairOut şema + validateChair', () => {
  const chairBase: ChairOut = {
    decision: 'opportunity',
    primary_service_slug: 'web-sitesi',
    secondary_service_slug: 'ai-satis-asistani',
    final_design_score: 85,
    final_ai_score: 60,
    oversell_warning: false,
    oversell_note: null,
    rationale_evidence_ids: [EV_A],
  }
  const chairCtx = { evidenceIds: new Set([EV_A, EV_B]), allowedSlugs: new Set(['web-sitesi', 'ai-satis-asistani']) }

  it('opportunity kararı boş rationale_evidence_ids ile ŞEMADA geçersiz', () => {
    const parsed = ChairOutSchema.safeParse({ ...chairBase, rationale_evidence_ids: [] })
    expect(parsed.success).toBe(false)
  })

  it('Chair eşleşme listesi DIŞI slug seçemez → null (hizmet uyduramama)', () => {
    expect(validateChair({ ...chairBase, primary_service_slug: 'uydurma-hizmet' }, chairCtx)).toBeNull()
    expect(validateChair({ ...chairBase, secondary_service_slug: 'baska-uydurma' }, chairCtx)).toBeNull()
  })

  it('bilinmeyen kanıt referanslı karar → null', () => {
    expect(validateChair({ ...chairBase, rationale_evidence_ids: ['sahte-kanit-id'] }, chairCtx)).toBeNull()
  })

  it('geçerli karar aynen döner; reject kararı slug kontrolünden muaf', () => {
    expect(validateChair(chairBase, chairCtx)).toEqual(chairBase)
    const reject: ChairOut = { ...chairBase, decision: 'reject', primary_service_slug: 'yok', rationale_evidence_ids: [] }
    expect(validateChair(reject, chairCtx)).toEqual(reject)
  })
})
