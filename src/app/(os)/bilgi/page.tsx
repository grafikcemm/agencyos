"use client"

import { useState, useEffect, useMemo } from 'react'
import {
  BookOpen,
  Search,
  FileText,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  Library,
  Clock
} from 'lucide-react'

// The /api/knowledge route has no listing endpoint for root docs — it only serves
// a single file via ?file=<name>. We curate the known root knowledge documents here
// (matching the existing hardcoded-list convention) and fetch each one's content.
const KNOWLEDGE_DOCS: { key: string; label: string }[] = [
  { key: '00_GRAFIKCEM_CONTEXT.md', label: 'Grafikcem Bağlamı' },
  { key: 'USER_PROFILE.md', label: 'Kullanıcı Profili' },
  { key: 'BUSINESS_MODEL.md', label: 'İş Modeli' },
  { key: 'GRAFIKCEM_BRAND.md', label: 'Marka Kimliği' },
  { key: 'PRICING_RULES.md', label: 'Fiyatlandırma Kuralları' },
  { key: 'SALES_FRAMEWORK.md', label: 'Satış Çerçevesi' },
  { key: 'TOOL_STACK.md', label: 'Araç Seti' },
  { key: 'SYSTEMS_CONTEXT.md', label: 'Sistem Bağlamı' },
  { key: 'INSTAGRAM_CONTEXT.md', label: 'Instagram Bağlamı' },
  { key: 'PROMPT_STYLE_GUIDE.md', label: 'Prompt Stil Rehberi' },
  { key: 'TURKEY_STRATEGY_MUSE.md', label: 'Türkiye Stratejisi' },
  { key: 'LIFE_GOALS.md', label: 'Yaşam Hedefleri' },
]

interface VaultDoc {
  key: string
  label: string
  content: string
  status: 'loaded' | 'empty' | 'error'
}

function readingTime(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const minutes = Math.max(1, Math.round(words / 200))
  return `${minutes} dk okuma`
}

