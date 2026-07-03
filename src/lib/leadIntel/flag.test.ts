import { describe, it, expect } from 'vitest'
import { resolveMode, isKillSwitchOn } from './flag'

describe('isKillSwitchOn', () => {
  it('truthy değerler kill-switch\'i açar', () => {
    expect(isKillSwitchOn({ LEAD_INTELLIGENCE_V2_KILL: '1' })).toBe(true)
    expect(isKillSwitchOn({ LEAD_INTELLIGENCE_V2_KILL: 'true' })).toBe(true)
    expect(isKillSwitchOn({ LEAD_INTELLIGENCE_V2_KILL: 'ON' })).toBe(true)
  })

  it('boş/falsy değerler kapalı', () => {
    expect(isKillSwitchOn({})).toBe(false)
    expect(isKillSwitchOn({ LEAD_INTELLIGENCE_V2_KILL: '' })).toBe(false)
    expect(isKillSwitchOn({ LEAD_INTELLIGENCE_V2_KILL: '0' })).toBe(false)
    expect(isKillSwitchOn({ LEAD_INTELLIGENCE_V2_KILL: 'false' })).toBe(false)
  })
})

describe('resolveMode — settings yönetir, env yalnız kapatır', () => {
  it('kill-switch HER modu ezer (settings active olsa bile)', () => {
    expect(resolveMode(true, { mode: 'active' })).toBe('off')
    expect(resolveMode(true, { mode: 'shadow' })).toBe('off')
    expect(resolveMode(true, 'active')).toBe('off')
  })

  it('settings objesi mode belirler', () => {
    expect(resolveMode(false, { mode: 'shadow', since: '2026-07-03' })).toBe('shadow')
    expect(resolveMode(false, { mode: 'active' })).toBe('active')
    expect(resolveMode(false, { mode: 'off' })).toBe('off')
  })

  it('düz string değer de kabul edilir', () => {
    expect(resolveMode(false, 'shadow')).toBe('shadow')
  })

  it('satır yok / geçersiz değer → off (güvenli default)', () => {
    expect(resolveMode(false, null)).toBe('off')
    expect(resolveMode(false, undefined)).toBe('off')
    expect(resolveMode(false, { mode: 'yanlis-deger' })).toBe('off')
    expect(resolveMode(false, 42)).toBe('off')
  })

  it('env hiçbir şeyi AÇAMAZ — kill kapalıyken settings yoksa off kalır', () => {
    // (Ayrı bir "env ile aç" yolu bilinçli olarak YOKTUR.)
    expect(resolveMode(false, null)).toBe('off')
  })
})
