'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { LibraryBook, BookNote } from '@/data/librarySeed'

interface Props {
  book: LibraryBook
  onClose: () => void
  onSave: (note: Omit<BookNote, 'id' | 'createdAt'>) => void
}

export function AddNoteModal({ book, onClose, onSave }: Props) {
  const [type, setType] = useState<'note' | 'quote' | 'action'>('note')
  const [content, setContent] = useState('')

  const typeLabels = { note: 'Not', quote: 'Alıntı', action: 'Aksiyon' }
  const placeholders = {
    note: 'Bu kitaptan öğrendiğin önemli bir şey...',
    quote: 'Seni etkileyen bir alıntı...',
    action: 'Bu kitaptan çıkan uygulanabilir bir aksiyon...',
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#111] border border-[#1f1f1f] rounded-card w-full max-w-lg shadow-soft">
        <div className="flex items-center justify-between p-4 border-b border-[#1f1f1f]">
          <div>
            <p className="text-[9px] font-mono uppercase tracking-widest text-[#555]">Not Ekle</p>
            <p className="text-white text-sm font-display font-medium mt-0.5">{book.title}</p>
          </div>
          <button onClick={onClose} className="text-[#555] hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            {(['note', 'quote', 'action'] as const).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 py-2 text-xs rounded-card transition-colors ${
                  type === t
                    ? 'bg-cat-purple/15 border border-cat-purple/40 text-cat-purple font-bold'
                    : 'bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:text-white'
                }`}
              >
                {typeLabels[t]}
              </button>
            ))}
          </div>

          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={placeholders[type]}
            rows={4}
            className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-card p-3 text-white text-sm resize-none focus:outline-none focus:border-cat-purple/40 placeholder:text-[#444]"
          />

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-[#2a2a2a] text-[#888] text-xs rounded-card hover:text-white transition-colors"
            >
              İptal
            </button>
            <button
              onClick={() => {
                if (!content.trim()) return
                onSave({ bookId: book.id, type, content: content.trim() })
              }}
              disabled={!content.trim()}
              className="flex-1 py-2.5 bg-cat-purple text-black font-display font-bold text-xs rounded-card disabled:opacity-40 hover:bg-cat-purple/90 transition-colors"
            >
              Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
