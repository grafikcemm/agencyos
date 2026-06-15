'use server';

import { createServerSupabase } from '@/lib/supabaseServer';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { CareerSkillStatus } from '@/data/careerRoadmap';

export async function toggleSkillCompletion(skillId: number, isCompleted: boolean) {
  const supabase = createServerSupabase();

  const { error } = await supabase
    .from('career_skills')
    .update({ is_completed: isCompleted })
    .eq('id', skillId);

  if (error) {
    console.error('Error updating skill:', error);
    throw new Error('Failed to update skill');
  }

  revalidatePath('/');
}

// ─────────────────────────────────────────────────────────────────────────────
// Gelişim Merdiveni state — localStorage → Supabase (career_state tablosu).
// Tek satır (single-user). Kalıcı veri sadece Supabase — CLAUDE.md kural #4.
// ─────────────────────────────────────────────────────────────────────────────
const CAREER_USER_KEY = 'global';

export interface CareerState {
  activeLevelId: string | null;
  activeFocusSkillId: string | null;
  completedSkillIds: string[];
  knowledgeStatus: Record<string, CareerSkillStatus>;
}

const EMPTY_CAREER_STATE: CareerState = {
  activeLevelId: null,
  activeFocusSkillId: null,
  completedSkillIds: [],
  knowledgeStatus: {},
};

// Supabase jsonb değerlerini güvenli tipe daralt (asla ham veriye güvenme).
function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function asStatusMap(value: unknown): Record<string, CareerSkillStatus> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, CareerSkillStatus> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v as CareerSkillStatus;
  }
  return out;
}

// Kariyer state'ini oku. Satır yoksa boş state döner (hata değil).
export async function getCareerState(): Promise<{ data: CareerState; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('career_state')
    .select('active_level_id, active_focus_skill_id, completed_skill_ids, knowledge_status')
    .eq('user_key', CAREER_USER_KEY)
    .maybeSingle();

  if (error) return { data: EMPTY_CAREER_STATE, error: error.message };
  if (!data) return { data: EMPTY_CAREER_STATE };

  return {
    data: {
      activeLevelId: data.active_level_id ?? null,
      activeFocusSkillId: data.active_focus_skill_id ?? null,
      completedSkillIds: asStringArray(data.completed_skill_ids),
      knowledgeStatus: asStatusMap(data.knowledge_status),
    },
  };
}

// Kariyer state'ini tamamen yaz (upsert). Source of truth Supabase.
export async function saveCareerState(
  state: CareerState
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from('career_state').upsert(
    {
      user_key: CAREER_USER_KEY,
      active_level_id: state.activeLevelId,
      active_focus_skill_id: state.activeFocusSkillId,
      completed_skill_ids: state.completedSkillIds,
      knowledge_status: state.knowledgeStatus,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_key' }
  );

  if (error) return { success: false, error: error.message };
  revalidatePath('/');
  return { success: true };
}
