"use client"

import { useState, useRef, useEffect } from 'react'
import { Send, Minus, Goal } from 'lucide-react'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const SAMPLE_COMMANDS = [
  "Günaydın, bugün ne var?",
  "Ödemeleri kontrol et",
  "Destek talepleri var mı?",
  "Sosyal medyayı denetle",
  "Beşiktaş'ta kuaför tara"
]

interface JarvisPanelProps {
  leadsCount?: number
  stats?: { new: number; contacted: number; won: number }
}

export function JarvisPanel({ leadsCount = 0, stats }: JarvisPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Sistem başlatıldı. İstanbul bölgesinde 80 yeni işletme tespit ettim. Drip kampanyalarına başlamak için talimat bekliyorum."
    }
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping])

  const handleSubmit = async (e?: React.FormEvent, textOverride?: string) => {
    e?.preventDefault()
    
    const textToSend = textOverride || input
    if (!textToSend.trim()) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: textToSend }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    try {
      const res = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: textToSend })
      })

      const data = await res.json()
      
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply || '// BAĞLANTI HATASI'
      }
      setMessages(prev => [...prev, assistantMsg])
      
      if (data.action) {
        console.log("JARVIS ACTION TRIGGERED:", data.action)
      }

    } catch (err) {
      setMessages(prev => [...prev, { id: 'err', role: 'assistant', content: '// CATASTROPHIC FAILURE: API ulaşılamıyor.' }])
    } finally {
      setIsTyping(false)
    }
  }

  const AIMessage = ({ content }: { content: string }) => {
    const words = content.split(' ')
    return (
      <div className="flex border-l-2 border-[var(--accent)] pl-3 py-1 my-4">
        <p className="text-[12px] leading-relaxed text-[var(--text-primary)]">
          {words.map((word, i) => (
            <span 
              key={i} 
              className="inline-block mr-1 opacity-0 animate-[wordFadeIn_0.15s_ease-out_forwards]"
              style={{ animationDelay: `${i * 20}ms` }}
            >
              {word}
            </span>
          ))}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] font-sans relative">
      
      {/* Stats Badges */}
      {stats && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border-subtle)] shrink-0 bg-[var(--bg-base)]">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            <span className="text-[10px] font-bold text-[var(--text-primary)]">{stats.new}</span>
            <span className="text-[10px] text-[var(--text-muted)] font-medium">YENİ</span>
          </div>
          <div className="w-px h-3 bg-[var(--border-subtle)]" />
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
            <span className="text-[10px] font-bold text-[var(--text-primary)]">{stats.won}</span>
            <span className="text-[10px] text-[var(--text-muted)] font-medium">KAZANILDI</span>
          </div>
          <div className="w-px h-3 bg-[var(--border-subtle)]" />
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--info)]" />
            <span className="text-[10px] font-bold text-[var(--text-primary)]">{stats.contacted}</span>
            <span className="text-[10px] text-[var(--text-muted)] font-medium">İLETİŞİM</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="h-12 border-b border-[var(--border-subtle)] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-bold text-[var(--text-primary)] tracking-widest uppercase">Jarvis Live</h2>
          <div className={`w-1.5 h-1.5 rounded-full ${isTyping ? 'bg-[var(--accent)] animate-ping' : 'bg-[var(--text-muted)]'}`}></div>
          <span className="text-[9px] text-[var(--accent)] font-bold tracking-widest uppercase ml-1">
            {isTyping ? 'Düşünüyor' : 'Hazır'}
          </span>
        </div>
        <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <Minus className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => (
          <div key={m.id} className={`${m.role === 'user' ? 'text-right' : 'text-left'}`}>
            {m.role === 'user' ? (
              <div className="inline-block bg-[var(--bg-base)] border border-[var(--border-subtle)] p-3 rounded-lg max-w-[90%]">
                <p className="text-[12px] text-[var(--text-secondary)]">{m.content}</p>
              </div>
            ) : (
              <AIMessage content={m.content} />
            )}
          </div>
        ))}
        {isTyping && (
           <div className="flex border-l-2 border-[var(--accent)] pl-3 py-1 my-4 opacity-50">
             <p className="text-[12px] text-[var(--accent)] animate-pulse tracking-widest">// DÜŞÜNÜYOR...</p>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Sample Commands */}
      <div className="px-4 pb-4">
        <div className="text-[9px] text-[var(--text-muted)] font-bold tracking-widest mb-2 uppercase">Örnek Komutlar</div>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_COMMANDS.map((cmd, i) => (
            <button 
              key={i}
              onClick={() => handleSubmit(undefined, cmd)}
              className="text-left text-[10px] text-[var(--text-secondary)] border border-[var(--border-subtle)] px-2 py-1 rounded hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 shrink-0 border-t border-[var(--border-subtle)]">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isTyping}
            placeholder="Mesajınızı yazın..."
            className="flex-1 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-sm px-4 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-50"
          />
          <button 
            type="submit" 
            disabled={isTyping || !input.trim()}
            className="w-10 h-10 bg-[var(--accent)] text-white rounded-lg flex items-center justify-center hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Bottom info */}
      <div className="h-8 border-t border-[var(--border-subtle)] shrink-0 flex items-center justify-between px-4 bg-[var(--bg-base)]">
        <div className="text-[8px] text-[var(--text-muted)] font-bold tracking-widest uppercase">
          Claude 4.5 Haiku • {leadsCount} İşletme • Grafikcem Agent
        </div>
      </div>

    </div>
  )
}
