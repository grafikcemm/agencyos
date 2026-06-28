'use client'

import { CourseCard } from './CourseCard'
import type { AkademiCourse, CourseStatus } from '@/lib/akademi/agno'

interface CourseColumnsProps {
  courses: AkademiCourse[]
  busyId: number | null
  onExpectedLetter: (id: number, letter: string | null) => void
  onActualLetter: (id: number, letter: string | null) => void
  onStatus: (id: number, status: CourseStatus) => void
}

const TERMS: { key: 'guz' | 'bahar'; title: string }[] = [
  { key: 'guz', title: 'Güz' },
  { key: 'bahar', title: 'Bahar' },
]

export function CourseColumns({ courses, busyId, onExpectedLetter, onActualLetter, onStatus }: CourseColumnsProps) {
  return (
    <section aria-label="Ders listesi">
      <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--text-muted)] mb-3">
        Ders Listesi
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {TERMS.map((term) => {
          const list = courses.filter((c) => c.term === term.key && c.in_average)
          const totalAkts = list.reduce((sum, c) => sum + c.akts, 0)
          return (
            <div key={term.key} className="space-y-2.5">
              <div className="flex items-baseline justify-between px-0.5">
                <h2 className="text-base font-display font-bold text-[var(--text-primary)]">{term.title}</h2>
                <span className="text-xs font-mono text-[var(--text-muted)] tabular-nums">{totalAkts} AKTS</span>
              </div>
              {list.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  busy={busyId === course.id}
                  onExpectedLetter={onExpectedLetter}
                  onActualLetter={onActualLetter}
                  onStatus={onStatus}
                />
              ))}
            </div>
          )
        })}
      </div>
    </section>
  )
}
