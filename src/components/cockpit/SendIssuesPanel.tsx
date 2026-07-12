'use client'

// Gönderim / Reconciliation sorunları paneli (Faz C5, finding #9).
// unknown / finalize-eksik satırlarda "Reconcile" butonu → POST /api/outreach/[id]/reconcile.
// Grace (5 dk), min-2-arama ve confirmNotFound kuralları SERVER'da (mig 056 RPC) —
// bu panel yalnız tetikler; provider arama hatası not-found SAYILMAZ (server kuralı).

import { useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { PanelResult, SendIssue } from '@/lib/cockpit/shared'

type RowState = { busy: boolean; outcome: string | null; error: string | null }

export function SendIssuesPanel({ initial }: { initial: PanelResult<SendIssue> }) {
  const [rows, setRows] = useState<Record<string, RowState>>({})

  function patch(id: string, p: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { busy: false, outcome: null, error: null }), ...p } }))
  }

  async function reconcile(issue: SendIssue) {
    // confirmNotFound YALNIZ yeterli arama yapılmışsa anlamlı — açık operatör onayı iste.
    let confirmNotFound = false
    if (issue.searchCount >= 2) {
      confirmNotFound = window.confirm(
        `${issue.searchCount} arama yapıldı, mesaj bulunamadı. "Gönderilmedi (failed)" olarak işaretlensin mi?\n(İptal = yalnız yeniden ara)`
      )
    }
    patch(issue.outreachMessageId, { busy: true, error: null })
    try {
      const res = await fetch(`/api/outreach/${issue.outreachMessageId}/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirmNotFound ? { confirmNotFound: true } : {}),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      patch(issue.outreachMessageId, { busy: false, outcome: json.data?.outcome ?? 'tamam' })
    } catch (err) {
      patch(issue.outreachMessageId, {
        busy: false,
        error: err instanceof Error ? err.message : 'hata',
      })
    }
  }

  return (
    <section
      data-testid="panel-issues"
      className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-[var(--accent)]" />
        <h2 className="text-[12px] font-bold tracking-wide text-[var(--text-secondary)] uppercase">
          Gönderim / Reconciliation Sorunları
        </h2>
        {initial.items.length > 0 && (
          <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
            {initial.items.length}
          </span>
        )}
      </div>

      {initial.error ? (
        <p className="text-[12px] text-red-400">Panel yüklenemedi: {initial.error}</p>
      ) : initial.items.length === 0 ? (
        <p className="text-[12px] text-[var(--text-muted)]">Sorunlu gönderim denemesi yok.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {initial.items.map((s) => {
            const st = rows[s.outreachMessageId]
            const needsReconcile = s.state === 'unknown' || (s.state === 'sent' && !s.finalized)
            return (
              <li key={s.outreachMessageId} className="text-[13px]">
                <div className="flex items-center gap-2">
                  <span className={s.state === 'unknown' ? 'text-red-400 font-semibold' : 'text-amber-400 font-semibold'}>
                    {s.state}{!s.finalized && s.state === 'sent' ? ' (finalize eksik)' : ''}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    deneme {s.attemptCount} · arama {s.searchCount}
                  </span>
                  {needsReconcile && !st?.outcome && (
                    <button
                      type="button"
                      disabled={st?.busy}
                      onClick={() => reconcile(s)}
                      data-testid={`reconcile-${s.outreachMessageId}`}
                      className="ml-auto flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 active:scale-95 transition disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${st?.busy ? 'animate-spin' : ''}`} /> Reconcile
                    </button>
                  )}
                  {st?.outcome && (
                    <span className="ml-auto text-[11px] font-semibold text-emerald-400">→ {st.outcome}</span>
                  )}
                </div>
                {s.lastError && <div className="text-[11px] text-[var(--text-muted)] truncate">{s.lastError}</div>}
                {st?.error && <div className="text-[11px] text-red-400 truncate">{st.error}</div>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
