'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { mirrorHabitDone } from '@/app/actions/habitActions'
import { HABIT_SOURCE_BY_SYSTEM_TYPE } from '@/lib/habits/config'

// Template task'ı tamamla/geri al
// v2: Sadece UUID formatındaki template_id yazılır. Fallback string ID'ler (rutin_*) engellenir.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function toggleTemplateTask(
  templateId: string,
  isCompleted: boolean
): Promise<{ success: boolean; error?: string }> {
  if (!UUID_RE.test(templateId)) {
    console.warn(`toggleTemplateTask: non-UUID templateId blocked: ${templateId}`)
    return { success: false, error: 'non-UUID templateId blocked' }
  }
  const supabase = createClient()
  const today = new Date().toISOString().slice(0, 10)

  if (isCompleted) {
    const { error } = await supabase
      .from('daily_completions')
      .delete()
      .eq('template_id', templateId)
      .eq('date', today)
    if (error) return { success: false, error: error.message }
  } else {
    const { error } = await supabase
      .from('daily_completions')
      .upsert(
        { template_id: templateId, date: today },
        { onConflict: 'template_id,date' }
      )
    if (error) return { success: false, error: error.message }
  }

  // Mirror → alışkanlık zinciri (saz/spor/ingilizce). Yeni durum = !isCompleted. best-effort.
  const { data: tpl } = await supabase
    .from('task_templates')
    .select('system_type')
    .eq('id', templateId)
    .maybeSingle()
  const habitKey = tpl?.system_type ? HABIT_SOURCE_BY_SYSTEM_TYPE[tpl.system_type] : undefined
  if (habitKey) await mirrorHabitDone(habitKey, today, !isCompleted)

  revalidatePath('/')
  return { success: true }
}

// Aktif görev ekle
export async function addActiveTask(
  title: string,
  category: 'active' | 'waiting' = 'active'
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  if (!title.trim()) return { success: false, error: 'Görev başlığı boş olamaz.' }
  const { error } = await supabase.from('active_tasks').insert({ title: title.trim(), category })
  if (error) return { success: false, error: error.message }
  revalidatePath('/')
  return { success: true }
}

// Aktif görevi sil
export async function deleteActiveTask(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('active_tasks').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/')
  return { success: true }
}

// Aktif görevi tamamla/geri al
export async function toggleActiveTask(
  id: string,
  isCurrentlyDone: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase
    .from('active_tasks')
    .update({ is_done: !isCurrentlyDone })
    .eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/')
  return { success: true }
}

export async function moveActiveTask(
  id: string,
  to: 'active' | 'waiting'
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('active_tasks').update({ category: to }).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/')
  return { success: true }
}

export async function toggleTaskPriority(
  id: string,
  isCurrentlyPriority: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase
    .from('active_tasks')
    .update({ is_priority: !isCurrentlyPriority })
    .eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/')
  return { success: true }
}

export async function updateActiveTaskNote(
  id: string,
  note: string
): Promise<{ error?: string }> {
  const supabase = createClient()
  const { error } = await supabase
    .from('active_tasks')
    .update({ note: note.trim() || null })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/')
  return {}
}

// Görevi netleştir: başlık / açıklama / son tarih (detay ekranı).
// Yalnız verilen alanlar güncellenir (kısmi patch).
export async function updateActiveTask(
  id: string,
  patch: { title?: string; description?: string; due_date?: string | null }
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const updates: Record<string, unknown> = {}
  if (patch.title !== undefined) {
    if (!patch.title.trim()) return { success: false, error: 'Başlık boş olamaz.' }
    updates.title = patch.title.trim()
  }
  if (patch.description !== undefined) updates.description = patch.description.trim() || null
  if (patch.due_date !== undefined) updates.due_date = patch.due_date || null
  if (Object.keys(updates).length === 0) return { success: true }
  const { error } = await supabase.from('active_tasks').update(updates).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/')
  return { success: true }
}

// ── Görev alt-adımları (büyük hedefi parçala — "sıradaki tek adım") ───────────
export async function addTaskStep(
  taskId: string,
  title: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  if (!title.trim()) return { success: false, error: 'Adım başlığı boş olamaz.' }
  const { error } = await supabase
    .from('active_task_steps')
    .insert({ task_id: taskId, title: title.trim() })
  if (error) return { success: false, error: error.message }
  revalidatePath('/')
  return { success: true }
}

export async function toggleTaskStep(
  id: string,
  isCurrentlyDone: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase
    .from('active_task_steps')
    .update({ is_done: !isCurrentlyDone })
    .eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/')
  return { success: true }
}

export async function deleteTaskStep(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('active_task_steps').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/')
  return { success: true }
}
