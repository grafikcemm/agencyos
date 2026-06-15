// ─────────────────────────────────────────────────────────────────────────────
// Asistan Canlı Bağlam Yükleyici
//
// Mentör LLM'ine Cem'in O ANKİ gerçek verisini taşır: rutin tikleri, günlük skor,
// aktif görevler (sıradaki adımıyla), sağlık minimumu, günün odağı, finans net.
//
// Eski davranış: mentorLoop tüm bu alanları SIFIR geçiyordu → LLM gerçek durumu
// göremiyor, genel/şablon cevap veriyordu. Bu modül o boşluğu kapatır.
//
// Tasarım: her Supabase sorgusu kendi try/catch'inde — tek tablo hata verse bile
// asistan kısmi veriyle çalışmaya devam eder (asla throw etmez).
// ─────────────────────────────────────────────────────────────────────────────
import { createServerSupabase } from "@/lib/supabaseServer";
import { loadActiveTasks } from "@/lib/activeTasks";
import { loadDailyRoutines } from "@/lib/dailyRoutines";
import { getTodayConfig } from "@/data/weeklyFocusConfig";
import { getIstanbulDateAndDay } from "./timezone";
import { loadAgencyContextBlock } from "./agencyContext";
import type { DailyPromptContext } from "./prompts";
import type { ActiveTask } from "@/types/tasks";

const DAY_KEY_MAP: Record<number, string> = {
  0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat",
};

export interface AssistantLiveContext {
  /** Mevcut prompt makinesine (buildDynamicSystemPrompt) verilecek dolu context. */
  promptContext: DailyPromptContext;
  /** LLM'in okuyacağı insan-okunur "GERÇEK VERİ" bloğu (factual cevaplar için). */
  factsBlock: string;
}

function nextStepOf(task: ActiveTask): string | null {
  const next = (task.steps ?? []).find((s) => !s.is_done);
  return next ? next.title : null;
}

/**
 * Cem'in anlık gerçek durumunu Supabase'ten toplar.
 *
 * @param opts.energyLevel  Dışarıdan enerji verilirse onu kullan; yoksa daily_v2'den çek.
 * @param opts.timeOfDay    Günün dilimi (sabah/öğlen/akşam/gece).
 */
