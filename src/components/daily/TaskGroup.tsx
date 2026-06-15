"use client";

import React, { useState, useTransition, useOptimistic } from "react";
import { Card } from "@/components/dashboard/Card";
import { SectionLabel } from "@/components/dashboard/SectionLabel";
import { TaskCard } from "./TaskCard";
import { ActiveTaskCard } from "./ActiveTaskCard";
import { toggleTemplateTask, addActiveTask } from "@/app/actions/taskActions";
import type { TaskGroupSharedProps } from "./taskGroupTypes";

interface TaskGroupProps extends TaskGroupSharedProps {
  showOnly?: "kritik" | "active" | "sistem";
  defaultCollapsed?: boolean;
  hideAddInput?: boolean;
}

export function TaskGroup({
  kritikTasks,
  sistemTasks,
  activeTasks,
  completedIds,
  englishSubtasks,
  isTreadmillActive,
  vitaminPackages,
  completedSkincareIds,
  showOnly,
  onToggleTemplate,
  defaultCollapsed = false,
  hideAddInput = false,
  isDev = false,
}: TaskGroupProps) {
  // Optimistic UI update
  const [optimisticIds, toggleOptimistic] = useOptimistic(
    completedIds,
    (current: Set<string>, templateId: string) => {
      const next = new Set(current);
      if (next.has(templateId)) {
        next.delete(templateId);
      } else {
        next.add(templateId);
      }
      return next;
    }
  );

  const [, startTransition] = useTransition();
  const [newTaskValue, setNewTaskValue] = useState("");
  const [isAdding, startAddTransition] = useTransition();

  const handleComplete = (templateId: string) => {
    if (templateId.startsWith("__virtual_")) return;
    
    if (onToggleTemplate) {
      const item = sistemTasks.find(s => s.id === templateId) || kritikTasks.find(s => s.id === templateId);
      const points = item?.points ?? 10;
      onToggleTemplate(templateId, points);
      return;
    }

    const isCompleted = optimisticIds.has(templateId);
    startTransition(() => {
      toggleOptimistic(templateId);
      toggleTemplateTask(templateId, isCompleted);
    });
  };

  const handleAddTask = (category: "active" | "waiting") => {
    if (!newTaskValue.trim()) return;
    const title = newTaskValue.trim();
    setNewTaskValue("");
    startAddTransition(async () => {
      try {
        const res = await addActiveTask(title, category);
        if (res && !res.success) {
          console.error("Görev ekleme hatası:", res.error);
        }
      } catch (err) {
        console.error("Görev ekleme hatası:", err);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAddTask("active");
  };

  const activeOnly = activeTasks
    .filter((t) => t.category === "active")
    .sort((a, b) => {
      if (a.is_priority && !b.is_priority) return -1;
      if (!a.is_priority && b.is_priority) return 1;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

  const waitingOnly = activeTasks
    .filter((t) => t.category === "waiting")
    .sort((a, b) => {
      if (a.is_priority && !b.is_priority) return -1;
      if (!a.is_priority && b.is_priority) return 1;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

  const renderKritik = () => (
    kritikTasks.length > 0 && (
      <Card noPadding>
        <div className="p-6">
          <SectionLabel>Kritik Rutinler</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {kritikTasks.map((t) => (
            <TaskCard
              key={t.id}
              id={t.id}
              title={t.title}
              isDone={optimisticIds.has(t.id)}
              category={t.category}
              systemType={t.system_type}
              points={t.points}
              priority={null}
              isBonus={false}
              onComplete={handleComplete}
              englishSubtasks={t.system_type === "english" ? englishSubtasks : []}
              isTreadmillActive={isTreadmillActive}
              vitaminPackages={t.system_type === "vitamin" ? vitaminPackages : []}
              completedSkincareIds={t.system_type === "skincare" ? completedSkincareIds : []}
            />
          ))}
        </div>
        </div>
      </Card>
    )
  );

  const renderActive = () => {
    // P1 KAPISI: öncelikli görevler bitene kadar diğerleri görünmez.
    // (Eski sayı-limiti mekaniği kaldırıldı — tek odak / DEHB uyumlu.)
    const hasPriorityPending = activeOnly.some((t) => t.is_priority && !t.is_done);
    const visibleTasks = hasPriorityPending
      ? activeOnly.filter((t) => t.is_priority)
      : activeOnly;
    const lockedCount = activeOnly.length - visibleTasks.length;

    const content = (
      <Card noPadding>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <SectionLabel>Aktif Görevler</SectionLabel>
            {hasPriorityPending && (
              <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--danger)]/90 bg-[var(--danger)]/10 border border-[var(--danger)]/20 px-2 py-0.5 rounded-pill">
                Öncelik modu
              </span>
            )}
          </div>

        <div className="flex flex-col gap-3">
          {activeOnly.length === 0 && (
            <p className="text-xs text-[#666666] italic px-1">
              Henüz aktif görev yok.
            </p>
          )}
          {visibleTasks.map((t) => (
            <ActiveTaskCard key={t.id} task={t} isDev={isDev} />
          ))}

          {hasPriorityPending && lockedCount > 0 && (
            <div className="flex items-center gap-2.5 rounded-card border border-dashed border-[var(--border)] px-4 py-3">
              <span className="text-[13px] opacity-70">🔒</span>
              <p className="text-[11px] text-[#666] leading-relaxed">
                <span className="text-[#999] font-medium">{lockedCount} görev</span> öncelikli görevler bitince açılır.
              </p>
            </div>
          )}
        </div>

        {/* Görev Ekleme Input */}
        {!hideAddInput && (
            <div className="flex gap-2 mt-4">
              <input
                type="text"
                value={newTaskValue}
                onChange={(e) => setNewTaskValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Yeni görev ekle..."
                disabled={isAdding}
                className="flex-1 bg-[#111111] border border-[#1E1E1E] rounded-xl px-4 py-2.5 text-sm text-[#888888] placeholder-[#444444] focus:border-[var(--accent)] focus:outline-none transition-all disabled:opacity-50"
              />
              <button
                onClick={() => handleAddTask("active")}
                disabled={isAdding || !newTaskValue.trim()}
                className="w-9 h-9 bg-[var(--accent)] rounded-xl flex items-center justify-center hover:bg-[var(--accent-hover)] transition-colors text-white text-sm font-bold disabled:opacity-50"
              >
                +
              </button>
              {isDev && (
                <button
                  onClick={() => handleAddTask("waiting")}
                  disabled={isAdding || !newTaskValue.trim()}
                  className="w-9 h-9 bg-[#111111] border border-[#1E1E1E] rounded-xl flex items-center justify-center text-[#555555] hover:border-[#333333] transition-colors disabled:opacity-50"
                  title="Bekleyenlere Ekle"
                >
                  ⏳
                </button>
              )}
            </div>
        )}

        {/* BEKLEYENLER */}
        {isDev && waitingOnly.length > 0 && (
          <div className="mt-6 border-t border-[#1a1a1a] pt-4">
            <details className="group/waiting-tasks">
              <summary className="flex items-center justify-between text-xs font-semibold tracking-widest uppercase text-[#555555] hover:text-white transition-colors cursor-pointer select-none py-1.5">
                <span className="flex items-center gap-2">
                  <span>BEKLEYENLER ({waitingOnly.length})</span>
                  <span className="text-[10px] text-[#444444] font-normal lowercase italic">günlük akışın dışında</span>
                </span>
                <svg className="w-3.5 h-3.5 transform group-open/waiting-tasks:rotate-180 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="flex flex-col gap-2 mt-4 animate-in slide-in-from-top-2 duration-300">
                {waitingOnly.map((t) => (
                  <ActiveTaskCard key={t.id} task={t} isDev={isDev} />
                ))}
              </div>
            </details>
          </div>
        )}
        </div>
      </Card>
    );

    if (!defaultCollapsed) return content;

    const doneCount = activeOnly.filter(t => t.is_done).length;
    return (
      <details className="group/active-tasks">
        <summary className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-[#555555] hover:text-white transition-colors cursor-pointer select-none py-2 px-1">
          <span>Aktif Görevler ({activeOnly.length - doneCount} bekliyor)</span>
          <svg className="w-3.5 h-3.5 transform group-open/active-tasks:rotate-180 transition-transform duration-300 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="mt-2 animate-in slide-in-from-top-2 duration-300">{content}</div>
      </details>
    );
  };

  const renderSistem = () => (
    sistemTasks.length > 0 && (
      <Card noPadding>
        <div className="p-6">
          <SectionLabel>Ritimler</SectionLabel>
        <div className="flex flex-col gap-3">
          {sistemTasks.map((t) => (
            <TaskCard
              key={t.id}
              id={t.id}
              title={t.title}
              isDone={optimisticIds.has(t.id)}
              category={t.category}
              systemType={t.system_type}
              points={t.points}
              priority={null}
              isBonus={false}
              onComplete={handleComplete}
              englishSubtasks={t.system_type === "english" ? englishSubtasks : []}
              isTreadmillActive={isTreadmillActive}
              vitaminPackages={t.system_type === "vitamin" ? vitaminPackages : []}
              completedSkincareIds={t.system_type === "skincare" ? completedSkincareIds : []}
            />
          ))}
        </div>
        </div>
      </Card>
    )
  );

  if (showOnly === "kritik") return renderKritik();
  if (showOnly === "active") return renderActive();
  if (showOnly === "sistem") return renderSistem();

  return (
    <div className="flex flex-col gap-10">
      {renderKritik()}
      {renderActive()}
      {renderSistem()}
    </div>
  );
}
