"use client"

import { useState } from 'react'
import { X, Mail, ExternalLink, Phone, Building2, MapPin, Copy, Check, Zap } from 'lucide-react'
import { safeMailto, safeTel } from '@/lib/contactHref'
import type { PersonLead } from '@/lib/personLeads/types'

interface PersonLeadDrawerProps {
  person: PersonLead
  onClose: () => void
}

// http(s) dışı şemaları engelle (XSS: javascript:/data: href).
function safeUrl(url: string | null): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    if (['http:', 'https:'].includes(parsed.protocol)) return parsed.href
  } catch { /* geçersiz */ }
  return undefined
}

function formatTL(n: number | null): string {
  if (!n) return '-'
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n)
}

const TIER_COLOR: Record<string, string> = {
  A: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  B: 'bg-green-500/10 text-green-500 border-green-500/20',
  C: 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20',
  D: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--text-muted)] font-bold tracking-wider uppercase">{label}</span>
        <span className="num text-[11px] font-bold text-[var(--text-secondary)]">{v}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
      </div>
    </div>
  )
}

export function PersonLeadDrawer({ person, onClose }: PersonLeadDrawerProps) {
  const [copied, setCopied] = useState(false)
  const linkedin = safeUrl(person.linkedin_url)
  const tier = person.person_tier ?? 'D'

  const outreach =
    person.purpose === 'job_application'
      ? `Merhaba ${person.full_name.split(' ')[0]}, ${person.company_name ?? 'ekibinizin'} kreatif/tasarım işleri ilgimi çekti. 6+ yıl sosyal medya + AI destekli kreatif üretim deneyimim var (@grafikcem, 94k). Portföyümü paylaşabilir miyim?`
      : `Merhaba ${person.full_name.split(' ')[0]}, ${person.company_name ?? 'markanız'} için sosyal medya + AI destekli kreatif üretimde somut bir fikrim var. 5 dakikalık kısa bir örnek gönderebilir miyim?`

  const copyOutreach = async () => {
    try {
      await navigator.clipboard.writeText(outreach)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard yok */ }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`${person.full_name} detayı`}>
      <button type="button" aria-label="Kapat" onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative w-full max-w-[440px] h-full bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] truncate">{person.full_name}</h2>
              <p className="text-xs text-[var(--text-secondary)] truncate">{person.title ?? '—'}</p>
              <p className="text-[11px] text-[var(--text-muted)] truncate">{person.company_name ?? '—'}{person.city ? ` · ${person.city}` : ''}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[11px] font-black px-2 py-0.5 rounded-full border ${TIER_COLOR[tier]}`}>{tier}</span>
              <button type="button" onClick={onClose} aria-label="Kapat" className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Primary actions */}
        <div className="px-5 py-3 border-b border-[var(--border-subtle)] flex items-center gap-2 shrink-0">
          {linkedin && (
            <a href={linkedin} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#0a66c2]/10 border border-[#0a66c2]/30 text-[#0a66c2] text-xs font-bold">
              <ExternalLink className="w-3.5 h-3.5" /> LinkedIn
            </a>
          )}
          {safeMailto(person.email) && (
            <a href={safeMailto(person.email)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[var(--accent-muted)] border border-[var(--accent)]/30 text-[var(--accent)] text-xs font-bold">
              <Mail className="w-3.5 h-3.5" /> E-posta
            </a>
          )}
          {safeTel(person.phone) && (
            <a href={safeTel(person.phone)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-500 text-xs font-bold">
              <Phone className="w-3.5 h-3.5" /> Ara
            </a>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-5">
          {/* Apollo filtre etiketi */}
          {person.b2b_filter_label && (
            <div className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2">
              <span className="font-bold tracking-wider uppercase text-[var(--text-secondary)]">Apollo Filtresi</span>
              <p className="mt-0.5">{person.b2b_filter_label}</p>
            </div>
          )}

          {/* Why now */}
          {person.why_now && (
            <div className="bg-[var(--accent-muted)] border border-[var(--accent)]/20 rounded-lg px-3 py-2.5">
              <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--accent)]">Neden Şimdi?</span>
              <p className="text-xs text-[var(--text-secondary)] mt-1">{person.why_now}</p>
            </div>
          )}

          {/* Skor detayı */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--text-muted)]">Skor Detayı</span>
              <span className="num text-2xl font-black text-[var(--accent)]">{person.person_score ?? 0}</span>
            </div>
            <ScoreBar label="Kolaylık (düşük=kolay)" value={person.difficulty_score} />
            <ScoreBar label="Market" value={person.market_score} />
            <ScoreBar label="Kazanç" value={person.earning_score} />
          </div>

          {/* Şirket & değer */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-2 text-[var(--text-secondary)]"><Building2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />{person.company_size ? `${person.company_size} çalışan` : '—'}</div>
            <div className="flex items-center gap-2 text-[var(--text-secondary)]"><MapPin className="w-3.5 h-3.5 text-[var(--text-muted)]" />{person.country ?? '—'}</div>
            {person.company_industry && <div className="col-span-2 text-[var(--text-muted)]">{person.company_industry}</div>}
          </div>
          {person.expected_monthly_value_tl != null && person.expected_monthly_value_tl > 0 && (
            <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2.5 flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--text-muted)]">Tahmini Aylık</span>
              <span className="num text-lg font-black text-[var(--text-primary)]">{formatTL(person.expected_monthly_value_tl)}</span>
            </div>
          )}

          {/* Next action */}
          {person.next_action && (
            <div className="text-xs text-[var(--text-secondary)]">
              <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--text-muted)]">Sonraki Aksiyon</span>
              <p className="mt-1 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-[var(--accent)]" />{person.next_action}</p>
            </div>
          )}

          {/* Outreach taslağı */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--text-muted)]">İlk Mesaj Taslağı</span>
              <button type="button" onClick={copyOutreach} className="flex items-center gap-1 text-[10px] font-bold text-[var(--accent)] hover:text-[var(--accent-hover)]">
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}{copied ? 'Kopyalandı' : 'Kopyala'}
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2.5 whitespace-pre-wrap">{outreach}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
