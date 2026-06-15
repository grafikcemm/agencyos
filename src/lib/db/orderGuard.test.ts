import { describe, it, expect } from 'vitest'
import { isAllowedOrder, ORDER_ALLOWED } from './orderGuard'

describe('isAllowedOrder', () => {
  it('allows the order columns the UI actually requests', () => {
    // src/components/** ve src/app/** içinde fiilen kullanılan order değerleri
    expect(isAllowedOrder('leads', 'created_at')).toBe(true)
    expect(isAllowedOrder('leads', 'score')).toBe(true)
    expect(isAllowedOrder('leads', 'potential_score')).toBe(true)
    expect(isAllowedOrder('leads', 'quality_score')).toBe(true)
    expect(isAllowedOrder('follow_ups', 'follow_up_date')).toBe(true)
  })

  it('rejects arbitrary / non-existent columns', () => {
    expect(isAllowedOrder('leads', 'password')).toBe(false)
    expect(isAllowedOrder('leads', 'id; drop table leads')).toBe(false)
    expect(isAllowedOrder('leads', '')).toBe(false)
  })

  it('rejects ordering on a table with no allowlist entry', () => {
    expect(isAllowedOrder('ai_cost_logs', 'cost')).toBe(true)
    expect(isAllowedOrder('unknown_table', 'created_at')).toBe(false)
  })

  it('every allowlisted table is also a readable table column-safe set', () => {
    for (const [table, cols] of Object.entries(ORDER_ALLOWED)) {
      expect(cols.size, `${table} should have at least id/created_at`).toBeGreaterThan(0)
      expect(cols.has('id')).toBe(true)
    }
  })
})
