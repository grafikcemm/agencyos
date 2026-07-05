'use client'

import { useEffect, useState } from 'react'
import { X, Star, Trash2, Plus, Check, ArrowRight, Clock } from 'lucide-react'
import type { ActiveTask } from '@/types/tasks'
import { cn } from '@/lib/utils'
import { dueMeta } from './taskUtils'

interface Props {
  task: ActiveTask | null
  today: string
  onClose: () => void
  onEditField: (id: string, patch: { title?: string; description?: string; due_date?: string | null }) => void
  onEditNote: (id: string, note: string) => void
  onTogglePriority: (task: ActiveTask) => void
  onMove: (task: ActiveTask, to: 'active' | 'waiting') => void
  onDelete: (id: string) => void
  onToggleStep: (taskId: string, stepId: string, wasDone: boolean) => void
  onAddStep: (taskId: string, title: string) => void
  onDeleteStep: (taskId: string, stepId: string) => void
}

// HabitDetailSheet ile aynı fixed-overlay deseni. Parent bu bileşeni
// key={task.id} ile render eder → farklı göreve geçince metin alanları temiz
// state ile remount olur. Metin alanları yerel state (blur'da commit); toggle
// ve adımlar doğrudan parent'ın canlı state'inden (task prop) okunur.
export function ActiveTaskDetailSheet({
  task,
  today,
  onClose,
  onEditField,
  onEditNote,
  onTogglePriority,
  onMove,
  onDelete,
  onToggleStep,
  onAddStep,
  onDeleteStep,
}: Props) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [note, setNote] = useState(task?.note ?? '')
  const [dueDate, setDueDate] = useState(task?.due_date ?? '')
  const [stepDraft, setStepDraft] = useState('')

  useEffect(() => {
    if (!task) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [task, onClose])

  if (!task) return null

  const steps = task.steps ?? []
  const doneSteps = steps.filter((s) => s.is_done).length
  const due = dueMeta(task, today)

  function commitTitle() {
    if (!task) return
    const v = title.trim()
    if (!v) {
      setTitle(task.title)
      return
    }
    if (v !== task.title) onEditField(task.id, { title: v })
  }

  function commitDescription() {
    if (!task) return
    if ((description.trim() || '') !== (task.description ?? '')) {
      onEditField(task.id, { description })
    }
  }

  function commitNote() {
    if (!task) return
    if ((note.trim() || '') !== (task.note ?? '')) onEditNote(task.id, note)
  }

  function commitDue(value: string) {
    if (!task) return
    setDueDate(value)
    onEditField(task.id, { due_date: value || null })
  }

  function submitStep(e: React.FormEvent) {
    e.preventDefault()
    if (!task) return
    const v = stepDraft.trim()
    if (!v) return
    onAddStep(task.id, v)
    setStepDraft('')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={task.title}
    >
      <button
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 motion-reduce:animate-none"
      />
      <div className="relative w-full sm:max-w-[480px] max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 ease-out motion-reduce:animate-none">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-[var(--bg-card)]/95 backdrop-blur border-b border-[var(--border-subtle)]">
          <span className="label-eyebrow text-[var(--text-muted)] flex-1">
            {task.category === 'active' ? 'Aktif görev' : 'Bekleyen'}
          </span>
          <button
            aria-label="Kapat"
            onClick={onClose}
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-6">
          {/* Başlık */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            aria-label="Görev başlığı"
            className="w-full bg-transparent text-base font-semibold text-[var(--text-primary)] leading-snug focus:outline-none border-b border-transparent focus:border-[var(--border-subtle)] pb-1 transition-colors"
          />

          {/* Son tarih */}
          <Field label="Son tarih">
            <div className="flex items-center gap-2">
              <Clock
                className={cn(
                  'w-3.5 h-3.5 shrink-0',
                  due.state === 'overdue'
                    ? 'text-[var(--danger,#ff453a)]'
                    : due.state === 'today'
                      ? 'text-[var(--accent)]'
                      : 'text-[var(--text-muted)]',
                )}
              />
              <input
                type="date"
                value={dueDate}
                onChange={(e) => commitDue(e.target.value)}
                aria-label="Son tarih"
                className="bg-transparent text-[13px] text-[var(--text-secondary)] focus:outline-none [color-scheme:dark]"
              />
              {due.state === 'overdue' && (
                <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--danger,#ff453a)]">
                  Gecikti
                </span>
              )}
              {dueDate && (
                <button
                  onClick={() => commitDue('')}
                  className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors ml-auto"
                >
                  Temizle
                </button>
              )}
            </div>
          </Field>

          {/* Açıklama / netleştir */}
          <Field label="Açıklama">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={commitDescription}
              rows={2}
              placeholder="Görevi netleştir — ne, neden, nasıl?"
              className="w-full resize-none rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated,rgba(255,255,255,0.03))] px-3 py-2.5 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-quaternary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
            />
          </Field>

          {/* Adımlar — büyük hedefi parçala */}
          <Field label={`Adımlar${steps.length ? ` · ${doneSteps}/${steps.length}` : ''}`}>
            <div className="flex flex-col gap-2">
              {steps.length === 0 && (
                <p className="text-[12px] text-[var(--text-muted)]">
                  Büyük hedefi park etme — sıradaki somut adımlara böl.
                </p>
              )}
              {steps.map((s) => (
                <div key={s.id} className="group/step flex items-center gap-2.5">
                  <button
                    onClick={() => onToggleStep(task.id, s.id, s.is_done)}
                    aria-label={`${s.title} · işaretle`}
                    aria-pressed={s.is_done}
                    className={cn(
                      'shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-150 active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                      s.is_done
                        ? 'bg-[var(--success,#34d399)] text-black'
                        : 'border-2 border-[var(--border-strong,rgba(255,255,255,0.15))] hover:border-[var(--accent)]',
                    )}
                  >
                    {s.is_done && <Check className="w-3 h-3" strokeWidth={3} />}
                  </button>
                  <span
                    className={cn(
                      'flex-1 text-[13px] leading-snug',
                      s.is_done ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-secondary)]',
                    )}
                  >
                    {s.title}
                  </span>
                  <button
                    onClick={() => onDeleteStep(task.id, s.id)}
                    aria-label="Adımı sil"
                    className="shrink-0 opacity-0 group-hover/step:opacity-100 focus:opacity-100 text-[var(--text-quaternary)] hover:text-[var(--danger,#ff453a)] transition-all focus:outline-none"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <form onSubmit={submitStep} className="flex items-center gap-2 pt-0.5">
                <Plus className="w-3.5 h-3.5 text-[var(--text-quaternary)] shrink-0" />
                <input
                  value={stepDraft}
                  onChange={(e) => setStepDraft(e.target.value)}
                  placeholder="Adım ekle…"
                  aria-label="Adım ekle"
                  className="flex-1 bg-transparent text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-quaternary)] focus:outline-none py-1"
                />
              </form>
            </div>
          </Field>

          {/* Not */}
          <Field label="Not">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={commitNote}
              rows={2}
              placeholder="Kısa hatırlatma / bağlam"
              className="w-full resize-none rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated,rgba(255,255,255,0.03))] px-3 py-2.5 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-quaternary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
            />
          </Field>

          {/* Aksiyonlar */}
          <div className="flex items-center gap-2 pt-1 border-t border-[var(--border-subtle)] mt-1">
            <button
              onClick={() => onTogglePriority(task)}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2.5 py-2 rounded-lg hover:bg-[var(--bg-card-hover)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <Star
                className={cn(
                  'w-3.5 h-3.5',
                  task.is_priority ? 'text-[var(--warning,#ffd60a)] fill-[var(--warning,#ffd60a)]' : '',
                )}
              />
              {task.is_priority ? 'Önceliği kaldır' : 'Önceliğe al'}
            </button>

            <button
              onClick={() => onMove(task, task.category === 'active' ? 'waiting' : 'active')}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2.5 py-2 rounded-lg hover:bg-[var(--bg-card-hover)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              {task.category === 'active' ? 'Bekleyene al' : 'Aktife al'}
            </button>

            <button
              onClick={() => {
                // Yıkıcı + geri alınamaz (adımlar CASCADE ile gider) — onay şart.
                if (window.confirm(`"${task.title}" kalıcı olarak silinsin mi?`)) onDelete(task.id)
              }}
              aria-label="Görevi sil"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--danger,#ff453a)] px-2.5 py-2 rounded-lg hover:bg-[var(--bg-card-hover)] transition-colors ml-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Sil
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="label-eyebrow text-[var(--text-muted)]">{label}</span>
      {children}
    </div>
  )
}
