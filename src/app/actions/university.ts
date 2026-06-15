"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Üniversiteye ait tüm veriyi çek
export async function getUniversityData(slug: string) {
  const supabase = createClient();

  const { data: university } = await supabase
    .from('universities')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!university) return null;

  const { data: courses } = await supabase
    .from('courses')
    .select('*')
    .eq('university_id', university.id)
    .order('subsection', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true });

  const { data: exams } = await supabase
    .from('exams')
    .select('*, courses(name)')
    .eq('university_id', university.id)
    .order('exam_date', { ascending: true });

  const { data: points } = await supabase
    .from('university_points')
    .select('points');

  const totalPoints = points?.reduce((sum, p) => sum + p.points, 0) || 0;

  return { university, courses: courses || [], 
           exams: exams || [], totalPoints };
}

// Ders ekle
export async function addCourse(data: {
  university_id: string;
  name: string;
  instructor?: string;
  status: 'critical' | 'on_track' | 'safe';
  midterm_score?: number;
  notes?: string;
}) {
  const supabase = createClient();
  await supabase.from('courses').insert(data);
  revalidatePath('/universite');
}

// Ders güncelle
export async function updateCourse(id: string, data: Partial<{
  name: string;
  instructor: string;
  status: 'critical' | 'on_track' | 'safe';
  midterm_score: number;
  notes: string;
}>) {
  const supabase = createClient();
  await supabase.from('courses').update(data).eq('id', id);
  revalidatePath('/universite');
}

// Ders sil
export async function deleteCourse(id: string) {
  const supabase = createClient();
  await supabase.from('courses').delete().eq('id', id);
  revalidatePath('/universite');
}

// Sınav ekle
export async function addExam(data: {
  university_id: string;
  course_id?: string;
  title: string;
  exam_date: string;
  type: 'exam' | 'assignment' | 'project';
}) {
  const supabase = createClient();
  await supabase.from('exams').insert(data);
  revalidatePath('/universite');
}

// Sınavı tamamlandı işaretle
export async function toggleExam(id: string, is_completed: boolean) {
  const supabase = createClient();
  await supabase.from('exams')
    .update({ is_completed })
    .eq('id', id);
  revalidatePath('/universite');
}

// Sınav sil
export async function deleteExam(id: string) {
  const supabase = createClient();
  await supabase.from('exams').delete().eq('id', id);
  revalidatePath('/universite');
}

// Puan ekle
export async function addUniversityPoints(
  action: string, 
  points: number, 
  course_id?: string
) {
  const supabase = createClient();
  await supabase.from('university_points')
    .insert({ action, points, course_id });
  revalidatePath('/universite');
}
