// Trace — OTel GenAI span (§16). SAF çekirdek: attribute redaction + süre + retention.
// GÜVENLİK (§12): ham prompt/secret/hassas payload span'e YAZILMAZ (redactAttributes
// hassas anahtarları düşürür, string değerleri maskeler). DB yüzeyi recordSpan (thin).

import { redactPreview } from '../brain/gate'
import { supabaseAdmin } from '../supabase'

export type SpanKind = 'llm' | 'tool' | 'retrieval' | 'internal' | 'approval'
export type SpanStatus = 'ok' | 'error'

export const DEFAULT_SPAN_RETENTION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

// Ham prompt/mesaj/gövde/secret taşıyan anahtarlar tamamen düşürülür.
const SENSITIVE_KEY = /(prompt|messages?|secret|token|api[_-]?key|authorization|password|body|payload)/i

export function redactAttributes(attrs: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(attrs)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = '‹redacted›'
    } else if (typeof value === 'string') {
      out[key] = redactPreview(value, 200)
    } else {
      out[key] = value
    }
  }
  return out
}

export interface SpanInput {
  runId: string | null
  stepId: string | null
  name: string
  kind: SpanKind
  status?: SpanStatus
  attributes?: Record<string, unknown>
  tokensIn?: number | null
  tokensOut?: number | null
  costUsd?: number | null
  startedAtMs: number
  endedAtMs: number
  retentionDays?: number
}

export interface SpanRecord {
  runId: string | null
  stepId: string | null
  name: string
  kind: SpanKind
  status: SpanStatus
  attributes: Record<string, unknown>
  tokensIn: number | null
  tokensOut: number | null
  costUsd: number | null
  startedAtMs: number
  endedAtMs: number
  durationMs: number
  retentionUntilMs: number
}

export function buildSpan(input: SpanInput): SpanRecord {
  const retentionDays = input.retentionDays ?? DEFAULT_SPAN_RETENTION_DAYS
  return {
    runId: input.runId,
    stepId: input.stepId,
    name: input.name,
    kind: input.kind,
    status: input.status ?? 'ok',
    attributes: redactAttributes(input.attributes ?? {}),
    tokensIn: input.tokensIn ?? null,
    tokensOut: input.tokensOut ?? null,
    costUsd: input.costUsd ?? null,
    startedAtMs: input.startedAtMs,
    endedAtMs: input.endedAtMs,
    durationMs: Math.max(0, input.endedAtMs - input.startedAtMs),
    retentionUntilMs: input.endedAtMs + retentionDays * DAY_MS,
  }
}

export async function recordSpan(input: SpanInput): Promise<boolean> {
  const span = buildSpan(input)
  const { error } = await supabaseAdmin.from('run_spans').insert({
    run_id: span.runId,
    step_id: span.stepId,
    name: span.name,
    kind: span.kind,
    status: span.status,
    attributes: span.attributes,
    tokens_in: span.tokensIn,
    tokens_out: span.tokensOut,
    cost_usd: span.costUsd,
    started_at: new Date(span.startedAtMs).toISOString(),
    ended_at: new Date(span.endedAtMs).toISOString(),
    duration_ms: span.durationMs,
    retention_until: new Date(span.retentionUntilMs).toISOString(),
  })
  if (error) {
    console.error('[trace.spans] recordSpan failed:', error.message)
    return false
  }
  return true
}
