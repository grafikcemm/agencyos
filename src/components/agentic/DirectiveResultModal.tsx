"use client"

import Link from 'next/link'
import { Loader2, CheckCircle2, AlertTriangle, ListChecks, ArrowRight, X, Bot } from 'lucide-react'
import type { DirectiveResult } from '@/lib/useDirective'

interface DirectiveResultModalProps {
  running: boolean
  result: DirectiveResult | null
  error: string | null
  label: string | null
  onClose: () => void
}

// Shared overlay that visualises an agent directive lifecycle: running →
// done (debrief + queued task count + link to the task board) → error.
// Reused by Hizmetlerim and İcraat Fırsatları.
export function DirectiveResultModal({ running, result, error, label, onClose }: DirectiveResultModalProps) {
  const open = running || !!result || !!error
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
      onClick={running ? undefined : onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-muted)] border border-[var(--accent)]/20 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">Ajan Orkestrasyonu</div>
              <div className="text-sm font-bold text-[var(--text-primary)] truncate">{label ?? 'Direktif'}</div>
            </div>
          </div>
          {!running && (
            <button
              onClick={onClose}
              aria-label="Kapat"
              className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5">
          {running && (
            <div className="flex flex-col items-center justify-center text-center py-6 gap-3">
              <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
              <div className="text-sm font-bold text-[var(--text-primary)]">CEO ajanı görevleri planlıyor…</div>
              <div className="text-xs text-[var(--text-muted)] max-w-xs leading-relaxed">
                Plan kuruluyor ve uzman ajanlara dağıtılıyor. Bu işlem birkaç saniye sürebilir.
              </div>
            </div>
          )}

          {!running && error && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span className="text-sm font-bold">Direktif başarısız</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed bg-red-500/5 border border-red-500/15 rounded-lg p-3">
                {error}
              </p>
            </div>
          )}

          {!running && result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span className="text-sm font-bold">İcraata döküldü</span>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--accent)] bg-[var(--accent-muted)] border border-[var(--accent)]/20 px-2 py-1 rounded-full">
                  <ListChecks className="w-3 h-3" />
                  {result.taskCount} görev kuyrukta
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">CEO Brifingi</div>
                <div className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg p-3 max-h-64 overflow-y-auto scrollbar-thin">
                  {result.debrief || 'Brifing üretilemedi.'}
                </div>
              </div>

              <Link
                href="/tasks"
                onClick={onClose}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-[var(--accent)] hover:opacity-90 text-black text-xs font-black rounded-lg transition-opacity"
              >
                Görev panosunu aç <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
