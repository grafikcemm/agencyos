import { describe, it, expect } from 'vitest'
import { LEAD_COLUMNS, DEFAULT_VISIBLE, COLUMN_STORAGE_KEY, LeadColumnKey } from './leadColumns'

// All valid keys derived from the type — enumerate them to keep the test
// independent of the runtime array being tested.
const ALL_KEYS: LeadColumnKey[] = [
  'priority',
  'business_name',
  'sector',
  'location',
  'phone',
  'website',
  'email',
  'rating',
  'score',
  'service',
  'tier',
  'value',
  'source',
  'actions',
]

describe('LEAD_COLUMNS', () => {
  it('every LeadColumnKey appears exactly once in LEAD_COLUMNS', () => {
    for (const key of ALL_KEYS) {
      const matches = LEAD_COLUMNS.filter((col) => col.key === key)
      expect(matches, `key "${key}" should appear exactly once`).toHaveLength(1)
    }
    // Also assert no extra unknown keys snuck in
    expect(LEAD_COLUMNS).toHaveLength(ALL_KEYS.length)
  })

  it('"business_name" has alwaysOn === true', () => {
    const col = LEAD_COLUMNS.find((c) => c.key === 'business_name')
    expect(col).toBeDefined()
    expect(col!.alwaysOn).toBe(true)
  })

  it('"actions" has alwaysOn === true', () => {
    const col = LEAD_COLUMNS.find((c) => c.key === 'actions')
    expect(col).toBeDefined()
    expect(col!.alwaysOn).toBe(true)
  })
})

describe('DEFAULT_VISIBLE', () => {
  it('has exactly 8 keys', () => {
    expect(DEFAULT_VISIBLE).toHaveLength(8)
  })

  it('every key in DEFAULT_VISIBLE exists in LEAD_COLUMNS', () => {
    const columnKeys = new Set(LEAD_COLUMNS.map((c) => c.key))
    for (const key of DEFAULT_VISIBLE) {
      expect(columnKeys.has(key), `"${key}" missing from LEAD_COLUMNS`).toBe(true)
    }
  })
})

describe('COLUMN_STORAGE_KEY', () => {
  it('equals "haritaLeadColumns"', () => {
    expect(COLUMN_STORAGE_KEY).toBe('haritaLeadColumns')
  })
})
