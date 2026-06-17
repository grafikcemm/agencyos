"use client";

import React, { useState, useTransition } from "react";
import { cn } from "@/utils/cn";
import { addTaskStep, toggleTaskStep, deleteTaskStep } from "@/app/actions/taskActions";
import type { ActiveTaskStep } from "@/types/tasks";

interface TaskStepsProps {
  taskId: string;
  steps: ActiveTaskStep[];
  /** Big/ambiguous goal: encourage adding at least one concrete next step. */
  encourageNextStep?: boolean;
}

/**
 * "Büyük hedefi parçala" — görev alt adımları.
 * Adımlar her zaman görünür (accordion yok). Sıradaki tamamlanmamış adım
 * hafif vurgulanır. Adım ekle / işaretle / sil.
 */
export function TaskSteps({ taskId, steps, encourageNextStep = false }: TaskStepsProps) {
  const [, startTransition] = useTransition();
  // Optimistic local copy so toggling/adding/deleting feels instant.
  const [localSteps, setLocalSteps] = useState<ActiveTaskStep[]>(steps);
  const [newStep, setNewStep] = useState("");
  const [isAdding, startAdding] = useTransition();

  React.useEffect(() => {
    // incoming prop → local editable state sync
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalSteps(steps);
  }, [steps]);

  const ordered = [...localSteps].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const total = ordered.length;
  const doneCount = ordered.filter((s) => s.is_done).length;
  const nextStep = ordered.find((s) => !s.is_done);

  const handleToggle = (step: ActiveTaskStep) => {
    const nextDone = !step.is_done;
    setLocalSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, is_done: nextDone } : s)));
    if (nextDone) {
      import("@/lib/confetti").then((m) => m.fireTaskConfetti());
    }
    startTransition(async () => {
      try {
        const res = await toggleTaskStep(step.id, step.is_done);
        if (res && !res.success) {
          setLocalSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, is_done: step.is_done } : s)));
        }
      } catch {
        setLocalSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, is_done: step.is_done } : s)));
      }
    });
  };

  const handleDelete = (id: string) => {
    const snapshot = localSteps;
    setLocalSteps((prev) => prev.filter((s) => s.id !== id));
    startTransition(async () => {
      try {
        const res = await deleteTaskStep(id);
        if (res && !res.success) setLocalSteps(snapshot);
      } catch {
        setLocalSteps(snapshot);
      }
    });
  };

  const handleAdd = () => {
    const title = newStep.trim();
    if (!title) return;
    setNewStep("");
    // Optimistic temp row (server revalidate will replace it).
    const temp: ActiveTaskStep = {
      id: `temp-${Date.now()}`,
      task_id: taskId,
      title,
      is_done: false,
      sort_order: total + 1,
      created_at: new Date().toISOString(),
    };
    setLocalSteps((prev) => [...prev, temp]);
    startAdding(async () => {
      try {
        const res = await addTaskStep(taskId, title);
        if (res && !res.success) {
          setLocalSteps((prev) => prev.filter((s) => s.id !== temp.id));
        }
      } catch {
        setLocalSteps((prev) => prev.filter((s) => s.id !== temp.id));
      }
    });
  };

  const showEmptyNudge = total === 0 && encourageNextStep;
  const progressPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="flex flex-col px-4 pb-3 pt-2.5">
      {/* İlerleme başlığı + ince bar */}
      {total > 0 && (
        <div className="flex items-center gap-2.5 mb-2.5">
          <span className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums shrink-0">
            {doneCount}/{total} adım
          </span>
          <div className="h-1 flex-1 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                doneCount === total ? "bg-[var(--accent-green)]" : "bg-[var(--cat-blue)]"
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Adım listesi — her zaman görünür */}
      {total > 0 && (
        <div className="flex flex-col gap-0.5">
          {ordered.map((step) => {
            const isNext = !!nextStep && step.id === nextStep.id;
            return (
              <div
                key={step.id}
                className={cn(
                  "flex items-start gap-2.5 group/step rounded-lg -mx-1.5 px-1.5 py-1.5 transition-colors",
                  isNext && "bg-[var(--cat-blue)]/8"
                )}
              >
                <button
                  onClick={() => handleToggle(step)}
                  className={cn(
                    "w-4 h-4 mt-0.5 rounded-full border shrink-0 flex items-center justify-center transition-all",
                    step.is_done
                      ? "bg-[var(--accent-green)] border-[var(--accent-green)] text-black"
                      : isNext
                      ? "border-[var(--cat-blue)] hover:bg-[var(--cat-blue)]/20"
                      : "border-[var(--border-strong)] hover:border-[var(--cat-blue)]"
                  )}
                  title="Adımı tamamla"
                >
                  {step.is_done && (
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

                <button
                  onClick={() => handleToggle(step)}
                  className={cn(
                    "flex-1 text-left text-[13px] leading-snug transition-colors whitespace-normal break-words",
                    step.is_done
                      ? "text-[var(--text-tertiary)] line-through"
                      : isNext
                      ? "text-[var(--text-primary)] font-medium"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  {step.title}
                </button>

                {isNext && (
                  <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--cat-blue)] mt-1 shrink-0">
                    sıradaki
                  </span>
                )}

                <button
                  onClick={() => handleDelete(step.id)}
                  className="opacity-0 group-hover/step:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--danger)] transition-all shrink-0 mt-0.5"
                  title="Adımı sil"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showEmptyNudge && (
        <p className="font-mono text-[10px] text-[var(--cat-orange)]/80 leading-relaxed mb-1">
          Büyük hedef — sıradaki somut adımı ekle.
        </p>
      )}

      {/* Adım ekle */}
      <div className="flex gap-2 mt-2">
        <input
          type="text"
          value={newStep}
          onChange={(e) => setNewStep(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          disabled={isAdding}
          placeholder={total === 0 ? "İlk adımı yaz…" : "Adım ekle…"}
          className="flex-1 bg-transparent border-b border-[var(--border-subtle)] px-1 py-1.5 text-[12px] font-mono text-[var(--text-secondary)] placeholder-[var(--border-strong)] focus:border-[var(--cat-blue)] focus:outline-none transition-colors disabled:opacity-50"
        />
        <button
          onClick={handleAdd}
          disabled={isAdding || !newStep.trim()}
          className="shrink-0 w-7 h-7 rounded-card bg-[var(--cat-blue)]/15 border border-[var(--cat-blue)]/30 text-[var(--cat-blue)] text-sm font-bold flex items-center justify-center hover:bg-[var(--cat-blue)]/25 transition-colors disabled:opacity-40"
          title="Adım ekle"
        >
          +
        </button>
      </div>
    </div>
  );
}