export async function loadAssistantLiveContext(opts?: {
  energyLevel?: "LOW" | "NORMAL" | "HIGH";
  timeOfDay?: "SABAH" | "ÖĞLEN" | "AKŞAM" | "GECE";
  /** Hazır Supabase client (cron, service-role). Verilmezse cookie-based oluşturulur. */
  client?: unknown;
}): Promise<AssistantLiveContext> {
  const { todayStr, dow } = getIstanbulDateAndDay();
  const dayKey = DAY_KEY_MAP[dow] ?? "mon";
  const focus = getTodayConfig();

  let completedRoutinesCount = 0;
  let totalRoutinesCount = 0;
  let activeTasksList: ActiveTask[] = [];
  let activeTasksCount = 0;
  let completedTasksCount = 0;
  let willpowerScore = 0;
  let financeNet: number | null = null;
  let energyLevel: "LOW" | "NORMAL" | "HIGH" = opts?.energyLevel ?? "NORMAL";
  const healthMinimum: string[] = [];

  let supabase: ReturnType<typeof createServerSupabase> | null =
    (opts?.client as ReturnType<typeof createServerSupabase> | undefined) ?? null;
  if (!supabase) {
    try {
      supabase = createServerSupabase();
    } catch {
      supabase = null;
    }
  }

  if (supabase) {
    // Rutinler + bugünkü tikler.
    try {
      const [routinesRes, completionsRes] = await Promise.all([
        loadDailyRoutines(supabase),
        supabase.from("daily_completions").select("template_id").eq("date", todayStr),
      ]);
      const completedIds = new Set(
        (completionsRes.data ?? []).map((c: { template_id: string }) => c.template_id),
      );
      const activeRoutines = routinesRes.routines.filter(
        (r) => !r.active_days || r.active_days.length === 0 || r.active_days.includes(dayKey),
      );
      totalRoutinesCount = activeRoutines.length;
      completedRoutinesCount = activeRoutines.filter((r) => completedIds.has(r.id)).length;
    } catch {
      // rutin verisi yoksa 0/0 kalır
    }

    // Aktif görevler (sıradaki adımıyla).
    try {
      const { tasks } = await loadActiveTasks(supabase);
      activeTasksList = tasks.filter((t) => t.category === "active");
      activeTasksCount = activeTasksList.filter((t) => !t.is_done).length;
      completedTasksCount = activeTasksList.filter((t) => t.is_done).length;
    } catch {
      // görev verisi yoksa boş kalır
    }

    // Günlük skor — finalize edilmemişse rutin tamamlama oranına düş.
    try {
      const { data } = await supabase
        .from("daily_scores")
        .select("total_score, completion_rate")
        .eq("date", todayStr)
        .maybeSingle();
      if (data?.completion_rate != null) {
        willpowerScore = Math.round(Number(data.completion_rate));
      } else if (totalRoutinesCount > 0) {
        willpowerScore = Math.round((completedRoutinesCount / totalRoutinesCount) * 100);
      }
    } catch {
      if (totalRoutinesCount > 0) {
        willpowerScore = Math.round((completedRoutinesCount / totalRoutinesCount) * 100);
      }
    }

    // daily_v2 — enerji + sağlık minimumu durumu.
    try {
      const { data } = await supabase
        .from("daily_v2")
        .select("energy, protein_meal, water_3l, walk_35")
        .eq("date", todayStr)
        .maybeSingle();
      if (data) {
        if (!opts?.energyLevel && data.energy) {
          energyLevel = data.energy === "low" ? "LOW" : data.energy === "high" ? "HIGH" : "NORMAL";
        }
        healthMinimum.push(`Proteinli öğün: ${data.protein_meal ? "✓" : "—"}`);
        healthMinimum.push(`3L su: ${data.water_3l ? "✓" : "—"}`);
        healthMinimum.push(`35 dk yürüyüş: ${data.walk_35 ? "✓" : "—"}`);
      }
    } catch {
      // daily_v2 yoksa sağlık minimumu raporlanmaz
    }

    // Finans net bakiye (singleton state).
    try {
      const { data } = await supabase
        .from("finance_state")
        .select("net_balance")
        .eq("id", 1)
        .maybeSingle();
      if (data?.net_balance != null) financeNet = Number(data.net_balance);
    } catch {
      // finans state yoksa atlanır
    }
  }

  const promptContext: DailyPromptContext = {
    energyLevel,
    timeOfDay: opts?.timeOfDay ?? "SABAH",
    completedRoutinesCount,
    totalRoutinesCount,
    activeTasksCount,
    completedTasksCount,
    willpowerScore,
    activeProjects: activeTasksList.filter((t) => !t.is_done).map((t) => t.title),
    supplementStatus: healthMinimum.length > 0 ? healthMinimum.join(" · ") : undefined,
  };

  const lines: string[] = [];
  lines.push(`=== CEM'İN ANLIK GERÇEK VERİSİ (${todayStr} · ${focus.gun}) ===`);
  lines.push(
    `Günün odağı: ${focus.odakTema}${focus.antrenmanVar ? ` · Antrenman günü (${focus.antrenmanAdi})` : " · Antrenman yok"}`,
  );
  lines.push(`Rutin tikleri: ${completedRoutinesCount}/${totalRoutinesCount} · Günlük skor: %${willpowerScore}`);
  if (healthMinimum.length > 0) lines.push(`Sağlık minimumu: ${healthMinimum.join(" · ")}`);
  if (activeTasksList.length > 0) {
    lines.push(`Aktif görevler (${activeTasksCount} bekliyor):`);
    for (const t of activeTasksList.slice(0, 8)) {
      const mark = t.is_done ? "✓" : t.is_priority ? "⚑ P1" : "•";
      const step = nextStepOf(t);
      lines.push(`  ${mark} ${t.title}${step ? ` — sıradaki adım: ${step}` : ""}`);
    }
  } else {
    lines.push("Aktif görev kaydı yok.");
  }
  if (financeNet != null) lines.push(`Finans net bakiye: ${financeNet.toLocaleString("tr-TR")} TL`);

  // AgencyOS iş tarafı + alışkanlık zincirleri (ayrı DB, best-effort).
  let agencyBlock = "";
  try {
    agencyBlock = await loadAgencyContextBlock();
  } catch {
    agencyBlock = "";
  }
  const factsBlock = agencyBlock ? `${lines.join("\n")}\n\n${agencyBlock}` : lines.join("\n");

  return { promptContext, factsBlock };
}
