'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ExamHero } from './ExamHero'
import { AgnoMeter } from './AgnoMeter'
import { CourseColumns } from './CourseColumns'
import { ExamTracker } from './ExamTracker'
import { projectAgno, type AkademiCourse, type CourseStatus } from '@/lib/akademi/agno'
import type { AkademiExam } from '@/lib/akademi/dates'
import {
  setExpectedLetter,
  setActualLetter,
  setCourseStatus,
} from '@/app/actions/academyActions'

interface AkademiClientProps {
  courses: AkademiCourse[]
  exams: AkademiExam[]
}

export function AkademiClient({ courses: initialCourses, exams }: AkademiClientProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [courses, setCourses] = useState(initialCourses)
  const [busyId, setBusyId] = useState<number | null>(null)

  const projection = useMemo(() => projectAgno(courses), [courses])
  const tmd = useMemo(() => courses.find((c) => !c.in_average), [courses])

  /** Optimistic alan güncelle → server action → hata olursa geri al. */
  function patch(id: number, change: Partial<AkademiCourse>, action: () => Promise<{ success: boolean; error?: string }>) {
    const prev = courses
    setCourses((cs) => cs.map((c) => (c.id === id ? { ...c, ...change } : c)))
    setBusyId(id)
    startTransition(async () => {
      const res = await action()
      if (!res.success) {
        setCourses(prev) // rollback
      }
      setBusyId(null)
      router.refresh()
    })
  }

  const onExpectedLetter = (id: number, letter: string | null) =>
    patch(id, { expected_letter: letter }, () => setExpectedLetter(id, letter))

  const onActualLetter = (id: number, letter: string | null) =>
    patch(id, { actual_letter: letter }, () => setActualLetter(id, letter))

  const onStatus = (id: number, status: CourseStatus) =>
    patch(id, { status }, () => setCourseStatus(id, status))

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 lg:px-6 space-y-5">
      <ExamHero exams={exams} />

      <AgnoMeter
        agno={projection.agno}
        band={projection.band}
        denominator={projection.denominator}
        gradAkts={projection.gradAkts}
        countedCourses={projection.countedCourses}
      />

      <CourseColumns
        courses={courses}
        busyId={busyId}
        onExpectedLetter={onExpectedLetter}
        onActualLetter={onActualLetter}
        onStatus={onStatus}
      />

      <ExamTracker courses={courses} exams={exams} />

      {/* İkincil: katlanır */}
      <details className="group rounded-xl border bg-[var(--bg-surface)]/40" style={{ borderColor: 'var(--border-subtle)' }}>
        <summary className="flex cursor-pointer select-none items-center justify-between p-4 text-xs font-mono uppercase tracking-wide text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
          <span>Daha fazla · intibak & bilgi</span>
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">−</span>
        </summary>
        <div className="px-4 pb-4 space-y-2 text-xs text-[var(--text-secondary)]">
          {tmd && (
            <p>
              <span className="font-mono text-[var(--text-muted)]">İntibak: </span>
              {tmd.name} — 0 AKTS, AGNO&apos;ya girmez · <span className="text-[var(--text-muted)]">kapatılacak</span>
            </p>
          )}
          <p className="text-[var(--text-muted)]">
            Baseline 203 AKTS / 331.5 puan transkriptten sabittir. Tekrar dersler paydayı şişirmez;
            yalnız yeni dersler (16 AKTS) mezuniyet paydasını 219&apos;a çıkarır.
          </p>
        </div>
      </details>
    </div>
  )
}
