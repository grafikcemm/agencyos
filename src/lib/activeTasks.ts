import type { SupabaseClient } from "@supabase/supabase-js";
import { getDefaultActiveTasks } from "@/data/activeTaskDefaults";
import type { ActiveTask, ActiveTaskStep } from "@/types/tasks";

type SupabaseLike = SupabaseClient;

export type ActiveTasksSource = "supabase" | "fallback";

export interface ActiveTasksResult {
  tasks: ActiveTask[];
  source: ActiveTasksSource;
  errorMessage?: string;
}

function normalizeStep(row: Record<string, unknown>, index: number): ActiveTaskStep {
  return {
    id: String(row.id),
    task_id: String(row.task_id ?? ""),
    title: String(row.title ?? ""),
    is_done: Boolean(row.is_done ?? false),
    sort_order: typeof row.sort_order === "number" ? row.sort_order : index + 1,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

function normalizeActiveTask(row: Record<string, unknown>, index: number): ActiveTask {
  const legacyDone = row.is_completed;
  const legacyPriority = row.is_urgent;

  const rawSteps = Array.isArray(row.steps) ? (row.steps as Record<string, unknown>[]) : [];
  const steps = rawSteps
    .map((s, i) => normalizeStep(s, i))
    .filter((s) => s.title.trim().length > 0)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    is_done: Boolean(row.is_done ?? legacyDone ?? false),
    category: row.category === "waiting" ? "waiting" : "active",
    sort_order: typeof row.sort_order === "number" ? row.sort_order : index + 1,
    is_priority: Boolean(row.is_priority ?? legacyPriority ?? false),
    created_at: String(row.created_at ?? new Date().toISOString()),
    note: typeof row.note === "string" ? row.note : undefined,
    description: typeof row.description === "string" ? row.description : undefined,
    due_date: typeof row.due_date === "string" ? row.due_date : undefined,
    steps,
  };
}

function sortActiveTasks(tasks: ActiveTask[]): ActiveTask[] {
  return [...tasks].sort((a, b) => {
    if (a.category !== b.category) return a.category === "active" ? -1 : 1;
    if (!!a.is_priority !== !!b.is_priority) return a.is_priority ? -1 : 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}

export async function loadActiveTasks(supabase: SupabaseLike): Promise<ActiveTasksResult> {
  const fallbackTasks = sortActiveTasks(getDefaultActiveTasks());

  try {
    // Görev adımlarını embedded select ile getir; ilişki çözülemezse adımsız sorguya düş.
    let { data, error } = await supabase
      .from("active_tasks")
      .select("*, steps:active_task_steps(id, task_id, title, is_done, sort_order, created_at)")
      .order("created_at", { ascending: true });

    if (error) {
      const retry = await supabase
        .from("active_tasks")
        .select("*")
        .order("created_at", { ascending: true });
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      return {
        tasks: fallbackTasks,
        source: "fallback",
        errorMessage: error.message,
      };
    }

    const dbTasks = (data ?? [])
      .map((row, index) => normalizeActiveTask(row as Record<string, unknown>, index))
      .filter((task: ActiveTask) => task.title.trim().length > 0);

    if (dbTasks.length === 0) {
      return {
        tasks: fallbackTasks,
        source: "fallback",
        errorMessage: "active_tasks returned no rows",
      };
    }

    return {
      tasks: sortActiveTasks(dbTasks),
      source: "supabase",
    };
  } catch (error) {
    return {
      tasks: fallbackTasks,
      source: "fallback",
      errorMessage: error instanceof Error ? error.message : "Unknown active task load error",
    };
  }
}
