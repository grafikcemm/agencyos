"use client"

import { useState } from "react"
import type { CareerSkill } from "@/data/careerRoadmap"
import { FocusResourcesPanel } from "./FocusResourcesPanel"
import { GrafikcemPlan } from "./GrafikcemPlan"

interface Props {
  skill: CareerSkill | null
  recommendedSkill: CareerSkill | null
  onComplete: (skillId: string) => void
  onClear: () => void
  onPickFocus: (skill: CareerSkill) => void
  onOpenPlan: () => void
}

// Tek odak kartının glow tonu — kategoriye göre (subtle, sadece bu kart).
function glowColor(skill: CareerSkill): string {
  return skill.category === "kalici" ? "var(--cat-purple)" : "var(--info)"
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function FocusHero({ skill, recommendedSkill, onComplete, onClear, onPickFocus, onOpenPlan }: Props) {
  const [showDetails, setShowDetails] = useState(false)
  const [celebrating, setCelebrating] = useState(false)

  // ── Boş durum: henüz odak yok ──
  if (!skill) {
    return (
      <div className="bg-dark-card border border-dark-border rounded-card shadow-soft p-6 mb-4">
        <p className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest mb-2">
          Odak Modu
        </p>
        <h2 className="text-xl font-display font-bold text-[var(--text-primary)] mb-1">Henüz odak yok</h2>
        <p className="text-sm text-[var(--text-muted)] font-sans mb-4">
          Aynı anda tek bir beceriye odaklan. Birini seç, gerisi gizli kalsın.
        </p>

        {recommendedSkill && (
          <div className="rounded-card border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-3 mb-3">
            <p className="text-[10px] font-mono text-[var(--accent)] uppercase tracking-wider mb-1">
              🎯 Bugün için önerilen
            </p>
            <p className="text-sm font-display font-bold text-[var(--text-primary)] mb-2">
              {recommendedSkill.title}
            </p>
            <button
              onClick={() => onPickFocus(recommendedSkill)}
              className="bg-[var(--cta-bg)] text-[var(--cta-fg)] font-mono font-bold text-xs px-3.5 py-1.5 rounded hover:bg-[#e6e6e6] transition-colors"
            >
              Odak Olarak Seç
            </button>
          </div>
        )}

        <button
          onClick={onOpenPlan}
          className="text-xs font-mono text-[var(--accent)] hover:underline"
        >
          veya Tüm Planı Aç’tan kendin seç →
        </button>
      </div>
    )
  }

  // ── Odak kartı ──
  const glow = glowColor(skill)
  const nextStep = skill.howToLearn[0] ?? skill.shortDescription

  const handleComplete = () => {
    if (prefersReducedMotion()) {
      onComplete(skill.id)
      return
    }
    setCelebrating(true)
    // Kutlama görünsün, sonra tamamla (completeSkill odağı temizler → boş durum).
    window.setTimeout(() => onComplete(skill.id), 900)
  }

  return (
    <div
      className="relative overflow-hidden rounded-card border border-[var(--border-subtle)] bg-dark-card p-6 mb-4"
      style={{ boxShadow: `0 0 28px -8px ${glow}, 0 10px 44px -16px ${glow}` }}
    >
      {/* Subtle glow katmanı — yalnız bu kart */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.13]"
        style={{ background: `radial-gradient(130% 120% at 0% 0%, ${glow}, transparent 58%)` }}
        aria-hidden="true"
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3 mb-3">
          <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: glow }}>
            ● Şu an tek odağın
          </p>
          <button
            onClick={onClear}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] text-xs font-mono transition-colors shrink-0"
            title="Odağı bırak"
          >
            ✕ bırak
          </button>
        </div>

        {/* Geniş ekranda yatay: içerik solda (flex-1), aksiyon paneli sağda. */}
        <div className="lg:flex lg:items-stretch lg:gap-6">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-[var(--text-primary)] leading-tight mb-4">
              {skill.title}
            </h2>

            <div className="rounded-card border border-[var(--border-subtle)] bg-[var(--bg-base)]/60 p-3">
              <p className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest mb-1">
                Sıradaki adım
              </p>
              <p className="text-sm text-[var(--text-secondary)] font-sans leading-relaxed">{nextStep}</p>
            </div>
          </div>

          <div className="mt-5 lg:mt-0 lg:w-60 lg:shrink-0 lg:border-l lg:border-[var(--border-subtle)] lg:pl-6 flex flex-col justify-center gap-3">
            <button
              onClick={handleComplete}
              disabled={celebrating}
              className={`w-full font-mono font-bold text-sm px-5 py-2.5 rounded-full transition-all ${
                celebrating
                  ? "bg-[var(--success)] text-black"
                  : "bg-[var(--cta-bg)] text-[var(--cta-fg)] hover:bg-[#e6e6e6]"
              }`}
            >
              <span className={celebrating ? "inline-block animate-in zoom-in-50 duration-300" : ""}>
                {celebrating ? "✓ Tamamlandı!" : "Tamamlandı ✓"}
              </span>
            </button>

            <button
              onClick={() => setShowDetails(v => !v)}
              className="text-xs font-mono text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors text-center"
              aria-expanded={showDetails}
            >
              {showDetails ? "Detaylar ▴" : "Detaylar ▾"}
            </button>
          </div>
        </div>

        {/* Kutlama: kısa, subtle accent pulse (reduced-motion'da hiç çalışmaz) */}
        {celebrating && (
          <div
            className="pointer-events-none absolute inset-0 rounded-[inherit] animate-in fade-in duration-500"
            style={{ background: `radial-gradient(120% 120% at 50% 100%, var(--success), transparent 55%)`, opacity: 0.18 }}
            aria-hidden="true"
          />
        )}

        {showDetails && (
          <div className="mt-5 pt-4 border-t border-[var(--border-subtle)] animate-in fade-in slide-in-from-top-1 duration-200">
            {skill.howToLearn.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-1.5">
                  Nasıl ilerleyeceksin
                </p>
                <ol className="space-y-1.5">
                  {skill.howToLearn.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-muted)] font-sans">
                      <span className="font-mono shrink-0" style={{ color: glow }}>{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <FocusResourcesPanel activeFocusSkillId={skill.id} />

            <details className="group border border-[var(--border-subtle)] rounded-card overflow-hidden bg-[var(--bg-base)]/30">
              <summary className="flex items-center justify-between p-3 text-left font-mono text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer select-none uppercase tracking-widest">
                <span>🎨 Grafikcem Stratejik Planı</span>
                <span className="text-[var(--text-tertiary)] group-open:hidden">+</span>
                <span className="text-[var(--text-tertiary)] hidden group-open:inline">−</span>
              </summary>
              <div className="p-2">
                <GrafikcemPlan />
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}
