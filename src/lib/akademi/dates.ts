// Sınav takvimi tarih yardımcıları (Europe/Istanbul). academic.ts'ten taşındı.

export interface AkademiExam {
  id: number
  course_id: number | null
  course_name: string | null
  exam_type: 'vize' | 'final' | 'butunleme'
  exam_date: string // YYYY-MM-DD
  exam_time: string | null
}

const EXAM_TYPE_LABELS: Record<AkademiExam['exam_type'], string> = {
  vize: 'Vize',
  final: 'Final',
  butunleme: 'Bütünleme',
}

export function examTypeLabel(type: AkademiExam['exam_type']): string {
  return EXAM_TYPE_LABELS[type] ?? type
}

/** Hedef tarihe kalan tam gün (Europe/Istanbul bugününe göre). Negatif = geçmiş. */
export function daysUntil(dateStr: string, now: Date = new Date()): number {
  const targetDateOnly = dateStr.split('T')[0]
  const targetTime = new Date(`${targetDateOnly}T00:00:00.000Z`).getTime()

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(now)
  let year = '',
    month = '',
    day = ''
  for (const part of parts) {
    if (part.type === 'year') year = part.value
    if (part.type === 'month') month = part.value
    if (part.type === 'day') day = part.value
  }
  const nowTime = new Date(`${year}-${month}-${day}T00:00:00.000Z`).getTime()
  return Math.round((targetTime - nowTime) / (1000 * 60 * 60 * 24))
}

export interface DatedExam extends AkademiExam {
  daysLeft: number
}

/** Tüm sınavları daysLeft ile etiketle, tarihe göre sırala (en yakın önce). */
export function withDaysLeft(exams: AkademiExam[], now: Date = new Date()): DatedExam[] {
  return exams
    .map((e) => ({ ...e, daysLeft: daysUntil(e.exam_date, now) }))
    .sort((a, b) => a.daysLeft - b.daysLeft)
}

/** Sıradaki sınav = daysLeft >= 0 olanların en yakını. Yoksa null. */
export function nextExam(exams: AkademiExam[], now: Date = new Date()): DatedExam | null {
  const upcoming = withDaysLeft(exams, now).filter((e) => e.daysLeft >= 0)
  return upcoming[0] ?? null
}
