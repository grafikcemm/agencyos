'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { addExam, deleteExam } from '@/app/actions/academyActions'
import { withDaysLeft, examTypeLabel, type AkademiExam } from '@/lib/akademi/dates'
import type { AkademiCourse } from '@/lib/akademi/agno'

interface ExamTrackerProps {
  courses: AkademiCourse[]
  exams: AkademiExam[]
}

type ExamType = AkademiExam['exam_type']

const EXAM_TYPES: { value: ExamType; label: string }[] = [
  { value: 'vize', label: 'Vize' },
  { value: 'final', label: 'Final' },
  { value: 'butunleme', label: 'Bütünleme' },
]

export function ExamTracker({ courses, exams }: ExamTrackerProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [courseName, setCourseName] = useState('')
  const [examType, setExamType] = useState<ExamType>('final')
  const [examDate, setExamDate] = useState('')
  const [examTime, setExamTime] = useState('')

  const dated = withDaysLeft(exams)
  const upcoming = dated.filter((e) => e.daysLeft >= 0)
  const past = dated.filter((e) => e.daysLeft < 0).reverse()

  function submit() {
    setError(null)
    if (!courseName) {
      setError('Ders seç.')
      return
    }
    if (!examDate) {
      setError('Tarih gir.')
      return
    }
    const found = courses.find((c) => c.name === courseName)
    startTransition(async () => {
      const res = await addExam({
        courseId: found?.id ?? null,
        courseName,
        examType,
        examDate,
        examTime: examTime || null,
      })
      if (!res.success) {
        setError(res.error ?? 'Sınav eklenemedi.')
        return
      }
      setCourseName('')
      setExamDate('')
      setExamTime('')
      router.refresh()
    })
  }

  function remove(id: number) {
    startTransition(async () => {
      await deleteExam(id)
      router.refresh()
    })
  }

  return (
    <section aria-label="Sınav takibi" className="space-y-4">
      <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
        Sınav Takibi
      </p>

      {/* Ekleme formu */}
      <div
        className="rounded-xl border bg-[var(--bg-surface)] p-3.5"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <Select value={courseName} onValueChange={setCourseName} disabled={pending}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Ders seç" />
            </SelectTrigger>
            <SelectContent>
              {courses
                .filter((c) => c.in_average)
                .map((c) => (
                  <SelectItem key={c.id} value={c.name} className="text-xs">
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <Select value={examType} onValueChange={(v) => setExamType(v as ExamType)} disabled={pending}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXAM_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-xs">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <input
            type="date"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            disabled={pending}
            className="h-9 rounded-md border bg-[var(--bg-elevated)] px-2.5 text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
            style={{ borderColor: 'var(--border-subtle)', colorScheme: 'dark' }}
          />

          <input
            type="time"
            value={examTime}
            onChange={(e) => setExamTime(e.target.value)}
            disabled={pending}
            className="h-9 rounded-md border bg-[var(--bg-elevated)] px-2.5 text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
            style={{ borderColor: 'var(--border-subtle)', colorScheme: 'dark' }}
          />
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3">
          {error ? (
            <span className="text-xs text-[#ff5d6c]">{error}</span>
          ) : (
            <span className="text-[10px] font-mono text-[var(--text-muted)]">Manuel giriş · otomatik çekme yok</span>
          )}
          <Button size="sm" onClick={submit} disabled={pending}>
            Sınav Ekle
          </Button>
        </div>
      </div>

      {/* Gelecek */}
      <div className="space-y-2">
        {upcoming.length === 0 && (
          <p className="text-xs text-[var(--text-muted)] px-0.5">Yaklaşan sınav yok.</p>
        )}
        {upcoming.map((e) => (
          <ExamRow key={e.id} exam={e} onDelete={() => remove(e.id)} disabled={pending} />
        ))}
      </div>

      {/* Geçmiş (soluk) */}
      {past.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer select-none items-center justify-between text-[10px] font-mono uppercase tracking-wide text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            <span>Geçmiş sınavlar ({past.length})</span>
            <span className="group-open:hidden">+</span>
            <span className="hidden group-open:inline">−</span>
          </summary>
          <div className="mt-2 space-y-2 opacity-50">
            {past.map((e) => (
              <ExamRow key={e.id} exam={e} onDelete={() => remove(e.id)} disabled={pending} past />
            ))}
          </div>
        </details>
      )}
    </section>
  )
}

function ExamRow({
  exam,
  onDelete,
  disabled,
  past,
}: {
  exam: AkademiExam & { daysLeft: number }
  onDelete: () => void
  disabled: boolean
  past?: boolean
}) {
  const urgent = !past && exam.daysLeft <= 3
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border bg-[var(--bg-surface)] px-3 py-2"
      style={{ borderColor: urgent ? '#ff5d6c55' : 'var(--border-subtle)' }}
    >
      <div className="min-w-0">
        <p className="truncate text-sm text-[var(--text-primary)]">{exam.course_name ?? 'Sınav'}</p>
        <p className="text-[10px] font-mono text-[var(--text-muted)]">
          {examTypeLabel(exam.exam_type)} · {exam.exam_date}
          {exam.exam_time ? ` · ${exam.exam_time}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {!past && (
          <span
            className="text-xs font-mono tabular-nums"
            style={{ color: urgent ? '#ff5d6c' : 'var(--text-secondary)' }}
          >
            {exam.daysLeft === 0 ? 'Bugün' : `${exam.daysLeft}g`}
          </span>
        )}
        <button
          onClick={onDelete}
          disabled={disabled}
          aria-label="Sınavı sil"
          className="text-[var(--text-muted)] hover:text-[#ff5d6c] transition-colors text-sm leading-none"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
