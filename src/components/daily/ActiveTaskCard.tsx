"use client";

import React, { useState, useTransition } from "react";
import { cn } from "@/utils/cn";
import { toggleActiveTask, deleteActiveTask, moveActiveTask, toggleTaskPriority, updateActiveTaskNote } from "@/app/actions/taskActions";
import type { ActiveTask } from "@/types/tasks";
import { TaskSteps } from "./TaskSteps";
import { TaskDetailModal } from "./TaskDetailModal";

// Büyük/belirsiz hedef sezgisi → en az bir "sıradaki adım" teşvik edilir.
const BIG_GOAL_PATTERNS = [
  /kurs/i, /proje/i, /müzik/i, /academy/i, /akademi/i, /üniversite/i, /okul/i,
  /haftalık/i, /aylık/i, /gelişim/i, /kariyer/i, /plan/i, /strateji/i, /öğren/i,
];
function looksLikeBigGoal(title: string): boolean {
  return BIG_GOAL_PATTERNS.some((p) => p.test(title)) || title.trim().length > 42;
}

interface ActiveTaskCardProps {
  task: ActiveTask;
  isDev?: boolean;
}

export function ActiveTaskCard({ task, isDev = false }: ActiveTaskCardProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticDone, setOptimisticDone] = useState(task.is_done);
  const [optimisticPriority, setOptimisticPriority] = useState(task.is_priority);
  const [noteValue, setNoteValue] = useState(task.note ?? "");
  const [noteSaveError, setNoteSaveError] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleNoteSave = () => {
    if (noteValue !== (task.note ?? "")) {
      setNoteSaveError(false);
      startTransition(async () => {
        const result = await updateActiveTaskNote(task.id, noteValue);
        if (result.error) {
          setNoteSaveError(true);
          setNoteValue(task.note ?? "");
        }
      });
    }
  };

  const isWaiting = task.category === "waiting";

  const handleToggle = () => {
    const isCurrentlyDone = optimisticDone;
    const nextDone = !isCurrentlyDone;
    setOptimisticDone(nextDone);

    if (nextDone) {
      import("@/lib/confetti").then((m) => m.fireTaskConfetti());
    }

    // Dispatch zero-latency event for Willpower Muscle growth if in dev mode
    if (isDev) {
      window.dispatchEvent(
        new CustomEvent("iradeTaskToggled", {
          detail: { id: task.id, isDone: nextDone, points: 15 }
        })
      );
    }

    startTransition(async () => {
      try {
        const res = await toggleActiveTask(task.id, task.is_done);
        if (res && !res.success) {
          setOptimisticDone(isCurrentlyDone);
        }
      } catch {
        setOptimisticDone(isCurrentlyDone);
      }
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(async () => {
      try {
        const res = await deleteActiveTask(task.id);
        if (res && !res.success) {
          console.error("Görevi silme hatası:", res.error);
        }
      } catch (err) {
        console.error("Görevi silme hatası:", err);
      }
    });
  };

  const handleMove = (e: React.MouseEvent, to: "active" | "waiting") => {
    e.stopPropagation();
    startTransition(async () => {
      try {
        const res = await moveActiveTask(task.id, to);
        if (res && !res.success) {
          console.error("Görev taşıma hatası:", res.error);
        }
      } catch (err) {
        console.error("Görev taşıma hatası:", err);
      }
    });
  };

  const handlePriorityToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const isCurrentlyPriority = optimisticPriority;
    const nextPriority = !isCurrentlyPriority;
    setOptimisticPriority(nextPriority);
    startTransition(async () => {
      try {
        const res = await toggleTaskPriority(task.id, !!isCurrentlyPriority);
        if (res && !res.success) {
          setOptimisticPriority(isCurrentlyPriority);
        }
      } catch {
        setOptimisticPriority(isCurrentlyPriority);
      }
    });
  };

  if (isWaiting) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 text-[#444444] hover:text-[#666666] transition-colors group",
          isPending && "opacity-60"
        )}
      >
        <button
          onClick={handleToggle}
          className={cn(
            "w-4 h-4 rounded-sm border shrink-0 flex items-center justify-center transition-all duration-300",
            optimisticDone
              ? "bg-[#30d158] border-[#30d158] text-white"
              : "border-[#2a2a2a] bg-transparent hover:border-[#6366f1]"
          )}
        >
          {optimisticDone && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <span
          className={cn(
            "flex-1 transition-all line-clamp-2 whitespace-normal break-words",
            optimisticDone ? "line-through opacity-70 text-[15px] text-[#666666]" : "text-[15px] text-[#444444]"
          )}
        >
          {task.title}
        </span>

        <button
          onClick={(e) => handleMove(e, "active")}
          className="text-[#666666] hover:text-[#6366f1] transition-colors ml-auto text-xs opacity-0 group-hover:opacity-100 px-1"
          title="Aktife taşı"
        >
          ↑
        </button>

        <button
          onClick={handleDelete}
          className="text-[#2a2a2a] hover:text-[#ff453a] transition-colors text-xs opacity-0 group-hover:opacity-100"
          title="Görevi sil"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  const steps = task.steps ?? [];
  const totalSteps = steps.length;
  const doneSteps = steps.filter((s) => s.is_done).length;
  const encourageNextStep = looksLikeBigGoal(task.title) && totalSteps === 0;

  return (
    <div
      className={cn(
        "rounded-card border transition-all group min-w-0 shadow-soft mb-2",
        optimisticPriority
          ? "bg-[var(--surface)] border-[var(--border)] border-l-2 border-l-[var(--danger)]"
          : "bg-[var(--surface)] border-[var(--border)] border-l-2 border-l-transparent",
        isPending && "opacity-60",
        optimisticDone && "opacity-70"
      )}
    >
    <div className="flex items-center gap-3 px-4 py-3">
      <button
        onClick={handleToggle}
        className={cn(
          "w-5 h-5 rounded-sm border shrink-0 flex items-center justify-center transition-all duration-300",
          optimisticDone
            ? "bg-[#30d158] border-[#30d158] text-white"
            : "border-[#2a2a2a] bg-[#141414] hover:border-[#6366f1]/50"
        )}
      >
        {optimisticDone && (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        className="flex-1 min-w-0 text-left group/title"
        title="Detay / düzenle"
      >
        <span
          className={cn(
            "block transition-all text-sm font-medium line-clamp-2 whitespace-normal break-words group-hover/title:underline decoration-dotted underline-offset-4 decoration-[#444]",
            optimisticDone ? "text-[#666666] line-through" : "text-white"
          )}
        >
          {task.title}
        </span>
        {task.description && (
          <span className="block text-[11px] text-[#5f5f5f] truncate mt-0.5">{task.description}</span>
        )}
      </button>

      {/* Son tarih rozeti */}
      {task.due_date && (
        <span
          className="shrink-0 font-mono text-[9px] text-[var(--cat-orange)] border border-[var(--cat-orange)]/25 bg-[var(--cat-orange)]/10 px-1.5 py-0.5 rounded-pill tabular-nums"
          title={`Son tarih: ${task.due_date}`}
        >
          {task.due_date.slice(5)}
        </span>
      )}

      {/* Adım ilerlemesi — sessiz mono çip */}
      {totalSteps > 0 && (
        <span
          className={cn(
            "shrink-0 font-mono text-[10px] tabular-nums px-1.5 py-0.5 rounded-pill border",
            doneSteps === totalSteps
              ? "text-[var(--accent-green)] border-[var(--accent-green)]/30 bg-[var(--accent-green)]/10"
              : "text-[var(--cat-blue)] border-[var(--cat-blue)]/25 bg-[var(--cat-blue)]/10"
          )}
          title={`${doneSteps}/${totalSteps} adım tamam`}
        >
          {doneSteps}/{totalSteps}
        </span>
      )}

      {/* Priority Toggle Button */}
      <button
        onClick={handlePriorityToggle}
        style={{
          marginLeft: "auto",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: optimisticPriority ? "#EF4444" : "#444444",
          fontWeight: "bold",
          fontSize: "16px",
          padding: "4px 8px",
          lineHeight: 1,
          borderRadius: "6px"
        }}
        className={cn(
          "transition-all",
          !optimisticPriority && "opacity-0 group-hover:opacity-100",
          optimisticPriority && "scale-125"
        )}
        title={optimisticPriority ? "Önceliği kaldır" : "Öncelikli işaretle"}
      >
        !
      </button>

      {isDev && (
        <button
          onClick={(e) => handleMove(e, "waiting")}
          className="w-7 h-7 bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg flex items-center justify-center text-[#555555] hover:border-[#333333] transition-colors ml-1 opacity-0 group-hover:opacity-100"
          title="Bekleyene taşı"
        >
          <span className="text-[10px]">⏳</span>
        </button>
      )}

      <button
        onClick={handleDelete}
        className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center text-[#666666] hover:text-[#ff453a] shrink-0 ml-1"
        title="Görevi sil"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

      {/* Alt zon — adımlar + not tek bölmede, başlık altında TEK ayraçla ayrılır.
          Eski çift-border (steps + note) kademeli boş bant görünümü yaratıyordu. */}
      <div>
        <TaskSteps taskId={task.id} steps={steps} encourageNextStep={encourageNextStep} />

        {/* Kendime not — ince footer satırı, kendi ayracı yok (boş bant olmasın) */}
        <input
          type="text"
          value={noteValue}
          onChange={e => { setNoteValue(e.target.value); setNoteSaveError(false); }}
          onBlur={handleNoteSave}
          onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
          placeholder={noteSaveError ? "Kaydedilemedi" : "Kendime not"}
          className={cn(
            "w-full px-4 pt-0.5 pb-2.5 text-xs bg-transparent text-[#555555] focus:outline-none focus:text-[#888888] transition-colors rounded-b-[14px]",
            noteSaveError ? "placeholder-[#ef4444]/70" : "placeholder-[#333333]"
          )}
        />
      </div>

      {detailOpen && <TaskDetailModal task={task} onClose={() => setDetailOpen(false)} />}
    </div>
  );
}
