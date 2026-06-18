import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Jarvis LLM tool-call argüman şemaları (runtime doğrulama).
//
// Tool şemasındaki enum'lar model'e verilen TALİMAT'tır; runtime zorlama DEĞİL.
// Model yanlış/enjekte argüman üretirse service-role mutasyonlarına ham gider.
// Bu şemalar executeTool girişinde her tool'un argümanlarını doğrular; özellikle
// destructive/para/status değiştiren tool'lar (update_lead_stage, create_project)
// enum/bound ile sınırlanır. Şeması olmayan tool (örn. arg almayan get_*) atlanır.
// ─────────────────────────────────────────────────────────────────────────────

export const LEAD_STAGES = ['new', 'contacted', 'responded', 'meeting', 'proposal', 'converted', 'lost'] as const

const leadId = z.string().min(1).max(64)
const name = z.string().min(1).max(200)
const limit = z.number().int().positive().max(500).optional()

export const TOOL_ARG_SCHEMAS: Record<string, z.ZodTypeAny> = {
  // İsimle arama (salt-okur)
  find_lead_by_name: z.object({ name }),
  generate_call_pitch_by_name: z.object({ name }),
  explain_conversion_by_name: z.object({ name }),

  // Tarama / listeleme
  scan_leads: z.object({
    niche: z.string().min(1).max(120),
    city: z.string().min(1).max(120),
    district: z.string().max(120).optional(),
    limit,
  }),
  get_quality_leads: z.object({ tier: z.enum(['A', 'B', 'C', 'D']).optional(), limit }),
  get_sector_opportunities: z.object({ limit }),
  disqualify_low_quality: z.object({ limit }),
  daily_call_list: z.object({ limit }),
  get_trend_signals: z.object({ limit }),

  // Lead-id bazlı (salt-okur / üretim)
  generate_call_pitch: z.object({ lead_id: leadId }),
  analyze_lead: z.object({ lead_id: leadId }),
  generate_briefing: z.object({ lead_id: leadId }),
  draft_email: z.object({ lead_id: leadId, tone: z.string().max(40).optional() }),
  draft_proposal: z.object({ lead_id: leadId, services: z.array(z.string().max(120)).max(50).optional() }),
  generate_pitch: z.object({ lead_id: leadId, service_id: z.string().max(64).optional() }),

  // İçerik üretimi
  build_carousel_brief: z.object({ topic: z.string().min(1).max(300), slides: z.number().int().min(1).max(20).optional() }),
  build_visual_prompt: z.object({ description: z.string().min(1).max(500), style: z.string().max(60).optional() }),
  wrap_session: z.object({ summary: z.string().min(1).max(5000) }),

  // Destructive / para / status — en sıkı sınırlar
  update_lead_stage: z.object({ lead_id: leadId, stage: z.enum(LEAD_STAGES) }),
  create_project: z.object({
    lead_id: leadId,
    title: z.string().min(1).max(200),
    revenue_tl: z.number().min(0).max(10_000_000).optional(),
  }),
}
