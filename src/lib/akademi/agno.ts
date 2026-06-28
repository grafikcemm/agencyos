// Beykent AGNO projeksiyon çekirdeği (saf, test edilebilir).
//
// Baseline transkriptten sabit: ortalamaya giren AKTS=203, toplam puan=331.5,
// AGNO=1.63. Kalan derslere beklenen/kesin harf girilince projeksiyon yeniden
// hesaplanır.
//
// retake kuralı (kritik): ders daha önce FF/DZ (0 puan) almış, AKTS zaten 203
// paydasında → yeniden alınınca PAYDA DEĞİŞMEZ, yalnız puan eklenir. new ders →
// hem payda hem puan eklenir. G/M ortalamaya girmez.

export const BASELINE = {
  aktsInAverage: 203,
  totalPoints: 331.5,
  agno: 331.5 / 203, // 1.633…
} as const

export const TARGET_AGNO = 2.0 // zorunlu mezuniyet eşiği
export const SAFE_AGNO = 2.25 // güvenli bant

/** Harf → katsayı. G/M/null ortalamaya girmez (undefined döner). */
export const LETTER_POINTS: Record<string, number> = {
  AA: 4.0,
  BA: 3.5,
  BB: 3.0,
  CB: 2.5,
  CC: 2.0,
  DC: 1.5,
  DD: 1.0,
  FD: 0.5,
  FF: 0,
  DZ: 0,
}

/** Beklenen-not seçeneği için harf listesi (UI Select). */
export const LETTER_OPTIONS = ['AA', 'BA', 'BB', 'CB', 'CC', 'DC', 'DD', 'FD', 'FF', 'DZ'] as const

export type CourseTerm = 'guz' | 'bahar'
export type CourseKind = 'retake' | 'new'
export type CourseCategory = 'zorunlu' | 'secmeli'
export type CourseStatus = 'alinacak' | 'aktif' | 'gecti' | 'kaldi'
export type AgnoBand = 'red' | 'yellow' | 'green'

export interface AkademiCourse {
  id: number
  name: string
  term: CourseTerm
  akts: number
  kind: CourseKind
  category: CourseCategory
  status: CourseStatus
  expected_letter: string | null
  actual_letter: string | null
  is_risk: boolean
  in_average: boolean
  sort_order: number
}

export interface AgnoProjection {
  agno: number
  points: number
  denominator: number
  band: AgnoBand
  /** Mezuniyet paydası: 203 + tüm new derslerin AKTS toplamı. */
  gradAkts: number
  /** Projeksiyona fiilen katkıda bulunan (harfi girilmiş) ders sayısı. */
  countedCourses: number
}

/** Harfi katsayıya çevirir. Bilinmeyen / G / M / null → null (ortalamaya girmez). */
export function letterToPoint(letter: string | null | undefined): number | null {
  if (!letter) return null
  const point = LETTER_POINTS[letter]
  return point === undefined ? null : point
}

/** AGNO değerinden renk bandı. <2.00 kırmızı · [2.00,2.25) sarı · ≥2.25 yeşil. */
export function agnoBand(agno: number): AgnoBand {
  if (agno < TARGET_AGNO) return 'red'
  if (agno < SAFE_AGNO) return 'yellow'
  return 'green'
}

/**
 * Etkin harf = kesin sonuç (actual) varsa o, yoksa beklenen (expected).
 * gecti/kaldi durumlarında actual, alinacak/aktif'te expected kullanılır.
 */
export function effectiveLetter(course: AkademiCourse): string | null {
  return course.actual_letter ?? course.expected_letter
}

/**
 * Canlı AGNO projeksiyonu. Yalnız in_average=true ve harfi girilmiş dersler katılır.
 * Harf girilmemiş dersler "henüz bilinmiyor" sayılır, projeksiyona girmez.
 * new derslerin AKTS'i (harf girilmiş olsun olmasın) gradAkts'a sayılır.
 */
export function projectAgno(courses: AkademiCourse[]): AgnoProjection {
  let points = BASELINE.totalPoints
  let denominator = BASELINE.aktsInAverage
  let gradAkts = BASELINE.aktsInAverage
  let countedCourses = 0

  for (const course of courses) {
    if (!course.in_average) continue

    // new ders → mezuniyet paydasına AKTS ekler (harf bağımsız)
    if (course.kind === 'new') gradAkts += course.akts

    const point = letterToPoint(effectiveLetter(course))
    if (point === null) continue // harf yok → projeksiyona girmez

    countedCourses += 1
    points += course.akts * point
    // retake: payda sabit (AKTS zaten baseline'da). new: payda += AKTS.
    if (course.kind === 'new') denominator += course.akts
  }

  const agno = denominator > 0 ? points / denominator : 0
  return {
    agno,
    points,
    denominator,
    band: agnoBand(agno),
    gradAkts,
    countedCourses,
  }
}
