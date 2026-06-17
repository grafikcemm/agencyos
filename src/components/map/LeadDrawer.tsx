"use client"

import { useMemo, useState, useEffect } from 'react'
import { X, Phone, Globe, MapPin, Star, Zap, FileText, Briefcase, Copy, MessageCircle, Mail, RefreshCw } from 'lucide-react'
import { enrichLead, EnrichedLead } from '@/lib/enrichLead'
import { buildProposal } from '@/lib/proposalBuilder'
import type { Lead, Proposal } from '@/lib/types'

interface LeadDrawerProps {
  lead: Partial<Lead> & { id: string; business_name: string }
  onClose: () => void
  onAnalyze?: (leadId: string) => void
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: 'YENİ', color: '#378ADD' },
  contacted: { label: 'İLETİŞİM', color: '#BA7517' },
  responded: { label: 'YANIT', color: '#8B5CF6' },
  meeting: { label: 'TOPLANTI', color: '#3B82F6' },
  proposal: { label: 'TEKLİF', color: '#E8440A' },
  converted: { label: 'KAZANILDI', color: '#1D9E75' },
  lost: { label: 'KAYIP', color: '#EF4444' },
  waiting: { label: 'BEKLEME', color: '#6B7280' },
}

function formatTL(n: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n || 0)
}

// Normalize a Turkish phone to wa.me digits (e.g. "0534 887 14 35" -> "905348871435").
function normalizeTrPhone(phone: string): string {
  const d = (phone || '').replace(/\D/g, '')
  if (d.startsWith('90')) return d
  if (d.startsWith('0')) return '90' + d.slice(1)
  if (d.length === 10) return '90' + d
  return d
}