export default function BilgiPage() {
  const [docs, setDocs] = useState<VaultDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadDocs()
  }, [])

  async function loadDocs() {
    setLoading(true)
    setError(null)
    try {
      const results = await Promise.all(
        KNOWLEDGE_DOCS.map(async (d): Promise<VaultDoc> => {
          try {
            const res = await fetch(`/api/knowledge?file=${encodeURIComponent(d.key)}`, {
              credentials: 'include',
            })
            if (!res.ok) {
              return { key: d.key, label: d.label, content: '', status: 'error' }
            }
            const data = await res.json()
            const content = typeof data.content === 'string' ? data.content : ''
            return {
              key: d.key,
              label: d.label,
              content,
              status: content.trim() ? 'loaded' : 'empty',
            }
          } catch {
            return { key: d.key, label: d.label, content: '', status: 'error' }
          }
        })
      )
      setDocs(results)
      const firstReadable = results.find(d => d.status === 'loaded')
      setSelectedKey(prev => prev ?? firstReadable?.key ?? results[0]?.key ?? null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Bilgi hazinesi yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return docs
    return docs.filter(
      d => d.label.toLowerCase().includes(q) || d.content.toLowerCase().includes(q)
    )
  }, [docs, query])

  const selectedDoc = useMemo(
    () => docs.find(d => d.key === selectedKey) ?? null,
    [docs, selectedKey]
  )

  async function copyContent() {
    if (!selectedDoc?.content) return
    try {
      await navigator.clipboard.writeText(selectedDoc.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard unavailable — fail silently
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--bg-base)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[var(--accent-muted)] border border-[var(--accent)]/20 flex items-center justify-center shrink-0">
            <Library className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] tracking-tight">Bilgi Hazinesi</h1>
            <p className="text-[11px] text-[var(--text-muted)] font-medium">
              Ajansın kurumsal hafızası — strateji, marka ve sistem belgeleri tek kasada.
            </p>
          </div>
        </div>
        <button
          onClick={loadDocs}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-highlight)] hover:text-[var(--text-primary)] transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: document list */}
        <div className="w-72 shrink-0 border-r border-[var(--border-subtle)] flex flex-col bg-[var(--bg-surface)]">
          <div className="p-3 border-b border-[var(--border-subtle)] shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Belgelerde ara"
                placeholder="Belgelerde ara..."
                className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-xs pl-8 pr-3 py-2.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)] transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-[var(--text-muted)]">
                <div className="w-4 h-4 rounded-full border-2 border-t-[var(--accent)] border-[var(--border-subtle)] animate-spin" />
                <span className="text-[10px] font-bold tracking-widest uppercase">Yükleniyor</span>
              </div>
            ) : filteredDocs.length === 0 ? (
              <p className="text-[11px] text-[var(--text-muted)] italic text-center py-16 px-4">
                {query ? 'Aramayla eşleşen belge yok.' : 'Belge bulunamadı.'}
              </p>
            ) : (
              filteredDocs.map(d => {
                const isActive = d.key === selectedKey
                return (
                  <button
                    key={d.key}
                    onClick={() => setSelectedKey(d.key)}
                    className={`w-full text-left rounded-xl px-3 py-2.5 flex items-start gap-2.5 transition-all border ${
                      isActive
                        ? 'bg-[var(--accent-muted)] border-[var(--accent)]/30'
                        : 'border-transparent hover:bg-[var(--bg-elevated)]'
                    }`}
                  >
                    <FileText
                      className={`w-4 h-4 shrink-0 mt-0.5 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-bold truncate ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                        {d.label}
                      </p>
                      <p className="text-[9px] text-[var(--text-muted)] font-mono truncate mt-0.5">{d.key}</p>
                    </div>
                    {d.status === 'error' && (
                      <span className="text-[8px] font-black text-red-400 uppercase shrink-0 mt-0.5">hata</span>
                    )}
                    {d.status === 'empty' && (
                      <span className="text-[8px] font-black text-[var(--text-muted)] uppercase shrink-0 mt-0.5">boş</span>
                    )}
                  </button>
                )
              })
            )}
          </div>

          <div className="px-4 py-3 border-t border-[var(--border-subtle)] shrink-0">
            <span className="text-[9px] font-black tracking-widest text-[var(--text-muted)] uppercase">
              {docs.length} belge kayıtlı
            </span>
          </div>
        </div>

        {/* RIGHT: reading pane */}
        <div className="flex-1 overflow-hidden flex flex-col bg-[var(--bg-base)]">
          {error ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="flex items-center gap-2 text-red-400 text-xs font-bold bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
              </div>
            </div>
          ) : loading ? (
            <div className="flex-1 flex items-center justify-center gap-3 text-[var(--text-muted)]">
              <div className="w-6 h-6 rounded-full border-2 border-t-[var(--accent)] border-[var(--border-subtle)] animate-spin" />
              <span className="text-xs font-bold tracking-widest uppercase">Kasa açılıyor...</span>
            </div>
          ) : !selectedDoc ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
              <BookOpen className="w-10 h-10 text-[var(--text-muted)] opacity-30" />
              <p className="text-xs text-[var(--text-muted)] font-bold">Okumak için soldan bir belge seçin.</p>
            </div>
          ) : (
            <>
              {/* Doc header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] shrink-0">
                <div className="min-w-0">
                  <h2 className="text-base font-black text-[var(--text-primary)] truncate">{selectedDoc.label}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-[var(--text-muted)] font-mono truncate">{selectedDoc.key}</span>
                    {selectedDoc.status === 'loaded' && (
                      <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] font-medium shrink-0">
                        <Clock className="w-3 h-3" /> {readingTime(selectedDoc.content)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={copyContent}
                  disabled={!selectedDoc.content}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-highlight)] hover:text-[var(--text-primary)] transition-all disabled:opacity-40 shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-[var(--accent)]" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Kopyalandı' : 'Kopyala'}
                </button>
              </div>

              {/* Doc content */}
              <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                {selectedDoc.status === 'error' ? (
                  <div className="flex items-center gap-2 text-red-400 text-xs font-bold bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 max-w-md">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> Bu belge yüklenemedi.
                  </div>
                ) : selectedDoc.status === 'empty' ? (
                  <p className="text-xs text-[var(--text-muted)] italic">Bu belge henüz boş.</p>
                ) : (
                  <div className="max-w-3xl mx-auto">
                    <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-[var(--text-secondary)] select-text bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6">
                      {selectedDoc.content}
                    </pre>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
