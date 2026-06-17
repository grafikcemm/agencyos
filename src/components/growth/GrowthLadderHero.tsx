"use client"

import { CAREER_ROADMAP } from "@/data/careerRoadmap"

interface Props {
  activeLevelId: string | null
  completedSkillIds: string[]
}

// Pastel kategori aksanları — LevelRoadmap ile aynı palet (7 seviye).
const LEVEL_COLORS = ["#FB923C", "#6AA2F0", "#2DD4BF", "#A78BFA", "#F472B6", "#6B7280", "#38BDF8"]

export function GrowthLadderHero({ activeLevelId, completedSkillIds }: Props) {
  const totalSkills = CAREER_ROADMAP.reduce((acc, l) => {
    return acc + l.skills.filter(s => s.priority !== "archive").length
  }, 0)

  const completedCount = CAREER_ROADMAP.reduce((acc, l) => {
    return acc + l.skills.filter(s => s.priority !== "archive" && completedSkillIds.includes(s.id)).length
  }, 0)

  const overallPct = totalSkills > 0 ? Math.round((completedCount / totalSkills) * 100) : 0

  const activeLevel = CAREER_ROADMAP.find(l => l.id === activeLevelId) ?? null

  return (
    <div className="bg-dark-card border border-dark-border rounded-card shadow-soft p-5 mb-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-lg font-display font-bold text-[var(--text-primary)] tracking-wide">
            GELİŞİM MERDİVENİ
          </h1>
          <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">
            Aranan adam ol — öğrenme kataloğu değil, aksiyon aynası
          </p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-mono font-bold text-[var(--accent)]">{overallPct}%</span>
          <p className="text-xs text-[var(--text-muted)] font-mono">{completedCount}/{totalSkills} skill</p>
        </div>
      </div>

      <div className="flex items-end gap-2 mt-4">
        {CAREER_ROADMAP.map((level, idx) => {
          const color = LEVEL_COLORS[idx] ?? "var(--accent)"
          const isActive = level.id === activeLevelId
          const activeSkills = level.skills.filter(s => s.priority !== "archive")
          const levelDone = activeSkills.filter(s => completedSkillIds.includes(s.id)).length
          const levelPct = activeSkills.length > 0 ? levelDone / activeSkills.length : 0
          const stepHeight = 28 + idx * 14

          return (
            <div
              key={level.id}
              className="flex-1 flex flex-col items-center gap-1"
              title={`Seviye ${level.levelNumber}: ${level.title}`}
            >
              <div
                className="w-full rounded-[4px] relative overflow-hidden transition-all duration-300"
                style={{
                  height: stepHeight,
                  backgroundColor: isActive ? color + "20" : "var(--bg-elevated)",
                  border: `1px solid ${isActive ? color : "var(--border-subtle)"}`,
                }}
              >
                <div
                  className="absolute bottom-0 left-0 right-0 transition-all duration-500"
                  style={{ height: `${levelPct * 100}%`, backgroundColor: color + "18" }}
                />
                {isActive && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[10px] font-mono animate-bounce" style={{ color }}>●</span>
                  </div>
                )}
              </div>
              <span className="text-[10px] font-mono" style={{ color: isActive ? color : "var(--text-tertiary)" }}>
                S{level.levelNumber}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-4 h-1 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--accent)] rounded-full transition-all duration-700"
          style={{ width: `${overallPct}%` }}
        />
      </div>

      {activeLevel && (
        <p className="text-xs font-mono text-[var(--text-muted)] mt-2">
          Aktif seviye: <span className="text-[var(--accent)]">{activeLevel.title}</span>
        </p>
      )}
    </div>
  )
}