function waLink(phone: string, text?: string): string {
  const d = normalizeTrPhone(phone)
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

const SUB_SCORE_LABELS: Record<string, string> = {
  sectorFit: 'Sektör Uyumu',
  budgetPotential: 'Ödeme Gücü',
  painIntensity: 'Problem Şiddeti',
  digitalMaturity: 'Dijital Olgunluk',
  offerFit: 'Hizmet Eşleşmesi',
  urgency: 'Aciliyet',
  accessibility: 'Ulaşılabilirlik',
  trustSignals: 'Güven Sinyalleri',
}

export function LeadDrawer(props: LeadDrawerProps) {
  // Remount the drawer when the selected lead changes so per-lead state
  // (email draft, apollo result) resets cleanly — no setState-in-effect needed.
  return <LeadDrawerInner key={props.lead.id} {...props} />
}

function LeadDrawerInner({ lead: rawLead, onClose }: LeadDrawerProps) {
  const lead: EnrichedLead = useMemo(() => {
    if (rawLead && 'nextAction' in rawLead && 'scores' in rawLead) {
      return rawLead as EnrichedLead
    }
    return enrichLead(rawLead)
  }, [rawLead])

  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<string | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [proposalView, setProposalView] = useState<'whatsapp' | 'email'>('whatsapp')
  const [copied, setCopied] = useState(false)
  const [apolloConfigured, setApolloConfigured] = useState<boolean | null>(null)
  const [enrichingApollo, setEnrichingApollo] = useState(false)
  const [apolloResult, setApolloResult] = useState<string | null>(null)
  const [emailDraft, setEmailDraft] = useState<{ id: string; subject: string | null; body: string } | null>(null)
  const [draftingEmail, setDraftingEmail] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/enrichment/apollo')
      .then(res => res.json())
      .then(data => setApolloConfigured(!!data.configured))
      .catch(() => setApolloConfigured(false))
  }, [])

  // Drawer açıldığında lead'in son soğuk e-posta taslağını yükle.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/leads/${rawLead.id}/cold-email`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data?.draft) setEmailDraft(data.draft)
      })
      .catch(() => { /* taslak yoksa sessiz geç */ })
    return () => { cancelled = true }
  }, [rawLead.id])

  // Close the drawer on Escape — expected behavior for an overlay panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleApolloEnrich = async () => {
    if (enrichingApollo) return
    setEnrichingApollo(true)
    setApolloResult(null)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 18000)

    try {
      const res = await fetch('/api/enrichment/apollo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id }),
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      const data = await res.json()
      if (res.status === 503) {
        setApolloResult('Apollo kapalı / API key yok')
      } else if (data.success) {
        const parts = [
          `🏢 Şirket: ${data.org_name || 'Bilinmiyor'}`,
          `💼 Sektör: ${data.industry || 'Belirtilmemiş'}`,
          `👥 Çalışan Sayısı: ${data.employees || 'Bilinmiyor'}`,
        ]
        if (data.linkedin) {
          parts.push(`🔗 LinkedIn: ${data.linkedin}`)
        }
        const stateLabel = data.cached ? ' [Önbellek]' : ' [Taze]'
        setApolloResult(`Apollo Başarılı!${stateLabel}\n\n${parts.join('\n')}`)
      } else {
        setApolloResult(`Apollo Hatası: ${data.error || 'Enrichment başarısız'}`)
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      const errName = err instanceof Error ? err.name : ''
      if (errName === 'AbortError') {
        setApolloResult('Apollo Zaman Aşımı: İstek 18 saniye içinde yanıt vermedi.')
      } else {
        setApolloResult('Bağlantı hatası oluştu.')
      }
    } finally {
      setEnrichingApollo(false)
    }
  }

  const handleDraftEmail = async () => {
    if (draftingEmail) return
    setDraftingEmail(true)
    setEmailError(null)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    try {
      const res = await fetch(`/api/leads/${lead.id}/cold-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      })
      const data = await res.json()
      if (data.success && data.draft) {
        setEmailDraft(data.draft)
      } else {
        setEmailError(data.error || 'Taslak üretilemedi, tekrar deneyin.')
      }
    } catch (err: unknown) {
      const errName = err instanceof Error ? err.name : ''
      if (errName === 'AbortError') {
        setEmailError('Zaman aşımı: taslak 30 saniye içinde üretilemedi.')
      } else {
        setEmailError('Bağlantı hatası oluştu.')
      }
    } finally {
      clearTimeout(timeoutId)
      setDraftingEmail(false)
    }
  }

  const statusInfo = STATUS_LABELS[lead.status] || STATUS_LABELS.new

  const handleAnalyze = async () => {
    if (analyzing) return
    setAnalyzing(true)
    setAnalysisResult(null)
    try {
      const res = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Lead analiz et: ${lead.business_name} (ID: ${lead.id})` })
      })
      const data = await res.json()
      setAnalysisResult(data.reply || 'Analiz tamamlandı.')
    } catch {
      setAnalysisResult('Analiz başarısız oldu.')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleBuildProposal = () => {
    const offerIds = (lead.recommended_offers || []).map(o => o.offerId)
    if (!offerIds.length) {
      setProposal(null)
      return
    }
    const p = buildProposal({
      lead: { id: lead.id, business_name: lead.business_name, sector: lead.sector, pain_points: lead.pain_points },
      offerIds,
    })
    setProposal(p)
  }

  const handleConvertToProject = async () => {
    try {
      await fetch('/api/db/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lead.id, status: 'converted' })
      })
      onClose()
    } catch { /* ignore */ }
  }

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const subScores = lead.scores || {
    sectorFit: 0, budgetPotential: 0, painIntensity: 0, digitalMaturity: 0,
    offerFit: 0, urgency: 0, accessibility: 0, trustSignals: 0, total: lead.potential_score || 0,
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[500] transition-opacity" onClick={onClose} />

      <div className="fixed top-0 right-0 h-full w-[440px] bg-[var(--glass-bg)] backdrop-blur-xl border-l border-[var(--border-highlight)] z-[501] flex flex-col animate-slideInRight shadow-2xl">

        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] truncate">{lead.business_name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span
                className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded"
                style={{ color: statusInfo.color, background: `${statusInfo.color}15`, border: `1px solid ${statusInfo.color}30` }}
              >
                {statusInfo.label}
              </span>
              {lead.sector && <span className="text-[10px] text-[var(--text-muted)] font-medium">{lead.sector}</span>}
              {lead.city && <span className="text-[10px] text-[var(--text-muted)]">{lead.city}{lead.district ? ` / ${lead.district}` : ''}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* PRIMARY CONTACT ACTIONS — calling is the #1 daily action, keep it
            unmissable and always visible above the scroll area. */}
        {lead.phone && (
          <div className="px-5 py-3 border-b border-[var(--border-subtle)] shrink-0 grid grid-cols-2 gap-2 bg-[var(--bg-base)]/40">
            <a
              href={`tel:${lead.phone}`}
              className="flex items-center justify-center gap-2 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-bold rounded-lg transition-all"
            >
              <Phone className="w-4 h-4" />
              Ara
            </a>
            <a
              href={waLink(lead.phone, lead.first_message || undefined)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-2.5 bg-[#25D366]/15 border border-[#25D366]/40 hover:bg-[#25D366]/25 text-[#25D366] text-sm font-bold rounded-lg transition-all"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </a>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin">

          {/* QUALITY HEADER */}
          {lead.quality_label && (
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-black tracking-widest uppercase px-2 py-1 rounded border ${
                lead.quality_label === 'Nokta Atışı' ? 'bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]/30' :
                lead.quality_label === 'Çok Güçlü' ? 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20' :
                lead.quality_label === 'Takip Edilebilir' ? 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20' :
                lead.quality_label === 'Ele' ? 'bg-[var(--text-muted)]/10 text-[var(--text-muted)] border-[var(--text-muted)]/20' :
                'bg-[var(--fire)]/10 text-[var(--fire)] border-[var(--fire)]/20'
              }`}>{lead.quality_label}</span>
              {(lead.conversion_probability ?? 0) > 0 && (
                <span className="text-[11px] font-semibold text-[var(--text-muted)]" title="Model tahmini — gerçek dönüşüm satış icraatına bağlıdır.">
                  Dönüşüm tahmini: <span className="font-bold text-[var(--accent)]">~%{lead.conversion_probability}</span>
                </span>
              )}
            </div>
          )}

          {/* WHY THIS WILL CONVERT */}
          {lead.why_this_will_convert && !lead.disqualification_reason && (
            <div className="bg-[var(--accent-muted)] border border-[var(--accent)]/20 rounded-xl p-3">
              <div className="text-[9px] font-bold tracking-widest uppercase text-[var(--accent)] mb-1">Neden Dönüşebilir?</div>
              <p className="text-[11px] text-[var(--text-primary)] leading-relaxed">{lead.why_this_will_convert}</p>
            </div>
          )}

          {/* NEDEN ŞİMDİ */}
          {lead.why_now && (
            <div className="bg-[var(--warning)]/10 border border-[var(--warning)]/30 rounded-xl p-4 space-y-2">
              <div className="text-[10px] font-black tracking-widest uppercase text-[var(--warning)]">Neden Şimdi?</div>
              <p className="text-xs text-[var(--text-primary)] leading-relaxed">{lead.why_now}</p>
              {Array.isArray(lead.pain_signals) && lead.pain_signals.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {lead.pain_signals.map((s, i) => (
                    <span key={i} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/20">{s}</span>
                  ))}
                </div>
              )}
              {Array.isArray(lead.proof_points) && lead.proof_points.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {lead.proof_points.map((s, i) => (
                    <span key={i} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20">✓ {s}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {lead.disqualification_reason && (
            <div className="bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-xl p-4">
              <div className="text-[10px] font-black tracking-widest uppercase text-[var(--danger)] mb-1">Elendi</div>
              <p className="text-xs text-[var(--danger)]">{lead.disqualification_reason}</p>
            </div>
          )}

          <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase">Öncelik Skoru</div>
                <div className="text-[9px] text-[var(--text-muted)] mt-0.5 uppercase tracking-wider">{lead.priority === 'high' ? 'Yüksek' : lead.priority === 'low' ? 'Düşük' : 'Normal'} öncelik</div>
              </div>
              <span className="text-3xl font-black text-[var(--accent)]">{subScores.total}</span>
            </div>
            <div className="w-full h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden mb-3">
              <div className="h-full rounded-full transition-all duration-500" style={{
                width: `${Math.min(subScores.total, 100)}%`,
                background: subScores.total >= 80 ? '#1D9E75' : subScores.total >= 65 ? '#BA7517' : subScores.total >= 50 ? '#E8440A' : '#6B7280'
              }} />
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-3 border-t border-[var(--border-subtle)]">
              {(Object.keys(SUB_SCORE_LABELS) as Array<keyof typeof SUB_SCORE_LABELS>).map(key => {
                const v = (subScores as unknown as Record<string, number>)[key] || 0
                return (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-[9px] text-[var(--text-muted)]">{SUB_SCORE_LABELS[key]}</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-10 h-0.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{
                          width: `${v}%`,
                          background: v >= 70 ? '#1D9E75' : v >= 40 ? '#BA7517' : '#6B7280'
                        }} />
                      </div>
                      <span className="text-[9px] font-bold text-[var(--text-secondary)] w-5 text-right">{v}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className={`rounded-xl p-4 border ${
            lead.nextAction.isOverdue
              ? 'bg-[var(--danger)]/10 border-[var(--danger)]/30'
              : lead.nextAction.priority === 'high'
                ? 'bg-[var(--accent-muted)] border-[var(--accent)]/30'
                : 'bg-[var(--bg-base)] border-[var(--border-subtle)]'
          }`}>
            <div className="text-[10px] font-bold tracking-widest uppercase text-[var(--text-muted)] mb-1">Sonraki Aksiyon</div>
            <div className="text-sm font-bold text-[var(--text-primary)] mb-1">{lead.nextAction.label}</div>
            {lead.nextAction.detail && (
              <div className="text-[11px] text-[var(--text-secondary)]">{lead.nextAction.detail}</div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase">İletişim & Sinyaller</h3>
            <div className="grid grid-cols-2 gap-2">
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="flex items-center gap-2 p-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg hover:border-[var(--accent)] transition-all group min-w-0">
                  <Phone className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--accent)] shrink-0" />
                  <span className="text-[10px] text-[var(--text-secondary)] truncate">{lead.phone}</span>
                </a>
              )}
              {lead.website && (
                <a href={lead.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg hover:border-[var(--accent)] transition-all group min-w-0">
                  <Globe className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--accent)] shrink-0" />
                  <span className="text-[10px] text-[var(--text-secondary)] truncate">{lead.website.replace(/^https?:\/\//, '')}</span>
                </a>
              )}
              {lead.rating !== null && lead.rating !== undefined && (
                <div className="flex items-center gap-2 p-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg">
                  <Star className="w-3 h-3 text-[var(--warning)] shrink-0" />
                  <span className="text-[10px] text-[var(--text-secondary)]">{lead.rating} / 5 · {lead.review_count || 0} yorum</span>
                </div>
              )}
              {(lead.city || lead.district) && (
                <div className="flex items-center gap-2 p-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg">
                  <MapPin className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                  <span className="text-[10px] text-[var(--text-secondary)] truncate">{lead.city}{lead.district ? ` / ${lead.district}` : ''}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              {lead.has_website && <SignalPill label="Web" />}
              {lead.has_whatsapp && <SignalPill label="WhatsApp" />}
              {lead.has_form && <SignalPill label="Form" />}
              {lead.has_online_booking && <SignalPill label="Online Randevu" />}
              {lead.has_ecommerce && <SignalPill label="E-Ticaret" />}
              {lead.has_ads_signal && <SignalPill label="Reklam Aktif" highlight />}
              {(lead.branch_count ?? 1) > 1 && <SignalPill label={`${lead.branch_count} Şube`} />}
            </div>
          </div>

          {(lead.estimated_setup_value || lead.estimated_monthly_value) && (
            <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl p-4 grid grid-cols-3 gap-2">
              <ValueStat label="Kurulum" value={formatTL(lead.estimated_setup_value || 0)} />
              <ValueStat label="Aylık" value={formatTL(lead.estimated_monthly_value || 0)} accent />
              <ValueStat label="Yıllık" value={formatTL((lead.estimated_setup_value || 0) + (lead.estimated_monthly_value || 0) * 12)} />
            </div>
          )}

          {lead.recommended_offers && lead.recommended_offers.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase">Önerilen Hizmetler</h3>
              {lead.recommended_offers.map(o => (
                <div key={o.offerId} className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-bold text-[var(--text-primary)]">{o.offerName}</div>
                    <div className="text-[10px] font-bold text-[var(--accent)] shrink-0">{formatTL(o.monthlyPrice)}/ay</div>
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed">{o.reason}</div>
                  <div className="text-[10px] text-[var(--text-muted)] italic border-l-2 border-[var(--accent)]/40 pl-2">{o.salesAngle}</div>
                </div>
              ))}
            </div>
          )}

          {lead.first_30_seconds_pitch && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] text-[var(--success)] font-bold tracking-widest uppercase">📞 30 Saniyelik Açılış</h3>
                <button onClick={() => copyText(lead.first_30_seconds_pitch ?? '')} className="text-[9px] text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1">
                  <Copy className="w-3 h-3" /> Kopyala
                </button>
              </div>
              <div className="bg-[var(--success)]/5 border border-[var(--success)]/20 rounded-lg p-3 text-[11px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                {lead.first_30_seconds_pitch}
              </div>
            </div>
          )}

          {lead.first_message && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase">İlk Mesaj (WhatsApp)</h3>
                <button onClick={() => copyText(lead.first_message || '')} className="text-[9px] text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1">
                  <Copy className="w-3 h-3" /> Kopyala
                </button>
              </div>
              <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg p-3 text-[11px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                {lead.first_message}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase">📧 Soğuk E-posta</h3>
              {emailDraft && (
                <button
                  onClick={handleDraftEmail}
                  disabled={draftingEmail}
                  className="text-[9px] text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${draftingEmail ? 'animate-spin' : ''}`} /> Yeniden Üret
                </button>
              )}
            </div>

            {!emailDraft && (
              <button
                onClick={handleDraftEmail}
                disabled={draftingEmail}
                className="w-full flex items-center justify-center gap-1.5 py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-[10px] font-bold text-[var(--text-primary)] rounded-md disabled:opacity-50"
              >
                <Mail className={`w-3 h-3 ${draftingEmail ? 'animate-pulse' : ''}`} />
                {draftingEmail ? 'Taslak üretiliyor...' : 'Soğuk E-posta Oluştur'}
              </button>
            )}

            {emailError && (
              <div className="bg-[var(--danger)]/5 border border-[var(--danger)]/20 rounded-lg p-2.5 text-[10px] text-[var(--danger)] leading-relaxed">
                {emailError}
              </div>
            )}

            {emailDraft && (
              <>
                {emailDraft.subject && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-bold text-[var(--text-primary)] truncate">{emailDraft.subject}</div>
                    <button onClick={() => copyText(emailDraft.subject || '')} className="text-[9px] text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1 shrink-0">
                      <Copy className="w-3 h-3" /> Konu
                    </button>
                  </div>
                )}
                <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg p-3 text-[11px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto scrollbar-thin">
                  {emailDraft.body}
                </div>
                <button
                  onClick={() => copyText(emailDraft.body)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-[var(--bg-base)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-[10px] font-bold text-[var(--text-primary)] rounded-md"
                >
                  <Copy className="w-3 h-3" /> {copied ? 'Kopyalandı ✓' : 'Gövdeyi kopyala'}
                </button>
              </>
            )}
          </div>

          {proposal && (
            <div className="space-y-2 border-t border-[var(--border-subtle)] pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] text-[var(--accent)] font-bold tracking-widest uppercase">Teklif Taslağı</h3>
                <div className="flex bg-[var(--bg-base)] p-0.5 rounded-md border border-[var(--border-subtle)]">
                  <button onClick={() => setProposalView('whatsapp')} className={`px-2 py-0.5 text-[9px] font-bold rounded transition-all ${proposalView === 'whatsapp' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)]'}`}>WhatsApp</button>
                  <button onClick={() => setProposalView('email')} className={`px-2 py-0.5 text-[9px] font-bold rounded transition-all ${proposalView === 'email' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)]'}`}>E-posta</button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <ValueStat label="Kurulum" value={formatTL(proposal.setupPrice)} />
                <ValueStat label="Aylık" value={formatTL(proposal.monthlyPrice)} accent />
                <ValueStat label="Süre" value={proposal.timeline} />
              </div>
              <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg p-3 text-[10px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto scrollbar-thin">
                {proposalView === 'whatsapp' ? proposal.whatsappText : proposal.emailText}
              </div>
              <button
                onClick={() => copyText(proposalView === 'whatsapp' ? proposal.whatsappText : proposal.emailText)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-[var(--bg-base)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-[10px] font-bold text-[var(--text-primary)] rounded-md"
              >
                <Copy className="w-3 h-3" /> {copied ? 'Kopyalandı ✓' : 'Tüm metni kopyala'}
              </button>
            </div>
          )}

          {analysisResult && (
            <div className="space-y-1.5">
              <h3 className="text-[10px] text-[var(--accent)] font-bold tracking-widest uppercase">JARVIS Analizi</h3>
              <div className="bg-[var(--accent-muted)] border border-[var(--accent)]/20 rounded-lg p-3">
                <p className="text-xs leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">{analysisResult}</p>
              </div>
            </div>
          )}

          {lead.notes && (
            <div className="space-y-1.5">
              <h3 className="text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase">Notlar</h3>
              <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg p-3">
                <p className="text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">{lead.notes}</p>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[var(--border-subtle)] shrink-0 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleBuildProposal}
              className="flex items-center justify-center gap-1.5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold rounded-lg transition-all"
            >
              <FileText className="w-3.5 h-3.5" />
              {proposal ? 'Teklifi Yenile' : 'Teklif Oluştur'}
            </button>
            <button
              onClick={handleConvertToProject}
              disabled={lead.status === 'converted'}
              className="flex items-center justify-center gap-1.5 py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] hover:border-[var(--success)] hover:text-[var(--success)] text-[var(--text-primary)] text-xs font-bold rounded-lg transition-all disabled:opacity-40"
            >
              <Briefcase className="w-3.5 h-3.5" />
              {lead.status === 'converted' ? 'Kazanıldı' : 'Projeye Dönüştür'}
            </button>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="w-full flex items-center justify-center gap-2 py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-[var(--text-primary)] text-xs font-bold rounded-lg transition-all disabled:opacity-50"
          >
            <Zap className={`w-3.5 h-3.5 ${analyzing ? 'animate-pulse text-[var(--accent)]' : ''}`} />
            {analyzing ? 'JARVIS analiz ediyor...' : 'JARVIS ile Derin Analiz'}
          </button>
          
          <div className="pt-2 border-t border-[var(--border-subtle)]/30 mt-2 space-y-2">
            <button
              onClick={handleApolloEnrich}
              disabled={enrichingApollo || apolloConfigured === false}
              className="w-full flex items-center justify-center gap-2 py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] hover:border-[var(--info)] hover:text-[var(--info)] text-[var(--text-primary)] text-xs font-bold rounded-lg transition-all disabled:opacity-50"
            >
              🚀 {enrichingApollo ? 'Apollo Enrichment...' : 'Apollo Pilot Enrich'}
            </button>
            {apolloConfigured === false && (
              <div className="text-[10px] text-[var(--danger)] font-bold text-center mt-1">
                ⚠️ Apollo kapalı / API key yok
              </div>
            )}
            {apolloResult && (
              <div className="text-[10px] text-center font-semibold bg-[var(--info)]/5 border border-[var(--info)]/20 text-[var(--info)] p-2 rounded-lg leading-relaxed">
                {apolloResult}
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slideInRight { animation: slideInRight 0.25s ease-out; }
      `}</style>
    </>
  )
}

function SignalPill({ label, highlight }: { label: string; highlight?: boolean }) {
  return (
    <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${
      highlight
        ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30'
        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
    }`}>{label}</span>
  )
}

function ValueStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-[8px] font-bold tracking-widest uppercase text-[var(--text-muted)]">{label}</div>
      <div className={`text-xs font-black mt-0.5 ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</div>
    </div>
  )
}
