"use client"

import { CAREER_ROADMAP } from "@/data/careerRoadmap"

interface Props {
  activeFocusSkillId: string | null
  activeLevelId: string | null
  onClear: () => void
}

export function ActiveFocusCard({ activeFocusSkillId, activeLevelId, onClear }: Props) {
  if (!activeFocusSkillId) {
    return (
      <div className="bg-dark-card border border-dark-border rounded-card shadow-soft p-4 mb-4">
        <p className="text-xs font-mono text-[#444]">
          — Aktif odak seçilmedi. &quot;Tüm Merdiven&quot;i açıp bir beceri seç.
        </p>
      </div>
    )
  }

  const level = CAREER_ROADMAP.find(l => l.id === activeLevelId)
  const skill = level?.skills.find(s => s.id === activeFocusSkillId)

  if (!skill || !level) return null

  return (
    <div className="bg-dark-card border border-[var(--accent)]/30 rounded-card shadow-soft p-4 mb-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-[10px] font-mono text-[var(--accent)] uppercase tracking-widest mb-1">
            Şu an tek odağın
          </p>
          <h2 className="text-base font-display font-bold text-white">{skill.title}</h2>
          <p className="text-xs text-[#666] font-mono mt-0.5">
            Seviye {level.levelNumber} — {level.title}
          </p>
        </div>
        <button
          onClick={onClear}
          className="text-[#444] hover:text-[#666] text-xs font-mono transition-colors mt-1"
          title="Odağı kaldır"
        >
          ✕
        </button>
      </div>

      <p className="text-xs text-[#999] font-sans leading-relaxed mb-3">
        {skill.shortDescription}
      </p>

      {skill.howToLearn.length > 0 && (
        <div>
          <p className="text-[10px] font-mono text-[#666] uppercase tracking-widest mb-1.5">
            Nasıl ilerleyeceksin
          </p>
          <ul className="space-y-1">
            {skill.howToLearn.slice(0, 3).map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[#888] font-sans">
                <span className="text-[var(--accent)] font-mono mt-0.5 shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
