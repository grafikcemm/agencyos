"use client"

import { Globe, MapPin } from 'lucide-react'
import type { MarketScope, MarketWorkspace } from '@/lib/leads/marketScope'

// LEAD RADAR ÇALIŞMA ALANI ÇUBUĞU.
//
// Tek işi var: kullanıcı BİR BAKIŞTA hangi pazarda olduğunu, o pazarın diline,
// para birimine, saat dilimine ve kaç ülkesinin gönderime açık olduğunu görsün.
// Ham enum ("tr"/"global") kullanıcı metni olarak GÖSTERİLMEZ.

export interface MarketScopeBarProps {
  scope: MarketScope
  scopes: readonly MarketScope[]
  workspace: MarketWorkspace
  sendable: { open: number; total: number }
  matchCount: number
  onChange: (scope: MarketScope) => void
}

const SCOPE_LABEL: Record<MarketScope, string> = {
  tr: 'Türkiye',
  global: 'Global',
}

export function MarketScopeBar({ scope, scopes, workspace, sendable, matchCount, onChange }: MarketScopeBarProps) {
  const Icon = scope === 'tr' ? MapPin : Globe
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="flex items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] p-0.5"
          role="tablist"
          aria-label="Pazar çalışma alanı"
        >
          {scopes.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={scope === s}
              onClick={() => onChange(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold tracking-wide transition-colors ${
                scope === s
                  ? 'bg-[var(--accent-muted)] text-[var(--text-primary)] ring-1 ring-inset ring-[var(--accent)]/30'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>

        <div className="flex min-w-0 items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
          <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]/70" aria-hidden />
          <span className="truncate">
            {workspace.label} · {workspace.language === 'tr' ? 'Türkçe' : 'İngilizce'} · {workspace.currency} ·{' '}
            {workspace.timezone}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[11px]">
        <span className="text-[var(--text-tertiary)]">
          <strong className="text-[var(--text-secondary)]">{matchCount}</strong> hesap
        </span>
        <span
          className={sendable.open === 0 ? 'text-[var(--warning)]' : 'text-[var(--text-tertiary)]'}
          title="Gönderim izni ülke politikasına ve kanıt kapısına bağlıdır."
        >
          {sendable.total} ülkeden <strong className="text-[var(--text-secondary)]">{sendable.open}</strong>&apos;i
          gönderime açık
        </span>
      </div>
    </div>
  )
}
