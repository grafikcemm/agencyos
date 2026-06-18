// api/db/[table] proxy'sinde `order` query parametresi doğrudan Supabase .order()
// çağrısına geçiyor. Keyfi/var olmayan kolonla sıralamayı engellemek için tablo
// bazlı sıralanabilir kolon allowlist'i. Saf fonksiyon — birim test edilebilir.

const COMMON_SORT = ['id', 'created_at', 'updated_at'] as const

export const ORDER_ALLOWED: Record<string, ReadonlySet<string>> = {
  leads: new Set([...COMMON_SORT, 'score', 'potential_score', 'quality_score', 'firm_score', 'sector_score', 'status', 'name', 'wave']),
  person_leads: new Set([...COMMON_SORT, 'person_score', 'earning_score', 'market_score', 'difficulty_score', 'expected_monthly_value_tl', 'person_tier', 'status']),
  follow_ups: new Set([...COMMON_SORT, 'follow_up_date', 'due_date', 'status']),
  projects: new Set([...COMMON_SORT, 'name', 'status']),
  playbooks: new Set([...COMMON_SORT, 'name', 'priority']),
  ai_cost_logs: new Set([...COMMON_SORT, 'cost', 'model']),
  settings: new Set(COMMON_SORT),
  sessions: new Set(COMMON_SORT),
  memories: new Set(COMMON_SORT),
  strategy: new Set(COMMON_SORT),
  hypotheses: new Set(COMMON_SORT),
  decisions: new Set(COMMON_SORT),
  autoresearch_runs: new Set(COMMON_SORT),
  council_debates: new Set(COMMON_SORT),
}

export function isAllowedOrder(table: string, column: string): boolean {
  const allowed = ORDER_ALLOWED[table]
  return allowed ? allowed.has(column) : false
}
