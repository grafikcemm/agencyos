"use client"

import { useState, useEffect } from "react"
import { CAREER_ROADMAP, getActiveSkills } from "@/data/careerRoadmap"
import type { CareerSkillStatus } from "@/data/careerRoadmap"
import { SkillCard } from "./SkillCard"
import { cn } from "@/utils/cn"

// Pastel kategori aksanları (globals.css --cat-* token'larıyla aynı değerler).
// Inline style'da hex string birleştirildiği için CSS var değil ham hex kullanılır.
const LEVEL_COLORS = ["#FB923C", "#6AA2F0", "#2DD4BF", "#A78BFA", "#F472B6", "#6B7280", "#38BDF8"]

interface Props {
  activeFocusSkillId: string | null
  completedSkillIds: string[]
  getSkillStatus: (skillId: string) => CareerSkillStatus
  onStatusChange: (skillId: string, status: CareerSkillStatus) => void
  onSetFocus: (skillId: string, levelId: string) => void
  onComplete: (skillId: string) => void
}

export function LevelRoadmap({
  activeFocusSkillId,
  completedSkillIds,
  getSkillStatus,
  onStatusChange,
  onSetFocus,
  onComplete,
}: Props) {
  // Dynamically determine the active level (first level that has incomplete active skills)
  const computedActiveLevel = CAREER_ROADMAP.find(level => {
    const activeSkills = getActiveSkills(level)
    return activeSkills.some(s => !completedSkillIds.includes(s.id))
  }) || CAREER_ROADMAP[0]

  const activeLevelId = computedActiveLevel.id
  const activeLevelIndex = CAREER_ROADMAP.findIndex(l => l.id === activeLevelId)

  const [openLevelId, setOpenLevelId] = useState<string | null>(activeLevelId)

  // Keep openLevelId in sync if the active level shifts
  useEffect(() => {
    // sync active level prop → local open state
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenLevelId(activeLevelId)
  }, [activeLevelId])

  return (
    <div className="space-y-2">
      {CAREER_ROADMAP.map((level, idx) => {
        const color = LEVEL_COLORS[idx] ?? "#06b6d4"
        const activeSkills = getActiveSkills(level)
        const completedInLevel = activeSkills.filter(s => completedSkillIds.includes(s.id)).length
        
        const isActive = level.id === activeLevelId
        const isCompletedLevel = idx < activeLevelIndex
        const isLockedLevel = idx > activeLevelIndex
        const isOpen = isActive && openLevelId === level.id

        const isStrategic = level.levelNumber === 6
        const isAiNative = level.levelNumber === 7

        return (
          <div
            key={level.id}
            className="border rounded-card shadow-soft overflow-hidden"
            style={{ borderColor: isOpen ? color + "40" : "var(--border-subtle)" }}
          >
            <button
              onClick={() => {
                if (isActive) {
                  setOpenLevelId(isOpen ? null : level.id)
                }
              }}
              disabled={!isActive}
              className={cn(
                "w-full flex items-center justify-between p-4 text-left bg-[var(--bg-surface)] transition-colors",
                isActive ? "hover:bg-[var(--bg-card-hover)]" : "opacity-60 cursor-not-allowed"
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded flex items-center justify-center text-xs font-mono font-bold shrink-0"
                  style={{
                    backgroundColor: color + "20",
                    color,
                    border: `1px solid ${color}40`,
                  }}
                >
                  {level.levelNumber}
                </div>
                <div className="text-left">
                  <p className="text-sm font-display font-bold text-[var(--text-primary)]">{level.title}</p>
                  <p className="text-xs text-[var(--text-muted)] font-sans">{level.subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {isStrategic && (
                  <span className="text-[9px] font-mono text-[var(--text-muted)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded">
                    STRATEJİK
                  </span>
                )}
                {isAiNative && (
                  <span className="text-[9px] font-mono text-[var(--info)] border border-[var(--info)]/30 bg-[var(--info)]/5 px-1.5 py-0.5 rounded uppercase tracking-wider">
                    AI-NATIVE
                  </span>
                )}

                {isCompletedLevel && (
                  <span className="text-[9px] font-mono text-[var(--success)] border border-[var(--success)]/20 bg-[var(--success)]/5 px-1.5 py-0.5 rounded uppercase tracking-wider">
                    ✓ Bitti
                  </span>
                )}
                {isLockedLevel && (
                  <span className="text-[9px] font-mono text-[var(--danger)] border border-[var(--danger)]/20 bg-[var(--danger)]/5 px-1.5 py-0.5 rounded uppercase tracking-wider">
                    🔒 Kilitli
                  </span>
                )}
                {isActive && (
                  <span className="text-[9px] font-mono text-[var(--accent)] border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
                    Aktif
                  </span>
                )}

                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                  {completedInLevel}/{activeSkills.length}
                </span>
                {isActive && (
                  <span className="text-[var(--text-tertiary)] font-mono text-sm">
                    {isOpen ? "−" : "+"}
                  </span>
                )}
              </div>
            </button>

            {isLockedLevel && (
              <div className="bg-[var(--bg-base)] px-4 py-3 border-t border-[var(--border-subtle)]/50 text-[11px] text-[var(--text-muted)] font-mono">
                🔒 Bu seviye kilitli. Önce Seviye {CAREER_ROADMAP[activeLevelIndex]?.levelNumber} ({CAREER_ROADMAP[activeLevelIndex]?.title}) hedeflerini tamamlamalısın.
              </div>
            )}

            {isOpen && (
              <div className="bg-[var(--bg-base)] p-3 space-y-2">
                {level.description && (
                  <p className="text-xs text-[var(--text-muted)] font-sans leading-relaxed pb-2 border-b border-[var(--border-subtle)]">
                    {level.description}
                  </p>
                )}
                {activeSkills.map(skill => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    levelId={level.id}
                    currentStatus={getSkillStatus(skill.id)}
                    isCompleted={completedSkillIds.includes(skill.id)}
                    isActiveFocus={skill.id === activeFocusSkillId}
                    onStatusChange={onStatusChange}
                    onSetFocus={onSetFocus}
                    onComplete={onComplete}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
