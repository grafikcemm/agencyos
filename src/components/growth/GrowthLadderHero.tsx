"use client"

import { getKaliciSkills, getTeknikSkills, getAllActiveSkills, getNowSkills } from "@/data/careerRoadmap"
import type { CareerSkill } from "@/data/careerRoadmap"

interface Props {
  completedSkillIds: string[]
}

// 2-kart modeli: Kalıcı + Teknik'in 3 alt grubu. Her biri bir ilerleme çubuğu.
const GROUP_COLORS = {
  kalici: "#A78BFA",
  kreatif: "#6AA2F0",
  ai: "#2DD4BF",
  yazilim: "#FB923C",
} as const

export function GrowthLadderHero({ completedSkillIds }: Props) {
  const allSkills = getAllActiveSkills()
  const groups: { key: keyof typeof GROUP_COLORS; label: string; tooltip: string; skills: CareerSkill[] }[] = [
    { key: "kalici", label: "Kalıcı", tooltip: "Kalıcı Beceriler", skills: getKaliciSkills() },
    { key: "kreatif", label: "B1", tooltip: "Teknik · Kreatif & Ürün", skills: getTeknikSkills("kreatif") },
    { key: "ai", label: "B2", tooltip: "Teknik · AI Kaldıracı", skills: getTeknikSkills("ai_kaldirac") },
    { key: "yazilim", label: "B3", tooltip: "Teknik · Yazılım Temeli", skills: getTeknikSkills("yazilim_temeli") },
  ]

  const totalSkills = allSkills.length
  const completedCount = allSkills.filter(s => completedSkillIds.includes(s.id)).length
  const overallPct = totalSkills > 0 ? Math.round((completedCount / totalSkills) * 100) : 0
  const nowCount = getNowSkills().length

  const totalLinks = allSkills.reduce((acc, sk) => acc + (sk.resources.links?.length ?? 0), 0)

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
          <p className="text-[10px] text-[var(--text-tertiary)] font-mono mt-0.5">▦ {totalLinks} kaynak linki</p>
        </div>
      </div>

      {/* T-şekil kimlik şeridi — nötr çerçeve (öncelik/veri değiştirmez). */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-[10px] font-mono px-2 py-1 rounded border border-[var(--accent)]/25 bg-[var(--accent)]/5 text-[var(--accent)]">
          Dikey · AI-native kreatif üretim
        </span>
        <span className="text-[var(--text-tertiary)] font-mono text-[10px]" aria-hidden="true">×</span>
        <span className="text-[10px] font-mono px-2 py-1 rounded border border-[var(--info)]/25 bg-[var(--info)]/5 text-[var(--info)]">
          Yatay · UI/UX + vibecoding
        </span>
      </div>

      {/* Grup ilerlemesi — 4 çubuk (Kalıcı + B1/B2/B3). */}
      <div className="flex items-end gap-2 mt-4">
        {groups.map(group => {
          const color = GROUP_COLORS[group.key]
          const done = group.skills.filter(s => completedSkillIds.includes(s.id)).length
          const pct = group.skills.length > 0 ? done / group.skills.length : 0
          const hasNow = group.skills.some(s => s.priority === "now")

          return (
            <div
              key={group.key}
              className="flex-1 flex flex-col items-center gap-1"
              title={`${group.tooltip}: ${done}/${group.skills.length}`}
            >
              <div
                className="w-full rounded-[4px] relative overflow-hidden transition-all duration-300"
                style={{
                  height: 56,
                  backgroundColor: hasNow ? color + "20" : "var(--bg-elevated)",
                  border: `1px solid ${hasNow ? color : "var(--border-subtle)"}`,
                }}
              >
                <div
                  className="absolute bottom-0 left-0 right-0 transition-all duration-500"
                  style={{ height: `${pct * 100}%`, backgroundColor: color + "30" }}
                />
                {hasNow && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[10px] font-mono animate-bounce" style={{ color }}>●</span>
                  </div>
                )}
              </div>
              <span
                className="text-[10px] font-mono"
                style={{ color: hasNow ? color : "var(--text-tertiary)" }}
              >
                {group.label}
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

      {nowCount > 0 && (
        <p className="text-xs font-mono text-[var(--text-muted)] mt-2">
          Şu an aktif: <span className="text-[var(--accent)]">{nowCount} beceri</span> (en fazla 4)
        </p>
      )}
    </div>
  )
}
