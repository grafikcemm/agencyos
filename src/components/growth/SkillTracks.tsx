"use client"

import { useState } from "react"
import type { CareerSkill, CareerSkillStatus, TeknikSubgroup } from "@/data/careerRoadmap"
import { getKaliciSkills, getTeknikSkills } from "@/data/careerRoadmap"
import { SkillCard } from "./SkillCard"
import { cn } from "@/utils/cn"

interface Props {
  activeFocusSkillId: string | null
  completedSkillIds: string[]
  getSkillStatus: (skillId: string) => CareerSkillStatus
  onStatusChange: (skillId: string, status: CareerSkillStatus) => void
  onSetFocus: (skillId: string, groupId: string) => void
  onComplete: (skillId: string) => void
}

const TEKNIK_SUBGROUPS: { key: TeknikSubgroup; tag: string; label: string }[] = [
  { key: "kreatif", tag: "B1", label: "Kreatif & Ürün Üretimi" },
  { key: "ai_kaldirac", tag: "B2", label: "AI Kaldıracı" },
  { key: "yazilim_temeli", tag: "B3", label: "Yazılım Temeli" },
]

function nowCount(skills: CareerSkill[]): number {
  return skills.filter(s => s.priority === "now").length
}

export function SkillTracks({
  activeFocusSkillId,
  completedSkillIds,
  getSkillStatus,
  onStatusChange,
  onSetFocus,
  onComplete,
}: Props) {
  const [openA, setOpenA] = useState(true)
  const [openB, setOpenB] = useState(true)

  const kaliciSkills = getKaliciSkills()
  const teknikGroups = TEKNIK_SUBGROUPS.map(g => ({ ...g, skills: getTeknikSkills(g.key) }))

  const kaliciDone = kaliciSkills.filter(s => completedSkillIds.includes(s.id)).length
  const teknikSkills = teknikGroups.flatMap(g => g.skills)
  const teknikDone = teknikSkills.filter(s => completedSkillIds.includes(s.id)).length

  // Tek beceri kartı — groupId odak/persist için (eski levelId yerine).
  function renderSkill(skill: CareerSkill, groupId: string) {
    return (
      <SkillCard
        key={skill.id}
        skill={skill}
        groupId={groupId}
        currentStatus={getSkillStatus(skill.id)}
        isCompleted={completedSkillIds.includes(skill.id)}
        isActiveFocus={skill.id === activeFocusSkillId}
        onStatusChange={onStatusChange}
        onSetFocus={onSetFocus}
        onComplete={onComplete}
      />
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
      {/* ── KART A — KALICI BECERİLER ── */}
      <section
        className="border rounded-card shadow-soft overflow-hidden"
        style={{ borderColor: "var(--border-subtle)", borderLeftColor: "var(--cat-purple)", borderLeftWidth: 3 }}
      >
        <button
          onClick={() => setOpenA(o => !o)}
          aria-expanded={openA}
          className="w-full flex items-center justify-between gap-3 p-4 text-left bg-[var(--bg-surface)] transition-colors hover:bg-[var(--bg-card-hover)]"
        >
          <div className="min-w-0">
            <p className="text-sm font-display font-bold text-[var(--text-primary)]">KALICI BECERİLER</p>
            <p className="text-xs text-[var(--text-muted)] font-sans">İnsan · yargı · iş · ilişki katmanı</p>
            <div className="flex items-center gap-2 mt-1 text-[9px] font-mono">
              {nowCount(kaliciSkills) > 0 && (
                <span className="text-[var(--accent)]">şimdi {nowCount(kaliciSkills)}</span>
              )}
              <span className="text-[var(--text-tertiary)]">{kaliciSkills.length} beceri</span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[10px] font-mono text-[var(--text-muted)]">
              {kaliciDone}/{kaliciSkills.length}
            </span>
            <span className="text-[var(--text-tertiary)] font-mono text-sm" aria-hidden="true">
              {openA ? "−" : "+"}
            </span>
          </div>
        </button>

        {openA && (
          <div className="bg-[var(--bg-base)] p-3 space-y-2">
            {kaliciSkills.map(skill => renderSkill(skill, "kalici"))}
          </div>
        )}
      </section>

      {/* ── KART B — TEKNİK BECERİLER ── */}
      <section
        className="border rounded-card shadow-soft overflow-hidden"
        style={{ borderColor: "var(--border-subtle)", borderLeftColor: "var(--info)", borderLeftWidth: 3 }}
      >
        <button
          onClick={() => setOpenB(o => !o)}
          aria-expanded={openB}
          className="w-full flex items-center justify-between gap-3 p-4 text-left bg-[var(--bg-surface)] transition-colors hover:bg-[var(--bg-card-hover)]"
        >
          <div className="min-w-0">
            <p className="text-sm font-display font-bold text-[var(--text-primary)]">TEKNİK BECERİLER</p>
            <p className="text-xs text-[var(--text-muted)] font-sans">Üretim · AI kaldıracı · yazılım temeli</p>
            <div className="flex items-center gap-2 mt-1 text-[9px] font-mono">
              {nowCount(teknikSkills) > 0 && (
                <span className="text-[var(--accent)]">şimdi {nowCount(teknikSkills)}</span>
              )}
              <span className="text-[var(--text-tertiary)]">{teknikSkills.length} beceri</span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[10px] font-mono text-[var(--text-muted)]">
              {teknikDone}/{teknikSkills.length}
            </span>
            <span className="text-[var(--text-tertiary)] font-mono text-sm" aria-hidden="true">
              {openB ? "−" : "+"}
            </span>
          </div>
        </button>

        {openB && (
          <div className="bg-[var(--bg-base)] p-3 space-y-4">
            {teknikGroups.map(group => (
              <div key={group.key} className="space-y-2">
                <div className="flex items-center gap-2 px-0.5">
                  <span className="text-[9px] font-mono text-[var(--info)] border border-[var(--info)]/30 bg-[var(--info)]/5 px-1.5 py-0.5 rounded">
                    {group.tag}
                  </span>
                  <p className="text-xs font-display font-bold text-[var(--text-secondary)]">{group.label}</p>
                  {nowCount(group.skills) > 0 && (
                    <span className="text-[9px] font-mono text-[var(--accent)]">şimdi {nowCount(group.skills)}</span>
                  )}
                </div>
                <div className={cn("space-y-2", group.key === "yazilim_temeli" && "border-l border-[var(--border-subtle)] pl-2 ml-1")}>
                  {group.skills.map(skill => renderSkill(skill, group.key))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
