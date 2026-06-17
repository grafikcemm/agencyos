'use client'

import { useState } from 'react'
import { CheckCircle, Lock, BookOpen, ChevronRight, AlertCircle } from 'lucide-react'
import type { LibraryBook } from '@/data/librarySeed'

interface Props {
  books: LibraryBook[]
  onActivate: (bookId: string) => void
  canActivateNew: boolean
}

export function ReadingLadder({ books, onActivate, canActivateNew }: Props) {
  const [activateWarning, setActivateWarning] = useState<string | null>(null)

  const handleActivate = (book: LibraryBook) => {
    if (!canActivateNew) {
      setActivateWarning('Önce aktif kitabı bitir veya arşive al. Aynı anda her şeyi okumaya çalışma.')
      setTimeout(() => setActivateWarning(null), 4000)
      return
    }
    onActivate(book.id)
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)] font-bold">Okuma Merdiveni</span>
        <span className="text-[var(--text-tertiary)] text-[10px]">— Sırayla ilerle</span>
      </div>

      {activateWarning && (
        <div className="mb-4 flex items-start gap-2 bg-cat-orange/10 border border-cat-orange/20 rounded-card p-3">
          <AlertCircle size={14} className="text-cat-orange shrink-0 mt-0.5" />
          <p className="text-cat-orange text-xs">{activateWarning}</p>
        </div>
      )}

      <div className="space-y-2">
        {books.map((book, idx) => (
          <LadderStep
            key={book.id}
            book={book}
            stepNumber={idx + 1}
            onActivate={() => handleActivate(book)}
          />
        ))}
      </div>
    </div>
  )
}

function LadderStep({
  book,
  stepNumber,
  onActivate,
}: {
  book: LibraryBook
  stepNumber: number
  onActivate: () => void
}) {
  const isActive = book.status === 'active'
  const isCompleted = book.status === 'completed'
  const isPaused = book.status === 'paused'
  const isNext = book.priority === 'next' && book.status === 'not_started'

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-card border transition-colors
        ${isActive ? 'border-cat-purple/40 border-l-2 border-l-cat-purple bg-cat-purple/5' : ''}
        ${isCompleted ? 'border-cat-teal/20 bg-cat-teal/5 opacity-60' : ''}
        ${!isActive && !isCompleted ? 'border-[var(--border-subtle)] bg-[var(--bg-surface)]' : ''}
      `}
    >
      {/* Step indicator */}
      <div className="shrink-0 w-6 h-6 flex items-center justify-center">
        {isCompleted ? (
          <CheckCircle size={16} className="text-cat-teal" />
        ) : isActive ? (
          <BookOpen size={16} className="text-cat-purple" />
        ) : (
          <span className={`text-[10px] font-mono ${isPaused ? 'text-cat-orange' : 'text-[var(--text-tertiary)]'}`}>
            {stepNumber}
          </span>
        )}
      </div>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate
          ${isActive ? 'text-[var(--text-primary)]' : ''}
          ${isCompleted ? 'text-cat-teal line-through' : ''}
          ${!isActive && !isCompleted ? 'text-[var(--text-muted)]' : ''}
        `}>
          {book.title}
        </p>
        {book.author && (
          <p className="text-[var(--text-tertiary)] text-[10px] truncate">{book.author}</p>
        )}
      </div>

      {/* Status / action */}
      <div className="shrink-0">
        {isActive && (
          <span className="text-[9px] font-mono uppercase tracking-widest text-cat-purple bg-cat-purple/10 px-2 py-1 rounded-pill">
            Aktif
          </span>
        )}
        {isCompleted && (
          <span className="text-[9px] font-mono uppercase tracking-widest text-cat-teal">Bitti</span>
        )}
        {isPaused && (
          <span className="text-[9px] font-mono uppercase tracking-widest text-cat-orange">Duraklatıldı</span>
        )}
        {!isActive && !isCompleted && !isPaused && (
          <button
            onClick={onActivate}
            className={`flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest px-2 py-1 rounded-pill transition-colors
              ${isNext
                ? 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-muted)]'
              }`}
          >
            {isNext ? 'Başlat' : <Lock size={10} />}
            {!isNext && <span className="ml-1">Sıra Bekliyor</span>}
            {isNext && <ChevronRight size={10} />}
          </button>
        )}
      </div>
    </div>
  )
}
