"use client";

import React, { useState, useEffect, useTransition } from "react";
import { TodayTasksSection } from "./TodayTasksSection";
import { DayModeSelector } from "./DayModeSelector";
import { BonusesSection } from "./BonusesSection";
import { EndDayButton } from "./EndDayButton";
import { DuaPanel } from "./DuaPanel";
import { EditorialGreeting } from "./EditorialGreeting";
import { TimelineRow, TimelineSectionLabel, type CatAccent } from "./TimelineRow";
import { VitaminModal } from "./VitaminModal";
import { toggleTemplateTask } from "@/app/actions/taskActions";
import { mirrorHabitDone } from "@/app/actions/habitActions";
import { toggleHealthMinimum, setDayMode } from "@/app/actions/dailyV2";
import type { DailyRoutine } from "@/data/dailyRoutineDefaults";
import { type DayMode } from "@/lib/pickTodayTasks";
import {
  Droplets,
  Footprints,
  Utensils,
  Sunrise,
  Pill,
  BookOpen,
  Smile,
} from "lucide-react";
import type { ActiveTask } from "@/types/tasks";
import type { DailyTemplateTask, EnglishSubtask, VitaminPackage } from "./taskGroupTypes";

type HealthKey = 'protein_meal' | 'water_3l' | 'walk_35';

interface DailyQuote {
  quote?: string;
  author?: string;
}

interface DailyDashboardClientProps {
  routines: DailyRoutine[];
  sistemTasks: DailyTemplateTask[];
  activeTasks: ActiveTask[];
  initialCompletedIds: string[];
  initialPeakChecked: Record<string, boolean>;
  quote: DailyQuote;
  vitaminPackages: VitaminPackage[];
  completedSkincareIds: string[];
  englishSubtasks: EnglishSubtask[];
  isTreadmillActive: boolean;
  today: string;
  isAlreadyFinalized: boolean;
  initialTotalScore: number;
  dayTotalPossible: number;
  dayModeInitial: DayMode | null;
  healthMinimumInitial: { protein_meal: boolean; water_3l: boolean; walk_35: boolean };
  englishDoneInitial: boolean;
  uiModeInitial: 'koruma' | 'denge' | 'atak';
  maxAutoTasksInitial: number;
  lockedModulesInitial: string[];
  unlockedModulesInitial: string[];
  assistantReasonInitial: string;
  nextActionInitial: string;
  agencyLoadInitial: string;
  energyInitial: string;
  isDev?: boolean;
}

const HEALTH_META: Record<HealthKey, { label: string; icon: React.ReactNode; accent: CatAccent }> = {
  protein_meal: { label: 'Proteinli ilk öğün', icon: <Utensils size={14} />, accent: 'pink' },
  water_3l: { label: '3 litre su', icon: <Droplets size={14} />, accent: 'cyan' },
  walk_35: { label: '35 dk yürüyüş / koşu bandı', icon: <Footprints size={14} />, accent: 'teal' },
};

function routineIcon(routine: DailyRoutine): React.ReactNode {
  const type = routine.system_type || routine.id;
  if (type?.includes('vitamin')) return <Pill size={14} />;
  if (type?.includes('reading') || type?.includes('book') || type?.includes('kitap')) return <BookOpen size={14} />;
  if (type?.includes('teeth') || type?.includes('dis')) return <Smile size={14} />;
  return <Sunrise size={14} />;
}

// Sessiz pastel aksanları sırayla dağıt — timeline ritmi.
const ROUTINE_ACCENTS: CatAccent[] = ['purple', 'orange', 'blue', 'pink', 'cyan', 'teal'];

