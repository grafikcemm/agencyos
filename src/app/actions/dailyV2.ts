'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabaseServer';
import { assertSession } from '@/lib/auth';
import { format } from 'date-fns';

export type DayMode = 'normal' | 'yogun' | 'dagilmis';
export type HealthKey = 'protein_meal' | 'water_3l' | 'walk_35';

function today(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export async function derivePolicyState(
  dayMode: DayMode,
  agencyLoad: 'low' | 'normal' | 'high',
  energy: 'low' | 'medium' | 'high'
) {
  let uiMode: 'koruma' | 'denge' | 'atak' = 'denge';
  let reason = 'Denge modu aktif. Rutinler ve ana görevler açık.';
  let nextAction = 'Günlük planına göz at.';
  let maxAutoTasks = 3;
  let lockedModules: string[] = [];

  if (dayMode === 'dagilmis' || energy === 'low' || agencyLoad === 'high') {
    uiMode = 'koruma';
    maxAutoTasks = 1;
    lockedModules = ['bonuses', 'growth', 'academy', 'library'];
    reason = dayMode === 'dagilmis'
      ? 'Dağılmış mod sebebiyle koruma devrede.'
      : (energy === 'low' ? 'Enerji düşük olduğu için koruma modu devrede.' : 'Ajans yoğunluğu sebebiyle koruma modu devrede.');
    nextAction = '10 dk başlat: En kritik işe odaklan.';
  } else if (agencyLoad === 'low' && energy === 'high' && dayMode === 'normal') {
    uiMode = 'atak';
    maxAutoTasks = 5;
    lockedModules = [];
    reason = 'Enerji yüksek ve ajans yükü az. Atak modu aktif!';
    nextAction = 'Kütüphane notu ekle veya akademi çalışması başlat.';
  }

  return {
    ui_mode: uiMode,
    max_auto_tasks: maxAutoTasks,
    locked_modules: lockedModules,
    unlocked_modules: [] as string[],
    assistant_reason: reason,
    next_action: nextAction,
  };
}

export async function setDayMode(mode: DayMode): Promise<{ error?: string }> {
  await assertSession();
  const supabase = createServerSupabase();
  const date = today();

  const { data: current } = await supabase
    .from('daily_v2')
    .select('*')
    .eq('date', date)
    .maybeSingle();

  const agencyLoad = current?.agency_load ?? 'normal';
  const energy = current?.energy ?? 'medium';

  const policy = await derivePolicyState(mode, agencyLoad, energy);

  const payload = {
    date,
    day_mode: mode,
    agency_load: agencyLoad,
    energy,
    ...policy,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('daily_v2').upsert(payload, { onConflict: 'date' });

  if (error) {
    // Fallback if schema is not migrated yet
    const basePayload = {
      date,
      day_mode: mode,
      updated_at: new Date().toISOString()
    };
    const { error: retryError } = await supabase.from('daily_v2').upsert(basePayload, { onConflict: 'date' });
    if (retryError) return { error: retryError.message };
  }

  revalidatePath('/');
  return {};
}

export async function toggleHealthMinimum(key: HealthKey, value: boolean): Promise<{ error?: string }> {
  await assertSession();
  const supabase = createServerSupabase();
  const date = today();

  const { error } = await supabase.from('daily_v2').upsert(
    { date, [key]: value, updated_at: new Date().toISOString() },
    { onConflict: 'date' }
  );

  if (error) return { error: error.message };
  revalidatePath('/');
  return {};
}

export async function toggleEnglishBonus(value: boolean): Promise<{ error?: string }> {
  await assertSession();
  const supabase = createServerSupabase();
  const date = today();

  const { error } = await supabase.from('daily_v2').upsert(
    { date, english_done: value, updated_at: new Date().toISOString() },
    { onConflict: 'date' }
  );

  if (error) return { error: error.message };
  revalidatePath('/');
  return {};
}

export async function updatePolicyState(patch: {
  day_mode?: DayMode;
  agency_load?: 'low' | 'normal' | 'high';
  energy?: 'low' | 'medium' | 'high';
  ui_mode?: 'koruma' | 'denge' | 'atak';
  max_auto_tasks?: number;
  locked_modules?: string[];
  unlocked_modules?: string[];
  assistant_reason?: string;
  next_action?: string;
}): Promise<{ error?: string }> {
  await assertSession();
  const supabase = createServerSupabase();
  const date = today();

  const { data: current } = await supabase
    .from('daily_v2')
    .select('*')
    .eq('date', date)
    .maybeSingle();

  const dayMode = patch.day_mode ?? current?.day_mode ?? 'normal';
  const agencyLoad = patch.agency_load ?? current?.agency_load ?? 'normal';
  const energy = patch.energy ?? current?.energy ?? 'medium';

  const derived = await derivePolicyState(dayMode, agencyLoad, energy);

  const payload = {
    date,
    day_mode: dayMode,
    agency_load: agencyLoad,
    energy,
    ...derived,
    ...patch,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('daily_v2').upsert(payload, { onConflict: 'date' });
  if (error) {
    const basePayload: { date: string; updated_at: string; day_mode?: DayMode } = {
      date,
      updated_at: new Date().toISOString(),
    };
    if (patch.day_mode) basePayload.day_mode = patch.day_mode;
    const { error: retryError } = await supabase.from('daily_v2').upsert(basePayload, { onConflict: 'date' });
    if (retryError) return { error: retryError.message };
  }

  revalidatePath('/');
  return {};
}

export async function getDailyV2(date?: string): Promise<{
  day_mode: DayMode | null;
  protein_meal: boolean;
  water_3l: boolean;
  walk_35: boolean;
  english_done: boolean;
  agency_load: 'low' | 'normal' | 'high';
  energy: 'low' | 'medium' | 'high';
  ui_mode: 'koruma' | 'denge' | 'atak';
  max_auto_tasks: number;
  locked_modules: string[];
  unlocked_modules: string[];
  assistant_reason: string;
  next_action: string;
} | null> {
  const supabase = createServerSupabase();
  const targetDate = date ?? today();

  const { data, error } = await supabase
    .from('daily_v2')
    .select('*')
    .eq('date', targetDate)
    .maybeSingle();

  if (error) {
    console.error('Error in getDailyV2:', error);
    return null;
  }
  if (!data) return null;

  return {
    day_mode: (data.day_mode as DayMode) ?? null,
    protein_meal: data.protein_meal ?? false,
    water_3l: data.water_3l ?? false,
    walk_35: data.walk_35 ?? false,
    english_done: data.english_done ?? false,
    agency_load: data.agency_load ?? 'normal',
    energy: data.energy ?? 'medium',
    ui_mode: data.ui_mode ?? (data.day_mode === 'dagilmis' || data.day_mode === 'yogun' ? 'koruma' : 'denge'),
    max_auto_tasks: data.max_auto_tasks ?? (data.day_mode === 'dagilmis' ? 1 : (data.day_mode === 'yogun' ? 1 : 3)),
    locked_modules: data.locked_modules ?? (data.day_mode === 'dagilmis' || data.day_mode === 'yogun' ? ['bonuses', 'growth', 'academy', 'library'] : []),
    unlocked_modules: data.unlocked_modules ?? [],
    assistant_reason: data.assistant_reason ?? '',
    next_action: data.next_action ?? '',
  };
}
