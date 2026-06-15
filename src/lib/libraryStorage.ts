'use client'

import {
  LibraryState,
  LibraryBook,
  BookNote,
  BookCompletion,
  LIBRARY_STORAGE_KEY,
  getInitialLibraryState,
} from '@/data/librarySeed'

export function loadLibraryState(): LibraryState {
  if (typeof window === 'undefined') return getInitialLibraryState()
  try {
    const raw = localStorage.getItem(LIBRARY_STORAGE_KEY)
    if (!raw) return getInitialLibraryState()
    return JSON.parse(raw) as LibraryState
  } catch {
    return getInitialLibraryState()
  }
}

export function saveLibraryState(state: LibraryState): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify({
      ...state,
      lastUpdated: new Date().toISOString(),
    }))
  } catch {
    // ignore storage errors
  }
}

export function getActiveBook(state: LibraryState): LibraryBook | null {
  return state.books.find(b => b.status === 'active') ?? null
}

export function getMainLinearBooks(state: LibraryState): LibraryBook[] {
  return state.books
    .filter(b => b.readingMode === 'main_linear' && b.status !== 'archived' && b.status !== 'completed')
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
}

export function getNotesForBook(state: LibraryState, bookId: string): BookNote[] {
  return state.notes.filter(n => n.bookId === bookId).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

export function getCompletionForBook(state: LibraryState, bookId: string): BookCompletion | null {
  return state.completions.find(c => c.bookId === bookId) ?? null
}

export function countCompletedBooks(state: LibraryState): number {
  return state.books.filter(b => b.status === 'completed').length
}

export function countNotesThisMonth(state: LibraryState): number {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  return state.notes.filter(n => n.createdAt >= monthStart).length
}

export function countActionsThisMonth(state: LibraryState): number {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  return state.notes.filter(n => n.type === 'action' && n.createdAt >= monthStart).length
}

export function canActivateNewMainBook(state: LibraryState): boolean {
  return !state.books.some(b => b.status === 'active' && b.readingMode === 'main_linear')
}

export function setBookActive(state: LibraryState, bookId: string): LibraryState {
  if (!canActivateNewMainBook(state)) {
    throw new Error('Önce aktif kitabı bitir veya arşive al.')
  }
  return {
    ...state,
    books: state.books.map(b =>
      b.id === bookId ? { ...b, status: 'active' } : b
    ),
  }
}

export function archiveBook(state: LibraryState, bookId: string): LibraryState {
  return {
    ...state,
    books: state.books.map(b =>
      b.id === bookId ? { ...b, status: 'archived' } : b
    ),
  }
}

export function completeBook(state: LibraryState, completion: BookCompletion): LibraryState {
  return {
    ...state,
    books: state.books.map(b =>
      b.id === completion.bookId ? { ...b, status: 'completed' } : b
    ),
    completions: [...state.completions.filter(c => c.bookId !== completion.bookId), completion],
  }
}

export function addNote(state: LibraryState, note: Omit<BookNote, 'id' | 'createdAt'>): LibraryState {
  const newNote: BookNote = {
    ...note,
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  }
  return {
    ...state,
    notes: [...state.notes, newNote],
  }
}

export function deleteNote(state: LibraryState, noteId: string): LibraryState {
  return {
    ...state,
    notes: state.notes.filter(n => n.id !== noteId),
  }
}

export function updateBook(state: LibraryState, bookId: string, updates: Partial<LibraryBook>): LibraryState {
  return {
    ...state,
    books: state.books.map(b => b.id === bookId ? { ...b, ...updates } : b),
  }
}

export function addBook(state: LibraryState, book: LibraryBook): LibraryState {
  return {
    ...state,
    books: [...state.books, book],
  }
}
