"use client"

import { useState, useEffect } from "react"
import { CAREER_ROADMAP, getActiveSkills } from "@/data/careerRoadmap"
import type { CareerLevel, CareerSkillStatus } from "@/data/careerRoadmap"
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
  // Aktif seviye = ilk tamamlanmamış aktif beceri içeren seviye.
  const computedActiveLevel = CAREER_ROADMAP.find(level => {
    const activeSkills = getActiveSkills(level)
    return activeSkills.some(s => !completedSkillIds.includes(s.id))
  }) || CAREER_ROADMAP[0]

  const activeLevelId = computedActiveLevel.id
  const activeLevelIndex = CAREER_ROADMAP.findIndex(l => l.id === activeLevelId)

  const [openLevelId, setOpenLevelId] = useState<string | null>(activeLevelId)

  // Aktif seviye kaydığında (bir seviye tamamlanınca) açık seviyeyi senkronla.
  useEffect(() => {
    setOpenLevelId(activeLevelId)
  }, [activeLevelId])

  // Odak için: yalnızca tamamlanan + aktif seviye görünür; kilitli (sıradaki)
  // seviyeler "Kilitli Aşamalar" alanında gizli durur, açılamaz.
  const visibleLevels = CAREER_ROADMAP.map((level, idx) => ({ level, idx })).filter(
    x => x.idx <= activeLevelIndex,
  )
  const lockedLevels = CAREER_ROADMAP.map((level, idx) => ({ level, idx })).filter(
    x => x.idx > activeLevelIndex,
  )

  function renderLevel(level: CareerLevel, idx: number) {
    const color = LEVEL_COLORS[idx] ?? "#06b6d4"
    const activeSkills = getActiveSkills(level)
    const completedInLevel = activeSkills.filter(s => completedSkillIds.includes(s.id)).length
    const nowCount = activeSkills.filter(s => s.priority === "now").length
    const nextCount = activeSkills.filter(s => s.priority === "next").length
    const laterCount = activeSkills.filter(s => s.priority === "later").length

    const isActive = level.id === activeLevelId
    const isCompletedLevel = idx < activeLevelIndex
    const isLockedLevel = idx > activeLevelIndex
    const isOpen = !isLockedLevel && openLevelId === level.id

    const isStrategic = level.levelNumber === 6
    const isAiNative = level.levelNumber === 7

    return (
      <div
        key={level.id}
        className="border rounded-card shadow-soft overflow-hidden"
        style={{
          borderColor: isOpen ? color + "40" : "var(--border-subtle)",
          borderLeftColor: isLockedLevel ? "var(--border-subtle)" : color,
          borderLeftWidth: 3,
        }}
      >
        <button
          onClick={() => {
            if (!isLockedLevel) setOpenLevelId(isOpen ? null : level.id)
          }}
          disabled={isLockedLevel}
          aria-expanded={isLockedLevel ? undefined : isOpen}
          className={cn(
            "w-full flex items-center justify-between p-4 text-left bg-[var(--bg-surface)] transition-colors",
            isLockedLevel
              ? "opacity-60 cursor-not-allowed"
              : "hover:bg-[var(--bg-card-hover)]",
            !isActive && !isOpen && !isLockedLevel && "opacity-80",
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded flex items-center justify-center text-xs font-mono font-bold shrink-0"
              style={{
                backgroundColor: isLockedLevel ? "var(--bg-elevated)" : color + "20",
                color: isLockedLevel ? "var(--text-tertiary)" : color,
                border: `1px solid ${isLockedLevel ? "var(--border-subtle)" : color + "40"}`,
              }}
            >
              {isLockedLevel ? "🔒" : level.levelNumber}
            </div>
            <div className="text-left">
              <p className="text-sm font-display font-bold text-[var(--text-primary)]">{level.title}</p>
              <p className="text-xs text-[var(--text-muted)] font-sans">{level.subtitle}</p>
              {!isLockedLevel && (
                <div className="flex items-center gap-2 mt-1 text-[9px] font-mono">
                  {nowCount > 0 && <span className="text-[var(--accent)]">şimdi {nowCount}</span>}
                  {nextCount > 0 && <span className="text-[var(--info)]">sonra {nextCount}</span>}
                  {laterCount > 0 && <span className="text-[var(--text-tertiary)]">ileride {laterCount}</span>}
                </div>
              )}
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
              <span className="text-[9px] font-mono text-[var(--text-muted)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded uppercase tracking-wider">
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
            {!isLockedLevel && (
              <span className="text-[var(--text-tertiary)] font-mono text-sm" aria-hidden="true">
                {isOpen ? "−" : "+"}
              </span>
            )}
          </div>
        </button>

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
  }

  return (
    <div className="space-y-2">
      {visibleLevels.map(({ level, idx }) => renderLevel(level, idx))}

      {/* Kilitli (sıradaki) aşamalar — odak için varsayılan gizli, açılamaz.
          Aktif seviye bitince bir üst seviye otomatik görünür hale gelir. */}
      {lockedLevels.length > 0 && (
        <details className="group border border-[var(--border-subtle)] rounded-card overflow-hidden bg-[var(--bg-base)]/30">
          <summary className="w-full flex items-center justify-between p-4 text-left font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer select-none">
            <span>
              🔒 Kilitli Aşamalar ({lockedLevels.length}) — önce Seviye{" "}
              {computedActiveLevel.levelNumber} ({computedActiveLevel.title}) bitir
            </span>
            <span className="text-[var(--text-tertiary)] font-mono text-sm group-open:hidden" aria-hidden="true">+</span>
            <span className="text-[var(--text-tertiary)] font-mono text-sm hidden group-open:inline" aria-hidden="true">−</span>
          </summary>
          <div className="p-2 space-y-2">
            <p className="text-[10px] text-[var(--text-tertiary)] font-sans px-1 pb-1">
              Odak için gizli. Bu aşamalar aktif seviyeni bitirince sırayla açılır.
            </p>
            {lockedLevels.map(({ level, idx }) => renderLevel(level, idx))}
          </div>
        </details>
      )}
    </div>
  )
}
