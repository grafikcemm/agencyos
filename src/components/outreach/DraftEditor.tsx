'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Taslak inline editörü (Sprint-3 Faz 4.1-4.4) — /bugun + LeadDrawer ortak.
//
// - Subject/body düzenlenir; "Kapıdan geçir" gerçek server gate'ini çağırır.
// - İhlaller metindeki BÖLGEYE bağlanır (anchor → <mark> önizleme).
// - "İhlalleri düzelt": deterministik draftFixes (LLM yok) → yeniden kapı.
// - "Onaya al": GERÇEK final subject/finalBody ile request-send (boş {} ASLA).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { ShieldCheck, Wand2, SendHorizonal } from 'lucide-react'
import { applyViolationFixes, anchorViolation } from '@/lib/outreach/draftFixes'
import type { QualityViolation } from '@/lib/outreach/qualityLint'

interface GateViolation {
  code: QualityViolation['code']
  detail: string
  fix: string
}
interface GateResult {
  ok: boolean
  violations: GateViolation[]
}

export interface DraftEditorProps {
  draftId: string
  leadId: string
  initialSubject: string
  initialBody: string
  /** Onay isteği başarıyla oluşunca — panel/drawer durumu ve İÇERİĞİ günceller. */
  onApprovalRequested?: (info: { approvalId: string; status: string; subject: string; body: string }) => void
}

function BodyPreview({ body, violations }: { body: string; violations: GateViolation[] }) {
  // İhlal bölgeleri işaretlenir; çakışmaları önlemek için sıralı tek geçiş.
  const anchors = violations
    .map((v) => ({ v, a: anchorViolation(body, v) }))
    .filter((x): x is { v: GateViolation; a: { start: number; end: number } } => x.a !== null)
    .sort((x, y) => x.a.start - y.a.start)

  if (anchors.length === 0) return null
  const parts: React.ReactNode[] = []
  let cursor = 0
  anchors.forEach(({ v, a }, i) => {
    if (a.start < cursor) return // çakışan bölge — ilki yeter
    parts.push(<span key={`t${i}`}>{body.slice(cursor, a.start)}</span>)
    parts.push(
      <mark
        key={`m${i}`}
        title={`${v.code}: ${v.fix}`}
        data-testid={`violation-mark-${v.code}`}
        className="bg-red-500/25 text-red-200 rounded px-0.5"
      >
        {body.slice(a.start, a.end)}
      </mark>,
    )
    cursor = a.end
  })
  parts.push(<span key="tail">{body.slice(cursor)}</span>)
  return (
    <pre className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--text-secondary)] bg-[var(--bg-elevated)] border border-red-500/20 rounded p-2 max-h-40 overflow-y-auto">
      {parts}
    </pre>
  )
}

export function DraftEditor({
  draftId,
  leadId,
  initialSubject,
  initialBody,
  onApprovalRequested,
}: DraftEditorProps) {
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState(initialBody)
  const [gate, setGate] = useState<GateResult | null>(null)
  const [busy, setBusy] = useState<null | 'gate' | 'fix' | 'approve'>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function runGate(nextSubject = subject, nextBody = body): Promise<GateResult | null> {
    setBusy('gate')
    setError(null)
    try {
      const res = await fetch('/api/outbound/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          items: [{ key: draftId, kind: 'cold_email', subject: nextSubject, text: nextBody }],
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `kapı servisi ${res.status} (fail-closed)`)
      const r = json.results?.[draftId] as GateResult | undefined
      if (!r) throw new Error('kapı sonucu okunamadı (fail-closed)')
      setGate(r)
      return r
    } catch (err) {
      setError(err instanceof Error ? err.message : 'kapı hatası')
      setGate(null)
      return null
    } finally {
      setBusy(null)
    }
  }

  async function fixViolations() {
    if (!gate || gate.ok) return
    setBusy('fix')
    setNotice(null)
    try {
      const fixed = applyViolationFixes(subject, body, gate.violations)
      setSubject(fixed.subject)
      setBody(fixed.body)
      setNotice(
        fixed.applied.length > 0
          ? `Uygulandı: ${fixed.applied.join(' · ')}${fixed.notFixable.length ? ` — elle gerekli: ${fixed.notFixable.join(', ')}` : ''}`
          : 'Otomatik düzeltilebilir ihlal yok — elle düzenleme gerekli.',
      )
      await runGate(fixed.subject, fixed.body)
    } finally {
      setBusy(null)
    }
  }

  async function requestApproval() {
    setBusy('approve')
    setError(null)
    try {
      // Faz 4.4: GERÇEK final içerik gönderilir — sunucu digest'i BUNA bağlar.
      const res = await fetch(`/api/outreach/${draftId}/request-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), finalBody: body.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const reasons = json.blockedReasons?.join(', ')
        throw new Error(reasons ? `Kalite kapısı blokladı: ${reasons}` : (json.error ?? `HTTP ${res.status}`))
      }
      setNotice('Onay isteği oluşturuldu — HITL onayı bekliyor.')
      onApprovalRequested?.({
        approvalId: json.data.approvalId as string,
        status: json.data.status as string,
        subject: subject.trim(),
        body: body.trim(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'onay isteği hatası')
    } finally {
      setBusy(null)
    }
  }

  const btn =
    'flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:brightness-110 disabled:opacity-50'

  return (
    <div data-testid={`draft-editor-${draftId}`} className="mt-2 flex flex-col gap-1.5">
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        data-testid={`draft-subject-${draftId}`}
        className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded px-2 py-1 text-[12px] text-[var(--text-primary)]"
        placeholder="Konu"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        data-testid={`draft-body-${draftId}`}
        rows={6}
        className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded px-2 py-1 text-[12px] leading-relaxed text-[var(--text-primary)] resize-y"
        placeholder="Gövde"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy !== null} onClick={() => runGate()} className={btn} data-testid={`draft-gate-${draftId}`}>
          <ShieldCheck className="w-3 h-3" /> {busy === 'gate' ? 'Kontrol…' : 'Kapıdan geçir'}
        </button>
        {gate && !gate.ok && (
          <button type="button" disabled={busy !== null} onClick={fixViolations} className={btn} data-testid={`draft-fix-${draftId}`}>
            <Wand2 className="w-3 h-3" /> {busy === 'fix' ? 'Düzeltiliyor…' : 'İhlalleri düzelt'}
          </button>
        )}
        <button
          type="button"
          disabled={busy !== null || (gate !== null && !gate.ok)}
          onClick={requestApproval}
          data-testid={`draft-request-approval-${draftId}`}
          className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded bg-[var(--accent)] text-white hover:brightness-110 disabled:opacity-50"
        >
          <SendHorizonal className="w-3 h-3" /> {busy === 'approve' ? 'Gönderiliyor…' : 'Onaya al'}
        </button>
        {gate?.ok && <span className="text-[10px] text-emerald-400">Kapı ✓</span>}
      </div>
      {gate && !gate.ok && (
        <div data-testid={`draft-violations-${draftId}`} className="flex flex-col gap-0.5">
          {gate.violations.map((v, i) => (
            <span key={i} className="text-[10px] text-red-400">
              {v.code}: {v.detail} → <span className="text-[var(--text-secondary)]">{v.fix}</span>
            </span>
          ))}
          <BodyPreview body={body} violations={gate.violations} />
        </div>
      )}
      {notice && <span className="text-[10px] text-emerald-400">{notice}</span>}
      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  )
}
