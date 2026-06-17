"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/utils/cn";
import { isEnglishActiveToday } from "@/lib/dayUtils";
import type { EnglishSubtask, VitaminPackage } from "./taskGroupTypes";

const SkincareModal = dynamic(() => import("./SkincareModal").then(mod => mod.SkincareModal), {
  ssr: false,
});

export interface TaskCardProps {
  id: string;
  title: string;
  isDone: boolean;
  points: number;
  category: "discipline" | "production" | "health" | "bonus";
  systemType?: string | null;
  priority?: "P1" | "P2" | "P3" | null;
  isBonus?: boolean;
  onComplete: (taskId: string) => void;
  // System task specific props
  englishSubtasks?: EnglishSubtask[];
  isTreadmillActive?: boolean;
  vitaminPackages?: VitaminPackage[];
  completedSkincareIds?: string[];
}

const EMPTY_ARRAY: string[] = [];

export function TaskCard({
  id, title, isDone, points, category, systemType, priority, isBonus, onComplete,
  isTreadmillActive = true,
  completedSkincareIds = EMPTY_ARRAY
}: TaskCardProps) {
  const [isFlying, setIsFlying] = useState(false);
  const [skincareModalOpen, setSkincareModalOpen] = useState(false);
  
  const [localSkincareCompletedIds, setLocalSkincareCompletedIds] = useState<string[]>(completedSkincareIds);

  React.useEffect(() => {
    // incoming prop → local editable state sync
    if (JSON.stringify(completedSkincareIds) !== JSON.stringify(localSkincareCompletedIds)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalSkincareCompletedIds(completedSkincareIds);
    }
    // localSkincareCompletedIds intentionally excluded: it is the compare target,
    // including it would re-fire on every local edit and clobber optimistic updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedSkincareIds]);

  // 1. Passive Checks
  const isEnglish = systemType === 'english';
  const isTreadmill = systemType === 'treadmill';
  const isVitamin = systemType === 'vitamin';
  const isSkincare = systemType === 'skincare';
  const isProduction = category === 'production';

  const englishActive = isEnglishActiveToday();
  const treadmillActive = isTreadmillActive;

  const isPassive = (isEnglish && !englishActive) || (isTreadmill && !treadmillActive);

  const showPriorityBadge = !isProduction && !systemType && priority;

  const handleClick = () => {
    if (isPassive) return;

    if (isSkincare) {
      if (isDone) {
        window.dispatchEvent(
          new CustomEvent("iradeTaskToggled", {
            detail: { id, isDone: false, points }
          })
        );
        onComplete(id);
      } else {
        setSkincareModalOpen(true);
      }
      return;
    }

    if (!isDone && !isProduction) {
      import('@/lib/confetti').then(m => m.fireTaskConfetti());
      setIsFlying(true);
      setTimeout(() => setIsFlying(false), 800);
    }
    
    // Dispatch zero-latency event for Willpower Muscle growth
    window.dispatchEvent(
      new CustomEvent("iradeTaskToggled", {
        detail: { id, isDone: !isDone, points }
      })
    );
    
    onComplete(id);
  };


  const handleSkincarePackageTaken = (packageId: string) => {
    setLocalSkincareCompletedIds(prev => [...prev, packageId]);
  };

  const getPassiveLabel = () => {
    if (isEnglish && !englishActive) return "BUGÜN PASİF";
    if (isTreadmill && !treadmillActive) return "BUGÜN PASİF";
    return null;
  };

  return (
    <div className="flex flex-col w-full">
      <div
        onClick={handleClick}
        className={cn(
          "flex items-center gap-4 px-3 py-3 rounded-xl border transition-colors relative group",
          isPassive ? "opacity-40 grayscale cursor-not-allowed bg-transparent border-[var(--border-subtle)]" :
          isBonus ? "border-dashed border-[var(--border-subtle)] bg-transparent hover:bg-[var(--bg-elevated)]" :
          "bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--border-strong)] cursor-pointer"
        )}
      >
        {/* Icon (Status Dot) */}
        <div
          className={cn(
            "w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-all text-white",
            isDone ? "bg-[var(--success)] border border-[var(--success)]" : isPassive ? "border border-[var(--border-subtle)] bg-transparent" : "border border-[var(--border-strong)]"
          )}
        >
          {isDone && (
             <svg className="w-1.5 h-1.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={6}>
               <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
             </svg>
          )}
        </div>

        {/* Title */}
        <span
          className={cn(
            "flex-1 text-sm font-medium transition-all w-full truncate",
            isDone ? "text-[var(--text-tertiary)] line-through" : isPassive ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"
          )}
        >
          {title}
          {isPassive && (
            <span className="ml-3 text-[10px] bg-[var(--bg-surface)] text-[var(--info)] px-2 py-0.5 rounded-full font-medium">
              {getPassiveLabel()}
            </span>
          )}
        </span>

        {/* Priority Badge */}
        {showPriorityBadge && (
          <span
            className={cn(
              "px-2 py-0.5 rounded text-[10px] tracking-wider font-bold",
              priority === "P1" && "bg-[var(--danger)]/15 text-[var(--danger)]",
              priority === "P2" && "bg-[var(--warning)]/15 text-[var(--warning)]",
              priority === "P3" && "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
            )}
          >
            {priority}
          </span>
        )}

        {/* Points */}
        {!isProduction && (
          <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold transition-colors", isDone ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--accent)]/10 text-[var(--accent)]")}>
            +{points}P
          </span>
        )}

        {/* XP Animation */}
        {isFlying && !isProduction && (
          <span className="absolute right-16 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--info)] pointer-events-none animate-fly-up">
            +{points}P
          </span>
        )}

        <div
          className={cn(
            "shrink-0 flex items-center justify-center transition-all duration-300",
            (isVitamin || isSkincare) && !isPassive && !isDone
               ? "w-7 h-7 rounded-lg bg-[var(--bg-card-hover)] border border-[var(--border-strong)] text-[var(--text-muted)] hover:border-[var(--info)] hover:text-[var(--info)]"
               : "hidden"
          )}
        >
          {(isSkincare) && !isPassive && !isDone && (
            <span className="leading-none pb-1">...</span>
          )}
        </div>
      </div>
 

      {/* Skincare Modal */}
      <SkincareModal
        isOpen={skincareModalOpen}
        onClose={() => setSkincareModalOpen(false)}
        completedPackageIds={localSkincareCompletedIds}
        onPackageTaken={handleSkincarePackageTaken}
        templateId={id}
      />
    </div>
  );
}
