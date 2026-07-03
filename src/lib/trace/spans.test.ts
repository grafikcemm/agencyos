import { describe, it, expect } from 'vitest'
import { buildSpan, redactAttributes, DEFAULT_SPAN_RETENTION_DAYS } from './spans'

describe('trace span — redaction + süre (§12/§16)', () => {
  it('redactAttributes: hassas anahtar düşer, string maskelenir', () => {
    const r = redactAttributes({
      prompt: 'gizli sistem promptu',
      api_key: 'sk-abc123456',
      model: 'claude-haiku-4-5',
      note: 'operatör sk-leak987654 için',
      count: 42,
    })
    expect(r.prompt).toBe('‹redacted›')
    expect(r.api_key).toBe('‹redacted›')
    expect(r.model).toBe('claude-haiku-4-5')
    expect(String(r.note)).not.toContain('sk-leak987654')
    expect(r.count).toBe(42)
  })

  it('buildSpan: duration + retention + status default', () => {
    const s = buildSpan({
      runId: 'r1', stepId: 's1', name: 'llm.call', kind: 'llm',
      attributes: { messages: 'ham içerik' },
      startedAtMs: 1000, endedAtMs: 1350,
    })
    expect(s.durationMs).toBe(350)
    expect(s.status).toBe('ok')
    expect(s.attributes.messages).toBe('‹redacted›')
    expect(s.retentionUntilMs).toBe(1350 + DEFAULT_SPAN_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  })

  it('buildSpan: negatif süre 0 clamp', () => {
    const s = buildSpan({ runId: null, stepId: null, name: 'x', kind: 'internal', startedAtMs: 500, endedAtMs: 400 })
    expect(s.durationMs).toBe(0)
  })
})
