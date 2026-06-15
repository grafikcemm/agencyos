"use client"

import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  MapPin,
  Building2,
  ExternalLink,
  Copy,
  Check,
  X,
  PenLine,
  Search,
} from 'lucide-react'

interface Draft {
  id: string
  lang: 'tr' | 'en'
  subject: string | null
  body: string
  created_at: string
}

type Market = 'tr' | 'global'

interface Listing {
  id: string
  source: string
  url: string
  title: string
  company: string | null
  location: string | null
  remote: boolean
  status: string
  market: Market
  legitimacy: 'high' | 'caution' | 'suspicious' | null
  fit_score: number | null
  fit_reasons: string[]
  scam_flags: string[]
  scanned_at: string
  drafts: Draft[]
}

const LEGIT_BADGE: Record<string, { label: string; cls: string; Icon: typeof ShieldCheck }> = {
  high: { label: 'Güvenilir', cls: 'text-[var(--success)] bg-[var(--success)]/10 border-[var(--success)]/20', Icon: ShieldCheck },
  caution: { label: 'Dikkat', cls: 'text-[var(--warning)] bg-[var(--warning)]/10 border-[var(--warning)]/20', Icon: ShieldQuestion },
  suspicious: { label: 'Şüpheli', cls: 'text-[var(--danger)] bg-[var(--danger)]/10 border-[var(--danger)]/20', Icon: ShieldAlert },
}

function fitColor(score: number | null): string {
  if (score == null) return 'text-[var(--text-muted)]'
  if (score >= 75) return 'text-[var(--success)]'
  if (score >= 60) return 'text-[var(--accent)]'
  if (score >= 40) return 'text-[var(--warning)]'
  return 'text-[var(--text-muted)]'
}

