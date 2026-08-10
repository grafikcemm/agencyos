"use client"

// ARŞİV — ROTAYA BAĞLI DEĞİL (2026-08-10).
//
// Kariyer Radarı AgencyOS kapsamından çıkarıldı. Bu dosya `src/app/(os)/kariyer/page.tsx`
// konumundan buraya TAŞINDI (git geçmişi korunur) ki GrafikcemOS Kariyer Ajanı devri
// sırasında referans arayüz kaybolmasın. Hiçbir yerden import EDİLMEZ ve render edilmez.
// Devir envanteri: docs/CAREER-HANDOFF-2026-08-10.md

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
  Sparkles,
  Clock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { classifyVisibility, isAgencySource, isStale, type Visibility } from '@/lib/jobs/scoring'
import type { ScanStats } from '@/lib/jobs/scan'
import { PageHeader } from '@/components/ui/PageHeader'

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
  posted_at: string | null
  scanned_at: string
  drafts: Draft[]
}

// Skorlanmamış (yeni/değerlendiriliyor) ilan henüz elenmez → 'show' (beklemede).
// Skorlanmışta scoring.ts merkezi kuralı: show / gray / rejected.
function visibilityOf(l: Listing): Visibility {
  if (l.fit_score == null) return 'show'
  return classifyVisibility(l.fit_score, l.legitimacy, l.posted_at)
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

export default function KariyerRadarClient() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanStats, setScanStats] = useState<ScanStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'all' | 'tr' | 'global'>('all')
  const [showGray, setShowGray] = useState(false)
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
      // TARAMA İSTATİSTİĞİ EKRANA TAŞINIR.
      //
      // Önce: tarama koştu, `ScanStats` üretti, hiçbir yerde gösterilmedi.
      // Ekranda yalnız "Henüz ilan yok" yazıyordu — bu cümle iki tamamen
      // farklı durumu aynı gösteriyordu: (a) tarama hiç koşmadı, (b) koştu,
      // 300 ilan çekti, hepsi filtreye takıldı. İlki bir kurulum sorunu,
      // ikincisi bir filtre kararı. Aynı ekranı görüp farklı şey yapmak
      // gerekiyordu.
      // `/api/jobs/scan` istatistikleri ÜST SEVİYEDE döndürüyor
      // (`{ success, fetched, filtered, ... }`). API sözleşmesi değiştirilmedi;
      // istemci ona uyuyor.
      const payload = (await res.json().catch(() => null)) as (ScanStats & { success?: boolean }) | null
      if (payload && typeof payload.fetched === 'number') {
        setScanStats({
          fetched: payload.fetched,
          filtered: payload.filtered,
          inserted: payload.inserted,
          duplicates: payload.duplicates,
          enqueued: payload.enqueued,
          errors: payload.errors ?? [],
          rejections: payload.rejections,
        })
      }
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

  // Karma eleme: 'rejected' API'de zaten gizli. Burada show (varsayılan) vs gray (katlanır).
  // Ajans kaynaklı ilanlar fit-sırası içinde öne alınır (bonus skoru zaten üste taşır,
  // eşitlikte ajansı öncele).
  const active = listings.filter((l) => l.status !== 'dismissed')
  const byAgencyThenFit = (a: Listing, b: Listing) => {
    const ag = Number(isAgencySource(b.source)) - Number(isAgencySource(a.source))
    if (ag !== 0) return ag
    return (b.fit_score ?? 0) - (a.fit_score ?? 0)
  }
  const showAll = active.filter((l) => visibilityOf(l) === 'show').sort(byAgencyThenFit)
  const grayList = active.filter((l) => visibilityOf(l) === 'gray').sort(byAgencyThenFit)
  const trCount = showAll.filter((l) => l.market === 'tr').length
  const globalCount = showAll.filter((l) => l.market === 'global').length

  const visible = tab === 'all' ? showAll : showAll.filter((l) => l.market === tab)

  const TABS: { key: 'all' | 'tr' | 'global'; label: string; count: number }[] = [
    { key: 'all', label: 'Hepsi', count: showAll.length },
    { key: 'tr', label: '🇹🇷 Türkiye', count: trCount },
    { key: 'global', label: '🌍 Global', count: globalCount },
  ]

  const renderListing = (l: Listing) => {
    const badge = l.legitimacy ? LEGIT_BADGE[l.legitimacy] : null
    const agency = isAgencySource(l.source)
    const stale = isStale(l.posted_at)
    const pending = l.fit_score == null
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
              {agency && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold rounded px-1.5 py-0.5 border uppercase tracking-wider text-[var(--accent)] bg-[var(--accent)]/10 border-[var(--accent)]/20">
                  <Sparkles className="w-2.5 h-2.5" /> Ajans
                </span>
              )}
              {stale && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold rounded px-1.5 py-0.5 border uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-elevated)] border-[var(--border-subtle)]">
                  <Clock className="w-2.5 h-2.5" /> Eski
                </span>
              )}
              {pending && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold rounded px-1.5 py-0.5 border uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-elevated)] border-[var(--border-subtle)]">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Değerlendiriliyor
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
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--bg-base)]">
      <PageHeader
        eyebrow="// Kariyer"
        title="Kariyer Radarı"
        description="Taramayı, eleme nedenlerini ve portföy kanıtı ihtiyacını tek karar yüzeyinde gör."
        meta={`${visible.length} ilan`}
        compact
        className="mx-6 mt-5 shrink-0"
        actions={(
          <button
            onClick={runScan}
            disabled={scanning}
            className="pressable flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:border-[var(--border-highlight)] disabled:opacity-50"
          >
            {scanning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {scanning ? 'Taranıyor' : 'İlan tara'}
          </button>
        )}
      />

      {/* Pazar sekmeleri: Türkiye vs Global */}
      <div className="flex items-center gap-1.5 px-6 py-2.5 border-b border-[var(--border-subtle)] shrink-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wide transition-all ${
              tab === t.key
                ? 'bg-[var(--accent-muted)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_rgba(94,230,176,0.18)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'
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
      ) : showAll.length === 0 && grayList.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-[var(--text-muted)]">
          <Search className="w-8 h-8" />
          {!scanStats ? (
            <p className="text-xs font-bold tracking-wide">
              Henüz tarama yapılmadı. &quot;İlan Tara&quot; ile başlat.
            </p>
          ) : (
            // Tarama KOŞTU ama sonuç boş. Nedeni gösterilmezse kullanıcı
            // "sistem bozuk" ile "filtre sıkı" arasında ayrım yapamaz.
            <div className="w-full max-w-md text-center">
              <p className="text-xs font-bold tracking-wide text-[var(--text-secondary)]">
                Tarama çalıştı, gösterilecek ilan çıkmadı.
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-left text-[11px]">
                <dt className="text-[var(--text-tertiary)]">çekilen</dt>
                <dd className="tabular-nums text-[var(--text-secondary)]">{scanStats.fetched}</dd>
                <dt className="text-[var(--text-tertiary)]">filtreyi geçen</dt>
                <dd className="tabular-nums text-[var(--text-secondary)]">{scanStats.filtered}</dd>
                <dt className="text-[var(--text-tertiary)]">eklenen</dt>
                <dd className="tabular-nums text-[var(--text-secondary)]">{scanStats.inserted}</dd>
                <dt className="text-[var(--text-tertiary)]">tekrar</dt>
                <dd className="tabular-nums text-[var(--text-secondary)]">{scanStats.duplicates}</dd>
              </dl>

              {scanStats.rejections && scanStats.rejections.totalRejected > 0 && (
                <div className="mt-3 rounded-lg border border-[var(--border-subtle)] p-3 text-left">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    eleme nedeni
                  </p>
                  <ul className="mt-1.5 space-y-1 text-[11px] text-[var(--text-secondary)]">
                    <li>DENY kelimesi: {scanStats.rejections.byCode.deny_keyword}</li>
                    <li>ALLOW kelimesi yok: {scanStats.rejections.byCode.no_allow_keyword}</li>
                    <li>yurt dışı konum: {scanStats.rejections.byCode.location_foreign}</li>
                    <li>eksik alan: {scanStats.rejections.byCode.missing_fields}</li>
                  </ul>
                  {scanStats.rejections.topDenyKeywords.length > 0 && (
                    <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">
                      En çok eleyen:{' '}
                      {scanStats.rejections.topDenyKeywords
                        .slice(0, 3)
                        .map((k) => `${k.keyword} (${k.count})`)
                        .join(', ')}
                    </p>
                  )}
                </div>
              )}

              {scanStats.errors.length > 0 && (
                <p className="mt-3 text-[11px] text-[var(--danger)]">
                  {scanStats.errors.length} kaynak hata verdi: {scanStats.errors[0]}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-3 scrollbar-thin">
          {visible.map(renderListing)}

          {/* Gri bölge: orta uyum (fit [40,60)) — karma elemenin "sakla-ama-gizle" katmanı. */}
          {grayList.length > 0 && (
            <div className="pt-2 border-t border-[var(--border-subtle)] mt-4">
              <button
                onClick={() => setShowGray((v) => !v)}
                className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] uppercase tracking-wider transition-colors py-1"
              >
                {showGray ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Gri bölge — orta uyum
                <span className="text-[9px] font-mono bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded px-1 py-0.5">
                  {grayList.length}
                </span>
              </button>
              {showGray && <div className="space-y-3 mt-3 opacity-75">{grayList.map(renderListing)}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
