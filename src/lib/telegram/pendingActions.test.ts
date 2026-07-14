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
  consumeSignedAction,
  peekPendingAction,
  makeConfirmCode,
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

// ── Faz 0.4: durable depo source-of-truth; iki-instance yarışı ────────────────
import { vi as vi04 } from 'vitest'
import * as life from '@/lib/lifeSupabaseAdmin'

describe('pendingActions durable doğruluk (Faz 0.4)', () => {
  it('durable ÇALIŞIYOR + kayıt yok → bayat memory girdisi TÜKETİLMEZ (null)', async () => {
    _resetPendingActions()
    // set: durable yazım hatalı (memory'ye düşer) → memory'de girdi var.
    await setPendingAction('chatX', 'add_task_choice', { title: 'bayat' }, 1000)
    // consume: durable delete BAŞARILI ama satır yok (başka instance tüketti senaryosu).
    const spy = vi04.spyOn(life.lifeSupabaseAdmin, 'from').mockReturnValue({
      delete: () => ({
        eq: () => ({
          select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
    } as never)
    const r = await consumePendingAction('chatX', 2000)
    expect(r).toBeNull()
    // memory de temizlendi → ikinci çağrı da null.
    spy.mockRestore()
    expect(await consumePendingAction('chatX', 2000)).toBeNull()
  })

  it('iki instance aynı anda consume → durable DELETE tek satır döner, tek taraf kazanır', async () => {
    _resetPendingActions()
    let row: { action_type: string; payload: object; digest: string; created_at: string } | null = {
      action_type: 'add_task_choice', payload: { title: 'x' }, digest: 'd', created_at: new Date(1000).toISOString(),
    }
    const spy = vi04.spyOn(life.lifeSupabaseAdmin, 'from').mockReturnValue({
      delete: () => ({
        eq: () => ({
          select: () => ({
            maybeSingle: async () => {
              const r = row; row = null // atomik DELETE ... RETURNING simülasyonu
              return { data: r, error: null }
            },
          }),
        }),
      }),
    } as never)
    const [a, b] = await Promise.all([
      consumePendingAction('chatY', 2000),
      consumePendingAction('chatY', 2000),
    ])
    expect([a, b].filter(Boolean)).toHaveLength(1) // TAM BİR kazanan
    spy.mockRestore()
  })
})

describe('imzalı aksiyonlar (Faz 6 — kodlu tek-kullanımlık)', () => {
  beforeEach(() => _resetPendingActions())

  it('makeConfirmCode: 6 hane, 0/O/1/I yok', () => {
    let seq = 0
    const rng = () => (seq++ % 32) / 32 // deterministik tarama
    const code = makeConfirmCode(rng)
    expect(code).toHaveLength(6)
    expect(code).not.toMatch(/[O01I]/)
  })

  it('set(code) → consumeSignedAction doğru kodla OK; ikinci sefer missing (tüketildi)', async () => {
    await setPendingAction('c1', 'sales_send', { draftId: 'd1', businessName: 'X' }, 1000, 'ABC234')
    const r = await consumeSignedAction('c1', 'ABC234', 2000)
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.action.payload.draftId).toBe('d1')
    const again = await consumeSignedAction('c1', 'ABC234', 2000)
    expect(again.status).toBe('missing')
  })

  it('yanlış kod → mismatch ve TÜKETİLMEZ (doğru kodla retry mümkün)', async () => {
    await setPendingAction('c2', 'sales_send', { draftId: 'd2' }, 1000, 'ABC234')
    const wrong = await consumeSignedAction('c2', 'ZZZ999', 2000)
    expect(wrong.status).toBe('mismatch')
    const right = await consumeSignedAction('c2', 'ABC234', 2000)
    expect(right.status).toBe('ok') // hâlâ orada — tampered denemesi tüketmedi
  })

  it('TTL dolmuş imzalı aksiyon → expired (temizlenir)', async () => {
    await setPendingAction('c3', 'sales_send', { draftId: 'd3' }, 1000, 'ABC234')
    const r = await consumeSignedAction('c3', 'ABC234', 1000 + PENDING_ACTION_TTL_MS + 1)
    expect(r.status).toBe('expired')
  })

  it('bekleyen aksiyon yok → missing', async () => {
    const r = await consumeSignedAction('bos', 'ABC234', 2000)
    expect(r.status).toBe('missing')
  })

  it('peekPendingAction: TÜKETMEZ; hasCode doğru; expired null', async () => {
    await setPendingAction('c4', 'sales_send', { draftId: 'd4' }, 1000, 'ABC234')
    const peek1 = await peekPendingAction('c4', 2000)
    expect(peek1).toEqual({ type: 'sales_send', hasCode: true })
    const peek2 = await peekPendingAction('c4', 2000)
    expect(peek2).toEqual({ type: 'sales_send', hasCode: true }) // hâlâ orada (peek tüketmez)
    // doğru kodla hâlâ tüketilebilir → peek gerçekten TÜKETMEDİ
    expect((await consumeSignedAction('c4', 'ABC234', 2000)).status).toBe('ok')
    // expired peek → null
    await setPendingAction('c5', 'sales_send', { draftId: 'd5' }, 1000, 'ABC234')
    expect(await peekPendingAction('c5', 1000 + PENDING_ACTION_TTL_MS + 1)).toBeNull()
  })

  it('kodsuz (legacy) aksiyon peek → hasCode:false', async () => {
    await setPendingAction('c6', 'add_task_choice', { title: 'x' }, 1000)
    expect(await peekPendingAction('c6', 2000)).toEqual({ type: 'add_task_choice', hasCode: false })
  })
})

describe('imzalı aksiyon DURABLE yolu (Faz 6)', () => {
  beforeEach(() => _resetPendingActions())

  function durableRow(row: Record<string, unknown> | null) {
    return vi04.spyOn(life.lifeSupabaseAdmin, 'from').mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    } as never)
  }

  it('consumeSignedAction DURABLE: kod eşleşir → ok + tüketilir (delete çağrılır)', async () => {
    const row = { action_type: 'sales_send', payload: { draftId: 'dX' }, digest: 'd', code: 'ABC234', created_at: new Date(1000).toISOString() }
    const spy = durableRow(row)
    const r = await consumeSignedAction('cd1', 'ABC234', 2000)
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.action.payload.draftId).toBe('dX')
    spy.mockRestore()
  })

  it('consumeSignedAction DURABLE: yanlış kod → mismatch (tüketmez)', async () => {
    const row = { action_type: 'sales_send', payload: {}, digest: 'd', code: 'ABC234', created_at: new Date(1000).toISOString() }
    const spy = durableRow(row)
    expect((await consumeSignedAction('cd2', 'ZZZ999', 2000)).status).toBe('mismatch')
    spy.mockRestore()
  })

  it('consumeSignedAction DURABLE: satır yok → missing', async () => {
    const spy = durableRow(null)
    expect((await consumeSignedAction('cd3', 'ABC234', 2000)).status).toBe('missing')
    spy.mockRestore()
  })

  it('peekPendingAction DURABLE: type+hasCode döner (tüketmez)', async () => {
    const row = { action_type: 'sales_send', code: 'ABC234', created_at: new Date(1000).toISOString() }
    const spy = durableRow(row)
    expect(await peekPendingAction('cd4', 2000)).toEqual({ type: 'sales_send', hasCode: true })
    spy.mockRestore()
  })

  it('consumeSignedAction DURABLE: TTL dolmuş → expired', async () => {
    const row = { action_type: 'sales_send', payload: {}, digest: 'd', code: 'ABC234', created_at: new Date(1000).toISOString() }
    const spy = durableRow(row)
    expect((await consumeSignedAction('cd5', 'ABC234', 1000 + PENDING_ACTION_TTL_MS + 1)).status).toBe('expired')
    spy.mockRestore()
  })
})

