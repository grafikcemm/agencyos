'use client'

import { useCallback, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Check, Star, ChevronRight, Clock, ListChecks } from 'lucide-react'
import type { ActiveTask } from '@/types/tasks'
import type { ActiveTasksSource } from '@/lib/activeTasks'
import {
  addActiveTask,
  deleteActiveTask,
  toggleActiveTask,
  moveActiveTask,
  toggleTaskPriority,
  updateActiveTask,
  updateActiveTaskNote,
  addTaskStep,
  toggleTaskStep,
  deleteTaskStep,
} from '@/app/actions/taskActions'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/utils'
import { sortTasks, dueMeta, stepProgress } from './taskUtils'
import { TaskRulesPanel } from './TaskRulesPanel'
import { ActiveTaskDetailSheet } from './ActiveTaskDetailSheet'

interface Props {
  initialTasks: ActiveTask[]
  source: ActiveTasksSource
  today: string
}

// Optimistik geçici satır (henüz DB id'si yok). Sunucuya ASLA gönderilmez:
// prod'da id UUID — 'temp-…' değeri 22P02 (invalid uuid) üretir.
const isTemp = (id: string) => id.startsWith('temp-')

// Alışkanlıklar kolonunun son bölümü: her zaman görünür Kurallar paneli + aktif
// görev listesi + bekleyen grubu + detay paneli. HabitTracker ile AYNI optimistik
// deseni kullanır: yerel state + render-anı authoritative resync (router.refresh
// sonrası) + startTransition ile server action.
export function ActiveTasksSection({ initialTasks, source, today }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [tasks, setTasks] = useState(initialTasks)
  const [draft, setDraft] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Bekleyen grubu varsayılan KAPALI — dikkati dağıtmasın (ADHD dostu).
  const [waitingOpen, setWaitingOpen] = useState(false)
  // Son başarısız server action mesajı (sessiz hata yutulmasın).
  const [lastError, setLastError] = useState<string | null>(null)

  // Server props referansı değişince (router.refresh sonrası) authoritative veriyi al.
  const [lastInit, setLastInit] = useState(initialTasks)
  if (initialTasks !== lastInit) {
    setLastInit(initialTasks)
    setTasks(initialTasks)
  }

  // fallback → seed'ler kalıcı DEĞİL (sahte id). Etkileşimli render etme; boş
  // durum + hızlı-ekle göster. İlk gerçek görev eklenince refresh 'supabase'e döner.
  const isSeed = source === 'fallback'

  const run = useCallback(
    (action: () => Promise<unknown>) => {
      startTransition(async () => {
        try {
          const res = await action()
          // taskActions {success?, error?} döner — hatayı yutma, kullanıcıya söyle.
          const err =
            res && typeof res === 'object' && 'error' in res
              ? (res as { error?: string }).error
              : undefined
          setLastError(err ?? null)
        } catch (e) {
          setLastError(e instanceof Error ? e.message : 'Beklenmeyen hata')
        } finally {
          // refresh her durumda: hata varsa authoritative veri optimistik durumu geri alır.
          router.refresh()
        }
      })
    },
    [router],
  )

  const sorted = sortTasks(tasks)
  // Seed (fallback) modda kalıcı olmayan seed satırları gizlenir; ama optimistik
  // temp satırlar GÖRÜNÜR kalmalı — yoksa hızlı-ekle "hiçbir şey olmadı" gibi
  // görünür ve ikinci Enter DB'ye çift kayıt yazar.
  const visible = isSeed ? sorted.filter((t) => isTemp(t.id)) : sorted
  const activeList = visible.filter((t) => t.category === 'active')
  const waitingList = visible.filter((t) => t.category === 'waiting')
  const doneCount = activeList.filter((t) => t.is_done).length
  const activeTotal = activeList.length
  const pct = activeTotal ? Math.round((doneCount / activeTotal) * 100) : 0
  const selected = selectedId ? tasks.find((t) => t.id === selectedId) ?? null : null

  // ── Mutasyonlar (optimistik setState → server action → refresh) ───────────
  function addTask() {
    const title = draft.trim()
    if (!title) return
    const tempId = `temp-${crypto.randomUUID()}`
    setTasks((prev) => [
      ...prev,
      {
        id: tempId,
        title,
        is_done: false,
        category: 'active',
        // Sunucu (addActiveTask) sort_order göndermez → DB default 0.
        // Optimistik değer de 0 olmalı; yoksa satır refresh'te zıplar.
        sort_order: 0,
        is_priority: false,
        created_at: new Date().toISOString(),
        steps: [],
      },
    ])
    setDraft('')
    run(() => addActiveTask(title, 'active'))
  }

  function toggleDone(task: ActiveTask) {
    if (isTemp(task.id)) return
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, is_done: !t.is_done } : t)))
    run(() => toggleActiveTask(task.id, task.is_done))
  }

  function togglePriority(task: ActiveTask) {
    if (isTemp(task.id)) return
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, is_priority: !t.is_priority } : t)))
    run(() => toggleTaskPriority(task.id, !!task.is_priority))
  }

  function move(task: ActiveTask, to: 'active' | 'waiting') {
    if (isTemp(task.id)) return
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, category: to } : t)))
    run(() => moveActiveTask(task.id, to))
  }

  function remove(id: string) {
    if (isTemp(id)) return
    setTasks((prev) => prev.filter((t) => t.id !== id))
    if (selectedId === id) setSelectedId(null)
    run(() => deleteActiveTask(id))
  }

  function editField(id: string, patch: { title?: string; description?: string; due_date?: string | null }) {
    if (isTemp(id)) return
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              ...(patch.title !== undefined ? { title: patch.title.trim() || t.title } : {}),
              ...(patch.description !== undefined ? { description: patch.description.trim() || undefined } : {}),
              ...(patch.due_date !== undefined ? { due_date: patch.due_date || undefined } : {}),
            }
          : t,
      ),
    )
    run(() => updateActiveTask(id, patch))
  }

  function editNote(id: string, note: string) {
    if (isTemp(id)) return
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, note: note.trim() || undefined } : t)))
    run(() => updateActiveTaskNote(id, note))
  }

  function toggleStep(taskId: string, stepId: string, wasDone: boolean) {
    if (isTemp(stepId)) return
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, steps: (t.steps ?? []).map((s) => (s.id === stepId ? { ...s, is_done: !wasDone } : s)) }
          : t,
      ),
    )
    run(() => toggleTaskStep(stepId, wasDone))
  }

  function addStep(taskId: string, title: string) {
    if (isTemp(taskId)) return
    const tempId = `temp-${crypto.randomUUID()}`
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              steps: [
                ...(t.steps ?? []),
                {
                  id: tempId,
                  task_id: taskId,
                  title,
                  is_done: false,
                  // addTaskStep sunucuda sort_order yazmaz → DB default 0; aynı kal.
                  sort_order: 0,
                  created_at: new Date().toISOString(),
                },
              ],
            }
          : t,
      ),
    )
    run(() => addTaskStep(taskId, title))
  }

  function deleteStep(taskId: string, stepId: string) {
    if (isTemp(stepId)) return
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, steps: (t.steps ?? []).filter((s) => s.id !== stepId) } : t)),
    )
    run(() => deleteTaskStep(stepId))
  }

  return (
    <section className="flex flex-col gap-4">
      <TaskRulesPanel />

      {/* Başlık + ilerleme */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
            Aktif Görevler
          </h2>
          <span className="num text-[11px] font-medium text-[var(--text-muted)]">
            {doneCount}/{activeTotal}
          </span>
        </div>
        {activeTotal > 0 && <ProgressBar progress={pct} />}

        {lastError && (
          <p role="alert" className="text-[11px] text-[var(--danger,#ff453a)]">
            Kaydedilemedi: {lastError} — liste sunucuyla eşitlendi.
          </p>
        )}

        {/* Hızlı ekle */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            addTask()
          }}
          className="flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 py-1 focus-within:border-[var(--border-strong)] transition-colors"
        >
          <Plus className="w-4 h-4 text-[var(--text-quaternary)] shrink-0" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Hızlı görev ekle…"
            aria-label="Hızlı görev ekle"
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:outline-none py-2"
          />
          {draft.trim() && (
            <button
              type="submit"
              className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-[var(--accent)] px-2 py-1 rounded hover:bg-[var(--accent-muted)] transition-colors"
            >
              Ekle
            </button>
          )}
        </form>

        {/* Aktif liste / boş durum */}
        {activeTotal === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 text-[var(--text-muted)] py-10 rounded-2xl border border-dashed border-[var(--border-subtle)]">
            <ListChecks className="w-7 h-7 text-[var(--text-quaternary)]" />
            <p className="text-xs font-medium">
              {isSeed ? 'Henüz kalıcı görev yok. İlk görevini yukarıdan ekle.' : 'Aktif görev yok. Yukarıdan ekle.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {activeList.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                today={today}
                onToggleDone={toggleDone}
                onTogglePriority={togglePriority}
                onOpen={() => setSelectedId(t.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bekleyen grubu — ikincil, soluk, aç/kapa (varsayılan kapalı) */}
      {waitingList.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => setWaitingOpen((o) => !o)}
            aria-expanded={waitingOpen}
            className="group flex items-center justify-between gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <span className="flex items-center gap-1.5">
              <ChevronRight
                className={cn(
                  'w-3.5 h-3.5 text-[var(--text-quaternary)] transition-transform duration-200',
                  waitingOpen && 'rotate-90',
                )}
              />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-quaternary)] group-hover:text-[var(--text-muted)] transition-colors">
                Bekleyen
              </span>
            </span>
            <span className="num text-[11px] text-[var(--text-quaternary)]">{waitingList.length}</span>
          </button>
          {waitingOpen && (
            <div className="flex flex-col gap-2 opacity-70">
              {waitingList.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  today={today}
                  onToggleDone={toggleDone}
                  onTogglePriority={togglePriority}
                  onOpen={() => setSelectedId(t.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <ActiveTaskDetailSheet
        key={selectedId ?? 'none'}
        task={selected}
        today={today}
        onClose={() => setSelectedId(null)}
        onEditField={editField}
        onEditNote={editNote}
        onTogglePriority={togglePriority}
        onMove={move}
        onDelete={remove}
        onToggleStep={toggleStep}
        onAddStep={addStep}
        onDeleteStep={deleteStep}
      />
    </section>
  )
}

function TaskRow({
  task,
  today,
  onToggleDone,
  onTogglePriority,
  onOpen,
}: {
  task: ActiveTask
  today: string
  onToggleDone: (task: ActiveTask) => void
  onTogglePriority: (task: ActiveTask) => void
  onOpen: () => void
}) {
  const due = dueMeta(task, today)
  const steps = stepProgress(task)
  const flagged = !!task.is_priority && !task.is_done
  // Sunucu id'si henüz yok (optimistik satır): detay açma + mutasyon kapalı.
  const pending = isTemp(task.id)
  const open = () => {
    if (!pending) onOpen()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      aria-label={`${task.title} — detay`}
      aria-disabled={pending || undefined}
      className={cn(
        'group cursor-pointer rounded-2xl border bg-[var(--bg-card)] px-3.5 py-3 flex items-center gap-3 transition-colors duration-200 hover:bg-[var(--bg-card-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        flagged ? 'border-[var(--accent)]/40' : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]',
        pending && 'opacity-60 cursor-default',
      )}
    >
      {/* Tamamlama dairesi */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleDone(task)
        }}
        disabled={pending}
        aria-label={`${task.title} · tamamla`}
        aria-pressed={task.is_done}
        className={cn(
          'shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]',
          task.is_done
            ? 'bg-[var(--success,#34d399)] text-black'
            : 'border-2 border-[var(--border-strong,rgba(255,255,255,0.15))] hover:border-[var(--accent)]',
        )}
      >
        {task.is_done && <Check className="w-4 h-4" strokeWidth={3} />}
      </button>

      {/* Başlık + meta */}
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'text-sm font-medium truncate',
            task.is_done ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]',
          )}
        >
          {task.title}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onTogglePriority(task)
            }}
            disabled={pending}
            aria-label={task.is_priority ? 'Önceliği kaldır' : 'Önceliğe al'}
            aria-pressed={!!task.is_priority}
            className="inline-flex items-center rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <Star
              className={cn(
                'w-3.5 h-3.5 transition-colors',
                task.is_priority
                  ? 'text-[var(--warning,#ffd60a)] fill-[var(--warning,#ffd60a)]'
                  : 'text-[var(--text-quaternary)] hover:text-[var(--text-muted)]',
              )}
            />
          </button>

          {steps.total > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
              <span className="text-[var(--text-quaternary)]">·</span>
              <span className="num">
                {steps.done}/{steps.total} adım
              </span>
            </span>
          )}

          {steps.nextTitle && steps.done < steps.total && !task.is_done && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] min-w-0">
              <span className="text-[var(--text-quaternary)]">·</span>
              <span className="truncate max-w-[160px]">▸ {steps.nextTitle}</span>
            </span>
          )}

          {due.state !== 'none' && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[11px]',
                due.state === 'overdue'
                  ? 'text-[var(--danger,#ff453a)]'
                  : due.state === 'today'
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--text-muted)]',
              )}
            >
              <span className="text-[var(--text-quaternary)]">·</span>
              <Clock className="w-3 h-3" />
              <span
                className={cn(
                  due.state === 'upcoming' ? 'num' : 'text-[10px] font-bold uppercase tracking-wide',
                )}
              >
                {due.label}
              </span>
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="w-4 h-4 shrink-0 text-[var(--text-quaternary)] group-hover:text-[var(--text-muted)] transition-colors" />
    </div>
  )
}
