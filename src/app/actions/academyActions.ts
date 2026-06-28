'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabaseServer'
import { assertSession } from '@/lib/auth'
import {
  LETTER_OPTIONS,
  type AkademiCourse,
  type CourseStatus,
} from '@/lib/akademi/agno'
import type { AkademiExam } from '@/lib/akademi/dates'

type ActionResult = { success: boolean; error?: string }

const VALID_LETTERS = new Set<string>(LETTER_OPTIONS)
const VALID_STATUS = new Set<CourseStatus>(['alinacak', 'aktif', 'gecti', 'kaldi'])
const VALID_EXAM_TYPE = new Set<AkademiExam['exam_type']>(['vize', 'final', 'butunleme'])

/** Tüm Beykent dersleri + sınavları (server component için, auth'suz read). */
export async function getAkademiData(): Promise<{
  courses: AkademiCourse[]
  exams: AkademiExam[]
}> {
  const supabase = createServerSupabase()
  const [{ data: courses }, { data: exams }] = await Promise.all([
    supabase.from('akademi_courses').select('*').order('term').order('sort_order'),
    supabase.from('akademi_exams').select('*').order('exam_date'),
  ])
  return {
    courses: (courses ?? []) as AkademiCourse[],
    exams: (exams ?? []) as AkademiExam[],
  }
}

/** Beklenen harf (projeksiyon girdisi). null → temizle. */
export async function setExpectedLetter(id: number, letter: string | null): Promise<ActionResult> {
  await assertSession()
  if (letter !== null && !VALID_LETTERS.has(letter)) {
    return { success: false, error: 'Geçersiz harf notu.' }
  }
  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('akademi_courses')
    .update({ expected_letter: letter })
    .eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/akademi')
  return { success: true }
}

/** Kesin sonuç harfi (gecti/kaldi). null → temizle. */
export async function setActualLetter(id: number, letter: string | null): Promise<ActionResult> {
  await assertSession()
  if (letter !== null && !VALID_LETTERS.has(letter)) {
    return { success: false, error: 'Geçersiz harf notu.' }
  }
  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('akademi_courses')
    .update({ actual_letter: letter })
    .eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/akademi')
  return { success: true }
}

/** Ders durumu (alinacak | aktif | gecti | kaldi). */
export async function setCourseStatus(id: number, status: CourseStatus): Promise<ActionResult> {
  await assertSession()
  if (!VALID_STATUS.has(status)) {
    return { success: false, error: 'Geçersiz durum.' }
  }
  const supabase = createServerSupabase()
  const { error } = await supabase.from('akademi_courses').update({ status }).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/akademi')
  return { success: true }
}

export interface AddExamInput {
  courseId: number | null
  courseName: string
  examType: AkademiExam['exam_type']
  examDate: string // YYYY-MM-DD
  examTime?: string | null
}

/** Manuel sınav ekle. */
export async function addExam(input: AddExamInput): Promise<ActionResult> {
  await assertSession()
  if (!VALID_EXAM_TYPE.has(input.examType)) {
    return { success: false, error: 'Geçersiz sınav türü.' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.examDate)) {
    return { success: false, error: 'Geçersiz tarih (YYYY-AA-GG).' }
  }
  if (!input.courseName.trim()) {
    return { success: false, error: 'Ders seçilmeli.' }
  }
  const supabase = createServerSupabase()
  const { error } = await supabase.from('akademi_exams').insert({
    course_id: input.courseId,
    course_name: input.courseName.trim(),
    exam_type: input.examType,
    exam_date: input.examDate,
    exam_time: input.examTime?.trim() || null,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/akademi')
  return { success: true }
}

/** Sınav sil. */
export async function deleteExam(id: number): Promise<ActionResult> {
  await assertSession()
  const supabase = createServerSupabase()
  const { error } = await supabase.from('akademi_exams').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/akademi')
  return { success: true }
}
