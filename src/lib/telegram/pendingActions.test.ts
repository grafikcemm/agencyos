import { describe, it, expect, vi, beforeEach } from 'vitest'

// Tablo yokmuş gibi davran (42P01 benzeri) → in-memory fallback yolunu test ederiz;
// durable yol aynı sözleşmeyi migration 005 sonrası sağlar.
vi.mock('@/lib/lifeSupabaseAdmin', () => ({
  lifeSupabaseAdmin: {
    from: () => ({
      upsert: async () => ({ error: { code: '42P01' } }),
      delete: () => ({
        eq: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: null, error: { code: '42P01' } }),
          }),
        }),
      }),
    }),
  },
}))

import {
  setPendingAction,
  consumePendingAction,
  computeActionDigest,
  PENDING_ACTION_TTL_MS,
  _resetPendingActions,
} from './pendingActions'

describe('pendingActions (Faz B5 — TTL + tek kullanım)', () => {
  beforeEach(() => _resetPendingActions())

  it('set → consume bir kez döner; ikinci consume null (tek kullanımlık)', async () => {
    await setPendingAction('chat1', 'add_task_choice', { title: 'fatura kes' }, 1000)
    const first = await consumePendingAction('chat1', 2000)
    expect(first?.type).toBe('add_task_choice')
    expect(first?.payload.title).toBe('fatura kes')
    const second = await consumePendingAction('chat1', 2000)
    expect(second).toBeNull()
  })

  it('TTL dolmuş → null (süresi dolmuş seçimle mutasyon yok)', async () => {
    await setPendingAction('chat1', 'add_task_choice', { title: 'x' }, 1000)
    const r = await consumePendingAction('chat1', 1000 + PENDING_ACTION_TTL_MS + 1)
    expect(r).toBeNull()
  })

  it('farklı chat anahtarı → erişemez', async () => {
    await setPendingAction('chat1', 'add_task_choice', { title: 'x' }, 1000)
    expect(await consumePendingAction('chat2', 2000)).toBeNull()
  })

  it('digest payload’a bağlı ve deterministik', () => {
    const a = computeActionDigest('add_task_choice', { title: 'x' })
    const b = computeActionDigest('add_task_choice', { title: 'x' })
    const c = computeActionDigest('add_task_choice', { title: 'y' })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})
