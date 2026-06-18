'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabaseServer';
import { assertSession } from '@/lib/auth';

export async function takeSkincarePackage(packageId: string, _parentTaskId: string) {
  await assertSession();
  void _parentTaskId; // positional param kept for caller compatibility; intentionally unused
  const today = new Date().toISOString().slice(0, 10);
  const supabase = createServerSupabase();

  // 1. Log the package as completed for today
  const { error: insertError } = await supabase.from('skincare_completions').upsert(
    { package_id: packageId, date: today },
    { onConflict: 'package_id,date' }
  );

  if (insertError) {
    console.error('[skincareActions] Insert Error:', insertError);
    return { success: false, error: insertError.message };
  }

  // 2. Count active packages
  const { count: totalCount } = await supabase
    .from('skincare_packages')
    .select('id', { count: 'exact', head: true });

  // 3. Count completions today
  const { count: completedCount } = await supabase
    .from('skincare_completions')
    .select('id', { count: 'exact', head: true })
    .eq('date', today);

  // 4. Update parent Skincare task if all packages are completed
  if (completedCount !== null && totalCount !== null && completedCount >= totalCount) {
    const { data: skincareTemplate } = await supabase
      .from('task_templates')
      .select('id')
      .eq('system_type', 'skincare')
      .single();

    if (skincareTemplate) {
      await supabase
        .from('daily_completions')
        .upsert({ 
          template_id: skincareTemplate.id, 
          date: today 
        }, { onConflict: 'template_id,date' });
    }
  }

  revalidatePath('/');
  return { 
    success: true, 
    allCompleted: (completedCount !== null && totalCount !== null && completedCount >= totalCount) 
  };
}

export async function getSkincarePackages() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('skincare_packages')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[skincareActions] Fetch Error:', error);
    return [];
  }
  return data;
}
