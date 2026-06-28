"use client"

import { useState } from "react"
import { useCareerState } from "@/hooks/useCareerState"
import { FocusHero } from "./FocusHero"
import { GrowthLadderHero } from "./GrowthLadderHero"
import { SkillTracks } from "./SkillTracks"
import { SkillCard } from "./SkillCard"
import { ArchivedCareerItems } from "./ArchivedCareerItems"
import {
  getAllActiveSkills,
  getSkillById,
  STRATEGIC_INSURANCE_SKILLS,
  BACKLOG_PROJECTS,
  type CareerSkill,
} from "@/data/careerRoadmap"

// Odak/persist için grup kimliği (eski levelId yerine). active_level_id'de tutulur.
function skillGroupId(skill: CareerSkill): string {
  return skill.category === "kalici" ? "kalici" : skill.subgroup ?? "teknik"
}

export function GrowthPage({}: { uiMode: 'koruma' | 'denge' | 'atak' }) {
  const {
    hydrated,
    activeFocusSkillId,
    completedSkillIds,
    setActiveFocus,
    clearActiveFocus,
    setKnowledgeStatus,
    completeSkill,
    getSkillStatus,
  } = useCareerState()

  const [showAllPlan, setShowAllPlan] = useState(false)

  if (!hydrated) {
    return (
      <div className="p-4">
        <div className="h-32 bg-dark-card border border-dark-border rounded-card shadow-soft animate-pulse" />
      </div>
    )
  }

  const focusedSkill = activeFocusSkillId ? getSkillById(activeFocusSkillId) ?? null : null
  // Öneri = tamamlanmamış ilk aktif beceri (sıralama şimdi → sonra → ileride).
  const recommendedSkill = getAllActiveSkills().find(s => !completedSkillIds.includes(s.id)) ?? null

  return (
    <div className="p-4 lg:p-6 pb-10 max-w-7xl mx-auto">
      {/* ── ODAK MODU: açılışta ekrandaki tek şey ── */}
      <div className="w-full">
        <FocusHero
          skill={focusedSkill}
          recommendedSkill={recommendedSkill}
          onComplete={completeSkill}
          onClear={clearActiveFocus}
          onPickFocus={skill => setActiveFocus(skill.id, skillGroupId(skill))}
          onOpenPlan={() => setShowAllPlan(true)}
        />

        {/* Tek toggle — geri kalan HER ŞEY bunun arkasında (progressive disclosure) */}
        <button
          onClick={() => setShowAllPlan(v => !v)}
          aria-expanded={showAllPlan}
          className="w-full flex items-center justify-between rounded-card border border-dark-border bg-dark-card shadow-soft px-4 py-3 text-left transition-colors hover:bg-dark-hover"
        >
          <div>
            <p className="text-[10px] font-mono text-text-tertiary uppercase tracking-widest">
              Tüm Planı {showAllPlan ? "Kapat" : "Aç"}
            </p>
            <p className="text-xs font-sans text-text-tertiary mt-0.5">
              Kalıcı + Teknik (45 beceri), backlog ve arşiv. {showAllPlan ? "Odağa dönmek için kapat." : "Sadece gerektiğinde aç."}
            </p>
          </div>
          <span className="text-text-tertiary font-mono text-sm shrink-0">{showAllPlan ? "−" : "+"}</span>
        </button>
      </div>

      {/* ── TÜM PLAN: progressive disclosure ── */}
      {showAllPlan && (
        <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="mb-4">
            <GrowthLadderHero completedSkillIds={completedSkillIds} />
          </div>

          <SkillTracks
            activeFocusSkillId={activeFocusSkillId}
            completedSkillIds={completedSkillIds}
            getSkillStatus={getSkillStatus}
            onStatusChange={setKnowledgeStatus}
            onSetFocus={setActiveFocus}
            onComplete={completeSkill}
          />

          <div className="space-y-3 mt-6">
            {/* Fiziksel Kariyer Sigortası — stratejik/ileride */}
            <details className="group border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--bg-base)]/30">
              <summary className="w-full flex items-center justify-between p-4 text-left font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer select-none">
                <span>🛡️ Fiziksel Kariyer Sigortası (stratejik · ileride)</span>
                <span className="text-[var(--text-tertiary)] font-mono text-sm group-open:hidden">+</span>
                <span className="text-[var(--text-tertiary)] font-mono text-sm hidden group-open:inline">−</span>
              </summary>
              <div className="px-3 pb-3 space-y-2 animate-in slide-in-from-top-2 duration-300">
                <p className="text-[10px] text-[var(--text-tertiary)] font-sans px-1 pb-1">
                  Şu an aktif hedef değil. Drone, hibrit prodüksiyon, photogrammetry ve alternatif kariyer opsiyonları.
                </p>
                {STRATEGIC_INSURANCE_SKILLS.map(skill => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    groupId="strategic"
                    currentStatus={getSkillStatus(skill.id)}
                    isCompleted={completedSkillIds.includes(skill.id)}
                    isActiveFocus={skill.id === activeFocusSkillId}
                    onStatusChange={setKnowledgeStatus}
                    onSetFocus={setActiveFocus}
                    onComplete={completeSkill}
                  />
                ))}
              </div>
            </details>

            {/* Backlog / Projeler */}
            <details className="group border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--bg-base)]/30">
              <summary className="w-full flex items-center justify-between p-4 text-left font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer select-none">
                <span>📌 Backlog / Projeler ({BACKLOG_PROJECTS.length})</span>
                <span className="text-[var(--text-tertiary)] font-mono text-sm group-open:hidden">+</span>
                <span className="text-[var(--text-tertiary)] font-mono text-sm hidden group-open:inline">−</span>
              </summary>
              <div className="px-3 pb-3 space-y-2 animate-in slide-in-from-top-2 duration-300">
                {BACKLOG_PROJECTS.map(project => (
                  <div
                    key={project.id}
                    className="bg-dark-card border border-[var(--border-subtle)] rounded-card shadow-soft p-3"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded">
                        ileride
                      </span>
                      <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded">
                        proje
                      </span>
                    </div>
                    <p className="text-sm font-display text-[var(--text-primary)]">{project.title}</p>
                    <p className="text-xs text-[var(--text-muted)] font-sans mt-0.5">{project.note}</p>
                  </div>
                ))}
              </div>
            </details>

            {/* Kitaplık Deposu & Park Edilenler (Arşiv) */}
            <details className="group border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--bg-base)]/30">
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
        </div>
      )}
    </div>
  )
}
