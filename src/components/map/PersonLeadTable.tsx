"use client"

import { Eye, ExternalLink, Mail } from 'lucide-react'
import { safeMailto } from '@/lib/contactHref'
import { PERSON_COLUMNS, PERSON_DEFAULT_VISIBLE } from '@/lib/personLeadColumns'
import type { PersonColumnKey } from '@/lib/personLeadColumns'
import type { PersonLead } from '@/lib/personLeads/types'

interface PersonLeadTableProps {
  people: PersonLead[]
  onSelect: (p: PersonLead) => void
}

const TIER_COLOR: Record<string, string> = {
  A: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  B: 'bg-green-500/10 text-green-500 border-green-500/20',
  C: 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20',
  D: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
}

function formatTL(n: number | null): string {
  if (!n) return '-'
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n)
}

function safeHttpUrl(url: string | null): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    if (['http:', 'https:'].includes(parsed.protocol)) return parsed.href
  } catch { /* geçersiz */ }
  return undefined
}

export function PersonLeadTable({ people, onSelect }: PersonLeadTableProps) {
  const cols = PERSON_COLUMNS.filter(c => PERSON_DEFAULT_VISIBLE.includes(c.key))

  if (people.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <span className="text-xl mb-2">👤</span>
        <p className="text-xs font-bold text-[var(--text-secondary)]">Henüz kişi leadi yok.</p>
        <p className="text-[10px] text-[var(--text-muted)] mt-1">Yukarıdaki &quot;Kişi Tara&quot; butonuyla Apollo People Search üzerinden pozisyon-bazlı kişi leadi toplayın.</p>
      </div>
    )
  }

  const renderCell = (key: PersonColumnKey, p: PersonLead) => {
    switch (key) {
      case 'priority':
        return (
          <td key={key} className="px-4 py-3 text-center whitespace-nowrap">
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full border ${TIER_COLOR[p.person_tier ?? 'D']}`}>{p.person_tier ?? '-'}</span>
          </td>
        )
      case 'full_name':
        return <td key={key} className="px-4 py-3 font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors whitespace-nowrap truncate max-w-[160px]">{p.full_name}</td>
      case 'title':
        return <td key={key} className="px-4 py-3 text-[var(--text-secondary)] whitespace-nowrap truncate max-w-[160px]" title={p.title ?? ''}>{p.title ?? '-'}</td>
      case 'seniority':
        return <td key={key} className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap">{p.seniority ?? '-'}</td>
      case 'company':
        return <td key={key} className="px-4 py-3 text-[var(--text-secondary)] whitespace-nowrap truncate max-w-[140px]" title={p.company_name ?? ''}>{p.company_name ?? '-'}</td>
      case 'location':
        return <td key={key} className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap truncate max-w-[120px]">{[p.city, p.country].filter(Boolean).join(' / ') || '-'}</td>
      case 'linkedin': {
        const url = safeHttpUrl(p.linkedin_url)
        return <td key={key} className="px-4 py-3 whitespace-nowrap">{url ? <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[#0a66c2] hover:underline"><ExternalLink className="w-3.5 h-3.5" /></a> : <span className="text-[var(--text-muted)]">-</span>}</td>
      }
      case 'email':
        return <td key={key} className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap truncate max-w-[160px]" title={p.email ?? ''}>{p.email ?? '-'}</td>
      case 'difficulty':
        return <td key={key} className="px-4 py-3 text-right num text-[var(--text-secondary)] whitespace-nowrap">{p.difficulty_score ?? '-'}</td>
      case 'market':
        return <td key={key} className="px-4 py-3 text-right num text-[var(--text-secondary)] whitespace-nowrap">{p.market_score ?? '-'}</td>
      case 'earning':
        return <td key={key} className="px-4 py-3 text-right num text-[var(--text-secondary)] whitespace-nowrap">{p.earning_score ?? '-'}</td>
      case 'person_score':
        return <td key={key} className="px-4 py-3 text-right num font-bold text-[var(--accent)] whitespace-nowrap">{p.person_score ?? 0}</td>
      case 'value':
        return <td key={key} className="px-4 py-3 text-right num font-bold text-[var(--text-primary)] whitespace-nowrap">{p.expected_monthly_value_tl ? `${formatTL(p.expected_monthly_value_tl)}/ay` : '-'}</td>
      case 'source':
        return <td key={key} className="px-4 py-3 whitespace-nowrap"><span className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full border border-[var(--border-subtle)] text-[var(--text-muted)]">Apollo</span></td>
      case 'actions':
        return (
          <td key={key} className="px-4 py-3 whitespace-nowrap">
            <div className="flex items-center gap-1.5">
              <button type="button" aria-label={`${p.full_name} detayını aç`} onClick={(e) => { e.stopPropagation(); onSelect(p) }} className="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all">
                <Eye className="w-3.5 h-3.5" />
              </button>
              {safeMailto(p.email) && (
                <a href={safeMailto(p.email)} aria-label={`${p.full_name} e-posta`} onClick={(e) => e.stopPropagation()} className="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all">
                  <Mail className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </td>
        )
      default:
        return null
    }
  }

  return (
    <>
      {/* Desktop table */}
      <table className="hidden md:table w-full border-collapse text-left text-xs">
        <thead className="sticky top-0 bg-[var(--bg-base)] text-[9px] text-[var(--text-muted)] font-bold tracking-widest uppercase border-b border-[var(--border-subtle)] z-10">
          <tr>
            {cols.map(col => (
              <th key={col.key} className={`px-4 py-2 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {people.map(p => (
            // Satır tıklaması kaldırıldı (klavye erişilemezdi); detay açma erişilebilir
            // Eye butonuyla yapılır (actions hücresi).
            <tr key={p.id} className="hover:bg-[var(--bg-elevated)] transition-colors group">
              {cols.map(col => renderCell(col.key, p))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile card list */}
      <div className="md:hidden divide-y divide-[var(--border-subtle)]">
        {people.map(p => (
          <div
            key={p.id}
            role="button"
            tabIndex={0}
            aria-label={`${p.full_name} detayını aç`}
            className="p-3 space-y-2 active:bg-[var(--bg-elevated)] cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            onClick={() => onSelect(p)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p) } }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold text-sm text-[var(--text-primary)] truncate">{p.full_name}</div>
                <div className="text-[10px] text-[var(--text-muted)] truncate">{p.title ?? '-'} · {p.company_name ?? '-'}</div>
              </div>
              <span className="text-sm font-black text-[var(--accent)] shrink-0">{p.person_score ?? 0}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${TIER_COLOR[p.person_tier ?? 'D']}`}>{p.person_tier ?? '-'}</span>
              {p.expected_monthly_value_tl ? <span className="text-[10px] font-bold text-[var(--text-secondary)]">{formatTL(p.expected_monthly_value_tl)}/ay</span> : null}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
