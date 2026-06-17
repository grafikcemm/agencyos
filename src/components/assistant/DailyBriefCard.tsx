"use client";

import { useState, useEffect } from "react";
import { Zap, Phone, Flame } from "lucide-react";

interface DailyBrief {
  energySummary: string;
  criticalActions: string[];
  mentorNote: string;
}

interface DailyBriefCardProps {
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

const CACHE_KEY_PREFIX = "daily-brief-";

export function DailyBriefCard({ energyInput, today }: DailyBriefCardProps) {
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [loading, setLoading] = useState(false);

  const cacheKey = CACHE_KEY_PREFIX + today;

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      // reads cached brief from sessionStorage on mount — intentional external→React sync
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (cached) setBrief(JSON.parse(cached));
    } catch {
      /* ignore */
    }
  }, [cacheKey]);

  async function fetchBrief() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "brief",
          energyLevel: "NORMAL",
          completedRoutinesCount: energyInput.rhythmCountToday,
          totalRoutinesCount: 0,
          activeTasksCount: energyInput.activeTasksCount,
          completedTasksCount: 0,
          willpowerScore: Math.round(energyInput.criticalRoutineCompletionRate * 100),
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as DailyBrief;
        setBrief(data);
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(data));
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-[var(--bg-surface)] rounded-card border border-[var(--border-subtle)] overflow-hidden">
      <div className="px-5 pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap size={13} className="text-[var(--accent)]" strokeWidth={2} />
            <span className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-medium">
              Günlük Brief
            </span>
          </div>
          {!brief && (
            <button
              onClick={fetchBrief}
              disabled={loading}
              className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
            >
              {loading ? "Üretiyor..." : "Oluştur"}
            </button>
          )}
        </div>

        {!brief && !loading && (
          <p className="text-[12px] text-[var(--text-muted)]">
            Bugünün alışkanlıkları ve aranacak müşteriler için &quot;Oluştur&quot; butonuna bas.
          </p>
        )}

        {loading && (
          <div className="space-y-2">
            {[40, 60, 50].map((w, i) => (
              <div key={i} className="h-3 rounded animate-pulse bg-[var(--bg-elevated)]" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}

        {brief && (
          <div className="space-y-3">
            <p className="text-xs text-[var(--text-secondary)]">{brief.energySummary}</p>

            <ul className="space-y-1.5">
              {brief.criticalActions.map((action, i) => {
                const isCall = action.startsWith("Ara:");
                const isHabit = action.startsWith("Bugünün alışkanlıkları");
                const Icon = isCall ? Phone : isHabit ? Flame : null;
                return (
                  <li
                    key={i}
                    className={`flex items-start gap-2 text-[13px] leading-relaxed rounded-lg px-3 py-2 ${
                      isCall
                        ? "bg-[var(--warning)]/10 border border-[var(--warning)]/20 text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)]"
                    }`}
                  >
                    {Icon ? (
                      <Icon size={13} className="text-[var(--accent)] mt-0.5 shrink-0" strokeWidth={2} />
                    ) : (
                      <span className="text-[var(--accent)] mt-0.5">•</span>
                    )}
                    <span>{action}</span>
                  </li>
                );
              })}
            </ul>

            <div className="h-px bg-[var(--border-subtle)]" />
            <p className="text-[11px] text-[var(--text-muted)] italic">{brief.mentorNote}</p>

            <button
              onClick={() => {
                setBrief(null);
                try {
                  sessionStorage.removeItem(cacheKey);
                } catch {
                  /* ignore */
                }
              }}
              className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            >
              Yenile
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
