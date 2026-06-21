"use client"

import { getSkillById } from "@/data/careerRoadmap"
import { ResourceLink } from "./ResourceLink"

/**
 * Aktif odak becerisinin isimli kaynaklarını çekmeceyi açmadan sayfada gösterir.
 * "Hangi kurs / hangi video" sorusuna doğrudan cevap. Link yoksa hiçbir şey render etmez.
 */
export function FocusResourcesPanel({ activeFocusSkillId }: { activeFocusSkillId: string | null }) {
  if (!activeFocusSkillId) return null

  const skill = getSkillById(activeFocusSkillId)
  const links = skill?.resources.links ?? []
  if (!skill || links.length === 0) return null

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--info)]/20 rounded-card shadow-soft p-4 mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[10px] font-mono text-[var(--info)] uppercase tracking-widest shrink-0">
          Odak Kaynakları
        </p>
        <p className="text-[10px] font-mono text-[var(--text-tertiary)] truncate">{skill.title}</p>
      </div>
      <div className="space-y-0.5">
        {links.map(link => (
          <ResourceLink key={link.url} link={link} />
        ))}
      </div>
      <p className="text-[10px] text-[var(--text-muted)] font-sans mt-2">
        Hangi kurs/video — doğrudan buradan başla. Adımlar için beceriyi aç.
      </p>
    </div>
  )
}
