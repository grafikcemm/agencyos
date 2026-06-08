// Pure plan parsing — no imports, so it is testable under a plain node runner
// without dragging in the server-only/supabase chain that orchestrator.ts pulls in.

export interface PlanStep {
  agent_key: string
  title: string
  input: Record<string, unknown>
}

// Tolerant JSON extraction: strips ``` fences and grabs the outermost array.
export function parsePlan(raw: string): PlanStep[] {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []

  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1)) as unknown
    if (!Array.isArray(arr)) return []
    return arr
      .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
      .map((s) => ({
        agent_key: String(s.agent_key ?? ''),
        title: String(s.title ?? 'Adsız görev'),
        input: (typeof s.input === 'object' && s.input !== null ? s.input : {}) as Record<string, unknown>,
      }))
      .filter((s) => s.agent_key)
  } catch {
    return []
  }
}
