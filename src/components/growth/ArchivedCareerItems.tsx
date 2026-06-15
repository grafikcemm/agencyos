"use client"

import { useState } from "react"
import { getAllArchivedSkills } from "@/data/careerRoadmap"

export function ArchivedCareerItems() {
  const [open, setOpen] = useState(false)
  const archived = getAllArchivedSkills()

  if (archived.length === 0) return null

  return (
    <div className="mt-6 border border-[#1f1f1f] rounded-[6px] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 bg-[#111111] hover:bg-[#141414] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[#444]">ARŞİV</span>
          <span className="text-[10px] font-mono text-[#333] border border-[#222] px-1.5 py-0.5 rounded">
            {archived.length}
          </span>
        </div>
        <span className="text-[#333] font-mono text-sm">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="bg-[#0a0a0a] p-3 space-y-2">
          <p className="text-[10px] font-mono text-[#333] pb-2">
            Bu skill&apos;ler şu an öncelik dışı bırakıldı.
          </p>
          {archived.map(({ skill, levelNumber, levelTitle }) => (
            <div
              key={skill.id}
              className="border border-[#1a1a1a] rounded-[4px] p-3 opacity-40"
            >
              <p className="text-xs font-mono text-[#666]">{skill.title}</p>
              <p className="text-[10px] font-sans text-[#444] mt-0.5">
                S{levelNumber} — {levelTitle}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
