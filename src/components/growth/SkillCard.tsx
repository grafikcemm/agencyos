"use client"

import { useState } from "react"
import type { CareerSkill, CareerSkillStatus } from "@/data/careerRoadmap"
import { SkillDetailDrawer } from "./SkillDetailDrawer"

interface Props {
  skill: CareerSkill
  groupId: string
  currentStatus: CareerSkillStatus
  isCompleted: boolean
  isActiveFocus: boolean
  onStatusChange: (skillId: string, status: CareerSkillStatus) => void
  onSetFocus: (skillId: string, groupId: string) => void
  onComplete: (skillId: string) => void
}

// Rozet artık üst kategoriden (kalıcı / teknik alt-grubu) türetilir, type'tan değil.
const GROUP_BADGE: Record<string, { label: string; cls: string }> = {
  kalici: { label: "Kalıcı", cls: "border-[var(--cat-purple)]/30 text-[var(--cat-purple)]" },
  kreatif: { label: "Kreatif", cls: "border-[var(--info)]/30 text-[var(--info)]" },
  ai_kaldirac: { label: "AI Kaldıracı", cls: "border-[var(--info)]/30 text-[var(--info)]" },
  yazilim_temeli: { label: "Yazılım", cls: "border-[var(--info)]/30 text-[var(--info)]" },
}

function groupKey(skill: CareerSkill): string {
  return skill.category === "kalici" ? "kalici" : skill.subgroup ?? "kreatif"
}

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  now: { label: "şimdi", cls: "text-[var(--accent)] border-[var(--accent)]/30 bg-[var(--accent)]/5" },
  next: { label: "sonra", cls: "text-[var(--info)] border-[var(--info)]/30 bg-[var(--info)]/5" },
  later: { label: "ileride", cls: "text-[var(--text-muted)] border-[var(--border-subtle)]" },
  archive: { label: "arşiv", cls: "text-[var(--text-tertiary)] border-[var(--border-subtle)]" },
}

// Bilgi durumunu tek renk noktasıyla özetler (kart başlığında hızlı tarama).
const STATUS_DOT: Record<string, string> = {
  not_started: "bg-[var(--text-tertiary)]",
  active: "bg-[var(--accent)]",
  in_progress: "bg-[var(--accent)]",
  known: "bg-[var(--info)]",
  needs_practice: "bg-[var(--cat-purple)]",
  completed: "bg-[var(--success)]",
  archived: "bg-[var(--text-tertiary)]",
}

export function SkillCard({
  skill,
  groupId,
  currentStatus,
  isCompleted,
  isActiveFocus,
  onStatusChange,
  onSetFocus,
  onComplete,
}: Props) {
  const [open, setOpen] = useState(false)

  const group = GROUP_BADGE[groupKey(skill)] ?? { label: "", cls: "border-[var(--border-subtle)] text-[var(--text-muted)]" }
  const priority = PRIORITY_META[skill.priority] ?? PRIORITY_META.later
  const statusDot = STATUS_DOT[currentStatus] ?? STATUS_DOT.not_started
  const linkCount = skill.resources.links?.length ?? 0
  const isB3Step = skill.subgroup === "yazilim_temeli" && typeof skill.order === "number"

  return (
    <div
      className={`bg-dark-card border rounded-card shadow-soft overflow-hidden transition-all ${
        isActiveFocus
          ? "border-[var(--accent)]/40"
          : isCompleted
          ? "border-[var(--success)]/20"
          : "border-[var(--border-subtle)]"
      }`}
    >
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-start justify-between p-3 text-left gap-3"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            {isActiveFocus && (
              <span className="text-[9px] font-mono text-[var(--accent)] bg-[var(--accent)]/10 border border-[var(--accent)]/30 px-1.5 py-0.5 rounded">
                ODAK
              </span>
            )}
            {isCompleted && (
              <span className="text-[9px] font-mono text-[var(--success)] bg-[var(--success)]/10 border border-[var(--success)]/30 px-1.5 py-0.5 rounded">
                ✓
              </span>
            )}
            {!isCompleted && (
              <span className={`text-[9px] font-mono border px-1.5 py-0.5 rounded ${priority.cls}`}>
                {priority.label}
              </span>
            )}
            <span className={`text-[9px] font-mono border px-1.5 py-0.5 rounded ${group.cls}`}>
              {group.label}
            </span>
            {isB3Step && (
              <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded">
                Adım {skill.order}
              </span>
            )}
            {linkCount > 0 && (
              <span
                className="text-[9px] font-mono text-[var(--text-tertiary)] flex items-center gap-0.5"
                aria-label={`${linkCount} kaynak linki`}
              >
                <span aria-hidden="true">▦</span>
                {linkCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`}
              aria-hidden="true"
            />
            <p className="text-sm font-display text-[var(--text-primary)] truncate">{skill.title}</p>
          </div>
          {!open && (
            <p className="text-xs text-[var(--text-muted)] font-sans mt-0.5 line-clamp-1">
              {skill.shortDescription}
            </p>
          )}
        </div>
        <span className="text-[var(--text-tertiary)] font-mono text-sm shrink-0 mt-0.5">
          {open ? "−" : "+"}
        </span>
      </button>

      <SkillDetailDrawer
        skill={skill}
        groupId={groupId}
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
