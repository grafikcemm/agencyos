'use client'

import { useState } from 'react'
import { BookOpen, Plus, CheckCircle, Lock } from 'lucide-react'
import type { LibraryBook, BookNote } from '@/data/librarySeed'
import { BookCompletionModal } from './BookCompletionModal'
import { AddNoteModal } from './AddNoteModal'

interface Props {
  book: LibraryBook | null
  notes: BookNote[]
  onAddNote: (note: Omit<BookNote, 'id' | 'createdAt'>) => void
  onComplete: (data: {
    notes: string[]
    feedTheGoatAction: string
    problemSolved: string
    readyForNext: boolean
    lifeImpact: string
  }) => void
}

export function ActiveBookCard({ book, notes, onAddNote, onComplete }: Props) {
  const [showCompletion, setShowCompletion] = useState(false)
  const [showNote, setShowNote] = useState(false)

  if (!book) {
    return (
      <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-card p-6 text-center shadow-soft">
        <Lock size={24} className="text-[#333] mx-auto mb-3" />
        <p className="text-[#555] text-sm">Aktif kitap yok</p>
        <p className="text-[#333] text-xs mt-1">Okuma Merdiveni&apos;nden bir kitap başlat</p>
      </div>
    )
  }

  const noteCount = notes.length
  const actionCount = notes.filter(n => n.type === 'action').length

  return (
    <>
      <div className="bg-[#0f0f0f] border border-cat-purple/30 border-l-2 border-l-cat-purple rounded-card p-5 space-y-4 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-6 h-6 rounded-pill bg-cat-purple/15 border border-cat-purple/30 flex items-center justify-center shrink-0">
                <BookOpen size={12} className="text-cat-purple" />
              </span>
              <span className="text-[9px] font-mono uppercase tracking-widest text-cat-purple">Aktif Kitap</span>
            </div>
            <h2 className="text-white font-display font-bold text-lg leading-tight">{book.title}</h2>
            {book.author && <p className="text-[#555] text-xs mt-0.5">{book.author}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <InfoRow label="Problemi çözüyor" value={book.problemItSolves} />
          <InfoRow label="Feed The Goat aksiyonu" value={book.feedTheGoatAction} highlight />
        </div>

        {/* Hafif ilerleme — baskı yok, sadece sayaç */}
        <div className="flex items-center gap-3 text-xs text-[#555] font-mono">
          <span>{noteCount} not</span>
          <span className="text-[#333]">•</span>
          <span>{actionCount} aksiyon</span>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => setShowNote(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] text-white text-xs rounded-card hover:border-cat-purple/40 transition-colors min-h-[36px]"
          >
            <Plus size={12} />
            Not / aksiyon ekle
          </button>

          <button
            onClick={() => setShowCompletion(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-card min-h-[36px] transition-colors bg-cat-teal/10 border border-cat-teal/40 text-cat-teal hover:bg-cat-teal/20"
          >
            <CheckCircle size={12} />
            Kitabı bitir
          </button>
        </div>
      </div>

      {showNote && (
        <AddNoteModal
          book={book}
          onClose={() => setShowNote(false)}
          onSave={(note) => {
            onAddNote(note)
            setShowNote(false)
          }}
        />
      )}

      {showCompletion && (
        <BookCompletionModal
          book={book}
          onClose={() => setShowCompletion(false)}
          onComplete={(data) => {
            onComplete(data)
            setShowCompletion(false)
          }}
        />
      )}
    </>
  )
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <span className="text-[9px] uppercase tracking-widest text-[#444] block mb-0.5">{label}</span>
      <p className={`text-xs leading-relaxed ${highlight ? 'text-[var(--accent)]' : 'text-[#888]'}`}>{value}</p>
    </div>
  )
}
