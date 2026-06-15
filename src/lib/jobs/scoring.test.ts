import { describe, it, expect } from 'vitest'
import {
  SHOW_THRESHOLD,
  GRAY_FLOOR,
  AGENCY_FIT_BONUS,
  MAX_AGE_DAYS,
  isAgencySource,
  applyAgencyBonus,
  isStale,
  classifyVisibility,
} from './scoring'

const NOW = new Date('2026-06-15T00:00:00Z')
const daysAgo = (n: number): string =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString()

describe('isAgencySource', () => {
  it('returns true for curated agency sources', () => {
    expect(isAgencySource('bigumigu')).toBe(true)
    expect(isAgencySource('dijitalajanslar')).toBe(true)
    expect(isAgencySource('ajanshayvanlari')).toBe(true)
    expect(isAgencySource('instagram_ajansisleri')).toBe(true)
  })

  it('returns false for generic pool and null', () => {
    expect(isAgencySource('firecrawl')).toBe(false)
    expect(isAgencySource('greenhouse')).toBe(false)
    expect(isAgencySource(null)).toBe(false)
    expect(isAgencySource(undefined)).toBe(false)
  })
})

describe('applyAgencyBonus', () => {
  it('adds the bonus for agency sources', () => {
    expect(applyAgencyBonus(50, 'bigumigu')).toBe(50 + AGENCY_FIT_BONUS)
  })

  it('leaves non-agency scores unchanged', () => {
    expect(applyAgencyBonus(50, 'firecrawl')).toBe(50)
    expect(applyAgencyBonus(50, 'greenhouse')).toBe(50)
  })

  it('caps the boosted score at 100', () => {
    expect(applyAgencyBonus(95, 'dijitalajanslar')).toBe(100)
  })
})

describe('isStale', () => {
  it('treats dateless or invalid postings as fresh', () => {
    expect(isStale(null, NOW)).toBe(false)
    expect(isStale(undefined, NOW)).toBe(false)
    expect(isStale('not-a-date', NOW)).toBe(false)
  })

  it('flags postings older than MAX_AGE_DAYS', () => {
    expect(isStale(daysAgo(MAX_AGE_DAYS + 1), NOW)).toBe(true)
  })

  it('keeps recent postings', () => {
    expect(isStale(daysAgo(MAX_AGE_DAYS - 1), NOW)).toBe(false)
  })
})

describe('classifyVisibility', () => {
  it('rejects suspicious listings regardless of fit', () => {
    expect(classifyVisibility(90, 'suspicious', null, NOW)).toBe('rejected')
  })

  it('rejects stale listings', () => {
    expect(classifyVisibility(90, 'high', daysAgo(MAX_AGE_DAYS + 5), NOW)).toBe('rejected')
  })

  it('rejects fit below the gray floor', () => {
    expect(classifyVisibility(GRAY_FLOOR - 1, 'high', null, NOW)).toBe('rejected')
  })

  it('marks mid-fit listings as gray', () => {
    expect(classifyVisibility(GRAY_FLOOR, 'high', null, NOW)).toBe('gray')
    expect(classifyVisibility(SHOW_THRESHOLD - 1, 'caution', null, NOW)).toBe('gray')
  })

  it('shows strong listings', () => {
    expect(classifyVisibility(SHOW_THRESHOLD, 'high', null, NOW)).toBe('show')
    expect(classifyVisibility(100, 'caution', daysAgo(5), NOW)).toBe('show')
  })

  it('treats null fit as zero (rejected)', () => {
    expect(classifyVisibility(null, 'high', null, NOW)).toBe('rejected')
  })
})
