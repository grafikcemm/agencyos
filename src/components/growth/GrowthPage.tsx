"use client"

import { useState } from "react"
import { useCareerState } from "@/hooks/useCareerState"
import { GrowthLadderHero } from "./GrowthLadderHero"
import { ActiveFocusCard } from "./ActiveFocusCard"
import { LevelRoadmap } from "./LevelRoadmap"
import { ArchivedCareerItems } from "./ArchivedCareerItems"
import { GrafikcemPlan } from "./GrafikcemPlan"
import { CAREER_ROADMAP, getActiveSkills } from "@/data/careerRoadmap"

export function GrowthPage({}: { uiMode: 'koruma' | 'denge' | 'atak' }) {
  const {
    hydrated,
    activeLevelId,
    activeFocusSkillId,
    completedSkillIds,
    setActiveFocus,
    clearActiveFocus,
    setKnowledgeStatus,
    completeSkill,
    getSkillStatus,
  } = useCareerState()

  const [showGrafikcemPlan, setShowGrafikcemPlan] = useState(false)
  const [showFullLadder, setShowFullLadder] = useState(false)

  if (!hydrated) {
    return (
      <div className="p-4">
        <div className="h-24 bg-dark-card border border-dark-border rounded-card shadow-soft animate-pulse" />
      </div>
    )
  }

  // Determine recommendation if no active focus
  const activeLevel = CAREER_ROADMAP.find(level => {
    const activeSkills = getActiveSkills(level)
    return activeSkills.some(s => !completedSkillIds.includes(s.id))
  }) || CAREER_ROADMAP[0]

  const recommendedSkill = getActiveSkills(activeLevel).find(s => !completedSkillIds.includes(s.id))

  return (
    <div className="p-4 pb-10 max-w-2xl mx-auto">
      <GrowthLadderHero
        activeLevelId={activeLevelId || activeLevel.id}
        completedSkillIds={completedSkillIds}
      />

      <ActiveFocusCard
        activeFocusSkillId={activeFocusSkillId}
        activeLevelId={activeLevelId}
        onClear={clearActiveFocus}
      />

      {/* AI Recommendation Banner when no active focus */}
      {!activeFocusSkillId && recommendedSkill && (
        <div className="bg-[var(--bg-base)] border border-[var(--accent)]/20 rounded-xl p-4 mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <p className="text-[10px] font-mono text-[var(--accent)] uppercase tracking-wider mb-1">🎯 BUGÜNÜN GELİŞİM ADIMI ÖNERİSİ</p>
          <h3 className="text-sm font-mono font-bold text-[var(--text-primary)] mb-1">{recommendedSkill.title}</h3>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-3">{recommendedSkill.shortDescription}</p>
          <button
            onClick={() => setActiveFocus(recommendedSkill.id, activeLevel.id)}
            className="bg-[var(--cta-bg)] text-[var(--cta-fg)] font-mono font-bold text-xs px-3.5 py-1.5 rounded hover:bg-[#e6e6e6] transition-colors"
          >
            Odak Olarak Seç
          </button>
        </div>
      )}

      {/* Grafikcem Plan mini card connected to active focus */}
      {activeFocusSkillId && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[6px] p-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs">🎨</span>
            <p className="text-xs font-mono text-[var(--text-secondary)]">Grafikcem Stratejik Planı</p>
          </div>
          <button
            onClick={() => setShowGrafikcemPlan(!showGrafikcemPlan)}
            className="text-xs font-mono text-[var(--accent)] hover:underline"
          >
            {showGrafikcemPlan ? "Kapat" : "Detayları Gör"}
          </button>
        </div>
      )}

      {activeFocusSkillId && showGrafikcemPlan && (
        <div className="animate-in fade-in duration-300">
          <GrafikcemPlan />
        </div>
      )}

      {/* Radikal sadeleştirme (DEHB): tam merdiven varsayılan kapalı.
          Üstte yalnızca aktif odak + öneri görünür; 47 madde buraya gizli. */}
      <div className="mb-2">
        <button
          onClick={() => setShowFullLadder(v => !v)}
          className="w-full flex items-center justify-between rounded-card border border-dark-border bg-dark-card shadow-soft px-4 py-3 text-left transition-colors hover:bg-dark-hover"
        >
          <div>
            <p className="text-[10px] font-mono text-text-tertiary uppercase tracking-widest">
              Tüm Merdiven
            </p>
            <p className="text-xs font-sans text-text-tertiary mt-0.5">
              7 seviye · tüm beceriler. {showFullLadder ? "Gizlemek için kapat." : "Sadece gerektiğinde aç."}
            </p>
          </div>
          <span className="text-text-tertiary font-mono text-sm shrink-0">
            {showFullLadder ? "−" : "+"}
          </span>
        </button>

        {showFullLadder && (
          <div className="mt-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <LevelRoadmap
              activeFocusSkillId={activeFocusSkillId}
              completedSkillIds={completedSkillIds}
              getSkillStatus={getSkillStatus}
              onStatusChange={setKnowledgeStatus}
              onSetFocus={setActiveFocus}
              onComplete={completeSkill}
            />
          </div>
        )}
      </div>

      {/* Parked & Archived items wrapped under a details toggle */}
      <details className="group border border-[var(--border-subtle)] rounded-xl overflow-hidden mt-6 bg-[var(--bg-base)]/30">
        <summary className="w-full flex items-center justify-between p-4 text-left font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer select-none">
          <span>Kitaplık Deposu & Park Edilenler (Arşiv)</span>
          <span className="text-[var(--text-tertiary)] font-mono text-sm group-open:hidden">+</span>
          <span className="text-[var(--text-tertiary)] font-mono text-sm hidden group-open:inline">−</span>
        </summary>
        <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-300">
          <ArchivedCareerItems />
        </div>
      </details>
    </div>
  )
}
