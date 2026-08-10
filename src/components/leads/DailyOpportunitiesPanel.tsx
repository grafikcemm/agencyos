"use client"

// Bugünün 2 Fırsatı — Lead Intelligence v2 karar yüzeyi.
// Kanıtlar (URL + zaman + güven + doğrulanma), bağımsız Tasarım/AI skorları,
// ana/ikincil hizmet, "satma" uyarısı ve Uygun/Uygun değil geri bildirimi.
// Filtreler server-side: alan, aile, kanıt kapsamı, güven.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Target, ShieldCheck, ShieldAlert, AlertTriangle, ThumbsUp, ThumbsDown,
  ExternalLink, Loader2, RefreshCw, Phone, Globe, ChevronDown, ChevronUp, Eye,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'

type Domain = 'tasarim' | 'ai_otomasyon' | 'hibrit'

const DOMAIN_LABEL: Record<Domain, string> = {
  tasarim: 'Tasarım',
  ai_otomasyon: 'AI & Otomasyon',
  hibrit: 'Hibrit',
}

const KIND_LABEL: Record<string, string> = {
  pagespeed: 'PageSpeed',
  screenshot: 'Ekran Görüntüsü',
  html_signal: 'Site Sinyali',
  cta_analysis: 'CTA Analizi',
  form_analysis: 'Form Analizi',
  tech_stack: 'Teknoloji',
  review_signal: 'Yorum Sinyali',
  places_data: 'Google Kaydı',
}

const REASON_OPTIONS = [
  { value: 'yanlis_sektor', label: 'Yanlış sektör' },
  { value: 'zayif_kanit', label: 'Zayıf kanıt' },
  { value: 'hizmet_uyumsuz', label: 'Hizmet uyumsuz' },
  { value: 'fiyat_uyumsuz', label: 'Fiyat uyumsuz' },
  { value: 'zaten_cozulmus', label: 'Zaten çözülmüş' },
  { value: 'dusuk_potansiyel', label: 'Düşük potansiyel' },
  { value: 'diger', label: 'Diğer' },
]

interface EvidenceRow {
  id: string
  kind: string
  source: string
  url: string | null
  summary: string | null
  confidence: number
  verified: boolean
  collected_at: string
  screenshot_url: string | null
}

interface Opportunity {
  assessment_id: string
  lead_id: string | null
  business_name: string
  sector: string | null
  city: string | null
  district: string | null
  phone: string | null
  website: string | null
  selected: boolean
  shadow: boolean
  mode: string
  design_score: number | null
  ai_score: number | null
  verified_evidence_count: number
  chair: {
    decision: string | null
    primary_service_slug: string | null
    primary_service_name: string | null
    secondary_service_slug: string | null
    secondary_service_name: string | null
    oversell_warning: boolean
    oversell_note: string | null
  }
  domain: Domain | null
  family: string | null
  matches: Array<{ id: string; service_slug: string; service_name: string; rank: number; score: number; reasons: string[] }>
  evidence: EvidenceRow[]
}

