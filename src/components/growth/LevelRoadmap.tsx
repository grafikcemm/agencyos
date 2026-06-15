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
            style={{ borderColor: isOpen ? color + "40" : "#1f1f1f" }}
          >
            <button
              onClick={() => {
                if (isActive) {
                  setOpenLevelId(isOpen ? null : level.id)
                }
              }}
              disabled={!isActive}
              className={cn(
                "w-full flex items-center justify-between p-4 text-left bg-[#111111] transition-colors",
                isActive ? "hover:bg-[#141414]" : "opacity-60 cursor-not-allowed"
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
                  <p className="text-sm font-display font-bold text-white">{level.title}</p>
                  <p className="text-xs text-[#555] font-sans">{level.subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {isStrategic && (
                  <span className="text-[9px] font-mono text-[#666] border border-[#333] px-1.5 py-0.5 rounded">
                    STRATEJİK
                  </span>
                )}
                {isAiNative && (
                  <span className="text-[9px] font-mono text-[#06b6d4] border border-[#06b6d4]/30 bg-[#06b6d4]/5 px-1.5 py-0.5 rounded uppercase tracking-wider">
                    AI-NATIVE
                  </span>
                )}
                
                {isCompletedLevel && (
                  <span className="text-[9px] font-mono text-[#22c55e] border border-[#22c55e]/20 bg-[#22c55e]/5 px-1.5 py-0.5 rounded uppercase tracking-wider">
                    ✓ Bitti
                  </span>
                )}
                {isLockedLevel && (
                  <span className="text-[9px] font-mono text-[#e53e3e] border border-[#e53e3e]/20 bg-[#e53e3e]/5 px-1.5 py-0.5 rounded uppercase tracking-wider">
                    🔒 Kilitli
                  </span>
                )}
                {isActive && (
                  <span className="text-[9px] font-mono text-[var(--accent)] border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
                    Aktif
                  </span>
                )}

                <span className="text-[10px] font-mono text-[#666]">
                  {completedInLevel}/{activeSkills.length}
                </span>
                {isActive && (
                  <span className="text-[#444] font-mono text-sm">
                    {isOpen ? "−" : "+"}
                  </span>
                )}
              </div>
            </button>

            {isLockedLevel && (
              <div className="bg-[#0c0c0d] px-4 py-3 border-t border-[#1f1f1f]/50 text-[11px] text-[#555] font-mono">
                🔒 Bu seviye kilitli. Önce Seviye {CAREER_ROADMAP[activeLevelIndex]?.levelNumber} ({CAREER_ROADMAP[activeLevelIndex]?.title}) hedeflerini tamamlamalısın.
              </div>
            )}

            {isOpen && (
              <div className="bg-[#0d0d0d] p-3 space-y-2">
                {level.description && (
                  <p className="text-xs text-[#666] font-sans leading-relaxed pb-2 border-b border-[#1a1a1a]">
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
