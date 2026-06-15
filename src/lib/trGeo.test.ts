import { describe, it, expect } from 'vitest'
import { TR_PROVINCES, districtsOf } from './trGeo'

// ---------------------------------------------------------------------------
// TR_PROVINCES invariants
// ---------------------------------------------------------------------------

describe('TR_PROVINCES', () => {
  it('has exactly 81 provinces', () => {
    expect(TR_PROVINCES).toHaveLength(81)
  })

  it('every province has at least one district', () => {
    const empty = TR_PROVINCES.filter((p) => p.districts.length === 0)
    expect(empty).toEqual([])
  })

  it('has no duplicate slugs', () => {
    const slugs = TR_PROVINCES.map((p) => p.slug)
    const unique = new Set(slugs)
    expect(unique.size).toBe(slugs.length)
  })

  it('İstanbul has exactly 39 districts', () => {
    const istanbul = TR_PROVINCES.find((p) => p.name === 'İstanbul')
    expect(istanbul).toBeDefined()
    expect(istanbul!.districts).toHaveLength(39)
  })
})

// ---------------------------------------------------------------------------
// districtsOf
// ---------------------------------------------------------------------------

describe('districtsOf', () => {
  it('returns districts for exact canonical name match ("İstanbul")', () => {
    const result = districtsOf('İstanbul')
    expect(result.length).toBe(39)
    expect(result).toContain('Kadıköy')
  })

  it('returns districts for slug match ("istanbul")', () => {
    const result = districtsOf('istanbul')
    expect(result.length).toBe(39)
  })

  it('returns districts case-insensitively ("ISTANBUL")', () => {
    const result = districtsOf('ISTANBUL')
    expect(result.length).toBe(39)
  })

  it('returns [] for an unknown province ("Atlantis")', () => {
    expect(districtsOf('Atlantis')).toEqual([])
  })

  it('returns [] for an empty string', () => {
    expect(districtsOf('')).toEqual([])
  })
})
