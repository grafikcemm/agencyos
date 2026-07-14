"use client"

import { useMemo, useState, useEffect } from 'react'
import { X, Phone, Globe, MapPin, Star, Zap, FileText, Briefcase, Copy, MessageCircle, Mail, RefreshCw, PenLine } from 'lucide-react'
import { DraftEditor } from '@/components/outreach/DraftEditor'
import { enrichLead, EnrichedLead } from '@/lib/enrichLead'
import { buildProposal } from '@/lib/proposalBuilder'
import { CATEGORY_DISPLAY } from '@/lib/customerCategory'
import type { CustomerCategory, Lead, Proposal } from '@/lib/types'

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

// Müşteri kategorisi rozet sınıfları — CATEGORY_DISPLAY.variant → Tailwind/CSS-var.
const CATEGORY_BADGE_CLASS: Record<string, string> = {
  danger: 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/30',
  warning: 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/30',
  info: 'bg-[var(--info)]/10 text-[var(--info)] border-[var(--info)]/30',
  success: 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/30',
  muted: 'bg-[var(--text-muted)]/10 text-[var(--text-muted)] border-[var(--text-muted)]/20',
  default: 'bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/30',
}

// Normalize a Turkish phone to wa.me digits (e.g. "0534 887 14 35" -> "905348871435").
function normalizeTrPhone(phone: string): string {
  const d = (phone || '').replace(/\D/g, '')
  if (d.startsWith('90')) return d
  if (d.startsWith('0')) return '90' + d.slice(1)
  if (d.length === 10) return '90' + d
  return d
}

// ── Faz 1.1: canonical outbound gate (server-side) ───────────────────────────
// Kapıdan GEÇMEYEN metin: wa.me prefill'e giremez, kopyalanamaz,
// "gönderilebilir" gösterilemez. Client evidence doğrulayamaz → karar serverda.
type GateInfo = { ok: boolean; violations: Array<{ code: string; detail: string; fix: string }> }
type GateItem = { key: string; kind: string; text: string; subject?: string | null }

const GATE_UNAVAILABLE: GateInfo = {
  ok: false,
  violations: [{ code: 'GATE_UNAVAILABLE', detail: 'Kalite kapısı değerlendirilemedi', fix: 'Bağlantıyı kontrol edip tekrar dene' }],
}

/** Saf fetch (setState yok): sonuç key→karar; hata/başarısızlıkta FAIL-CLOSED blok. */
async function fetchGateResults(leadId: string, items: GateItem[]): Promise<Record<string, GateInfo>> {
  const failClosed = Object.fromEntries(items.map((i) => [i.key, GATE_UNAVAILABLE]))
  try {
    const res = await fetch('/api/outbound/gate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, items }),
    })
    const data = await res.json()
    if (data?.success && data.results) return data.results as Record<string, GateInfo>
    return failClosed
  } catch {
    return failClosed
  }
}

