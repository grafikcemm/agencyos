import 'server-only'
import { lifeSupabaseAdmin } from '@/lib/lifeSupabaseAdmin'
import { istanbulDate } from './cemosLifeAuth'

// ─────────────────────────────────────────────────────────────────────────────
// LIFE okuma katmanı — köprünün gördüğü TEK veri yüzeyi.
//
// Route'lar Supabase'e doğrudan sorgu yazmaz; alan seçimi burada tek yerde
// durur. Sebep sızıntı yüzeyi: `select('*')` yazan bir route, tabloya sonradan
// eklenen bir sütunu (örneğin bir Telegram mesaj kimliği) sessizce dışarı
// verirdi. Burada her alan AÇIKÇA sayılır.
//
// GÖNDERİLMEZ: Telegram token/mesaj kimliği, service-role anahtarı, konuşma
// geçmişi, CRM lead PII, Gmail içeriği, provider anahtarı, ham assistant memory.
// ─────────────────────────────────────────────────────────────────────────────

const TASK_FIELDS = 'id,title,is_done,category,sort_order,is_priority,note,description,due_date,created_at'
const STEP_FIELDS = 'id,task_id,title,is_done,sort_order,created_at'
const HABIT_FIELDS = 'id,key,is_active,target,cadence_type,sort_order'
const LOG_FIELDS = 'habit_key,date,value'
// `metadata` ve `telegram_message_id` BILINCLI olarak yok: ilki serbest jsonb
// (içerik taşıyabilir), ikincisi dış sistem kimliği.
const REMINDER_FIELDS = 'id,date,reminder_type,status,scheduled_at,sent_at'
const DAILY_FIELDS = 'date,day_mode,agency_load,energy,ui_mode,max_auto_tasks,next_action'

export type LifeWarnings = string[]

async function safe<T>(fn: () => Promise<T>, label: string, warnings: LifeWarnings, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    // Tablo yoksa ya da sorgu düşerse köprü 500 DÖNMEZ: eksik parça uyarı olur.
    // `daily_commitments` gibi migration dosyası olmayan tablolar için bu şart —
    // yoksa tek eksik tablo tüm snapshot'ı düşürürdü.
    warnings.push(`${label}: okunamadı (${String((e as Error)?.message ?? e).slice(0, 80)})`)
    return fallback
  }
}

export async function readTasks(warnings: LifeWarnings) {
  return safe(async () => {
    const { data, error } = await lifeSupabaseAdmin
      .from('active_tasks')
      .select(TASK_FIELDS)
      .order('is_done', { ascending: true })
      .order('is_priority', { ascending: false })
      .order('sort_order', { ascending: true })
      .limit(200)
    if (error) throw new Error(error.message)
    return data ?? []
  }, 'active_tasks', warnings, [])
}

export async function readSteps(taskIds: number[], warnings: LifeWarnings) {
  if (!taskIds.length) return []
  return safe(async () => {
    const { data, error } = await lifeSupabaseAdmin
      .from('active_task_steps')
      .select(STEP_FIELDS)
      .in('task_id', taskIds)
      .order('sort_order', { ascending: true })
      .limit(1000)
    if (error) throw new Error(error.message)
    return data ?? []
  }, 'active_task_steps', warnings, [])
}

export async function readHabits(warnings: LifeWarnings) {
  return safe(async () => {
    const { data, error } = await lifeSupabaseAdmin
      .from('habits')
      .select(HABIT_FIELDS)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error) throw new Error(error.message)
    return data ?? []
  }, 'habits', warnings, [])
}

/** Son 30 gün alışkanlık kaydı — streak ve 7/30 görünümü buradan türer. */
export async function readHabitLogs(warnings: LifeWarnings, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000)
  return safe(async () => {
    const { data, error } = await lifeSupabaseAdmin
      .from('habit_logs')
      .select(LOG_FIELDS)
      .gte('date', istanbulDate(since))
      .order('date', { ascending: false })
      .limit(2000)
    if (error) throw new Error(error.message)
    return data ?? []
  }, 'habit_logs', warnings, [])
}

export async function readDaily(date: string, warnings: LifeWarnings) {
  return safe(async () => {
    const { data, error } = await lifeSupabaseAdmin
      .from('daily_v2')
      .select(DAILY_FIELDS)
      .eq('date', date)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ?? null
  }, 'daily_v2', warnings, null)
}

export async function readReminders(date: string, warnings: LifeWarnings) {
  return safe(async () => {
    const { data, error } = await lifeSupabaseAdmin
      .from('assistant_reminders')
      .select(REMINDER_FIELDS)
      .eq('date', date)
      .order('scheduled_at', { ascending: true })
    if (error) throw new Error(error.message)
    return data ?? []
  }, 'assistant_reminders', warnings, [])
}

/**
 * `daily_commitments` migration dosyası OLMAYAN, yalnız canlı DB'de bulunan bir
 * tablodur (docs/agencyos-v2-research/01-current-state-audit.md:38). Yokluğu
 * beklenen bir durumdur ve uyarıya dönüşür — hata değil.
 */
export async function readCommitments(warnings: LifeWarnings) {
  return safe(async () => {
    const { data, error } = await lifeSupabaseAdmin
      .from('daily_commitments')
      .select('date,status')
      .order('date', { ascending: false })
      .limit(30)
    if (error) throw new Error(error.message)
    return data ?? []
  }, 'daily_commitments', warnings, [])
}

/**
 * KAPASITE SINYALI — ham sayaçlar, YORUM DEĞIL.
 *
 * "Bugün 4 saatin var" gibi bir çıkarım GrafikcemOS'un `capacity.mjs`'ine
 * aittir ve o motor ölçülmemiş girdiyi sıfır saymaz. Köprü yalnız sayabildiğini
 * gönderir; ölçülemeyen alan `null` kalır ve karşı taraf onu "bilinmiyor" diye
 * görür. Buradan bir tahmin göndermek, iki ayrı doğruluk kaynağı üretirdi.
 */
export function capacitySignal(
  tasks: Array<{ is_done?: boolean | null; due_date?: string | null; is_priority?: boolean | null }>,
  daily: { energy?: string | null; day_mode?: string | null; max_auto_tasks?: number | null } | null,
  today: string,
) {
  const open = tasks.filter((t) => !t.is_done)
  return {
    openTasks: open.length,
    overdue: open.filter((t) => t.due_date && t.due_date < today).length,
    dueToday: open.filter((t) => t.due_date === today).length,
    priorityOpen: open.filter((t) => t.is_priority).length,
    energy: daily?.energy ?? null,
    dayMode: daily?.day_mode ?? null,
    maxAutoTasks: daily?.max_auto_tasks ?? null,
    measured: Boolean(daily),
  }
}
