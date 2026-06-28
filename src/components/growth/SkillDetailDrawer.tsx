"use client"

import { useState } from "react"
import type { CareerSkill, CareerSkillStatus } from "@/data/careerRoadmap"
import { KnowledgeStatusSelector } from "./KnowledgeStatusSelector"
import { ResourceLink } from "./ResourceLink"
import { addActiveTask } from "@/app/actions/taskActions"

interface Props {
  skill: CareerSkill
  isOpen: boolean
  currentStatus: CareerSkillStatus
  isCompleted: boolean
  isActiveFocus: boolean
  onStatusChange: (skillId: string, status: CareerSkillStatus) => void
  onSetFocus: (skillId: string, groupId: string) => void
  onComplete: (skillId: string) => void
  groupId: string
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-[var(--border-subtle)]">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between py-2.5 text-xs font-mono text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
      >
        <span className="uppercase tracking-widest">{title}</span>
        <span className="text-[var(--text-tertiary)]" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  )
}

export function SkillDetailDrawer({
  skill,
  isOpen,
  currentStatus,
  isCompleted,
  isActiveFocus,
  onStatusChange,
  onSetFocus,
  onComplete,
  groupId,
}: Props) {
  const [bridgeState, setBridgeState] = useState<"idle" | "saving" | "done" | "error">("idle")

  if (!isOpen) return null

  // Manuel köprü: kariyer odağı → aktif görev ("sıradaki tek adım").
  const handleConvertToTask = async () => {
    if (bridgeState === "saving" || bridgeState === "done") return
    setBridgeState("saving")
    const res = await addActiveTask(`${skill.title} — sıradaki adım`)
    setBridgeState(res.success ? "done" : "error")
    if (!res.success) {
      // Kullanıcı tekrar deneyebilsin diye kısa süre sonra sıfırla.
      setTimeout(() => setBridgeState("idle"), 2500)
    }
  }

  const hasLinks = (skill.resources.links?.length ?? 0) > 0
  const hasSearchTerms =
    (skill.resources.courseSearchTerms?.length ?? 0) > 0 ||
    (skill.resources.youtubeSearchTerms?.length ?? 0) > 0 ||
    (skill.resources.docs?.length ?? 0) > 0 ||
    !!skill.resources.savedCoursesNote
  const hasResources = hasLinks || hasSearchTerms

  return (
    <div className="px-4 pb-4 border-t border-[#1f1f1f] mt-2">
      {skill.whyLearn && (
        <p className="text-xs text-[var(--text-muted)] font-sans leading-relaxed pt-3 pb-2">
          <span className="text-[var(--accent)] font-mono">Neden: </span>
          {skill.whyLearn}
        </p>
      )}

      {skill.relevanceToCem && (
        <p className="text-xs text-[var(--text-muted)] font-sans leading-relaxed pb-3">
          <span className="text-[var(--text-muted)] font-mono">Sana Özel: </span>
          {skill.relevanceToCem}
        </p>
      )}

      {/* Aksiyon Aynası — bu bir katalog değil, ayna. Kendine sor. */}
      <div className="rounded-card border border-[var(--accent)]/15 bg-[var(--accent)]/3 shadow-soft p-3 mb-1">
        <p className="text-[10px] font-mono text-[var(--accent)]/80 uppercase tracking-widest mb-2">
          Aksiyon Aynası
        </p>
        <ul className="space-y-1.5">
          <li className="flex items-start gap-2 text-xs font-sans text-[var(--text-secondary)]">
            <span className="text-[var(--text-muted)] font-mono shrink-0">›</span>
            <span>Şu an bunu yapıyor muyum?</span>
          </li>
          <li className="flex items-start gap-2 text-xs font-sans text-[var(--text-secondary)]">
            <span className="text-[var(--text-muted)] font-mono shrink-0">›</span>
            <span>Bu bana para getiriyor mu?</span>
          </li>
          <li className="flex items-start gap-2 text-xs font-sans text-[var(--text-secondary)]">
            <span className="text-[var(--text-muted)] font-mono shrink-0">›</span>
            <span>Sıradaki tek adım ne?</span>
          </li>
        </ul>
        <button
          onClick={handleConvertToTask}
          disabled={bridgeState === "saving" || bridgeState === "done"}
          className={`mt-3 w-full py-2 text-xs font-mono rounded transition-all border ${
            bridgeState === "done"
              ? "border-[var(--success)]/40 text-[var(--success)] bg-[var(--success)]/10 cursor-default"
              : bridgeState === "error"
              ? "border-[var(--danger)]/40 text-[var(--danger)] bg-[var(--danger)]/10"
              : "border-[var(--accent)]/40 text-[var(--accent)] bg-[var(--accent)]/5 hover:bg-[var(--accent)]/15"
          }`}
        >
          {bridgeState === "saving"
            ? "Ekleniyor…"
            : bridgeState === "done"
            ? "✓ Göreve eklendi"
            : bridgeState === "error"
            ? "Hata — tekrar dene"
            : "Göreve çevir →"}
        </button>
      </div>

      <div className="py-3 border-t border-[var(--border-subtle)]">
        <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-2">
          Bilgi Durumu
        </p>
        <KnowledgeStatusSelector
          skillId={skill.id}
          current={currentStatus}
          onChange={onStatusChange}
        />
      </div>

      <div className="flex gap-2 py-3 border-t border-[var(--border-subtle)]">
        <button
          onClick={() => onSetFocus(skill.id, groupId)}
          disabled={isActiveFocus}
          className={`flex-1 py-2 text-xs font-mono rounded transition-all border ${
            isActiveFocus
              ? "border-[var(--accent)]/40 text-[var(--accent)] bg-[var(--accent)]/10 cursor-default"
              : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
          }`}
        >
          {isActiveFocus ? "● Aktif Odak" : "Odak Seç"}
        </button>
        <button
          onClick={() => onComplete(skill.id)}
          className={`flex-1 py-2 text-xs font-mono rounded transition-all border ${
            isCompleted
              ? "border-[var(--success)]/40 text-[var(--success)] bg-[var(--success)]/10"
              : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--success)]/40 hover:text-[var(--success)]"
          }`}
        >
          {isCompleted ? "✓ Tamamlandı" : "Tamamla"}
        </button>
      </div>

      {hasResources && (
        <div className="py-3 border-t border-[var(--border-subtle)]">
          <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-2">
            Kaynaklar
          </p>
          {hasLinks && (
            <div className="space-y-0.5 mb-2">
              {/* hasLinks guard yukarıda links.length > 0 garantiler */}
              {skill.resources.links!.map(link => (
                <ResourceLink key={link.url} link={link} />
              ))}
            </div>
          )}
          {hasSearchTerms && (
            <div className="space-y-1">
              {(skill.resources.courseSearchTerms?.length ?? 0) > 0 && (
                <p className="text-[10px] text-[var(--text-tertiary)] font-sans">
                  <span className="font-mono text-[var(--text-muted)]">Kurs ara: </span>
                  {skill.resources.courseSearchTerms?.join(" · ")}
                </p>
              )}
              {(skill.resources.youtubeSearchTerms?.length ?? 0) > 0 && (
                <p className="text-[10px] text-[var(--text-tertiary)] font-sans">
                  <span className="font-mono text-[var(--text-muted)]">YouTube ara: </span>
                  {skill.resources.youtubeSearchTerms?.join(" · ")}
                </p>
              )}
              {skill.resources.savedCoursesNote && (
                <p className="text-[10px] text-[var(--text-muted)] font-sans italic">
                  {skill.resources.savedCoursesNote}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {skill.howToLearn.length > 0 && (
        <Section title="Nasıl Öğrenilir">
          <ol className="space-y-1.5 mt-1">
            {skill.howToLearn.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-muted)] font-sans">
                <span className="text-[var(--accent)] font-mono shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {skill.practiceProjects.length > 0 && (
        <Section title="Pratik Projeler">
          <ul className="space-y-1.5 mt-1">
            {skill.practiceProjects.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-muted)] font-sans">
                <span className="text-[var(--text-muted)] font-mono shrink-0">→</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {skill.completionProof.length > 0 && (
        <Section title="Tamamlandı Sayılır">
          <ul className="space-y-1.5 mt-1">
            {skill.completionProof.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-muted)] font-sans">
                <span className="text-[var(--success)] font-mono shrink-0">✓</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {skill.ifAlreadyKnown.length > 0 && (
        <Section title="Zaten Biliyorsan">
          <ul className="space-y-1.5 mt-1">
            {skill.ifAlreadyKnown.map((s, i) => (
              <li key={i} className="text-xs text-[var(--text-muted)] font-sans">{s}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}
