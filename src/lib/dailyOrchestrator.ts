export type AgencyLoad = 'low' | 'normal' | 'high';
export type EnergyLevel = 'low' | 'medium' | 'high';
export type PlanMode = 'koruma' | 'denge' | 'atak';

export interface DailyOrchestratorInput {
  date: string;
  agencyLoad?: AgencyLoad;
  energy?: EnergyLevel;
  activeTasks: Array<{ id: string; title: string; category?: string; is_priority?: boolean }>;
  waitingTasks: Array<{ id: string; title: string }>;
  criticalRoutines: Array<{ title: string; isCompleted?: boolean }>;
  todayRhythms: Array<{ key: string; title: string; minimumVersion?: string }>;
  healthProtocol?: {
    protocolDay: number;
    phase: string;
    shampoo: string | null;
    supplementList: string[];
  };
  financeSnapshot: {
    hasDebtService: boolean;
    haineWarning: boolean;
  };
  activeBook: { title: string; todayTarget?: string } | null;
  activeGrowthStep: { title: string } | null;
}

export interface PriorityTask {
  title: string;
  reason: string;
  source: 'daily' | 'growth' | 'finance' | 'health' | 'library' | 'rhythm';
}

export interface UnifiedTodayPlan {
  date: string;
  mode: PlanMode;
  agencyLoad: AgencyLoad;
  energy: EnergyLevel;
  todayLock: string;
  maxActiveTasks: number;
  priorityTasks: PriorityTask[];
  rhythms: Array<{
    title: string;
    timeHint: string;
    minimumVersion?: string;
    details: string;
  }>;
  health: {
    day: number;
    phase: string;
    todaySummary: string;
    checklist: string[];
  };
  financeWarnings: string[];
  readingTarget: string | null;
  shutdownQuestions: string[];
  telegramMessages: {
    morningCheckIn: string;
    noonCheckIn: string;
    eveningRhythm: string;
    nightShutdown: string;
  };
}

export interface AssistantDailyState {
  id?: string;
  date: string;
  agency_load: AgencyLoad;
  energy: EnergyLevel;
  mode: PlanMode;
  today_plan_json: UnifiedTodayPlan | null;
  created_at?: string;
  updated_at?: string;
}

function deriveMode(agencyLoad: AgencyLoad, energy: EnergyLevel): PlanMode {
  if (agencyLoad === 'high' && energy === 'low') return 'koruma';
  if (agencyLoad === 'high') return 'koruma';
  if (agencyLoad === 'low' && energy === 'high') return 'atak';
  return 'denge';
}

function deriveMaxTasks(mode: PlanMode): number {
  if (mode === 'koruma') return 1;
  if (mode === 'denge') return 2;
  return 3;
}

export function calculateLocalTodayPlan(input: DailyOrchestratorInput): UnifiedTodayPlan {
  const agencyLoad = input.agencyLoad ?? 'normal';
  const energy = input.energy ?? 'medium';
  const mode = deriveMode(agencyLoad, energy);
  const maxActiveTasks = deriveMaxTasks(mode);

  const p1Tasks = input.activeTasks.filter(t => t.is_priority || t.category === 'active');
  const todayLock = p1Tasks[0]?.title ?? input.activeGrowthStep?.title ?? 'Bugün aktif görev yok';

  const priorityTasks: PriorityTask[] = [];
  p1Tasks.slice(0, maxActiveTasks).forEach(t => {
    priorityTasks.push({ title: t.title, reason: 'Aktif görev', source: 'daily' });
  });
  if (priorityTasks.length < maxActiveTasks && input.activeGrowthStep) {
    priorityTasks.push({
      title: input.activeGrowthStep.title,
      reason: 'Aktif gelişim basamağı',
      source: 'growth',
    });
  }

  const healthChecklist = [
    'Proteinli ilk öğün',
    '3 litre su',
    '35 dk yürüyüş / koşu bandı'
  ];

  const rhythms = input.todayRhythms.map(r => ({
    title: r.title,
    timeHint: 'Akşam',
    minimumVersion: r.minimumVersion,
    details: energy === 'low' ? (r.minimumVersion ?? r.title) : r.title,
  }));

  const financeWarnings: string[] = ['Yeni borç yok. Yeni taksit yok. Yeni araç aboneliği yok.'];
  if (input.financeSnapshot.hasDebtService) {
    financeWarnings.push('Borç servis ödemesi bu ay aktif.');
  }

  const morningCheckIn = `Günaydın Cem.\nBugün ajans yoğunluğu nasıl: Yoğun / Normal / Rahat?\nEnerjin nasıl: Düşük / Orta / Yüksek?\nCevapla: yoğun düşük`;

  const noonCheckIn = `Cem, gün ortası kontrol.\nAjans beklediğinden yoğun mu?\nCevapla: rahat / normal / yoğun / sadeleştir`;

  const eveningRhythm = rhythms.length > 0
    ? `Akşam ritimleri:\n${rhythms.map(r => `- ${r.title}: ${r.details}`).join('\n')}`
    : `Akşam ritimleri: Bugün programlanmış ritim yok.`;

  const nightShutdown = `Günü kapatalım Cem.\n1) Bugün en kritik görevi bitirdin mi?\n2) Sağlık minimumu tamam mı?\n3) Yarın ilk hamle ne?`;

  return {
    date: input.date,
    mode,
    agencyLoad,
    energy,
    todayLock,
    maxActiveTasks,
    priorityTasks,
    rhythms,
    health: {
      day: input.healthProtocol?.protocolDay ?? 1,
      phase: input.healthProtocol?.phase ?? 'V2 Starter',
      todaySummary: healthChecklist.slice(0, 3).join(' · '),
      checklist: healthChecklist,
    },
    financeWarnings,
    readingTarget: input.activeBook
      ? `${input.activeBook.title}: ${input.activeBook.todayTarget ?? '10 sayfa veya 15 dk'}`
      : null,
    shutdownQuestions: [
      'Bugün en kritik görevi bitirdin mi?',
      'Sağlık minimumu tamam mı?',
      'Yarın ilk hamle ne?',
    ],
    telegramMessages: {
      morningCheckIn,
      noonCheckIn,
      eveningRhythm,
      nightShutdown,
    },
  };
}
