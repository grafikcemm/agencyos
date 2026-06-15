import type { SupabaseClient } from "@supabase/supabase-js";
import { getDefaultDailyRoutines, type DailyRoutine } from "@/data/dailyRoutineDefaults";

type SupabaseLike = SupabaseClient;

export interface DailyRoutinesResult {
  routines: DailyRoutine[];
  source: "supabase" | "fallback";
  errorMessage?: string;
}

export async function loadDailyRoutines(supabase: SupabaseLike): Promise<DailyRoutinesResult> {
  const fallbackRoutines = getDefaultDailyRoutines();
  try {
    const { data, error } = await supabase
      .from("task_templates")
      .select("*")
      .eq("section", "rutin")
      .order("sort_order", { ascending: true });

    if (error) {
      return {
        routines: fallbackRoutines,
        source: "fallback",
        errorMessage: error.message,
      };
    }

    if (!data || data.length === 0) {
      return {
        routines: fallbackRoutines,
        source: "fallback",
      };
    }

    const dbRoutines: DailyRoutine[] = data.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      title: String(row.title ?? ""),
      points: Number(row.points ?? 5),
      section: "rutin" as const,
      system_type: typeof row.system_type === "string" ? row.system_type : null,
      active_days: Array.isArray(row.active_days) ? (row.active_days as string[]) : null,
    }));

    return {
      routines: dbRoutines,
      source: "supabase",
    };
  } catch (error) {
    return {
      routines: fallbackRoutines,
      source: "fallback",
      errorMessage: error instanceof Error ? error.message : "Unknown daily routines load error",
    };
  }
}
