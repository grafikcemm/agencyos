import { describe, it, expect } from 'vitest'
import { describeV2Flags } from './flags'

describe('describeV2Flags — V2 bayrakları default KAPALI (06 §4 kapı 1)', () => {
  it('boş env: dört bayrak da kapalı', () => {
    const flags = describeV2Flags({})
    expect(flags).toHaveLength(4)
    for (const f of flags) expect(f.enabled).toBe(false)
    expect(flags.map((f) => f.key)).toEqual([
      'GMAIL_SEND_ENABLED',
      'FOLLOWUP_FSM_ENABLED',
      'BRAIN_V2_ENABLED',
      'BRAIN_ACTIVE_ENABLED',
    ])
  })

  it("yalnız 'true' string'i açar (1/yes/TRUE açmaz)", () => {
    const flags = describeV2Flags({
      GMAIL_SEND_ENABLED: '1',
      FOLLOWUP_FSM_ENABLED: 'yes',
      BRAIN_V2_ENABLED: 'TRUE',
      BRAIN_ACTIVE_ENABLED: 'true',
    })
    expect(flags.find((f) => f.key === 'GMAIL_SEND_ENABLED')?.enabled).toBe(false)
    expect(flags.find((f) => f.key === 'FOLLOWUP_FSM_ENABLED')?.enabled).toBe(false)
    expect(flags.find((f) => f.key === 'BRAIN_V2_ENABLED')?.enabled).toBe(false)
    expect(flags.find((f) => f.key === 'BRAIN_ACTIVE_ENABLED')?.enabled).toBe(true)
  })

  it('env değeri hiçbir alanda dışarı sızmaz (yalnız boolean)', () => {
    const flags = describeV2Flags({ GMAIL_SEND_ENABLED: 'true' })
    for (const f of flags) {
      expect(typeof f.enabled).toBe('boolean')
      expect(Object.keys(f).sort()).toEqual(['description', 'enabled', 'key'])
    }
  })
})
