'use client'

import { useState } from 'react'
import { X, CheckCircle } from 'lucide-react'
import type { LibraryBook } from '@/data/librarySeed'

interface Props {
  book: LibraryBook
  onClose: () => void
  onComplete: (data: {
    notes: string[]
    feedTheGoatAction: string
    problemSolved: string
    readyForNext: boolean
    lifeImpact: string
  }) => void
}

// v3 — kısa tamamlama formu: "bitti / sıradaki kitap?"
// Ağır 5-not duvarı kaldırıldı; veri sözleşmesi tek çıkarım + aksiyondan türetilir.
export function BookCompletionModal({ book, onClose, onComplete }: Props) {
  const [takeaway, setTakeaway] = useState('')
  const [feedTheGoatAction, setFeedTheGoatAction] = useState('')
  const [readyForNext, setReadyForNext] = useState<boolean | null>(null)

  const isValid = takeaway.trim().length > 0 && feedTheGoatAction.trim().length > 0 && readyForNext !== null

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#111] border border-[#1f1f1f] rounded-card w-full max-w-md my-8 shadow-soft">
        <div className="flex items-center justify-between p-4 border-b border-[#1f1f1f]">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-pill bg-cat-teal/15 border border-cat-teal/30 flex items-center justify-center shrink-0">
                <CheckCircle size={13} className="text-cat-teal" />
              </span>
              <p className="text-[9px] font-mono uppercase tracking-widest text-cat-teal">Kitabı Bitir</p>
            </div>
            <p className="text-white text-sm font-display font-medium mt-1.5">{book.title}</p>
          </div>
          <button onClick={onClose} className="text-[#555] hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Tek çıkarım */}
          <div>
            <label className="text-[9px] font-mono uppercase tracking-widest text-[#555] block mb-2">
              En büyük çıkarımın ne?
            </label>
            <textarea
              value={takeaway}
              onChange={e => setTakeaway(e.target.value)}
              placeholder="Bu kitaptan aklında kalan tek şey..."
              rows={2}
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-card px-3 py-2 text-white text-xs resize-none focus:outline-none focus:border-cat-teal/40 placeholder:text-[#444]"
            />
          </div>

          {/* FTG aksiyon */}
          <div>
            <label className="text-[9px] font-mono uppercase tracking-widest text-[#555] block mb-2">
              Feed The Goat&apos;a bağlanacak 1 aksiyon
            </label>
            <input
              value={feedTheGoatAction}
              onChange={e => setFeedTheGoatAction(e.target.value)}
              placeholder="Sisteme eklenecek somut aksiyon..."
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-card px-3 py-2 text-white text-xs focus:outline-none focus:border-cat-teal/40 placeholder:text-[#444]"
            />
          </div>

          {/* Sıradaki kitap? */}
          <div>
            <label className="text-[9px] font-mono uppercase tracking-widest text-[#555] block mb-2">
              Sıradaki kitap?
            </label>
            <div className="flex gap-2">
              {[true, false].map(val => (
                <button
                  key={String(val)}
                  onClick={() => setReadyForNext(val)}
                  className={`flex-1 py-2 text-xs rounded-card transition-colors ${
                    readyForNext === val
                      ? val
                        ? 'bg-cat-teal/15 border border-cat-teal/40 text-cat-teal'
                        : 'bg-cat-orange/10 border border-cat-orange/30 text-cat-orange'
                      : 'bg-[#1a1a1a] border border-[#2a2a2a] text-[#888]'
                  }`}
                >
                  {val ? 'Evet, sıradakine geç' : 'Biraz daha zaman lazım'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-[#2a2a2a] text-[#888] text-xs rounded-card hover:text-white transition-colors"
            >
              İptal
            </button>
            <button
              onClick={() => {
                if (!isValid) return
                const tk = takeaway.trim()
                onComplete({
                  // Veri sözleşmesi korunur: tek çıkarımdan türetilir
                  notes: [tk],
                  feedTheGoatAction: feedTheGoatAction.trim(),
                  problemSolved: book.problemItSolves,
                  readyForNext: readyForNext!,
                  lifeImpact: tk,
                })
              }}
              disabled={!isValid}
              className="flex-1 py-2.5 bg-cat-teal text-black font-display font-bold text-xs rounded-card disabled:opacity-40 hover:bg-cat-teal/90 transition-colors"
            >
              Bitti
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
