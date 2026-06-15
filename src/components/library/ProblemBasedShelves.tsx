'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react'
import type { LibraryBook, BookCategory } from '@/data/librarySeed'
import { CATEGORY_LABELS, STATUS_LABELS } from '@/data/librarySeed'
import { BookDetailDrawer } from './BookDetailDrawer'
import type { BookNote } from '@/data/librarySeed'

interface Props {
  books: LibraryBook[]
  getNotes: (bookId: string) => BookNote[]
  onAddNote: (note: Omit<BookNote, 'id' | 'createdAt'>) => void
  onArchive: (bookId: string) => void
  onActivate: (bookId: string) => void
  canActivateNew: boolean
}

const SHELF_ORDER: BookCategory[] = [
  'focus_discipline',
  'mental_resilience',
  'relationships_boundaries',
  'career_creativity',
  'ai_future',
  'design_marketing',
  'strategy_power',
  'literature_character',
  'english_reference',
  'reference',
]

export function ProblemBasedShelves({
  books,
  getNotes,
  onAddNote,
  onArchive,
  onActivate,
  canActivateNew,
}: Props) {
  const [selectedBook, setSelectedBook] = useState<LibraryBook | null>(null)
  const [openShelves, setOpenShelves] = useState<Set<BookCategory>>(
    new Set(['focus_discipline', 'mental_resilience'])
  )

  const toggleShelf = (cat: BookCategory) => {
    setOpenShelves(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const shelvesWithBooks = SHELF_ORDER.map(cat => ({
    category: cat,
    books: books.filter(b => b.category === cat && b.status !== 'archived'),
  })).filter(s => s.books.length > 0)

  return (
    <>
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#555] font-bold">Problem Bazlı Raflar</span>
        </div>

        <div className="space-y-2">
          {shelvesWithBooks.map(({ category, books: shelfBooks }) => (
            <Shelf
              key={category}
              category={category}
              books={shelfBooks}
              isOpen={openShelves.has(category)}
              onToggle={() => toggleShelf(category)}
              onSelect={setSelectedBook}
            />
          ))}
        </div>
      </div>

      {selectedBook && (
        <BookDetailDrawer
          book={selectedBook}
          notes={getNotes(selectedBook.id)}
          onClose={() => setSelectedBook(null)}
          onAddNote={onAddNote}
          onArchive={onArchive}
          onActivate={onActivate}
          canActivateNew={canActivateNew}
        />
      )}
    </>
  )
}

function Shelf({
  category,
  books,
  isOpen,
  onToggle,
  onSelect,
}: {
  category: BookCategory
  books: LibraryBook[]
  isOpen: boolean
  onToggle: () => void
  onSelect: (book: LibraryBook) => void
}) {
  const completedCount = books.filter(b => b.status === 'completed').length
  const activeCount = books.filter(b => b.status === 'active').length

  return (
    <div className="border border-[#1f1f1f] rounded-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 bg-[#0f0f0f] hover:bg-[#111] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs text-white font-display font-medium">{CATEGORY_LABELS[category]}</span>
          <div className="flex items-center gap-2 font-mono">
            <span className="text-[10px] text-[#555]">{books.length} kitap</span>
            {completedCount > 0 && (
              <span className="text-[10px] text-cat-teal">{completedCount} tamamlandı</span>
            )}
            {activeCount > 0 && (
              <span className="text-[10px] text-cat-purple">1 aktif</span>
            )}
          </div>
        </div>
        {isOpen ? <ChevronUp size={12} className="text-[#555]" /> : <ChevronDown size={12} className="text-[#555]" />}
      </button>

      {isOpen && (
        <div className="border-t border-[#1f1f1f] divide-y divide-[#1a1a1a]">
          {books.map(book => (
            <BookRow key={book.id} book={book} onClick={() => onSelect(book)} />
          ))}
        </div>
      )}
    </div>
  )
}

function BookRow({ book, onClick }: { book: LibraryBook; onClick: () => void }) {
  const statusColors: Record<string, string> = {
    active: 'text-cat-purple',
    completed: 'text-cat-teal',
    not_started: 'text-[#444]',
    reference: 'text-cat-blue',
    evening: 'text-cat-purple',
    paused: 'text-cat-orange',
    archived: 'text-[#333]',
  }

  const isCompleted = book.status === 'completed'

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-3 hover:bg-[#111] transition-colors group ${isCompleted ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <BookOpen
          size={12}
          className={`shrink-0 mt-0.5 ${statusColors[book.status] ?? 'text-[#444]'}`}
        />
        <div className="flex-1 min-w-0 text-left">
          <p className={`text-xs truncate ${isCompleted ? 'line-through text-[#555]' : 'text-[#888] group-hover:text-white transition-colors'}`}>
            {book.title}
          </p>
          <p className="text-[10px] text-[#444] truncate mt-0.5">{book.problemItSolves}</p>
        </div>
      </div>
      <span className={`text-[9px] font-mono uppercase tracking-widest shrink-0 ml-3 ${statusColors[book.status] ?? 'text-[#444]'}`}>
        {STATUS_LABELS[book.status]}
      </span>
    </button>
  )
}