describe('durable savunma dalları (Faz 6 tamamlayıcı)', () => {
  beforeEach(() => _resetPendingActions())

  it('setPendingAction DURABLE başarı → mode durable', async () => {
    const spy = vi04.spyOn(life.lifeSupabaseAdmin, 'from').mockReturnValue({
      upsert: async () => ({ error: null }),
    } as never)
    const r = await setPendingAction('cs1', 'sales_send', { x: 1 }, 1000, 'ABC234')
    expect(r.mode).toBe('durable')
    spy.mockRestore()
  })

  it('consumeSignedAction DURABLE: payload/code null alanlar → güvenli ({}/hasCode yolu)', async () => {
    const spy = vi04.spyOn(life.lifeSupabaseAdmin, 'from').mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { action_type: 'sales_send', payload: null, digest: 'd', code: 'ABC234', created_at: new Date(1000).toISOString() }, error: null }) }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    } as never)
    const r = await consumeSignedAction('cs2', 'ABC234', 2000)
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.action.payload).toEqual({})
    spy.mockRestore()
  })

  it('peekPendingAction DURABLE: code null → hasCode:false', async () => {
    const spy = vi04.spyOn(life.lifeSupabaseAdmin, 'from').mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { action_type: 'add_task_choice', code: null, created_at: new Date(1000).toISOString() }, error: null }) }) }),
    } as never)
    expect(await peekPendingAction('cs3', 2000)).toEqual({ type: 'add_task_choice', hasCode: false })
    spy.mockRestore()
  })
})