export function DailyDashboardClient({
  routines,
  sistemTasks,
  activeTasks: initialActiveTasks,
  initialCompletedIds,
  quote,
  vitaminPackages,
  completedSkincareIds,
  englishSubtasks,
  isTreadmillActive,
  today,
  isAlreadyFinalized,
  initialTotalScore,
  dayTotalPossible,
  dayModeInitial,
  healthMinimumInitial,
  englishDoneInitial,
  uiModeInitial,
  maxAutoTasksInitial,
  lockedModulesInitial,
  assistantReasonInitial,
  nextActionInitial,
  agencyLoadInitial,
  energyInitial,
  isDev = false,
}: DailyDashboardClientProps) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set(initialCompletedIds));
  const [activeTasks, setActiveTasks] = useState(initialActiveTasks);
  const [mounted, setMounted] = useState(false);
  const [currentMode, setCurrentMode] = useState<DayMode | null>(dayModeInitial);
  const [healthState, setHealthState] = useState(healthMinimumInitial);
  const [healthError, setHealthError] = useState<string | null>(null);

  // V3 UI policy states
  // Vitamin rutinine tıklanınca açılan modal (hangi rutin id ile açıldı)
  const [vitaminRoutineId, setVitaminRoutineId] = useState<string | null>(null);

  const [uiMode, setUiMode] = useState<'koruma' | 'denge' | 'atak'>(uiModeInitial);
  // maxAutoTasks / nextAction are written by the assistant policy but not read in render.
  const [, setMaxAutoTasks] = useState<number>(maxAutoTasksInitial);
  const [lockedModules, setLockedModules] = useState<string[]>(lockedModulesInitial);
  const [assistantReason, setAssistantReason] = useState<string>(assistantReasonInitial);
  const [, setNextAction] = useState<string>(nextActionInitial);

  const [, startTransition] = useTransition();

  useEffect(() => {
    // incoming prop → local editable state sync
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveTasks(initialActiveTasks);
  }, [initialActiveTasks]);

  useEffect(() => {
    // Hydration mount guard — intentional one-time client flag
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const getDerivedPolicy = (dayMode: DayMode) => {
    let uiModeVal: 'koruma' | 'denge' | 'atak' = 'denge';
    let reason = 'Denge modu aktif. Rutinler ve ana görevler açık.';
    let nextActionVal = 'Günlük planına göz at.';
    let maxAutoTasksVal = 3;
    let lockedModulesVal: string[] = [];

    if (dayMode === 'dagilmis' || energyInitial === 'low' || agencyLoadInitial === 'high') {
      uiModeVal = 'koruma';
      maxAutoTasksVal = 1;
      lockedModulesVal = ['bonuses', 'growth', 'academy', 'library'];
      reason = dayMode === 'dagilmis'
        ? 'Dağılmış mod sebebiyle koruma devrede.'
        : (energyInitial === 'low' ? 'Enerji düşük olduğu için koruma modu devrede.' : 'Ajans yoğunluğu sebebiyle koruma modu devrede.');
      nextActionVal = '10 dk başlat: En kritik işe odaklan.';
    } else if (agencyLoadInitial === 'low' && energyInitial === 'high' && dayMode === 'normal') {
      uiModeVal = 'atak';
      maxAutoTasksVal = 5;
      lockedModulesVal = [];
      reason = 'Enerji yüksek ve ajans yükü az. Atak modu aktif!';
      nextActionVal = 'Kütüphane notu ekle veya akademi çalışması başlat.';
    }
    return { uiMode: uiModeVal, maxAutoTasks: maxAutoTasksVal, lockedModules: lockedModulesVal, reason, nextAction: nextActionVal };
  };

  const handleModeSelected = (mode: DayMode) => {
    setCurrentMode(mode);
    const derived = getDerivedPolicy(mode);
    setUiMode(derived.uiMode);
    setMaxAutoTasks(derived.maxAutoTasks);
    setLockedModules(derived.lockedModules);
    setAssistantReason(derived.reason);
    setNextAction(derived.nextAction);

    startTransition(async () => {
      await setDayMode(mode);
    });
  };

  const toggleTemplateTaskClient = (templateId: string, points: number, onConfetti?: () => void) => {
    const isCompleted = completedIds.has(templateId);
    const next = new Set(completedIds);
    if (isCompleted) {
      next.delete(templateId);
    } else {
      next.add(templateId);
      onConfetti?.();
    }
    setCompletedIds(next);
    startTransition(async () => {
      try {
        const res = await toggleTemplateTask(templateId, isCompleted);
        if (res && !res.success) {
          setCompletedIds(prev => {
            const rollback = new Set(prev);
            if (isCompleted) {
              rollback.add(templateId);
            } else {
              rollback.delete(templateId);
            }
            return rollback;
          });
        }
      } catch {
        setCompletedIds(prev => {
          const rollback = new Set(prev);
          if (isCompleted) {
            rollback.add(templateId);
          } else {
            rollback.delete(templateId);
          }
          return rollback;
        });
      }
    });
  };

  const toggleRoutine = (routineId: string, points: number, onConfetti?: () => void) => {
    toggleTemplateTaskClient(routineId, points, onConfetti);
  };

  const toggleHealth = (key: HealthKey) => {
    const prevVal = healthState[key];
    const nextVal = !prevVal;

    setHealthState(prev => ({ ...prev, [key]: nextVal }));
    setHealthError(null);

    startTransition(async () => {
      try {
        const res = await toggleHealthMinimum(key, nextVal);
        if (res && res.error) {
          setHealthState(prev => ({ ...prev, [key]: prevVal }));
          setHealthError(res.error);
        }
      } catch (err: unknown) {
        setHealthState(prev => ({ ...prev, [key]: prevVal }));
        setHealthError(err instanceof Error ? err.message : "Bir hata oluştu.");
      }
    });
  };

  const displayCompletedIds = mounted ? completedIds : new Set(initialCompletedIds);

  // "Bugünkü tek hareket" kaldırıldı — tüm aktif görevler listede görünür;
  // P1 önceliklendirmesi TaskGroup içinde yapılır.
  const filteredActiveTasks = activeTasks;

  const maxActiveTasks = uiMode === 'koruma' ? 1 : (uiMode === 'atak' ? 3 : 2);

  // Glanceable timeline progress (rutin + sağlık).
  const activeRoutines = routines;
  const routinesDone = activeRoutines.filter(r => displayCompletedIds.has(r.id)).length;
  const healthDone = (Object.keys(healthState) as HealthKey[]).filter(k => healthState[k]).length;
  const glanceTotal = activeRoutines.length + 3;
  const glanceDone = routinesDone + healthDone;

  const sharedTaskProps = {
    kritikTasks: [],
    sistemTasks,
    activeTasks: filteredActiveTasks,
    completedIds: displayCompletedIds,
    englishSubtasks,
    isTreadmillActive,
    vitaminPackages,
    completedSkincareIds,
    onToggleTemplate: toggleTemplateTaskClient,
    isDev,
    uiMode,
    maxActiveTasks,
  };

  const renderLockedRow = (title: string, reasonStr: string, accent: CatAccent) => (
    <TimelineRow
      icon={<span className="text-xs">🔒</span>}
      accent={accent}
      title={<span className="text-[var(--text-muted)]">{title} — bugün kapalı</span>}
      detail={<p className="px-4 py-3 text-xs text-[var(--text-muted)]">{reasonStr}</p>}
    />
  );

  // ── Mod seçilmemiş: sadece editöryel başlık + mod seçici ──
  if (!currentMode) {
    return (
      <div className="flex flex-col gap-5 w-full min-w-0">
        {/* Gün Sonu Duası — anasayfanın en üstü */}
        <DuaPanel quote={quote?.quote} author={quote?.author} />
        <EditorialGreeting />
        <DayModeSelector initialMode={null} onModeSelected={handleModeSelected} />
      </div>
    );
  }

  const isRoutinesLocked = lockedModules.includes('routines');
  const isTasksLocked = lockedModules.includes('tasks');
  const isBonusesLocked = lockedModules.includes('bonuses');

  return (
    <div className="flex flex-col gap-5 w-full min-w-0">
      {/* Gün Sonu Duası — anasayfanın en üstü */}
      <DuaPanel quote={quote?.quote} author={quote?.author} />

      {/* Editöryel selamlama başlığı */}
      <EditorialGreeting progressLabel={`Bugün ${glanceDone}/${glanceTotal} sessiz hedef tamam`} />

      {/* Mod seçici — compact, değiştirilebilir */}
      <DayModeSelector initialMode={currentMode} onModeSelected={handleModeSelected} />

      {/* Asistan analizi — sessiz banner */}
      {assistantReason && (
        <div className="rounded-card border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Asistan analizi</p>
          <p className="text-[13px] text-[var(--text-primary)] font-sans font-medium leading-relaxed">{assistantReason}</p>
        </div>
      )}

      {/* ── TIMELINE OMURGASI — sakin glanceable satırlar ── */}
      <div className="flex flex-col pt-1">
        {/* Sağlık minimumu */}
        <TimelineSectionLabel>Sağlık minimumu</TimelineSectionLabel>
        {(Object.keys(HEALTH_META) as HealthKey[]).map((key) => {
          const meta = HEALTH_META[key];
          return (
            <TimelineRow
              key={key}
              icon={meta.icon}
              accent={meta.accent}
              title={meta.label}
              meta="+5"
              done={healthState[key]}
              onClick={() => toggleHealth(key)}
            />
          );
        })}
        {healthError && (
          <p className="pl-12 text-[10px] text-[var(--danger)] mb-2 animate-in fade-in duration-200">{healthError}</p>
        )}

        {/* Günlük rutinler */}
        <TimelineSectionLabel>Günlük rutinler</TimelineSectionLabel>
        {isRoutinesLocked
          ? renderLockedRow("Günlük rutinler", "Asistan koruma politikası sebebiyle rutinler devre dışı.", 'gray')
          : activeRoutines.map((routine, i) => {
              const isVitamin = (routine.system_type || '').includes('vitamin');
              return (
                <TimelineRow
                  key={routine.id}
                  icon={routineIcon(routine)}
                  accent={ROUTINE_ACCENTS[i % ROUTINE_ACCENTS.length]}
                  title={routine.title}
                  meta={`+${routine.points}p`}
                  done={displayCompletedIds.has(routine.id)}
                  onClick={() => {
                    if (isVitamin) {
                      // Vitamin rutini: doğrudan toggle yerine kontrol modalını aç.
                      setVitaminRoutineId(routine.id);
                    } else {
                      toggleRoutine(routine.id, routine.points, () => {
                        import("@/lib/confetti").then((m) => m.fireTaskConfetti());
                      });
                    }
                  }}
                />
              );
            })}
      </div>

      {/* ── Aktif görevler — zengin kartlar (alt-adım UI burada) ── */}
      {isTasksLocked ? (
        <div className="rounded-card border border-[var(--border)] bg-[var(--surface)] p-6 text-center opacity-60">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] mb-1.5">Aktif görevler</p>
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">🔒 Bugün kapalı</p>
          <p className="text-xs text-[var(--text-muted)]">Zihinsel koruma amacıyla bugün aktif görev planlanmadı.</p>
        </div>
      ) : (
        <div className="mt-1 min-w-0">
          <TodayTasksSection {...sharedTaskProps} collapsed={false} hideAddInput={false} />
        </div>
      )}

      {/* Bonuslar */}
      {isBonusesLocked ? (
        <div className="rounded-card border border-[var(--border)] bg-[var(--surface)] p-6 text-center opacity-60">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] mb-1.5">Bonuslar & gelişim</p>
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">🔒 Bugün kapalı</p>
          <p className="text-xs text-[var(--text-muted)]">Koruma modu devrede. Bonus aksiyonlar bugün kapalı.</p>
        </div>
      ) : (
        <BonusesSection initialEnglishDone={englishDoneInitial} />
      )}

      {/* Gün bitir */}
      <EndDayButton score={initialTotalScore} totalPossible={dayTotalPossible} isAlreadyFinalized={isAlreadyFinalized} />

      {/* Vitamin kontrol modalı — vitamin rutinine tıklanınca açılır */}
      <VitaminModal
        isOpen={vitaminRoutineId !== null}
        onClose={() => setVitaminRoutineId(null)}
        onTakeAll={() => {
          if (vitaminRoutineId && !displayCompletedIds.has(vitaminRoutineId)) {
            toggleRoutine(vitaminRoutineId, 5);
          }
          // Mirror → alışkanlık zinciri (vitamin). İstanbul günü = server prop. best-effort.
          void mirrorHabitDone("vitamin", today, true);
        }}
      />
    </div>
  );
}
