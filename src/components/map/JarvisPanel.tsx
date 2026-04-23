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

export function JarvisPanel({ leadsCount = 0 }: { leadsCount?: number }) {
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
      
      // Aksiyon varsa (örneğin scan komutu tetiklendiyse) console'a bas veya zustand store'a yolla
      if (data.action) {
        console.log("JARVIS ACTION TRIGGERED:", data.action)
      }

    } catch (err) {
      setMessages(prev => [...prev, { id: 'err', role: 'assistant', content: '// CATASTROPHIC FAILURE: API ulaşılamıyor.' }])
    } finally {
      setIsTyping(false)
    }
  }

  // Word-by-word streaming effect component
  const AIMessage = ({ content }: { content: string }) => {
    const words = content.split(' ')
    return (
      <div className="flex border-l-2 border-[var(--os-cyan)] pl-3 py-1 my-4">
        <p className="text-[11px] leading-relaxed text-[var(--text-primary)]">
          {words.map((word, i) => (
            <span 
              key={i} 
              className="inline-block mr-1 opacity-0 animate-[wordFadeIn_0.15s_ease-out_forwards]"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              {word}
            </span>
          ))}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#050810] font-mono relative">
      
      {/* Header */}
      <div className="h-12 border-b border-[var(--border-color)] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-bold text-[var(--text-primary)] tracking-widest">// JARVIS LIVE</h2>
          <div className={`w-1.5 h-1.5 rounded-full ${isTyping ? 'bg-[var(--os-cyan)] animate-ping' : 'bg-[var(--text-muted)]'}`}></div>
          <span className="text-[9px] text-[var(--os-cyan)] font-bold tracking-widest uppercase ml-1">
            {isTyping ? 'THINKING' : 'OFFLINE'}
          </span>
        </div>
        <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <Minus className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {messages.map((m) => (
          <div key={m.id} className={`mb-6 ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
            {m.role === 'user' ? (
              <div className="inline-block">
                <div className="text-[9px] text-[var(--os-accent)] mb-1 font-bold tracking-widest flex items-center justify-end gap-1">
                  <Goal className="w-3 h-3" /> ADD_SERVICE_TO_PROJECT
                </div>
                <p className="text-[11px] text-[var(--text-secondary)]">{m.content}</p>
              </div>
            ) : (
              <AIMessage content={m.content} />
            )}
          </div>
        ))}
        {isTyping && (
           <div className="flex border-l-2 border-[var(--os-cyan)] pl-3 py-1 my-4 opacity-50">
             <p className="text-[11px] text-[var(--os-cyan)] animate-pulse tracking-widest">// DÜŞÜNÜYOR...</p>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Sample Commands (only show if no recent messages) */}
      <div className="px-4 pb-2">
        <div className="text-[9px] text-[var(--text-muted)] font-bold tracking-widest mb-2">// ÖRNEK KOMUTLAR</div>
        <div className="space-y-1">
          {SAMPLE_COMMANDS.map((cmd, i) => (
            <button 
              key={i}
              onClick={() => handleSubmit(undefined, cmd)}
              className="block text-left text-[10px] text-[var(--os-cyan)] opacity-70 hover:opacity-100 transition-opacity w-full truncate"
            >
              {`> ${cmd}`}
            </button>
          ))}
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 shrink-0">
        <div className="flex items-center gap-2 text-[var(--os-cyan)] mb-2">
          {isTyping ? (
            <div className="flex gap-1 h-3 items-end opacity-50">
              <div className="w-1 bg-[var(--os-cyan)] h-full animate-[pulse-opacity_1s_infinite]"></div>
              <div className="w-1 bg-[var(--os-cyan)] h-2/3 animate-[pulse-opacity_1s_infinite_0.2s]"></div>
              <div className="w-1 bg-[var(--os-cyan)] h-1/2 animate-[pulse-opacity_1s_infinite_0.4s]"></div>
              <div className="w-1 bg-[var(--os-cyan)] h-2/3 animate-[pulse-opacity_1s_infinite_0.6s]"></div>
              <div className="w-1 bg-[var(--os-cyan)] h-full animate-[pulse-opacity_1s_infinite_0.8s]"></div>
              <span className="text-[9px] font-bold tracking-widest ml-1">JARVIS KONUŞUYOR...</span>
            </div>
          ) : (
            <div className="flex gap-1 h-3 items-center opacity-30">
              <div className="w-1 h-1 bg-[var(--os-cyan)]"></div>
              <div className="w-1 h-1 bg-[var(--os-cyan)]"></div>
              <div className="w-1 h-1 bg-[var(--os-cyan)]"></div>
              <div className="w-1 h-1 bg-[var(--os-cyan)]"></div>
              <div className="w-1 h-1 bg-[var(--os-cyan)]"></div>
              <span className="text-[9px] font-bold tracking-widest ml-1">BEKLEMEDE...</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isTyping}
            placeholder="JARVIS'e yaz... (ses yerine)"
            className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-sm text-xs px-3 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--os-cyan)] transition-colors disabled:opacity-50"
          />
          <button 
            type="submit" 
            disabled={isTyping || !input.trim()}
            className="w-10 h-10 border border-[var(--border-color)] bg-[var(--bg-elevated)] rounded-sm flex items-center justify-center hover:border-[var(--os-cyan)] text-[var(--os-cyan)] transition-colors disabled:opacity-50 disabled:hover:border-[var(--border-color)]"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Bottom info */}
      <div className="h-8 border-t border-[var(--border-color)] shrink-0 flex items-center justify-between px-4">
        <div className="text-[8px] text-[var(--text-muted)] font-bold tracking-widest uppercase">
          GEMİNİ 3 FLASH • {leadsCount} İŞLETME • 1 ŞEHİR • 54 TOOL
        </div>
      </div>

    </div>
  )
}
