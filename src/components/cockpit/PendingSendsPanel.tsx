'use client'

// Onay bekleyen taslaklar paneli (/bugun) — kokpitten çıkmadan tam HITL akışı:
// pending → "Onayla" (POST /api/approvals/[id]) → approved → "Gönder (dry-run)"
// (POST /api/outreach/[id]/send-gmail) → gönderildi. Gönderim her zaman
// at-most-once state machine + digest-lock arkasında; bu panel yalnız tetikler.

import { useState } from 'react'
import { MailCheck, Check, Send } from 'lucide-react'
import type { PanelResult, PendingSendDraft } from '@/lib/cockpit/today'

type RowState = { status: string; busy: boolean; error: string | null; sent: boolean; dryRun?: boolean }

export function PendingSendsPanel({ initial }: { initial: PanelResult<PendingSendDraft> }) {
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      initial.items.map((d) => [d.draftId, { status: d.approvalStatus, busy: false, error: null, sent: false }])
    )
  )

  function patch(id: string, p: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }))
  }

  async function approve(d: PendingSendDraft) {
    patch(d.draftId, { busy: true, error: null })
    try {
      const res = await fetch(`/api/approvals/${d.approvalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'approved' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      patch(d.draftId, { status: 'approved', busy: false })
    } catch (err) {
      patch(d.draftId, { busy: false, error: err instanceof Error ? err.message : 'hata' })
    }
  }

  async function send(d: PendingSendDraft) {
    patch(d.draftId, { busy: true, error: null })
    try {
      const res = await fetch(`/api/outreach/${d.draftId}/send-gmail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId: d.approvalId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      patch(d.draftId, { busy: false, sent: true, dryRun: Boolean(json.data?.dryRun) })
    } catch (err) {
      patch(d.draftId, { busy: false, error: err instanceof Error ? err.message : 'hata' })
    }
  }

  return (
    <section
      data-testid="panel-approvals"
      className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <MailCheck className="w-4 h-4 text-[var(--accent)]" />
        <h2 className="text-[12px] font-bold tracking-wide text-[var(--text-secondary)] uppercase">
          Onay Bekleyen Taslaklar
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
        <p className="text-[12px] text-[var(--text-muted)]">Onay bekleyen taslak yok.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {initial.items.map((d) => {
            const st = rows[d.draftId]
            return (
              <li key={d.draftId} data-testid={`send-draft-${d.draftId}`} className="text-[13px]">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--text-primary)] font-medium truncate">{d.businessName}</span>
                  <span className="text-[11px] text-[var(--text-muted)]">alıcı-domain: {d.domain}</span>
                </div>
                <div className="text-[11px] text-[var(--text-muted)] truncate mb-1.5">{d.subject}</div>
                <div className="flex items-center gap-2">
                  {st.sent ? (
                    <span className="text-[12px] font-semibold text-emerald-400">
                      Gönderildi ✓{st.dryRun ? ' (dry-run)' : ''}
                    </span>
                  ) : st.status === 'approved' ? (
                    <button
                      type="button"
                      disabled={st.busy}
                      onClick={() => send(d)}
                      className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white hover:brightness-110 active:scale-95 transition disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" /> Gönder (dry-run)
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={st.busy}
                      onClick={() => approve(d)}
                      className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white hover:brightness-110 active:scale-95 transition disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" /> Onayla
                    </button>
                  )}
                  {st.error && <span className="text-[11px] text-red-400 truncate">{st.error}</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
