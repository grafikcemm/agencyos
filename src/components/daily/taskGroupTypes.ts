import type { ActiveTask } from "@/types/tasks";

/**
 * Template-backed daily task row (kritik / sistem). Mirrors the fields actually
 * read by TaskGroup / TaskCard. `category` is wider than the DB TaskTemplate
 * because the daily UI also renders production/bonus rows.
 */
export interface DailyTemplateTask {
  id: string;
  title: string;
  points: number;
  category: "discipline" | "production" | "health" | "bonus";
  system_type?: string | null;
}

/** Pass-through domain arrays whose element shape is not read in these components. */
export type EnglishSubtask = unknown;
export type VitaminPackage = unknown;

/** Shared props for the daily task group surface (TaskGroup / TodayTasksSection). */
export interface TaskGroupSharedProps {
  kritikTasks: DailyTemplateTask[];
  sistemTasks: DailyTemplateTask[];
  activeTasks: ActiveTask[];
  completedIds: Set<string>;
  englishSubtasks: EnglishSubtask[];
  isTreadmillActive: boolean;
  vitaminPackages: VitaminPackage[];
  completedSkincareIds: string[];
  onToggleTemplate?: (id: string, points: number) => void;
  isDev?: boolean;
  uiMode?: "koruma" | "denge" | "atak";
  maxActiveTasks?: number;
}
