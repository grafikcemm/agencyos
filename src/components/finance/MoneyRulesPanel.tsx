"use client"

import { useState } from "react"
import { ChevronDown, Coins } from "lucide-react"
import { MONEY_RULES } from "@/data/moneyRules"

// Paranın Kuralları — açılır referans sekmesi. Parayı öğrenmek için 20 ilke.
export function MoneyRulesPanel() {
  const [open, setOpen] = useState(false)

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 mt-6">
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[var(--bg-card-hover)] transition-colors"
        >
          <span className="flex items-center gap-2.5">
            <Coins className="w-4 h-4 text-[var(--accent-yellow)]" />
            <span className="text-sm font-bold font-[family-name:var(--font-inter-tight)] tracking-tight text-[var(--text-primary)]">
              Paranın Kuralları
            </span>
            <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-wide">
              {MONEY_RULES.length} ilke
            </span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <div className="border-t border-[var(--border-subtle)] px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {MONEY_RULES.map((rule, i) => (
              <div
                key={rule.title}
                className="flex gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]/40 p-3"
              >
                <span className="num shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-[var(--accent-yellow)]/15 text-[var(--accent-yellow)] text-[11px] font-black">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h4 className="text-[13px] font-bold text-[var(--text-primary)] leading-snug">
                    {rule.title}
                  </h4>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mt-0.5">
                    {rule.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
