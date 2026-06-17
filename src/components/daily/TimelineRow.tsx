"use client";

import React, { useState } from "react";
import { cn } from "@/utils/cn";
import { Check } from "lucide-react";

export type CatAccent = "blue" | "teal" | "pink" | "purple" | "orange" | "cyan" | "gray";

const ACCENT_VAR: Record<CatAccent, string> = {
  blue: "var(--cat-blue)",
  teal: "var(--cat-teal)",
  pink: "var(--cat-pink)",
  purple: "var(--cat-purple)",
  orange: "var(--cat-orange)",
  cyan: "var(--cat-cyan)",
  gray: "var(--cat-gray)",
};

interface TimelineRowProps {
  icon: React.ReactNode;
  accent: CatAccent;
  title: React.ReactNode;
  /** small mono meta on the right (points, time, progress) */
  meta?: React.ReactNode;
  done?: boolean;
  /** Primary click — toggles the row (when no expandable detail) */
  onClick?: () => void;
  /** Expandable progressive-disclosure detail. When provided, the row becomes expandable. */
  detail?: React.ReactNode;
  /** Open detail by default */
  defaultExpanded?: boolean;
  /** Last row in the spine — hide the trailing connector */
  isLast?: boolean;
}

/**
 * A single calm row on the vertical day timeline spine.
 * Small colored icon circle sits ON the spine; content is a quiet card to the right.
 * Completed rows dim + show a check. Optional expandable detail for progressive disclosure.
 */
export function TimelineRow({
  icon,
  accent,
  title,
  meta,
  done = false,
  onClick,
  detail,
  defaultExpanded = false,
  isLast = false,
}: TimelineRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const accentColor = ACCENT_VAR[accent];
  const hasDetail = !!detail;

  const handleHeaderClick = () => {
    if (hasDetail) {
      setExpanded((v) => !v);
    } else {
      onClick?.();
    }
  };

  return (
    <div className="relative flex gap-3.5">
      {/* Spine + icon circle */}
      <div className="relative flex flex-col items-center shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onClick) {
              onClick();
            } else {
              handleHeaderClick();
            }
          }}
          aria-label="toggle"
          className={cn(
            "relative z-10 w-8 h-8 rounded-full flex items-center justify-center border transition-all duration-300",
            done ? "border-transparent" : "border-[var(--border-subtle)]"
          )}
          style={{
            backgroundColor: done ? accentColor : `color-mix(in srgb, ${accentColor} 14%, transparent)`,
            color: done ? "#0a0a0a" : accentColor,
          }}
        >
          {done ? <Check size={15} strokeWidth={3} /> : icon}
        </button>
        {/* connector down to next row */}
        {!isLast && <div className="w-px flex-1 mt-1 bg-(--timeline-line)" />}
      </div>

      {/* Content card */}
      <div
        className={cn(
          "flex-1 min-w-0 mb-3 rounded-card border bg-(--surface) transition-all duration-300",
          done ? "border-[var(--border-subtle)] opacity-55" : "border-(--border)"
        )}
      >
        <div
          onClick={handleHeaderClick}
          role={hasDetail || onClick ? "button" : undefined}
          className={cn(
            "flex items-center gap-3 px-4 py-3 min-w-0",
            (hasDetail || onClick) && "cursor-pointer"
          )}
        >
          <span
            className={cn(
              "flex-1 min-w-0 text-sm font-medium leading-snug truncate transition-colors",
              done ? "text-[var(--text-tertiary)] line-through" : "text-[var(--text-primary)]"
            )}
          >
            {title}
          </span>

          {meta && (
            <span className="shrink-0 font-mono text-[10px] text-[var(--text-tertiary)] tabular-nums">{meta}</span>
          )}

          {hasDetail && (
            <svg
              className={cn(
                "w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0 transition-transform duration-300",
                expanded && "rotate-180"
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>

        {hasDetail && expanded && (
          <div className="border-t border-[var(--border-subtle)] animate-in fade-in duration-200">{detail}</div>
        )}
      </div>
    </div>
  );
}

/** A non-row label that sits inline on the timeline as a quiet section divider. */
export function TimelineSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex gap-3.5 items-center">
      <div className="relative flex flex-col items-center shrink-0 w-8">
        <span className="w-1.5 h-1.5 rounded-full bg-(--timeline-line)" />
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] py-1.5">
        {children}
      </p>
    </div>
  );
}
