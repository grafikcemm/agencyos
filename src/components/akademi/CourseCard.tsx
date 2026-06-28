'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  LETTER_OPTIONS,
  letterToPoint,
  type AkademiCourse,
  type CourseStatus,
} from '@/lib/akademi/agno'

const NONE = '__none__'

const STATUS_OPTIONS: { value: CourseStatus; label: string }[] = [
  { value: 'alinacak', label: 'Alınacak' },
  { value: 'aktif', label: 'Aktif' },
  { value: 'gecti', label: 'Geçti' },
  { value: 'kaldi', label: 'Kaldı' },
]

const STATUS_COLOR: Record<CourseStatus, string> = {
  alinacak: 'var(--text-muted)',
  aktif: '#0099ff',
  gecti: '#46d39a',
  kaldi: '#ff5d6c',
}

interface CourseCardProps {
  course: AkademiCourse
  busy: boolean
  onExpectedLetter: (id: number, letter: string | null) => void
  onActualLetter: (id: number, letter: string | null) => void
  onStatus: (id: number, status: CourseStatus) => void
}

export function CourseCard({ course, busy, onExpectedLetter, onActualLetter, onStatus }: CourseCardProps) {
  const isFinal = course.status === 'gecti' || course.status === 'kaldi'
  const highlight = course.is_risk || course.status === 'aktif'
  const glow = course.is_risk ? '#ff5d6c' : '#0099ff'
  const point = letterToPoint(course.actual_letter ?? course.expected_letter)

  return (
    <div
      className="relative overflow-hidden rounded-xl border bg-[var(--bg-surface)] p-3.5 transition-colors"
      style={{
        borderColor: highlight ? `${glow}66` : 'var(--border-subtle)',
        boxShadow: highlight ? `0 0 22px -10px ${glow}` : undefined,
        opacity: busy ? 0.6 : 1,
      }}
    >
      {/* Üst satır: ad + AKTS */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)] leading-snug">{course.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge>{course.akts} AKTS</Badge>
            {course.kind === 'retake' ? <Badge tone="warn">Tekrar</Badge> : <Badge tone="accent">Yeni</Badge>}
            <Badge>{course.category === 'secmeli' ? 'Seçmeli' : 'Zorunlu'}</Badge>
            {course.is_risk && <Badge tone="danger">Risk · Capstone</Badge>}
          </div>
        </div>
        {point !== null && (
          <span className="shrink-0 text-xs font-mono tabular-nums text-[var(--text-secondary)]">
            {point.toFixed(1)}
          </span>
        )}
      </div>

      {/* Alt satır: durum + harf seçimleri */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Durum">
          <Select value={course.status} onValueChange={(v) => onStatus(course.id, v as CourseStatus)} disabled={busy}>
            <SelectTrigger className="h-8 text-xs" style={{ color: STATUS_COLOR[course.status] }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-xs">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={isFinal ? 'Kesin not' : 'Beklenen not'}>
          <LetterSelect
            value={isFinal ? course.actual_letter : course.expected_letter}
            disabled={busy}
            onChange={(letter) =>
              isFinal ? onActualLetter(course.id, letter) : onExpectedLetter(course.id, letter)
            }
          />
        </Field>
      </div>
    </div>
  )
}

function LetterSelect({
  value,
  disabled,
  onChange,
}: {
  value: string | null
  disabled: boolean
  onChange: (letter: string | null) => void
}) {
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE} className="text-xs text-[var(--text-muted)]">
          — (boş)
        </SelectItem>
        {LETTER_OPTIONS.map((l) => (
          <SelectItem key={l} value={l} className="text-xs">
            {l} · {letterToPoint(l)?.toFixed(1)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] font-mono uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  )
}

function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'accent' | 'warn' | 'danger' }) {
  const styles: Record<string, string> = {
    default: 'border-[var(--border-subtle)] text-[var(--text-muted)]',
    accent: 'border-[#0099ff55] text-[#0099ff]',
    warn: 'border-[#f5c45155] text-[#f5c451]',
    danger: 'border-[#ff5d6c55] text-[#ff5d6c]',
  }
  return (
    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide ${styles[tone]}`}>
      {children}
    </span>
  )
}