function GateNote({ gate }: { gate: GateInfo | undefined }) {
  if (!gate) return <p className="text-[9px] text-[var(--text-muted)]">Kalite kapısı kontrol ediliyor…</p>
  if (gate.ok) return null
  const v = gate.violations[0]
  return (
    <p className="text-[9px] text-amber-400 leading-snug" data-testid="gate-blocked">
      ⛔ {v.code}: {v.detail} → <span className="font-semibold">{v.fix}</span>
    </p>
  )
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
  const [emailEditing, setEmailEditing] = useState(false)
  const [draftingEmail, setDraftingEmail] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  // Gmail HITL gönderim durumu (Sprint 0 Faz 4) — onay/gönderim/dry-run.
  const [sendStatus, setSendStatus] = useState<{
    sent: boolean
    gmailMessageId: string | null
    lastError: string | null
    approval: { id: string; status: string; expiresAt: string } | null
    dryRunMode: boolean
  } | null>(null)
  const [gmailBusy, setGmailBusy] = useState(false)
  const [gmailNote, setGmailNote] = useState<string | null>(null)
  const [statusDraftId, setStatusDraftId] = useState<string | null>(null)
  // Faz 1.1: metin anahtarı → server gate kararı (undefined = değerlendiriliyor).
  const [gates, setGates] = useState<Record<string, GateInfo | undefined>>({})

  // Taslak değişince gönderim durumu render-anında sıfırlanır (adjust-state-
  // during-render deseni — effect içinde sync setState cascade'i yok).
  if ((emailDraft?.id ?? null) !== statusDraftId) {
    setStatusDraftId(emailDraft?.id ?? null)
    setSendStatus(null)
    setGmailNote(null)
  }

  useEffect(() => {
    fetch('/api/enrichment/apollo')
      .then(res => res.json())
      .then(data => setApolloConfigured(!!data.configured))
      .catch(() => setApolloConfigured(false))
  }, [])

  // Canonical gate çağrısı — başarısızlıkta FAIL-CLOSED (raw metin kullanılmaz).
  const runGate = (items: GateItem[]) => {
    if (!items.length) return
    fetchGateResults(rawLead.id, items).then((results) => setGates((prev) => ({ ...prev, ...results })))
  }

  // Drawer açılışında lead metinleri kapıya girer.
  useEffect(() => {
    const items: GateItem[] = []
    if (lead.first_message) items.push({ key: 'first_message', kind: 'first_message', text: lead.first_message })
    if (lead.first_30_seconds_pitch) items.push({ key: 'pitch', kind: 'pitch', text: lead.first_30_seconds_pitch })
    if (!items.length) return
    let cancelled = false
    fetchGateResults(rawLead.id, items).then((results) => {
      if (!cancelled) setGates((prev) => ({ ...prev, ...results }))
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawLead.id])

  // Cold email taslağı her değiştiğinde yeniden değerlendirilir.
  useEffect(() => {
    if (!emailDraft) return
    let cancelled = false
    fetchGateResults(rawLead.id, [
      { key: `email-${emailDraft.id}`, kind: 'cold_email', text: emailDraft.body, subject: emailDraft.subject },
    ]).then((results) => {
      if (!cancelled) setGates((prev) => ({ ...prev, ...results }))
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailDraft])

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

  // Taslak varken Gmail gönderim durumunu yükle (onay/gönderildi/dry-run).
  useEffect(() => {
    if (!emailDraft) return
    let cancelled = false
    fetch(`/api/outreach/${emailDraft.id}/send-status`)
      .then(res => res.json())
      .then(data => { if (!cancelled && data?.success) setSendStatus(data.data) })
      .catch(() => { /* durum okunamazsa blok gizli kalır */ })
    return () => { cancelled = true }
  }, [emailDraft])

  const refreshSendStatus = async (draftId: string) => {
    try {
      const res = await fetch(`/api/outreach/${draftId}/send-status`)
      const data = await res.json()
      if (data?.success) setSendStatus(data.data)
    } catch { /* sessiz */ }
  }

  const handleRequestSend = async () => {
    if (!emailDraft || gmailBusy) return
    setGmailBusy(true)
    setGmailNote(null)
    try {
      // Faz 4.4: onay isteği GERÇEK final içerikle gider — boş {} ASLA.
      // Sunucu digest'i bu içeriğe bağlar; sonradan sapma digest-mismatch olur.
      const res = await fetch(`/api/outreach/${emailDraft.id}/request-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(emailDraft.subject?.trim() ? { subject: emailDraft.subject.trim() } : {}),
          finalBody: emailDraft.body,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setGmailNote('Onay isteği oluşturuldu — Konsol > Onay Kuyruğu üzerinden onaylayın.')
      } else if (data.blockedReasons) {
        setGmailNote(`Gönderim bloke: ${data.blockedReasons.join(', ')}`)
      } else {
        setGmailNote(data.error || 'Onay isteği oluşturulamadı.')
      }
      await refreshSendStatus(emailDraft.id)
    } catch {
      setGmailNote('Bağlantı hatası oluştu.')
    } finally {
      setGmailBusy(false)
    }
  }

  const handleSendGmail = async () => {
    if (!emailDraft || gmailBusy || !sendStatus?.approval) return
    setGmailBusy(true)
    setGmailNote(null)
    try {
      const res = await fetch(`/api/outreach/${emailDraft.id}/send-gmail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId: sendStatus.approval.id }),
      })
      const data = await res.json()
      if (data.success) {
        setGmailNote(data.data?.dryRun ? 'Gönderildi (DRY-RUN — gerçek e-posta çıkmadı).' : 'Gmail üzerinden gönderildi.')
      } else if (data.blockedReasons) {
        setGmailNote(`Gönderim bloke: ${data.blockedReasons.join(', ')}`)
      } else {
        setGmailNote(data.error || 'Gönderim başarısız.')
      }
      await refreshSendStatus(emailDraft.id)
    } catch {
      setGmailNote('Bağlantı hatası oluştu.')
    } finally {
      setGmailBusy(false)
    }
  }

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
    // Faz 1.1: teklif metinleri de kapıdan geçmeden kopyalanamaz.
    runGate([
      { key: 'proposal_whatsapp', kind: 'proposal_whatsapp', text: p.whatsappText },
      { key: 'proposal_email', kind: 'proposal_email', text: p.emailText, subject: `Teklif — ${lead.business_name}` },
    ])
  }

  // Faz 5.1: KALICI teklif — client buildProposal yalnız önizleme; kalıcı yol
  // proposalService API'si (mig 061 canlıysa tek-transaction RPC).
  const [persistState, setPersistState] = useState<{ busy: boolean; note: string | null }>({ busy: false, note: null })

  // FINALIZATION Faz 4: kalıcı teklifin YÖNETİMİ — durum + versiyonlar +
  // request approval + approve/reject; hepsi UI'dan bağımsız application
  // service (proposalService) API'leri üzerinden. Hatalar GÖRÜNÜR.
  interface ProposalDetailView {
    id: string
    status: string
    currentVersion: number
    versions: Array<{ version: number; createdAt: string | null }>
    approval: { version: number; decision: string } | null
  }
  const [propMgr, setPropMgr] = useState<{ busy: boolean; error: string | null; detail: ProposalDetailView | null }>({
    busy: false, error: null, detail: null,
  })

  const refreshProposalDetail = async (proposalId: string) => {
    setPropMgr((s) => ({ ...s, busy: true, error: null }))
    try {
      const res = await fetch(`/api/proposals/${proposalId}`)
      const json = await res.json().catch(() => ({}))
      if (!json.success) {
        setPropMgr({ busy: false, error: json.error ?? `teklif durumu okunamadı (${res.status})`, detail: null })
        return
      }
      setPropMgr({ busy: false, error: null, detail: json.detail as ProposalDetailView })
    } catch {
      setPropMgr({ busy: false, error: 'bağlantı hatası — teklif durumu okunamadı', detail: null })
    }
  }

  const proposalAction = async (
    proposalId: string,
    body: { action: 'request_approval' } | { action: 'decide'; version: number; decision: 'approved' | 'rejected' },
  ) => {
    setPropMgr((s) => ({ ...s, busy: true, error: null }))
    try {
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!json.success) {
        setPropMgr((s) => ({ ...s, busy: false, error: json.error ?? `aksiyon başarısız (${res.status})` }))
        // Hata görünür kalır ama durum da tazelenir (stale görünüm bırakma).
        await refreshProposalDetail(proposalId)
        return
      }
      await refreshProposalDetail(proposalId)
    } catch {
      setPropMgr((s) => ({ ...s, busy: false, error: 'bağlantı hatası — aksiyon uygulanamadı' }))
    }
  }

  const handlePersistProposal = async () => {
    const offerIds = (lead.recommended_offers || []).map((o) => o.offerId)
    if (!offerIds.length || persistState.busy) return
    setPersistState({ busy: true, note: null })
    try {
      const res = await fetch(`/api/leads/${lead.id}/proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerIds }),
      })
      const json = await res.json().catch(() => ({}))
      if (json.success) {
        setPersistState({ busy: false, note: `Kalıcı teklif kaydedildi: v${json.version}${json.atomic ? '' : ' (legacy — 061 RPC bekliyor)'}` })
        if (json.proposalId) await refreshProposalDetail(json.proposalId as string)
      } else if (json.schemaMissing) {
        setPersistState({ busy: false, note: 'Teklif şeması (mig 061) canlı değil — kalıcı kayıt onay sonrası mümkün.' })
      } else if (json.quality) {
        setPersistState({ busy: false, note: `Kalite kapısı blokladı: ${json.quality.violations.map((v: { code: string }) => v.code).join(', ')}` })
      } else {
        setPersistState({ busy: false, note: json.error ?? 'Teklif kaydedilemedi.' })
      }
    } catch {
      setPersistState({ busy: false, note: 'Bağlantı hatası.' })
    }
  }

  // Faz 3.1: gerçek dönüşüm — proje oluşmadan "dönüştü" denmez; hata drawer'ı KAPATMAZ.
  const [convertState, setConvertState] = useState<{ busy: boolean; done: boolean; error: string | null }>({
    busy: false, done: false, error: null,
  })
  const handleConvertToProject = async () => {
    if (convertState.busy || convertState.done) return
    setConvertState({ busy: true, done: false, error: null })
    try {
      const res = await fetch(`/api/leads/${lead.id}/convert`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setConvertState({ busy: false, done: false, error: json.error ?? `HTTP ${res.status}` })
        return
      }
      setConvertState({ busy: false, done: true, error: null })
    } catch {
      setConvertState({ busy: false, done: false, error: 'bağlantı hatası' })
    }
  }

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  /** Kapı ok değilse KOPYALANMAZ (Faz 1.1) — buton zaten disabled; savunma katmanı. */
  const copyGated = (gateKey: string, text: string) => {
    if (!gates[gateKey]?.ok) return
    copyText(text)
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
              className="flex items-center justify-center gap-2 py-2.5 bg-[var(--cta-bg)] hover:bg-[#e6e6e6] text-[var(--cta-fg)] text-sm font-bold rounded-lg transition-all"
            >
              <Phone className="w-4 h-4" />
              Ara
            </a>
            {/* Faz 1.1: prefill YALNIZ kapıdan geçen first_message ile — aksi hâlde
                link metinsiz sohbet açar; neden başlıkta görünür. */}
            <a
              href={`https://wa.me/${normalizeTrPhone(lead.phone)}${
                lead.first_message && gates['first_message']?.ok
                  ? `?text=${encodeURIComponent(lead.first_message)}`
                  : ''
              }`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="wa-primary"
              title={
                lead.first_message && gates['first_message'] && !gates['first_message'].ok
                  ? `Prefill bloke — ${gates['first_message'].violations[0]?.code}: ${gates['first_message'].violations[0]?.fix}`
                  : undefined
              }
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

          {/* MÜŞTERİ KATEGORİSİ — neden hedefimiz + hangi tasarım hizmetini satmalıyız */}
          {lead.customer_category && CATEGORY_DISPLAY[lead.customer_category as CustomerCategory] && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-black tracking-widest uppercase px-2 py-1 rounded border ${CATEGORY_BADGE_CLASS[CATEGORY_DISPLAY[lead.customer_category as CustomerCategory].variant] ?? CATEGORY_BADGE_CLASS.default}`}>
                {CATEGORY_DISPLAY[lead.customer_category as CustomerCategory].label}
              </span>
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                Önerilen hizmet: <span className="font-bold text-[var(--text-primary)]">{CATEGORY_DISPLAY[lead.customer_category as CustomerCategory].service}</span>
              </span>
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
                <button
                  onClick={() => copyGated('pitch', lead.first_30_seconds_pitch ?? '')}
                  disabled={!gates['pitch']?.ok}
                  className="text-[9px] text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Copy className="w-3 h-3" /> Kopyala
                </button>
              </div>
              <GateNote gate={gates['pitch']} />
              <div className="bg-[var(--success)]/5 border border-[var(--success)]/20 rounded-lg p-3 text-[11px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                {lead.first_30_seconds_pitch}
              </div>
            </div>
          )}

          {lead.first_message && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase">İlk Mesaj (WhatsApp)</h3>
                <button
                  onClick={() => copyGated('first_message', lead.first_message || '')}
                  disabled={!gates['first_message']?.ok}
                  data-testid="copy-first-message"
                  className="text-[9px] text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Copy className="w-3 h-3" /> Kopyala
                </button>
              </div>
              <GateNote gate={gates['first_message']} />
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
                {/* Faz 4.1: drawer'dan inline düzenleme — kapı + ihlal bağlama +
                    deterministik düzeltme + GERÇEK finalBody ile onaya alma. */}
                <button
                  onClick={() => setEmailEditing((v) => !v)}
                  data-testid={`drawer-draft-edit-${emailDraft.id}`}
                  className="text-[9px] text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1"
                >
                  <PenLine className="w-3 h-3" /> {emailEditing ? 'Düzenlemeyi kapat' : 'Düzenle + Onaya Al'}
                </button>
                {emailEditing && lead && (
                  <DraftEditor
                    draftId={emailDraft.id}
                    leadId={lead.id}
                    initialSubject={emailDraft.subject ?? ''}
                    initialBody={emailDraft.body}
                    onApprovalRequested={({ subject, body }) => {
                      setEmailDraft((prev) => (prev ? { ...prev, subject: subject || prev.subject, body } : prev))
                      setEmailEditing(false)
                      setGmailNote('Onay isteği oluşturuldu — Konsol > Onay Kuyruğu üzerinden onaylayın.')
                      void refreshSendStatus(emailDraft.id)
                    }}
                  />
                )}
                {emailDraft.subject && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-bold text-[var(--text-primary)] truncate">{emailDraft.subject}</div>
                    <button
                      onClick={() => copyGated(`email-${emailDraft.id}`, emailDraft.subject || '')}
                      disabled={!gates[`email-${emailDraft.id}`]?.ok}
                      className="text-[9px] text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Copy className="w-3 h-3" /> Konu
                    </button>
                  </div>
                )}
                <GateNote gate={gates[`email-${emailDraft.id}`]} />
                <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg p-3 text-[11px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto scrollbar-thin">
                  {emailDraft.body}
                </div>
                <button
                  onClick={() => copyGated(`email-${emailDraft.id}`, emailDraft.body)}
                  disabled={!gates[`email-${emailDraft.id}`]?.ok}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-[var(--bg-base)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-[10px] font-bold text-[var(--text-primary)] rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Copy className="w-3 h-3" /> {copied ? 'Kopyalandı ✓' : 'Gövdeyi kopyala'}
                </button>

                {/* Gmail HITL gönderim bloğu (Sprint 0 Faz 4) — onaysız gönderim yok */}
                <div className="space-y-1.5 border-t border-[var(--border-subtle)] pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold tracking-widest uppercase text-[var(--text-muted)]">
                      Gmail Gönderimi {sendStatus?.dryRunMode ? '· DRY-RUN' : ''}
                    </span>
                    {sendStatus?.approval && !sendStatus.sent && (
                      <span className="text-[9px] font-mono text-[var(--text-tertiary)]">onay: {sendStatus.approval.status}</span>
                    )}
                  </div>

                  {sendStatus?.sent ? (
                    <div className="text-[10px] text-[var(--success)] font-semibold">
                      Gönderildi ✓ {sendStatus.gmailMessageId?.startsWith('dryrun-') ? '(dry-run)' : ''}
                    </div>
                  ) : sendStatus?.approval?.status === 'approved' ? (
                    <button
                      onClick={handleSendGmail}
                      disabled={gmailBusy}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-[var(--accent)] text-white text-[10px] font-bold rounded-md hover:brightness-110 disabled:opacity-50"
                    >
                      <Mail className="w-3 h-3" /> {gmailBusy ? 'Gönderiliyor…' : sendStatus.dryRunMode ? 'Gönder (dry-run)' : "Gmail'den Gönder"}
                    </button>
                  ) : sendStatus?.approval?.status === 'pending' ? (
                    <div className="text-[10px] text-[var(--text-tertiary)]">
                      Onay bekliyor — <a href="/konsol" className="text-[var(--accent)] underline">Konsol &gt; Onay Kuyruğu</a>
                    </div>
                  ) : (
                    <button
                      onClick={handleRequestSend}
                      disabled={gmailBusy}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-[var(--bg-base)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-[10px] font-bold text-[var(--text-primary)] rounded-md disabled:opacity-50"
                    >
                      <Mail className="w-3 h-3" /> {gmailBusy ? 'İsteniyor…' : 'Gmail Onayı İste'}
                    </button>
                  )}

                  {gmailNote && (
                    <div className="text-[10px] text-[var(--text-tertiary)] leading-snug">{gmailNote}</div>
                  )}
                  {sendStatus?.lastError && !sendStatus.sent && (
                    <div className="text-[10px] text-[var(--danger)] leading-snug">{sendStatus.lastError}</div>
                  )}
                </div>
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
              <GateNote gate={gates[proposalView === 'whatsapp' ? 'proposal_whatsapp' : 'proposal_email']} />
              <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg p-3 text-[10px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto scrollbar-thin">
                {proposalView === 'whatsapp' ? proposal.whatsappText : proposal.emailText}
              </div>
              <button
                onClick={() =>
                  copyGated(
                    proposalView === 'whatsapp' ? 'proposal_whatsapp' : 'proposal_email',
                    proposalView === 'whatsapp' ? proposal.whatsappText : proposal.emailText,
                  )
                }
                disabled={!gates[proposalView === 'whatsapp' ? 'proposal_whatsapp' : 'proposal_email']?.ok}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-[var(--bg-base)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-[10px] font-bold text-[var(--text-primary)] rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
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
          {/* Faz 5.1: kalıcı teklif — önizlemeden ayrı, durable + versiyonlu yol. */}
          {proposal && (
            <button
              onClick={handlePersistProposal}
              disabled={persistState.busy}
              data-testid="persist-proposal"
              className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-[var(--bg-base)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-[10px] font-bold text-[var(--text-primary)] rounded-md disabled:opacity-50"
            >
              <FileText className="w-3 h-3" /> {persistState.busy ? 'Kaydediliyor…' : 'Kalıcı Teklif Kaydet (versiyonlu)'}
            </button>
          )}
          {persistState.note && (
            <p data-testid="persist-proposal-note" className="text-[10px] text-[var(--text-secondary)]">{persistState.note}</p>
          )}
          {/* FINALIZATION Faz 4: kalıcı teklif yönetimi — durum/versiyon/onay. */}
          {propMgr.detail && (
            <div data-testid="proposal-manager" className="rounded-md border border-[var(--border-subtle)] p-2 space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span data-testid="proposal-status" className="font-bold text-[var(--text-primary)]">
                  Teklif durumu: {propMgr.detail.status} · v{propMgr.detail.currentVersion}
                </span>
                <span className="text-[var(--text-muted)]">
                  {propMgr.detail.versions.length} versiyon
                  {propMgr.detail.approval ? ` · onay: ${propMgr.detail.approval.decision} (v${propMgr.detail.approval.version})` : ''}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => proposalAction(propMgr.detail!.id, { action: 'request_approval' })}
                  disabled={propMgr.busy || !['draft', 'review'].includes(propMgr.detail.status)}
                  data-testid="proposal-request-approval"
                  className="py-1 text-[9px] font-bold rounded border border-[var(--border-subtle)] hover:border-[var(--accent)] disabled:opacity-40"
                >
                  Onaya al
                </button>
                <button
                  onClick={() =>
                    proposalAction(propMgr.detail!.id, {
                      action: 'decide', version: propMgr.detail!.currentVersion, decision: 'approved',
                    })
                  }
                  disabled={propMgr.busy || propMgr.detail.approval?.decision !== 'pending'}
                  data-testid="proposal-approve"
                  className="py-1 text-[9px] font-bold rounded border border-[var(--border-subtle)] hover:border-[var(--success)] disabled:opacity-40"
                >
                  Onayla
                </button>
                <button
                  onClick={() =>
                    proposalAction(propMgr.detail!.id, {
                      action: 'decide', version: propMgr.detail!.currentVersion, decision: 'rejected',
                    })
                  }
                  disabled={propMgr.busy || propMgr.detail.approval?.decision !== 'pending'}
                  data-testid="proposal-reject"
                  className="py-1 text-[9px] font-bold rounded border border-[var(--border-subtle)] hover:border-red-400 disabled:opacity-40"
                >
                  Reddet
                </button>
              </div>
            </div>
          )}
          {propMgr.error && (
            <p data-testid="proposal-manager-error" className="text-[10px] text-red-400">{propMgr.error}</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleBuildProposal}
              className="flex items-center justify-center gap-1.5 py-2 bg-[var(--cta-bg)] hover:bg-[#e6e6e6] text-[var(--cta-fg)] text-xs font-bold rounded-lg transition-all"
            >
              <FileText className="w-3.5 h-3.5" />
              {proposal ? 'Teklifi Yenile' : 'Teklif Oluştur'}
            </button>
            <button
              onClick={handleConvertToProject}
              disabled={lead.status === 'converted' || convertState.busy || convertState.done}
              data-testid="convert-to-project"
              className="flex items-center justify-center gap-1.5 py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] hover:border-[var(--success)] hover:text-[var(--success)] text-[var(--text-primary)] text-xs font-bold rounded-lg transition-all disabled:opacity-40"
            >
              <Briefcase className="w-3.5 h-3.5" />
              {convertState.done
                ? 'Proje oluşturuldu ✓'
                : convertState.busy
                  ? 'Dönüştürülüyor…'
                  : lead.status === 'converted'
                    ? 'Kazanıldı'
                    : 'Projeye Dönüştür'}
            </button>
          </div>
          {convertState.error && (
            <p className="text-[10px] text-red-400" data-testid="convert-error">
              Dönüşüm başarısız: {convertState.error} — drawer açık kaldı, tekrar deneyebilirsin.
            </p>
          )}
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
