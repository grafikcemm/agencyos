import { DailyBriefCard } from "./DailyBriefCard";
import { AssistantChat } from "./AssistantChat";
import { AssistantMemoryPanel } from "./AssistantMemoryPanel";

interface AssistantShellProps {
  energyInput: {
    completedTasksYesterday: number;
    criticalRoutineCompletionRate: number;
    dailyPeakClean: boolean | null;
    activeTasksCount: number;
    waitingTasksCount: number;
    rhythmCountToday: number;
  };
  today: string;
}

export function AssistantShell({ energyInput, today }: AssistantShellProps) {
  return (
    <div className="max-w-[860px] mx-auto px-4 sm:px-6 pb-16">
      <div className="mb-8">
        <span className="text-[10px] uppercase tracking-widest text-[#444444] font-medium block">
          ASİSTAN
        </span>
        <p className="text-[13px] text-[#555555] mt-1">
          Cem&apos;i tanıyan kişisel planlama ve disiplin asistanı.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <DailyBriefCard energyInput={energyInput} today={today} />
        <AssistantChat />
        <AssistantMemoryPanel />
      </div>
    </div>
  );
}
