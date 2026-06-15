'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  LibraryState,
  LibraryBook,
  BookNote,
  BookCompletion,
  BookCategory,
  BookStatus,
  ReadingMode,
} from '@/data/librarySeed'
import {
  loadLibraryState,
  saveLibraryState,
  getActiveBook,
  getNotesForBook,
  getCompletionForBook,
  countCompletedBooks,
  countNotesThisMonth,
  countActionsThisMonth,
  canActivateNewMainBook,
  setBookActive,
  archiveBook,
  completeBook,
  addNote,
  deleteNote,
  updateBook,
  addBook,
} from '@/lib/libraryStorage'

export function useLibrary() {
  const [state, setState] = useState<LibraryState>(() => loadLibraryState())

  useEffect(() => {
    saveLibraryState(state)
  }, [state])

  const activeBook = getActiveBook(state)
  const completedCount = countCompletedBooks(state)
  const notesThisMonth = countNotesThisMonth(state)
  const actionsThisMonth = countActionsThisMonth(state)

  const activateBook = useCallback((bookId: string) => {
    setState(prev => {
      if (!canActivateNewMainBook(prev)) {
        throw new Error('ACTIVE_EXISTS')
      }
      return setBookActive(prev, bookId)
    })
  }, [])

  const archiveBookById = useCallback((bookId: string) => {
    setState(prev => archiveBook(prev, bookId))
  }, [])

  const completeBookById = useCallback((completion: BookCompletion) => {
    setState(prev => completeBook(prev, completion))
  }, [])

  const addNoteToBook = useCallback((note: Omit<BookNote, 'id' | 'createdAt'>) => {
    setState(prev => addNote(prev, note))
  }, [])

  const deleteNoteById = useCallback((noteId: string) => {
    setState(prev => deleteNote(prev, noteId))
  }, [])

  const updateBookById = useCallback((bookId: string, updates: Partial<LibraryBook>) => {
    setState(prev => updateBook(prev, bookId, updates))
  }, [])

  const addNewBook = useCallback((book: LibraryBook) => {
    setState(prev => addBook(prev, book))
  }, [])

  const getBookNotes = useCallback((bookId: string) => {
    return getNotesForBook(state, bookId)
  }, [state])

  const getBookCompletion = useCallback((bookId: string) => {
    return getCompletionForBook(state, bookId)
  }, [state])

  const getBooksByCategory = useCallback((category: BookCategory) => {
    return state.books.filter(b => b.category === category && b.status !== 'archived')
  }, [state])

  const getBooksByStatus = useCallback((status: BookStatus) => {
    return state.books.filter(b => b.status === status)
  }, [state])

  const getMainReadingLadder = useCallback(() => {
    return state.books
      .filter(b => b.readingMode === 'main_linear' && b.status !== 'archived')
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
  }, [state])

  const getReferenceBooks = useCallback(() => {
    return state.books.filter(b => b.status === 'reference' || b.readingMode === 'reference')
  }, [state])

  const getEveningBooks = useCallback(() => {
    return state.books.filter(b => b.status === 'evening' || b.readingMode === 'evening')
  }, [state])

  const changeBookStatus = useCallback((bookId: string, newStatus: BookStatus) => {
    setState(prev => updateBook(prev, bookId, { status: newStatus }))
  }, [])

  const changeReadingMode = useCallback((bookId: string, mode: ReadingMode) => {
    setState(prev => updateBook(prev, bookId, { readingMode: mode }))
  }, [])

  return {
    state,
    activeBook,
    completedCount,
    notesThisMonth,
    actionsThisMonth,
    totalBooks: state.books.filter(b => b.status !== 'archived').length,
    canActivateNew: canActivateNewMainBook(state),
    activateBook,
    archiveBookById,
    completeBookById,
    addNoteToBook,
    deleteNoteById,
    updateBookById,
    addNewBook,
    getBookNotes,
    getBookCompletion,
    getBooksByCategory,
    getBooksByStatus,
    getMainReadingLadder,
    getReferenceBooks,
    getEveningBooks,
    changeBookStatus,
    changeReadingMode,
  }
}
