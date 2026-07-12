import { describe, it, expect, vi, beforeEach } from 'vitest'

let insertBehavior: (payload: { update_id: number }) => { error: { code: string } | null }
const insertedIds: number[] = []

vi.mock('@/lib/lifeSupabaseAdmin', () => ({
  lifeSupabaseAdmin: {
    from: () => ({
      insert: async (payload: { update_id: number }) => {
        insertedIds.push(payload.update_id)
        return insertBehavior(payload)
      },
    }),
  },
}))

import { claimTelegramUpdate, _resetMemoryClaims } from './updateClaims'

describe('claimTelegramUpdate (Faz B4 — durable idempotency)', () => {
  beforeEach(() => {
    _resetMemoryClaims()
    insertedIds.length = 0
    insertBehavior = () => ({ error: null })
  })

  it('ilk claim → fresh, durable', async () => {
    const r = await claimTelegramUpdate(100)
    expect(r).toEqual({ fresh: true, mode: 'durable' })
  })

  it('DB unique ihlali (23505) → duplicate (cross-instance yarış yakalanır)', async () => {
    _resetMemoryClaims()
    insertBehavior = () => ({ error: { code: '23505' } })
    const r = await claimTelegramUpdate(101)
    expect(r).toEqual({ fresh: false, mode: 'durable' })
  })

  it('aynı instance içinde ikinci claim → in-memory kısa devre, DB’ye tekrar gitmez', async () => {
    await claimTelegramUpdate(102)
    const before = insertedIds.length
    const r = await claimTelegramUpdate(102)
    expect(r.fresh).toBe(false)
    expect(insertedIds.length).toBe(before) // ikinci insert YOK
  })

  it('tablo yok (42P01 — migration onay bekliyor) → memory moda düşer, fresh', async () => {
    insertBehavior = () => ({ error: { code: '42P01' } })
    const r = await claimTelegramUpdate(103)
    expect(r).toEqual({ fresh: true, mode: 'memory' })
    // memory modda bile duplicate yakalanır (aynı instance):
    const r2 = await claimTelegramUpdate(103)
    expect(r2.fresh).toBe(false)
  })

  it('eşzamanlı iki handler AYNI update → tek fresh (yarış: biri 23505 yer)', async () => {
    // İki "instance" simülasyonu: memory reset ile ikinci handler'ın Map'i boş.
    insertBehavior = () => ({ error: null })
    const first = await claimTelegramUpdate(104)
    _resetMemoryClaims() // ikinci instance'ın belleği ayrı
    insertBehavior = () => ({ error: { code: '23505' } }) // DB PK yarışı kaybeden taraf
    const second = await claimTelegramUpdate(104)
    expect(first.fresh).toBe(true)
    expect(second.fresh).toBe(false)
  })
})
