export interface TodayEnergyInput {
  completedTasksYesterday: number;
  criticalRoutineCompletionRate: number;  // 0.0 – 1.0
  dailyPeakClean: boolean | null;         // null = no data
  activeTasksCount: number;
  waitingTasksCount: number;
  rhythmCountToday: number;
  recentDays?: Array<{
    date: string;
    completedTasks: number;
    peakClean: boolean | null;
    criticalRate: number;
  }>;
}

export interface TodayEnergyOutput {
  energy: "low" | "medium" | "high";
  mode: "koruma" | "denge" | "atak";
  capacity: number;
  message: string;
  warning: string | null;
  suggestedFocus: string;
}

export function calculateTodayEnergy(input: TodayEnergyInput): TodayEnergyOutput {
  const {
    completedTasksYesterday,
    criticalRoutineCompletionRate,
    dailyPeakClean,
    activeTasksCount,
    waitingTasksCount,
    rhythmCountToday,
    recentDays = [],
  } = input;

  // Base score 2 = medium territory. Range roughly -2 to +4.
  let score = 2;

  // Yesterday's task momentum — primary signal
  if (completedTasksYesterday >= 3) score += 1;
  else if (completedTasksYesterday === 0) score -= 1;

  // Critical routine trend (recent history preferred over today's partial rate)
  const rateForScoring =
    recentDays.length > 0
      ? recentDays.reduce((s, d) => s + d.criticalRate, 0) / recentDays.length
      : criticalRoutineCompletionRate;

  if (rateForScoring >= 0.8) score += 1;
  else if (rateForScoring > 0 && rateForScoring < 0.3) score -= 1;
  // rate === 0 (nothing logged yet today) is neutral — no penalty

  // Peak habit breach yesterday — mild signal, not a punishment
  if (dailyPeakClean === false) score -= 1;

  // High rhythm load occupies mental bandwidth
  if (rhythmCountToday >= 5) score -= 1;

  // Map score to energy level
  let energy: "low" | "medium" | "high";
  if (score <= 1) energy = "low";
  else if (score <= 3) energy = "medium";
  else energy = "high";

  // Overloaded task queue caps at medium regardless of score
  if (activeTasksCount + waitingTasksCount >= 8 && energy === "high") energy = "medium";

  const mode: TodayEnergyOutput["mode"] =
    energy === "low" ? "koruma" : energy === "medium" ? "denge" : "atak";

  // Capacity — how many active tasks are realistic today
  let capacity: number;
  if (energy === "low") {
    capacity = 1;
  } else if (energy === "medium") {
    capacity = rhythmCountToday >= 3 ? 2 : 3;
  } else {
    capacity = rhythmCountToday >= 4 ? 3 : 4;
  }

  // Message — concise, non-judgmental
  let message: string;
  if (energy === "low") {
    message = "Bugün koruma modu. Minimumu tamamla, yeter.";
  } else if (energy === "medium") {
    if (criticalRoutineCompletionRate > 0 && criticalRoutineCompletionRate < 0.5) {
      message = "Önce kritik rutinleri tamamla, sonra görevlere geç.";
    } else {
      message = `Bugün ${capacity} aktif iş + kritik rutinler yeterli.`;
    }
  } else {
    message = `Yüksek kapasite. ${capacity} görev + ritimler + kritikler.`;
  }

  // Warning — at most one, priority: queue overload > routine lag > peak reset
  let warning: string | null = null;
  if (waitingTasksCount >= 3) {
    warning = "Yeni görev ekleme, mevcutları bitir.";
  } else if (criticalRoutineCompletionRate > 0 && criticalRoutineCompletionRate < 0.4) {
    warning = "Kritik rutinler geride kalıyor.";
  } else if (dailyPeakClean === false) {
    warning = "Dün peak bozuldu. Bugün sıfırlamak için iyi bir gün.";
  }

  // Suggested focus
  let suggestedFocus: string;
  if (criticalRoutineCompletionRate > 0 && criticalRoutineCompletionRate < 0.5) {
    suggestedFocus = "Kritik Rutinler";
  } else if (activeTasksCount > 0) {
    suggestedFocus = "Aktif Görevler";
  } else {
    suggestedFocus = "Bonuslar";
  }

  return { energy, mode, capacity, message, warning, suggestedFocus };
}
