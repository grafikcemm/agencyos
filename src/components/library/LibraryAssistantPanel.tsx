'use client'

import { useState } from 'react'
import { Bot, ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react'
import type { LibraryBook } from '@/data/librarySeed'

interface LibraryAdvice {
  activeBookAdvice: string
  shouldContinueCurrentBook: boolean
  nextBook: string | null
  reason: string
  todayReadingTarget: string
  avoidStarting: string[]
  actionFromBook: string
}

interface Props {
  activeBook: LibraryBook | null
  completedCount: number
  totalBooks: number
}

const QUICK_PROMPTS = [
  'Sıradaki kitabı seç',
  'Bu kitabı neden okuyorum?',
  'Bu kitaptan aksiyon çıkar',
  'Okuma planımı sadeleştir',
  'Bu hafta kaç sayfa yeterli?',
]

export function LibraryAssistantPanel({ activeBook, completedCount, totalBooks }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [advice, setAdvice] = useState<LibraryAdvice | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null)

  const fetchAdvice = async (prompt?: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/library-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeBook,
          completedCount,
          totalBooks,
          prompt: prompt ?? 'Genel okuma koçluğu ver',
        }),
      })
      if (!res.ok) throw new Error('API hatası')
      const data = await res.json()
      setAdvice(data)
    } catch {
      setError('Asistan şu an erişilemiyor. Tekrar dene.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border border-[var(--border-subtle)] rounded-card overflow-hidden shadow-soft">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-[var(--bg-surface)] hover:bg-[var(--bg-card-hover)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-pill bg-cat-purple/15 border border-cat-purple/30 flex items-center justify-center shrink-0">
            <Bot size={13} className="text-cat-purple" />
          </span>
          <span className="text-xs text-[var(--text-primary)] font-display font-medium">AI Kitap Koçu</span>
          <span className="text-[10px] text-[var(--text-muted)]">— Okuma planına yardım</span>
        </div>
        {isOpen ? <ChevronUp size={12} className="text-[var(--text-muted)]" /> : <ChevronDown size={12} className="text-[var(--text-muted)]" />}
      </button>

      {isOpen && (
        <div className="border-t border-[var(--border-subtle)] p-4 space-y-4">
          {/* Quick prompts */}
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map(prompt => (
              <button
                key={prompt}
                onClick={() => {
                  setSelectedPrompt(prompt)
                  fetchAdvice(prompt)
                }}
                className={`px-3 py-1.5 text-xs rounded-pill border transition-colors
                  ${selectedPrompt === prompt
                    ? 'border-cat-purple/40 bg-cat-purple/10 text-cat-purple'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                  }`}
              >
                {prompt}
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
              <Loader2 size={12} className="animate-spin" />
              Düşünüyor...
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-cat-pink/10 border border-cat-pink/20 rounded-card p-3">
              <AlertCircle size={12} className="text-cat-pink shrink-0 mt-0.5" />
              <p className="text-cat-pink text-xs">{error}</p>
            </div>
          )}

          {advice && !loading && (
            <div className="space-y-3">
              <AdviceRow label="Aktif Kitap Tavsiyesi" value={advice.activeBookAdvice} />
              <AdviceRow label="Bugünkü Hedef" value={advice.todayReadingTarget} highlight />
              <AdviceRow label="Aksiyon" value={advice.actionFromBook} />
              {advice.nextBook && (
                <AdviceRow label="Sıradaki Kitap" value={`${advice.nextBook} — ${advice.reason}`} />
              )}
              {advice.avoidStarting.length > 0 && (
                <div>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)] block mb-1">Şu An Başlama</span>
                  <div className="flex flex-wrap gap-1.5">
                    {advice.avoidStarting.map(t => (
                      <span key={t} className="text-[10px] px-2 py-0.5 bg-cat-pink/10 border border-cat-pink/20 text-cat-pink rounded-pill">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!advice && !loading && !error && (
            <p className="text-[var(--text-tertiary)] text-xs">Yukarıdan bir soru seç veya koç ile konuş.</p>
          )}
        </div>
      )}
    </div>
  )
}

function AdviceRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)] block mb-1">{label}</span>
      <p className={`text-xs leading-relaxed ${highlight ? 'text-cat-teal' : 'text-[var(--text-secondary)]'}`}>{value}</p>
    </div>
  )
}
