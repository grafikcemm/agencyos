"use client"

import { useState } from "react"
import type { CareerSkill, CareerSkillStatus } from "@/data/careerRoadmap"
import { SkillDetailDrawer } from "./SkillDetailDrawer"

interface Props {
  skill: CareerSkill
  levelId: string
  currentStatus: CareerSkillStatus
  isCompleted: boolean
  isActiveFocus: boolean
  onStatusChange: (skillId: string, status: CareerSkillStatus) => void
  onSetFocus: (skillId: string, levelId: string) => void
  onComplete: (skillId: string) => void
}

const TYPE_BADGE: Record<string, string> = {
  technical: "border-blue-500/30 text-blue-400",
  personal: "border-purple-500/30 text-purple-400",
}

export function SkillCard({
  skill,
  levelId,
  currentStatus,
  isCompleted,
  isActiveFocus,
  onStatusChange,
  onSetFocus,
  onComplete,
}: Props) {
  const [open, setOpen] = useState(false)

  const badgeClass = TYPE_BADGE[skill.type] ?? "border-[#333] text-[#666]"

  return (
    <div
      className={`bg-dark-card border rounded-card shadow-soft overflow-hidden transition-all ${
        isActiveFocus
          ? "border-[var(--accent)]/40"
          : isCompleted
          ? "border-green-500/20"
          : "border-[#1f1f1f]"
      }`}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start justify-between p-3 text-left gap-3"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {isActiveFocus && (
              <span className="text-[9px] font-mono text-[var(--accent)] bg-[var(--accent)]/10 border border-[var(--accent)]/30 px-1.5 py-0.5 rounded">
                ODAK
              </span>
            )}
            {isCompleted && (
              <span className="text-[9px] font-mono text-green-400 bg-green-400/10 border border-green-400/30 px-1.5 py-0.5 rounded">
                ✓
              </span>
            )}
            <span className={`text-[9px] font-mono border px-1.5 py-0.5 rounded ${badgeClass}`}>
              {skill.type === "technical" ? "teknik" : "kişisel"}
            </span>
          </div>
          <p className="text-sm font-display text-white truncate">{skill.title}</p>
          {!open && (
            <p className="text-xs text-[#555] font-sans mt-0.5 line-clamp-1">
              {skill.shortDescription}
            </p>
          )}
        </div>
        <span className="text-[#444] font-mono text-sm shrink-0 mt-0.5">
          {open ? "−" : "+"}
        </span>
      </button>

      <SkillDetailDrawer
        skill={skill}
        levelId={levelId}
        isOpen={open}
        currentStatus={currentStatus}
        isCompleted={isCompleted}
        isActiveFocus={isActiveFocus}
        onStatusChange={onStatusChange}
        onSetFocus={onSetFocus}
        onComplete={onComplete}
      />
    </div>
  )
}
