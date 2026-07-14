'use client'

// Taslak darboğazı paneli (/bugun, Faz C4 — finding #5-6): TÜM email taslakları
// görünür, her biri deterministik durum + TEK güvenli sonraki adım taşır.
// pending → "Onayla" → approved → görünür gönderim modu. Gönderim her zaman
// at-most-once state machine + digest-lock arkasında; bu panel yalnız tetikler.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MailCheck, Check, Send, UserPlus, PenLine } from 'lucide-react'
import { DraftEditor } from '@/components/outreach/DraftEditor'
import {
  GMAIL_SEND_MODE_COPY,
  type GmailSendMode,
  type PanelResult,
  type PendingSendDraft,
  type DraftState,
} from '@/lib/cockpit/shared'

type RowState = { status: string | null; busy: boolean; error: string | null; sent: boolean; dryRun?: boolean }

// Faz 2.2: recipient_missing satırından ÇIKMADAN kişi ekleme — lead drawer'a
// gitmek gerekmez. Kayıt sonrası canonical recipient server'da yeniden çözülür
// (router.refresh) ve durum approval_missing'e ilerler.
function InlineContactForm({ leadId, onDone }: { leadId: string; onDone: () => void }) {
  const [form, setForm] = useState({ fullName: '', role: 'owner', email: '', source: 'manual', isPrimary: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          role: form.role,
          email: form.email.trim(),
          source: form.source,
          isPrimary: form.isPrimary,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'kayıt hatası')
    } finally {
      setBusy(false)
    }
  }

  const input = 'bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded px-2 py-1 text-[11px] text-[var(--text-primary)]'
  return (
    <form onSubmit={submit} data-testid={`inline-contact-${leadId}`} className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <input
        required
        minLength={2}
        placeholder="Ad Soyad"
        value={form.fullName}
        onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
        className={`${input} w-32`}
        data-testid={`inline-contact-name-${leadId}`}
      />
      <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className={input}>
        <option value="owner">Sahip</option>
        <option value="marketing">Pazarlama</option>
        <option value="operations">Operasyon</option>
        <option value="cto">CTO</option>
        <option value="cfo">CFO</option>
        <option value="other">Diğer</option>
      </select>
      <input
        required
        type="email"
        placeholder="E-posta"
        value={form.email}
        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        className={`${input} w-44`}
        data-testid={`inline-contact-email-${leadId}`}
      />
      <select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} className={input}>
        <option value="manual">Manuel</option>
        <option value="website">Web sitesi</option>
        <option value="instagram">Instagram</option>
        <option value="apollo">Apollo</option>
        <option value="referral">Referans</option>
      </select>
      <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={form.isPrimary}
          onChange={(e) => setForm((f) => ({ ...f, isPrimary: e.target.checked }))}
        />
        Primary
      </label>
      <button
        type="submit"
        disabled={busy}
        data-testid={`inline-contact-save-${leadId}`}
        className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded bg-[var(--accent)] text-white hover:brightness-110 disabled:opacity-50"
      >
        <UserPlus className="w-3 h-3" /> {busy ? 'Kaydediliyor…' : 'Kaydet'}
      </button>
      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </form>
  )
}

const STATE_BADGE: Record<DraftState, { label: string; cls: string }> = {
  recipient_missing: { label: 'Alıcı eksik', cls: 'bg-red-500/15 text-red-400' },
  compliance_blocked: { label: 'Suppression', cls: 'bg-red-500/15 text-red-400' },
  approval_missing: { label: 'Onay yok', cls: 'bg-amber-500/15 text-amber-400' },
  approval_pending: { label: 'Onay bekliyor', cls: 'bg-amber-500/15 text-amber-400' },
  approved: { label: 'Onaylı', cls: 'bg-emerald-500/15 text-emerald-400' },
  sent: { label: 'Gönderildi', cls: 'bg-emerald-500/15 text-emerald-400' },
  unknown: { label: 'Belirsiz', cls: 'bg-red-500/15 text-red-400' },
  finalize_pending: { label: 'Finalize eksik', cls: 'bg-red-500/15 text-red-400' },
  failed: { label: 'Hata', cls: 'bg-red-500/15 text-red-400' },
}

