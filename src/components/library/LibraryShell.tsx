'use client'

import { useLibrary } from '@/hooks/useLibrary'
import { LibraryCommandCenter } from './LibraryCommandCenter'
import { ActiveBookCard } from './ActiveBookCard'
import { ReadingLadder } from './ReadingLadder'
import { ProblemBasedShelves } from './ProblemBasedShelves'
import { LibraryAssistantPanel } from './LibraryAssistantPanel'
import type { BookCompletion } from '@/data/librarySeed'

// uiMode prop is accepted for API compatibility with the caller but not consumed here
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function LibraryShell({ uiMode }: { uiMode: 'koruma' | 'denge' | 'atak' }) {
  const {
    activeBook,
    completedCount,
    notesThisMonth,
    actionsThisMonth,
    totalBooks,
    canActivateNew,
    state,
    activateBook,
    archiveBookById,
    completeBookById,
    addNoteToBook,
    getBookNotes,
    getMainReadingLadder,
  } = useLibrary()

  const ladderBooks = getMainReadingLadder()
  const nextBook = ladderBooks.find(b => b.status === 'not_started' && b.priority === 'next')

  const handleComplete = (data: {
    notes: string[]
    feedTheGoatAction: string
    problemSolved: string
    readyForNext: boolean
    lifeImpact: string
  }) => {
    if (!activeBook) return
    const completion: BookCompletion = {
      bookId: activeBook.id,
      ...data,
      completedAt: new Date().toISOString(),
    }
    completeBookById(completion)
  }

  // ADHD restriction: only show active book + next 3 books
  const firstIncompleteIdx = ladderBooks.findIndex(b => b.status !== 'completed')
  const visibleLadderBooks = firstIncompleteIdx !== -1
    ? ladderBooks.slice(firstIncompleteIdx, firstIncompleteIdx + 4)
    : []

  return (
    <div className="max-w-2xl mx-auto px-4 pb-16 space-y-8">
      {/* Section 1: Command Center */}
      <section>
        <LibraryCommandCenter
          totalBooks={totalBooks}
          completedCount={completedCount}
          notesThisMonth={notesThisMonth}
          actionsThisMonth={actionsThisMonth}
          weeklyGoalPages={state.weeklyReadingGoalPages}
          activeBookTitle={activeBook?.title}
          nextBookTitle={nextBook?.title}
        />
      </section>

      {/* Section 2: Active Book */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#555] font-bold">Aktif Kitap</span>
        </div>
        <ActiveBookCard
          book={activeBook}
          notes={activeBook ? getBookNotes(activeBook.id) : []}
          onAddNote={addNoteToBook}
          onComplete={handleComplete}
        />
      </section>

      {/* Section 3: Reading Ladder (restricted view) */}
      <section>
        <ReadingLadder
          books={visibleLadderBooks}
          onActivate={activateBook}
          canActivateNew={canActivateNew}
        />
      </section>

      {/* Collapsiblebottom container for secondary library panels */}
      <details className="group border border-[#1f1f1f] rounded-card overflow-hidden mt-6 bg-[#0c0c0d]/30 shadow-soft">
        <summary className="w-full flex items-center justify-between p-4 text-left font-mono text-xs text-[#555] hover:text-white cursor-pointer select-none">
          <span>Kitaplık Deposu &amp; Park Edilenler (Tüm Kitaplar &amp; Raflar)</span>
          <span className="text-[#333] font-mono text-sm group-open:hidden">+</span>
          <span className="text-[#333] font-mono text-sm hidden group-open:inline">−</span>
        </summary>
        <div className="p-4 space-y-8 border-t border-[#1f1f1f]/30">
          {/* Section 4: Problem-based shelves */}
          <section>
            <ProblemBasedShelves
              books={state.books}
              getNotes={getBookNotes}
              onAddNote={addNoteToBook}
              onArchive={archiveBookById}
              onActivate={activateBook}
              canActivateNew={canActivateNew}
            />
          </section>

          {/* Section 5: AI Assistant */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#555] font-bold">Kitap Koçu</span>
            </div>
            <LibraryAssistantPanel
              activeBook={activeBook}
              completedCount={completedCount}
              totalBooks={totalBooks}
            />
          </section>
        </div>
      </details>
    </div>
  )
}
