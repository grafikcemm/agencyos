'use client'

import { useState } from 'react'
import { X, BookOpen, StickyNote, Zap, Quote, ChevronDown, ChevronUp, Archive } from 'lucide-react'
import type { LibraryBook, BookNote } from '@/data/librarySeed'
import { CATEGORY_LABELS, STATUS_LABELS, READING_MODE_LABELS } from '@/data/librarySeed'
import { AddNoteModal } from './AddNoteModal'

interface Props {
  book: LibraryBook
  notes: BookNote[]
  onClose: () => void
  onAddNote: (note: Omit<BookNote, 'id' | 'createdAt'>) => void
  onArchive: (bookId: string) => void
  onActivate: (bookId: string) => void
  canActivateNew: boolean
}

export function BookDetailDrawer({
  book,
  notes,
  onClose,
  onAddNote,
  onArchive,
  onActivate,
  canActivateNew,
}: Props) {
  const [showNote, setShowNote] = useState(false)
  const [showHowTo, setShowHowTo] = useState(false)

  const bookNotes = notes.filter(n => n.type === 'note')
  const quotes = notes.filter(n => n.type === 'quote')
  const actions = notes.filter(n => n.type === 'action')

  return (
    <div className="fixed inset-0 bg-black/80 flex items-start justify-end z-50">
      <div className="h-full w-full max-w-md bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] p-4 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 font-mono">
              <span className="text-[9px] uppercase tracking-widest text-[var(--text-muted)]">
                {CATEGORY_LABELS[book.category]}
              </span>
              <span className="text-[var(--text-tertiary)]">•</span>
              <span className="text-[9px] uppercase tracking-widest text-[var(--text-muted)]">
                {READING_MODE_LABELS[book.readingMode]}
              </span>
            </div>
            <h2 className="text-[var(--text-primary)] font-display font-bold text-base leading-tight">{book.title}</h2>
            {book.author && <p className="text-[var(--text-muted)] text-xs mt-0.5">{book.author}</p>}
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0 mt-1">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Status badge */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)]">Durum:</span>
            <span className={`text-[9px] font-mono uppercase tracking-widest px-2 py-1 rounded-pill
              ${book.status === 'active' ? 'bg-cat-purple/10 text-cat-purple' : ''}
              ${book.status === 'completed' ? 'bg-cat-teal/10 text-cat-teal' : ''}
              ${book.status === 'not_started' || book.status === 'paused' ? 'bg-[var(--bg-elevated)] text-[var(--text-muted)]' : ''}
              ${book.status === 'reference' ? 'bg-cat-blue/10 text-cat-blue' : ''}
              ${book.status === 'evening' ? 'bg-cat-purple/10 text-cat-purple' : ''}
            `}>
              {STATUS_LABELS[book.status]}
            </span>
          </div>

          {/* Core info */}
          <Section title="Problemi Çözüyor" content={book.problemItSolves} />
          <Section title="Neden Okuyorum" content={book.whyRead} />
          <Section title="Feed The Goat Aksiyonu" content={book.feedTheGoatAction} highlight />

          {/* How to read (collapsible) */}
          <div>
            <button
              onClick={() => setShowHowTo(!showHowTo)}
              className="flex items-center justify-between w-full"
            >
              <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)]">Nasıl Okuyacağım?</span>
              {showHowTo ? <ChevronUp size={12} className="text-[var(--text-muted)]" /> : <ChevronDown size={12} className="text-[var(--text-muted)]" />}
            </button>
            {showHowTo && (
              <ul className="mt-2 space-y-1">
                {book.howToRead.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                    <span className="text-[var(--text-muted)] shrink-0">{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Completion criteria */}
          {book.completionCriteria.length > 0 && (
            <div>
              <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)] block mb-2">Tamamlanma Kriterleri</span>
              <ul className="space-y-1">
                {book.completionCriteria.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                    <span className="text-[var(--text-tertiary)] shrink-0">—</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tags */}
          {book.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {book.tags.map(tag => (
                <span key={tag} className="text-[10px] font-mono px-2 py-0.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)] rounded-pill">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Notes */}
          {notes.length > 0 && (
            <div>
              <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)] block mb-3">Notlar ({notes.length})</span>
              <div className="space-y-2">
                {bookNotes.map(note => (
                  <NoteCard key={note.id} note={note} icon={<StickyNote size={10} />} color="text-[var(--text-secondary)]" />
                ))}
                {quotes.map(note => (
                  <NoteCard key={note.id} note={note} icon={<Quote size={10} />} color="text-cat-purple" />
                ))}
                {actions.map(note => (
                  <NoteCard key={note.id} note={note} icon={<Zap size={10} />} color="text-cat-orange" />
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => setShowNote(true)}
              className="flex items-center justify-center gap-2 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs rounded-card hover:border-cat-purple/30 transition-colors"
            >
              <BookOpen size={12} />
              Not / Aksiyon / Alıntı Ekle
            </button>

            {book.status === 'not_started' && canActivateNew && (
              <button
                onClick={() => { onActivate(book.id); onClose() }}
                className="flex items-center justify-center gap-2 py-2.5 bg-cat-purple text-black font-display font-bold text-xs rounded-card hover:bg-cat-purple/90 transition-colors"
              >
                <BookOpen size={12} />
                Bu Kitabı Başlat
              </button>
            )}

            {book.status !== 'archived' && book.status !== 'completed' && (
              <button
                onClick={() => { onArchive(book.id); onClose() }}
                className="flex items-center justify-center gap-2 py-2.5 border border-[var(--border-subtle)] text-[var(--text-muted)] text-xs rounded-card hover:text-[var(--text-primary)] transition-colors"
              >
                <Archive size={12} />
                Arşivle
              </button>
            )}
          </div>
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
    </div>
  )
}

function Section({ title, content, highlight }: { title: string; content: string; highlight?: boolean }) {
  return (
    <div>
      <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)] block mb-1">{title}</span>
      <p className={`text-xs leading-relaxed ${highlight ? 'text-cat-teal' : 'text-[var(--text-secondary)]'}`}>{content}</p>
    </div>
  )
}

function NoteCard({ note, icon, color }: { note: BookNote; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-card p-3">
      <div className={`flex items-center gap-1.5 mb-1 ${color}`}>
        {icon}
        <span className="text-[9px] font-mono uppercase tracking-widest">
          {note.type === 'note' ? 'Not' : note.type === 'quote' ? 'Alıntı' : 'Aksiyon'}
        </span>
      </div>
      <p className="text-[var(--text-secondary)] text-xs leading-relaxed">{note.content}</p>
    </div>
  )
}