export function DailyOpportunitiesPanel({ embedded = false }: { embedded?: boolean }) {
  const [opportunities, setOpportunities] = useState<Opportunity[] | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [domainFilter, setDomainFilter] = useState<Domain | 'all'>('all')
  const [familyFilter, setFamilyFilter] = useState<string>('all')
  const [minEvidence, setMinEvidence] = useState<number>(0)
  const [showAll, setShowAll] = useState(false)
  const [shadowTotals, setShadowTotals] = useState<{ costUsd: number; v2SelectedCount: number; overlapCount: number; legacyPickCount: number } | null>(null)

  const fetchOpportunities = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (domainFilter !== 'all') params.set('domain', domainFilter)
      if (familyFilter !== 'all') params.set('family', familyFilter)
      if (minEvidence > 0) params.set('evidenceCoverage', String(minEvidence))
      if (showAll) params.set('all', 'true')
      const res = await fetch(`/api/leads/daily-opportunities?${params.toString()}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Fırsatlar yüklenemedi')
      setOpportunities(json.data.opportunities as Opportunity[])
      setNote(json.data.note ?? null)
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Fırsatlar yüklenemedi')
    }
  }, [domainFilter, familyFilter, minEvidence, showAll])

  // Mount + filtre değişiminde yükle (harita/page.tsx ile aynı desen).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchOpportunities() }, [fetchOpportunities])

  // Shadow karşılaştırma kartı (shadow satırı varsa göster).
  const hasShadow = useMemo(() => (opportunities ?? []).some((o) => o.shadow), [opportunities])
  useEffect(() => {
    if (!hasShadow) return
    fetch('/api/admin/lead-intel-comparison?days=7')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setShadowTotals(json.data.totals)
      })
      .catch(() => {})
  }, [hasShadow])

  const families = useMemo(() => {
    const set = new Set<string>()
    for (const o of opportunities ?? []) if (o.family) set.add(o.family)
    return [...set].sort()
  }, [opportunities])

  return (
    <div className={embedded ? 'h-full overflow-y-auto p-4 md:p-6 scrollbar-thin' : 'h-full overflow-y-auto p-6 scrollbar-thin'}>
      <div className="space-y-5 max-w-[1100px]">
        <PageHeader
          eyebrow="// Lead intelligence"
          title={<span className="flex items-center gap-2"><Target className="h-5 w-5" /> Bugünün fırsatları</span>}
          description="Kanıta dayalı, konseyden geçmiş karar-hazır fırsatlar. Günde en fazla iki aday; zayıf aday kota doldurmaz."
          compact
          actions={(
            <button
              onClick={fetchOpportunities}
              className="pressable flex items-center gap-1.5 rounded-full bg-[var(--bg-elevated)] px-3 py-1.5 text-[10px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
            >
              <RefreshCw className="h-3 w-3" /> Yenile
            </button>
          )}
        />

        {shadowTotals && (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2 flex items-center gap-1.5">
              <Eye className="w-3 h-3" /> Shadow Karşılaştırma (7 gün)
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <ShadowStat label="v2 seçimi" value={String(shadowTotals.v2SelectedCount)} />
              <ShadowStat label="Eski seçim" value={String(shadowTotals.legacyPickCount)} />
              <ShadowStat label="Kesişim" value={String(shadowTotals.overlapCount)} />
              <ShadowStat label="Maliyet" value={`$${shadowTotals.costUsd.toFixed(4)}`} />
            </div>
            <p className="text-[9px] text-[var(--text-muted)] mt-2">
              Shadow modda v2 yalnız gözlemler — lead seçimi ve dış iletişim etkilenmez.
            </p>
          </div>
        )}

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-3 flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 bg-[var(--bg-base)] p-0.5 rounded-md border border-[var(--border-subtle)]">
            <FilterChip active={domainFilter === 'all'} onClick={() => setDomainFilter('all')}>Tüm alanlar</FilterChip>
            {(Object.keys(DOMAIN_LABEL) as Domain[]).map((d) => (
              <FilterChip key={d} active={domainFilter === d} onClick={() => setDomainFilter(d)}>{DOMAIN_LABEL[d]}</FilterChip>
            ))}
          </div>
          <select
            value={familyFilter}
            onChange={(e) => setFamilyFilter(e.target.value)}
            aria-label="Hizmet ailesi"
            className="bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[10px] py-1 px-2 rounded-md text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
          >
            <option value="all">Tüm aileler</option>
            {families.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select
            value={minEvidence}
            onChange={(e) => setMinEvidence(Number(e.target.value))}
            aria-label="Kanıt kapsamı"
            className="bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[10px] py-1 px-2 rounded-md text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
          >
            <option value={0}>Kanıt: tümü</option>
            <option value={2}>≥2 doğrulanmış</option>
            <option value={4}>≥4 doğrulanmış</option>
            <option value={6}>≥6 doğrulanmış</option>
          </select>
          <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)] cursor-pointer ml-auto">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-[var(--accent)]" />
            Seçilmeyenleri de göster
          </label>
        </div>

        {loadError && (
          <div className="text-center py-8 bg-[var(--bg-surface)] border border-[var(--danger)]/30 rounded-xl text-sm text-[var(--danger)]">{loadError}</div>
        )}
        {!opportunities && !loadError && (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Fırsatlar yükleniyor…
          </div>
        )}
        {opportunities && opportunities.length === 0 && (
          <div className="text-center py-16 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl">
            <div className="text-sm text-[var(--text-muted)] mb-1">Bugün için fırsat yok</div>
            <div className="text-[10px] text-[var(--text-muted)]">
              {note ?? 'Kalite tabanını geçen aday çıkmadıysa kota zorla doldurulmaz — bu bilinçli bir tasarım.'}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {(opportunities ?? []).map((o) => (
            <OpportunityCard key={o.assessment_id} opportunity={o} onFeedback={fetchOpportunities} />
          ))}
        </div>
      </div>
    </div>
  )
}


function OpportunityCard({ opportunity: o, onFeedback }: { opportunity: Opportunity; onFeedback: () => void }) {
  const [evidenceOpen, setEvidenceOpen] = useState(false)

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
      <div className="p-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-[var(--text-primary)]">{o.business_name}</h2>
            {o.selected && (
              <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
                Günün Fırsatı
              </span>
            )}
            {o.shadow && (
              <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                Shadow
              </span>
            )}
            {o.mode === 'deterministic' && (
              <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                Deterministik
              </span>
            )}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-3 flex-wrap">
            <span>{[o.sector, o.district, o.city].filter(Boolean).join(' · ')}</span>
            {o.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{o.phone}</span>}
            {o.website && (
              <a href={o.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[var(--accent)] hover:underline">
                <Globe className="w-3 h-3" /> Site <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        </div>
        <div className="flex gap-4">
          <ScoreBar label="Tasarım" score={o.design_score} />
          <ScoreBar label="AI" score={o.ai_score} />
        </div>
      </div>

      {o.chair.oversell_warning && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-lg bg-[var(--warning)]/10 border border-[var(--warning)]/30 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)] shrink-0 mt-0.5" />
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--warning)]">Satma uyarısı</div>
            <div className="text-[11px] text-[var(--text-secondary)]">
              {o.chair.oversell_note ?? 'Vaadi kanıtın önüne geçirme — görüşmede yalnız doğrulanmış bulguları kullan.'}
            </div>
          </div>
        </div>
      )}

      <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
        {o.chair.primary_service_name && (
          <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
            Ana: {o.chair.primary_service_name}
          </span>
        )}
        {o.chair.secondary_service_name && (
          <span className="text-[10px] px-2 py-1 rounded-md bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
            İkincil: {o.chair.secondary_service_name}
          </span>
        )}
        {o.domain && (
          <span className="text-[9px] uppercase tracking-widest font-bold text-[var(--text-muted)]">{DOMAIN_LABEL[o.domain]}{o.family ? ` · ${o.family}` : ''}</span>
        )}
        <span className="text-[9px] text-[var(--text-muted)] ml-auto flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" /> {o.verified_evidence_count} doğrulanmış kanıt
        </span>
      </div>

      <button
        onClick={() => setEvidenceOpen(!evidenceOpen)}
        className="w-full py-2 text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)] border-t border-[var(--border-subtle)] flex items-center justify-center gap-1 transition-colors"
      >
        Kanıtlar ({o.evidence.length}) {evidenceOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {evidenceOpen && (
        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-base)]/40 space-y-2">
          {o.evidence.length === 0 && (
            <div className="text-[11px] text-[var(--text-muted)]">Kanıt kaydı yok (shadow adayı olabilir — lead insert edilmedi).</div>
          )}
          {o.evidence.map((e) => (
            <div key={e.id} className="flex items-start gap-2 p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              {e.verified
                ? <ShieldCheck className="w-3.5 h-3.5 text-[var(--success)] shrink-0 mt-0.5" />
                : <ShieldAlert className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 mt-0.5" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">{KIND_LABEL[e.kind] ?? e.kind}</span>
                  <span className="text-[9px] text-[var(--text-muted)]">güven {(e.confidence * 100).toFixed(0)}%</span>
                  <span className="text-[9px] text-[var(--text-muted)]">{new Date(e.collected_at).toLocaleString('tr-TR')}</span>
                  {e.url && (
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-[var(--accent)] hover:underline flex items-center gap-0.5">
                      kaynak <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">{e.summary}</div>
                {e.screenshot_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.screenshot_url}
                    alt={`${o.business_name} site ekran görüntüsü`}
                    className="mt-2 rounded-lg border border-[var(--border-subtle)] max-w-full w-[420px]"
                    loading="lazy"
                  />
                )}
              </div>
            </div>
          ))}

          {o.matches.length > 0 && (
            <div className="pt-2">
              <div className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">Hizmet eşleşmeleri (deterministik)</div>
              {o.matches.map((m) => (
                <div key={m.id} className="text-[10px] text-[var(--text-secondary)] flex items-center gap-2">
                  <span className="font-bold text-[var(--text-primary)]">#{m.rank}</span>
                  <span>{m.service_name}</span>
                  <span className="text-[var(--text-muted)]">skor {m.score}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {o.lead_id && <FeedbackRow leadId={o.lead_id} assessmentId={o.assessment_id} onDone={onFeedback} />}
    </div>
  )
}

function FeedbackRow({ leadId, assessmentId, onDone }: { leadId: string; assessmentId: string; onDone: () => void }) {
  const [pending, setPending] = useState<'uygun' | 'uygun_degil' | null>(null)
  const [reason, setReason] = useState<string>('zayif_kanit')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const send = async (verdict: 'uygun' | 'uygun_degil') => {
    setSending(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { verdict, assessment_id: assessmentId }
      if (verdict === 'uygun_degil') body.reason_code = reason
      const res = await fetch(`/api/leads/${leadId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Gönderilemedi')
      setSent(verdict)
      setPending(null)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gönderilemedi')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="px-4 py-2.5 border-t border-[var(--border-subtle)] text-[10px] text-[var(--success)] font-bold">
        Geri bildirim kaydedildi: {sent === 'uygun' ? 'Uygun' : 'Uygun değil'} — öğrenme döngüsüne işlendi.
      </div>
    )
  }

  return (
    <div className="px-4 py-2.5 border-t border-[var(--border-subtle)] flex items-center gap-2 flex-wrap">
      <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">Bu eşleşme:</span>
      <button
        onClick={() => send('uygun')}
        disabled={sending}
        className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--cta-bg,#ffffff)] text-[var(--cta-fg,#000000)] text-[10px] font-black hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        <ThumbsUp className="w-3 h-3" /> Uygun
      </button>
      {pending !== 'uygun_degil' ? (
        <button
          onClick={() => setPending('uygun_degil')}
          disabled={sending}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--bg-elevated)] text-[var(--text-primary)] text-[10px] font-bold hover:bg-[var(--bg-base)] disabled:opacity-50 transition-colors"
        >
          <ThumbsDown className="w-3 h-3" /> Uygun değil
        </button>
      ) : (
        <span className="flex items-center gap-1.5">
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Neden uygun değil"
            className="bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[10px] py-1 px-2 rounded-md text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
          >
            {REASON_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <button
            onClick={() => send('uygun_degil')}
            disabled={sending}
            className="px-3 py-1.5 rounded-full bg-[var(--bg-elevated)] text-[var(--text-primary)] text-[10px] font-bold hover:bg-[var(--bg-base)] disabled:opacity-50 transition-colors"
          >
            {sending ? 'Gönderiliyor…' : 'Gönder'}
          </button>
          <button onClick={() => setPending(null)} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">Vazgeç</button>
        </span>
      )}
      {error && <span className="text-[10px] text-[var(--danger)]">{error}</span>}
    </div>
  )
}

function ScoreBar({ label, score }: { label: string; score: number | null }) {
  const value = score ?? 0
  return (
    <div className="w-24">
      <div className="flex justify-between items-baseline">
        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">{label}</span>
        <span className="num text-xs font-black text-[var(--text-primary)]">{score ?? '—'}</span>
      </div>
      <div className="h-1.5 mt-1 rounded-full bg-[var(--bg-base)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--text-primary)] transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, value))}%`, opacity: value >= 70 ? 1 : 0.4 }}
        />
      </div>
    </div>
  )
}

function ShadowStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="num text-sm font-black text-[var(--text-primary)]">{value}</div>
      <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)]">{label}</div>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-[9px] font-bold rounded transition-all ${
        active
          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
      }`}
    >
      {children}
    </button>
  )
}
