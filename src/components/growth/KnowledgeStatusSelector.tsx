"use client"

import type { CareerSkillStatus } from "@/data/careerRoadmap"

const OPTIONS: { value: CareerSkillStatus; label: string; color: string }[] = [
  { value: "known", label: "Biliyorum", color: "text-[var(--success)] border-[var(--success)]/40 bg-[var(--success)]/10" },
  { value: "needs_practice", label: "Tekrar Lazım", color: "text-[var(--warning)] border-[var(--warning)]/40 bg-[var(--warning)]/10" },
  { value: "in_progress", label: "Uygulama Lazım", color: "text-[var(--fire)] border-[var(--fire)]/40 bg-[var(--fire)]/10" },
  { value: "not_started", label: "Eksik Var", color: "text-[var(--danger)] border-[var(--danger)]/40 bg-[var(--danger)]/10" },
  { value: "active", label: "Sıfırdan Öğrenilecek", color: "text-[var(--info)] border-[var(--info)]/40 bg-[var(--info)]/10" },
]

interface Props {
  skillId: string
  current: CareerSkillStatus
  onChange: (skillId: string, status: CareerSkillStatus) => void
}

export function KnowledgeStatusSelector({ skillId, current, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(skillId, opt.value)}
          className={`px-3 py-1.5 text-xs font-mono border rounded transition-all ${
            current === opt.value
              ? opt.color + " opacity-100"
              : "text-[var(--text-muted)] border-[var(--border-subtle)] bg-transparent hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