export function PendingSendsPanel({
  initial,
  sendMode,
}: {
  initial: PanelResult<PendingSendDraft>
  sendMode: GmailSendMode
}) {
  const router = useRouter()
  const modeCopy = GMAIL_SEND_MODE_COPY[sendMode]
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      initial.items.map((d) => [d.draftId, { status: d.approvalStatus, busy: false, error: null, sent: false }])
    )
  )
  const [savedContacts, setSavedContacts] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<Record<string, boolean>>({})

  function patch(id: string, p: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }))
  }

  async function approve(d: PendingSendDraft) {
    if (!d.approvalId) return
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
    if (!d.approvalId) return
    patch(d.draftId, { busy: true, error: null })
    try {
      const res = await fetch(`/api/outreach/${d.draftId}/send-gmail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId: d.approvalId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      patch(d.draftId, {
        busy: false,
        sent: true,
        dryRun: Boolean(json.data?.dryRun),
        error: json.data?.followUpScheduleError
          ? `E-posta gönderildi; takip planı kurulamadı: ${json.data.followUpScheduleError}`
          : null,
      })
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
          Taslak Darboğazı
        </h2>
        {initial.items.length > 0 && (
          <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
            {initial.items.length}
          </span>
        )}
      </div>

      <div
        data-testid="gmail-send-mode"
        className={`mb-3 rounded-lg border px-2.5 py-2 text-[11px] font-semibold ${
          sendMode === 'live'
            ? 'border-red-500/40 bg-red-500/10 text-red-300'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
        }`}
      >
        {modeCopy.banner}
      </div>

      {initial.error ? (
        <p className="text-[12px] text-red-400">Panel yüklenemedi: {initial.error}</p>
      ) : initial.items.length === 0 ? (
        <p className="text-[12px] text-[var(--text-muted)]">Bekleyen e-posta taslağı yok.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {initial.items.map((d) => {
            const st = rows[d.draftId]
            const badge = STATE_BADGE[d.state]
            const effectiveState: DraftState = st.sent
              ? 'sent'
              : st.status === 'approved' && d.state === 'approval_pending'
                ? 'approved'
                : d.state
            const canApprove = effectiveState === 'approval_pending' && d.approvalId
            const canSend = effectiveState === 'approved' && d.approvalId
            return (
              <li key={d.draftId} data-testid={`send-draft-${d.draftId}`} tabIndex={-1} className="text-[13px]">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--text-primary)] font-medium truncate">{d.businessName}</span>
                  <span
                    data-testid={`draft-state-${d.draftId}`}
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATE_BADGE[effectiveState]?.cls ?? badge.cls}`}
                  >
                    {STATE_BADGE[effectiveState]?.label ?? effectiveState}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">alıcı-domain: {d.domain}</span>
                </div>
                <div className="text-[11px] text-[var(--text-muted)] truncate mb-1.5">{d.subject}</div>
                <div className="flex items-center gap-2">
                  {st.sent ? (
                    <span className="text-[12px] font-semibold text-emerald-400">
                      Gönderildi ✓{st.dryRun ? ' (dry-run)' : ''}
                    </span>
                  ) : canSend ? (
                    <button
                      type="button"
                      disabled={st.busy}
                      onClick={() => send(d)}
                      className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white hover:brightness-110 active:scale-95 transition disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {modeCopy.button}
                    </button>
                  ) : canApprove ? (
                    <button
                      type="button"
                      disabled={st.busy}
                      onClick={() => approve(d)}
                      className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white hover:brightness-110 active:scale-95 transition disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" /> Onayla
                    </button>
                  ) : (
                    // Diğer durumlarda gönderime götüren buton YOK — tek güvenli adım metni.
                    <span className="text-[11px] text-[var(--text-secondary)]">→ {d.nextAction}</span>
                  )}
                  {/* Faz 4.1: gönderilmemiş taslak satırdan düzenlenir; onay isteği
                      GERÇEK final içerikle oluşur (approval_missing ana yol). */}
                  {(effectiveState === 'approval_missing' || effectiveState === 'approval_pending') && d.leadId && (
                    <button
                      type="button"
                      onClick={() => setEditing((prev) => ({ ...prev, [d.draftId]: !prev[d.draftId] }))}
                      data-testid={`draft-edit-toggle-${d.draftId}`}
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <PenLine className="w-3 h-3" /> {editing[d.draftId] ? 'Kapat' : 'Düzenle'}
                    </button>
                  )}
                  {st.error && <span className="text-[11px] text-red-400 truncate">{st.error}</span>}
                </div>
                {editing[d.draftId] && d.leadId && (
                  <DraftEditor
                    draftId={d.draftId}
                    leadId={d.leadId}
                    initialSubject={d.subject === '(konu yok)' ? '' : d.subject}
                    initialBody={d.body}
                    onApprovalRequested={({ status }) => {
                      patch(d.draftId, { status })
                      setEditing((prev) => ({ ...prev, [d.draftId]: false }))
                      router.refresh()
                    }}
                  />
                )}
                {/* Faz 2.2: alıcı eksikse kişi satırdan eklenir; kayıt sonrası
                    server canonical recipient'ı yeniden çözer (refresh). */}
                {effectiveState === 'recipient_missing' && d.leadId && !savedContacts[d.draftId] && (
                  <InlineContactForm
                    leadId={d.leadId}
                    onDone={() => {
                      setSavedContacts((prev) => ({ ...prev, [d.draftId]: true }))
                      router.refresh()
                    }}
                  />
                )}
                {savedContacts[d.draftId] && (
                  <span className="text-[10px] text-emerald-400">Kişi kaydedildi — alıcı güncelleniyor…</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
