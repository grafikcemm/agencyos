"use client"

import { useState } from "react"
import { getAllArchivedSkills } from "@/data/careerRoadmap"

export function ArchivedCareerItems() {
  const [open, setOpen] = useState(false)
  const archived = getAllArchivedSkills()

  if (archived.length === 0) return null

  return (
    <div className="mt-6 border border-[var(--border-subtle)] rounded-[6px] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 bg-[var(--bg-surface)] hover:bg-[var(--bg-card-hover)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[var(--text-tertiary)]">ARŞİV</span>
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded">
            {archived.length}
          </span>
        </div>
        <span className="text-[var(--text-tertiary)] font-mono text-sm">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="bg-[var(--bg-base)] p-3 space-y-2">
          <p className="text-[10px] font-mono text-[var(--text-tertiary)] pb-2">
            Bu skill&apos;ler şu an öncelik dışı bırakıldı.
          </p>
          {archived.map(({ skill, levelNumber, levelTitle }) => (
            <div
              key={skill.id}
              className="border border-[var(--border-subtle)] rounded-[4px] p-3 opacity-40"
            >
              <p className="text-xs font-mono text-[var(--text-muted)]">{skill.title}</p>
              <p className="text-[10px] font-sans text-[var(--text-tertiary)] mt-0.5">
                S{levelNumber} — {levelTitle}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
