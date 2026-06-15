"use client"

import type { CareerSkillStatus } from "@/data/careerRoadmap"

const OPTIONS: { value: CareerSkillStatus; label: string; color: string }[] = [
  { value: "known", label: "Biliyorum", color: "text-green-400 border-green-400/40 bg-green-400/10" },
  { value: "needs_practice", label: "Tekrar Lazım", color: "text-[var(--warning)] border-[var(--warning)]/40 bg-[var(--warning)]/10" },
  { value: "in_progress", label: "Uygulama Lazım", color: "text-orange-400 border-orange-400/40 bg-orange-400/10" },
  { value: "not_started", label: "Eksik Var", color: "text-red-400 border-red-400/40 bg-red-400/10" },
  { value: "active", label: "Sıfırdan Öğrenilecek", color: "text-blue-400 border-blue-400/40 bg-blue-400/10" },
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
              : "text-[#666] border-[#1f1f1f] bg-transparent hover:border-[#333] hover:text-[#999]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
