import { describe, it, expect } from 'vitest'
import { staleActionFor } from './staleDeals'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000

const ago = (days: number) => NOW - days * DAY

describe('staleActionFor', () => {
  it('aktivite zamanı yoksa null', () => {
    expect(staleActionFor({ status: 'contacted', lastActivityMs: null, nowMs: NOW })).toBeNull()
  })

  it('contacted: 3 günden sonra send_next_touch', () => {
    expect(staleActionFor({ status: 'contacted', lastActivityMs: ago(2), nowMs: NOW })).toBeNull()
    expect(staleActionFor({ status: 'contacted', lastActivityMs: ago(4), nowMs: NOW })).toBe('send_next_touch')
  })

  it('responded: 2 günden sonra manuel takip', () => {
    expect(staleActionFor({ status: 'responded', lastActivityMs: ago(3), nowMs: NOW })).toBe('manual_followup')
  })

  it('meeting: 7 günden sonra close_loop', () => {
    expect(staleActionFor({ status: 'meeting', lastActivityMs: ago(8), nowMs: NOW })).toBe('close_loop')
  })

  it('proposal: 4-14 gün arası followup, 14+ gün nurture', () => {
    expect(staleActionFor({ status: 'proposal', lastActivityMs: ago(3), nowMs: NOW })).toBeNull()
    expect(staleActionFor({ status: 'proposal', lastActivityMs: ago(6), nowMs: NOW })).toBe('proposal_followup')
    expect(staleActionFor({ status: 'proposal', lastActivityMs: ago(20), nowMs: NOW })).toBe('move_to_nurture')
  })

  it('takip gerektirmeyen aşama → null', () => {
    expect(staleActionFor({ status: 'new', lastActivityMs: ago(30), nowMs: NOW })).toBeNull()
    expect(staleActionFor({ status: 'converted', lastActivityMs: ago(30), nowMs: NOW })).toBeNull()
  })
})