export default function KariyerPage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'all' | 'tr' | 'global' | 'unfit'>('all')
  const [draftingId, setDraftingId] = useState<string | null>(null)
  const [draftError, setDraftError] = useState<{ id: string; msg: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs?limit=200', { credentials: 'include' })
      if (!res.ok) throw new Error('İlanlar yüklenemedi')
      const data = await res.json()
      setListings(Array.isArray(data.listings) ? data.listings : [])
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'İlanlar yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch
    load()
  }, [load])

  const runScan = async () => {
    setScanning(true)
    try {
      const res = await fetch('/api/jobs/scan', { method: 'POST', credentials: 'include' })
      if (!res.ok) throw new Error('Tarama başarısız')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Tarama başarısız')
    } finally {
      setScanning(false)
    }
  }

  const dismiss = async (id: string) => {
    setListings((prev) => prev.filter((l) => l.id !== id))
    await fetch('/api/jobs', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'dismissed' }),
    }).catch(() => load())
  }

  const requestDraft = async (id: string) => {
    setDraftingId(id)
    setDraftError(null)
    try {
      const res = await fetch(`/api/jobs/${id}/draft`, { method: 'POST', credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success || !data.draft) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Taslak üretilemedi')
      }
      // Dönen taslağı ilana ekle — reload beklemeden anında görünür.
      setListings((prev) =>
        prev.map((l) =>
          l.id === id ? { ...l, status: 'drafted', drafts: [data.draft as Draft, ...(l.drafts ?? [])] } : l,
        ),
      )
    } catch (e: unknown) {
      setDraftError({ id, msg: e instanceof Error ? e.message : 'Taslak üretilemedi' })
    } finally {
      setDraftingId(null)
    }
  }

  const copyDraft = async (draft: Draft) => {
    const text = draft.subject ? `Konu: ${draft.subject}\n\n${draft.body}` : draft.body
    await navigator.clipboard.writeText(text)
    setCopiedId(draft.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  // fit < 50 = "Uyumlu Değil" (skorlanmış ama düşük). null/skorlanmamış = uygun havuzda.
  const UNFIT_THRESHOLD = 50
  const isUnfit = (l: Listing) => l.fit_score != null && l.fit_score < UNFIT_THRESHOLD

  const active = listings.filter((l) => l.status !== 'dismissed')
  const fitList = active.filter((l) => !isUnfit(l)) // uygun + skorlanmamış
  const unfitList = active.filter(isUnfit)
  const trCount = fitList.filter((l) => l.market === 'tr').length
  const globalCount = fitList.filter((l) => l.market === 'global').length

  const visible =
    tab === 'unfit'
      ? unfitList
      : tab === 'all'
        ? fitList
        : fitList.filter((l) => l.market === tab)

  const TABS: { key: 'all' | 'tr' | 'global' | 'unfit'; label: string; count: number }[] = [
    { key: 'all', label: 'Hepsi', count: fitList.length },
    { key: 'tr', label: '🇹🇷 Türkiye', count: trCount },
    { key: 'global', label: '🌍 Global', count: globalCount },
    { key: 'unfit', label: '⚠️ Uyumlu Değil', count: unfitList.length },
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--bg-base)]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-black tracking-widest text-[var(--text-secondary)] uppercase">
            Kariyer Radarı
          </h2>
          <span className="text-[9px] text-[var(--text-muted)] font-bold tracking-wider uppercase border-l border-[var(--border-subtle)] pl-2">
            {visible.length} İLAN
          </span>
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="flex items-center gap-2 px-3 py-1.5 border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-highlight)] rounded-lg text-[10px] font-bold text-[var(--text-secondary)] transition-all uppercase tracking-wider disabled:opacity-50"
        >
          {scanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          {scanning ? 'Taranıyor' : 'İlan Tara'}
        </button>
      </div>

      {/* Pazar sekmeleri: Türkiye vs Global */}
      <div className="flex items-center gap-1.5 px-6 py-2.5 border-b border-[var(--border-subtle)] shrink-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wide transition-all ${
              tab === t.key
                ? 'bg-[var(--accent-muted)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_rgba(94,230,176,0.18)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5'
            }`}
          >
            {t.label}
            <span className="text-[9px] font-mono bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded px-1 py-0.5">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 flex-1 text-[var(--text-muted)]">
          <div className="w-6 h-6 rounded-full border-2 border-t-[var(--accent)] border-[var(--border-subtle)] animate-spin" />
          <span className="text-xs font-bold tracking-widest uppercase">İlanlar yükleniyor...</span>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-[var(--danger)] text-xs font-bold bg-[var(--danger)]/10 border border-[var(--danger)]/20 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
          <Search className="w-8 h-8" />
          <p className="text-xs font-bold tracking-wide">Henüz ilan yok. &quot;İlan Tara&quot; ile başlat.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-3 scrollbar-thin">
          {visible.map((l) => {
            const badge = l.legitimacy ? LEGIT_BADGE[l.legitimacy] : null
            return (
              <div
                key={l.id}
                className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-3 hover:border-[var(--border-highlight)] transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] inline-flex items-center gap-1"
                      >
                        {l.title}
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </a>
                      {badge && (
                        <span className={`inline-flex items-center gap-1 text-[9px] font-bold rounded px-1.5 py-0.5 border uppercase tracking-wider ${badge.cls}`}>
                          <badge.Icon className="w-2.5 h-2.5" /> {badge.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)] font-medium flex-wrap">
                      {l.company && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="w-2.5 h-2.5" /> {l.company}
                        </span>
                      )}
                      {(l.location || l.remote) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5" /> {l.remote ? 'Remote' : l.location}
                        </span>
                      )}
                      <span className="uppercase tracking-wider">{l.source}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className={`num text-lg font-black leading-none ${fitColor(l.fit_score)}`}>
                        {l.fit_score ?? '—'}
                      </div>
                      <div className="text-[8px] text-[var(--text-muted)] font-bold uppercase tracking-wider">fit</div>
                    </div>
                    <button
                      onClick={() => dismiss(l.id)}
                      title="İlgilenmiyorum"
                      className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {l.fit_reasons?.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {l.fit_reasons.map((r, i) => (
                      <li
                        key={i}
                        className="text-[10px] text-[var(--text-secondary)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded px-2 py-0.5"
                      >
                        {r}
                      </li>
                    ))}
                  </ul>
                )}

                {l.legitimacy === 'suspicious' && l.scam_flags?.length > 0 && (
                  <div className="text-[10px] text-[var(--danger)] bg-[var(--danger)]/5 border border-[var(--danger)]/15 rounded-lg px-2.5 py-1.5 space-y-0.5">
                    {l.scam_flags.map((f, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5 shrink-0" /> {f}
                      </div>
                    ))}
                  </div>
                )}

                {l.drafts?.length > 0 ? (
                  <div className="space-y-2">
                    {l.drafts.map((d) => (
                      <div key={d.id} className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                            Başvuru Taslağı ({d.lang})
                          </span>
                          <button
                            onClick={() => copyDraft(d)}
                            className="flex items-center gap-1 text-[9px] font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                          >
                            {copiedId === d.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {copiedId === d.id ? 'Kopyalandı' : 'Kopyala'}
                          </button>
                        </div>
                        {d.subject && (
                          <p className="text-[11px] font-semibold text-[var(--text-primary)]">{d.subject}</p>
                        )}
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{d.body}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <button
                      onClick={() => requestDraft(l.id)}
                      disabled={draftingId === l.id}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] border border-[var(--border-subtle)] hover:border-[var(--border-highlight)] rounded-lg px-2.5 py-1.5 transition-all uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {draftingId === l.id ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <PenLine className="w-3 h-3" />
                      )}
                      {draftingId === l.id ? 'Üretiliyor…' : 'Taslak üret'}
                    </button>
                    {draftError?.id === l.id && (
                      <p className="flex items-center gap-1 text-[9px] font-bold text-[var(--danger)]">
                        <AlertTriangle className="w-2.5 h-2.5 shrink-0" /> {draftError.msg}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
