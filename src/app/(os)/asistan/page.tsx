// Asistan sayfası — Cem'i tanıyan kişisel planlama + disiplin asistanı.
// Server component: enerji girdisini FTG/LIFE DB'den toplar (best-effort), shell'e geçer.
// Brief + chat client tarafında /api/ai/mentor'a gider (liveContext server-side zenginleşir).
import { AssistantShell } from "@/components/assistant/AssistantShell";
import { createServerSupabase } from "@/lib/supabaseServer";
import { loadActiveTasks } from "@/lib/activeTasks";
import { getIstanbulDateAndDay } from "@/lib/assistant/timezone";

export const dynamic = "force-dynamic";

export default async function AsistanPage() {
  const { todayStr } = getIstanbulDateAndDay();

  let activeTasksCount = 0;
  let waitingTasksCount = 0;
  try {
    const supabase = createServerSupabase();
    const { tasks } = await loadActiveTasks(supabase);
    activeTasksCount = tasks.filter((t) => t.category === "active" && !t.is_done).length;
    waitingTasksCount = tasks.filter((t) => t.category === "waiting").length;
  } catch {
    // veri yoksa 0/0 — asistan yine açılır
  }

  const energyInput = {
    completedTasksYesterday: 0,
    criticalRoutineCompletionRate: 0,
    dailyPeakClean: null,
    activeTasksCount,
    waitingTasksCount,
    rhythmCountToday: 0,
  };

  return (
    <div className="pt-8">
      <AssistantShell energyInput={energyInput} today={todayStr} />
    </div>
  );
}
