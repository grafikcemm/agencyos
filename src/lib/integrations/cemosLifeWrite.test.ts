import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/lifeSupabaseAdmin', () => ({ lifeSupabaseAdmin: {} }))

import {
  HabitLog, StepPatch, TaskCreate, TaskPatch, numericId, stepColumns, taskColumns,
} from './cemosLifeWrite'
import { capacitySignal } from './cemosLifeData'
import { BadRequestError } from '@/lib/api/guards'

describe('şemalar STRICT — bilinmeyen alan sessizce düşmez', () => {
  it('görev oluşturmada fazladan alan REDDEDILIR', () => {
    const r = TaskCreate.safeParse({ title: 'x', is_done: true })
    expect(r.success).toBe(false)
  })

  it('doğrudan sütun adı göndermek de reddedilir (camelCase sözleşmesi)', () => {
    expect(TaskCreate.safeParse({ title: 'x', due_date: '2026-08-01' }).success).toBe(false)
    expect(TaskCreate.safeParse({ title: 'x', dueDate: '2026-08-01' }).success).toBe(true)
  })

  it('boş başlık ve aşırı uzun başlık reddedilir', () => {
    expect(TaskCreate.safeParse({ title: '' }).success).toBe(false)
    expect(TaskCreate.safeParse({ title: 'a'.repeat(301) }).success).toBe(false)
  })

  it('kategori kapalı kümedir', () => {
    expect(TaskCreate.safeParse({ title: 'x', category: 'archive' }).success).toBe(false)
    expect(TaskCreate.safeParse({ title: 'x', category: 'someday' }).success).toBe(true)
  })

  it('BOŞ patch reddedilir — "güncellendi" diyen ama hiçbir şey yapmayan çağrı olmaz', () => {
    expect(TaskPatch.safeParse({}).success).toBe(false)
    expect(StepPatch.safeParse({}).success).toBe(false)
  })

  it('tarih biçimi dayatılır', () => {
    expect(HabitLog.safeParse({ date: '30-07-2026', value: 1 }).success).toBe(false)
    expect(HabitLog.safeParse({ date: '2026-07-30', value: 1 }).success).toBe(true)
  })

  it('alışkanlık değeri negatif olamaz ve tam sayıdır', () => {
    expect(HabitLog.safeParse({ date: '2026-07-30', value: -1 }).success).toBe(false)
    expect(HabitLog.safeParse({ date: '2026-07-30', value: 1.5 }).success).toBe(false)
    // 0 GECERLI: "geri al" bu yoldan gecer.
    expect(HabitLog.safeParse({ date: '2026-07-30', value: 0 }).success).toBe(true)
  })
})

describe('sütun eşlemesi', () => {
  it('yalnız verilen alanlar yazılır — tanımsız alan sütuna dönmez', () => {
    expect(taskColumns({ isDone: true })).toEqual({ is_done: true })
    expect(taskColumns({ title: 'a', dueDate: null })).toEqual({ title: 'a', due_date: null })
    expect(stepColumns({ sortOrder: 3 })).toEqual({ sort_order: 3 })
  })

  it('boş patch boş nesne verir (mutasyon yok)', () => {
    expect(taskColumns({})).toEqual({})
  })
})

describe('numericId', () => {
  it('geçersiz kimlik yazma yapmadan düşer', () => {
    for (const bad of ['0', '-3', 'abc', '1.5', '']) {
      expect(() => numericId(bad)).toThrowError(BadRequestError)
    }
  })
  it('geçerli kimlik sayıya döner', () => {
    expect(numericId('42')).toBe(42)
  })
})

describe('kapasite sinyali — sayar, TAHMIN ETMEZ', () => {
  const today = '2026-07-30'
  const tasks = [
    { is_done: false, due_date: '2026-07-28', is_priority: true },
    { is_done: false, due_date: '2026-07-30', is_priority: false },
    { is_done: false, due_date: null, is_priority: false },
    { is_done: true, due_date: '2026-07-01', is_priority: true },
  ]

  it('açık/gecikmiş/bugün sayıları doğru', () => {
    const s = capacitySignal(tasks, { energy: 'orta', day_mode: 'normal', max_auto_tasks: 3 }, today)
    expect(s).toMatchObject({ openTasks: 3, overdue: 1, dueToday: 1, priorityOpen: 1, measured: true })
  })

  it('daily_v2 kaydı yoksa ÖLÇÜLMEDI der — sıfır ya da varsayılan UYDURMAZ', () => {
    const s = capacitySignal(tasks, null, today)
    expect(s.measured).toBe(false)
    expect(s.energy).toBeNull()
    expect(s.dayMode).toBeNull()
    expect(s.maxAutoTasks).toBeNull()
    // Sayilabilenler yine sayilir — olculemeyen alan sayilabileni gizlemez.
    expect(s.openTasks).toBe(3)
  })

  it('saat tahmini ÜRETMEZ — o hesap GrafikcemOS capacity.mjs\'e ait', () => {
    const s = capacitySignal(tasks, null, today) as Record<string, unknown>
    for (const k of ['availableHours', 'musaitSaat', 'estimatedHours', 'load']) {
      expect(s[k]).toBeUndefined()
    }
  })
})
