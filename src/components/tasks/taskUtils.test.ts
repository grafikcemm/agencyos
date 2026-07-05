import { describe, it, expect } from 'vitest'
import { sortTasks, dueMeta, stepProgress, formatDue } from './taskUtils'
import type { ActiveTask, ActiveTaskStep } from '@/types/tasks'

function makeTask(over: Partial<ActiveTask> = {}): ActiveTask {
  return {
    id: over.id ?? 'id',
    title: over.title ?? 'Görev',
    is_done: over.is_done ?? false,
    category: over.category ?? 'active',
    sort_order: over.sort_order ?? 0,
    is_priority: over.is_priority ?? false,
    created_at: over.created_at ?? '2026-01-01T00:00:00.000Z',
    note: over.note,
    description: over.description,
    due_date: over.due_date,
    steps: over.steps,
  }
}

function makeStep(over: Partial<ActiveTaskStep> = {}): ActiveTaskStep {
  return {
    id: over.id ?? 's',
    task_id: over.task_id ?? 'id',
    title: over.title ?? 'Adım',
    is_done: over.is_done ?? false,
    sort_order: over.sort_order ?? 0,
    created_at: over.created_at ?? '2026-01-01T00:00:00.000Z',
  }
}

describe('sortTasks', () => {
  it('puts active before waiting, priority first, then sort_order', () => {
    const tasks = [
      makeTask({ id: 'w', category: 'waiting', sort_order: 1 }),
      makeTask({ id: 'a2', category: 'active', sort_order: 20 }),
      makeTask({ id: 'a1p', category: 'active', sort_order: 99, is_priority: true }),
      makeTask({ id: 'a1', category: 'active', sort_order: 10 }),
    ]
    const order = sortTasks(tasks).map((t) => t.id)
    expect(order).toEqual(['a1p', 'a1', 'a2', 'w'])
  })

  it('does not mutate the input array', () => {
    const tasks = [makeTask({ id: 'b', sort_order: 2 }), makeTask({ id: 'a', sort_order: 1 })]
    const snapshot = tasks.map((t) => t.id)
    sortTasks(tasks)
    expect(tasks.map((t) => t.id)).toEqual(snapshot)
  })
})

describe('dueMeta', () => {
  const today = '2026-07-05'

  it('flags a past due date as overdue', () => {
    expect(dueMeta(makeTask({ due_date: '2026-07-01' }), today)).toEqual({ state: 'overdue', label: 'Gecikti' })
  })

  it('flags today as today', () => {
    expect(dueMeta(makeTask({ due_date: today }), today)).toEqual({ state: 'today', label: 'Bugün' })
  })

  it('formats an upcoming date', () => {
    expect(dueMeta(makeTask({ due_date: '2026-07-12' }), today)).toEqual({ state: 'upcoming', label: '12 Tem' })
  })

  it('returns none when there is no due date', () => {
    expect(dueMeta(makeTask({ due_date: undefined }), today).state).toBe('none')
  })

  it('suppresses the due chip once the task is done', () => {
    expect(dueMeta(makeTask({ due_date: '2026-07-01', is_done: true }), today).state).toBe('none')
  })
})

describe('formatDue', () => {
  it('renders a short Turkish month label', () => {
    expect(formatDue('2026-03-09')).toBe('9 Mar')
  })

  it('returns the raw string on malformed input', () => {
    expect(formatDue('not-a-date')).toBe('not-a-date')
  })
})

describe('stepProgress', () => {
  it('counts done steps and surfaces the next open step', () => {
    const task = makeTask({
      steps: [
        makeStep({ id: '1', title: 'Bir', is_done: true }),
        makeStep({ id: '2', title: 'İki', is_done: false }),
        makeStep({ id: '3', title: 'Üç', is_done: false }),
      ],
    })
    expect(stepProgress(task)).toEqual({ done: 1, total: 3, nextTitle: 'İki' })
  })

  it('handles a task with no steps', () => {
    expect(stepProgress(makeTask())).toEqual({ done: 0, total: 0, nextTitle: null })
  })
})
