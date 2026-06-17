"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Minus, Copy, Check, Zap, Globe, Building2 } from 'lucide-react'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: string[]
  pendingApproval?: boolean
}

const SAMPLE_COMMANDS = [
  "Bugün kimi arayayım? İlk 5 lead'i nedenleriyle listele.",
  "Beşiktaş'ta kuaför tara",
  "Kadıköy'de diş kliniği bul",
  "Son eklenen lead'i analiz et",
  "Oturumu kaydet"
]

interface JarvisPanelProps {
  leadsCount?: number
  stats?: { new: number; contacted: number; won: number }
  /** Called after a JARVIS tool changed lead data (e.g. scan_leads) so the page can refetch. */
  onLeadsChanged?: () => void | Promise<void>
}

// Tools whose completion means lead rows changed in the DB.
const LEAD_MUTATING_TOOLS = ['scan_leads', 'update_lead_stage', 'create_project', 'disqualify_low_quality']

export function JarvisPanel({ leadsCount = 0, stats, onLeadsChanged }: JarvisPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Sistem başlatıldı. İstanbul bölgesinde hazırım. Komut bekliyorum."
    }
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [toolCounter, setToolCounter] = useState(0)
  const [citiesScanned, setCitiesScanned] = useState(0)
  // Default false: streaming route has no tool support; tool commands need classic route
  const [useStreaming, setUseStreaming] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping])

  // onLeadsChanged is intentionally a dependency: parent passes a stable useCallback.
  const sendClassic = useCallback(async (textToSend: string, existingId?: string) => {
    if (!existingId) {
      const userMsg: Message = { id: Date.now().toString(), role: 'user', content: textToSend }
      setMessages(prev => [...prev, userMsg])
      setInput('')
      setIsTyping(true)
    }

    try {
      const res = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: textToSend })
      })

      const data = await res.json()

      const needsApproval = data.reply?.includes('onay gerekli') ||
        data.reply?.includes('onayla') ||
        data.reply?.includes('TASLAK')

      const assistantMsg: Message = {
        id: existingId || (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply || '// BAĞLANTI HATASI',
        toolCalls: data.tool_calls,
        pendingApproval: needsApproval,
      }

      if (existingId) {
        setMessages(prev => prev.map(m => m.id === existingId ? assistantMsg : m))
      } else {
        setMessages(prev => [...prev, assistantMsg])
      }

      if (data.tool_count) setToolCounter(prev => prev + data.tool_count)
      if (data.tool_calls?.includes('scan_leads')) setCitiesScanned(prev => prev + 1)
      if (data.tool_calls?.some((t: string) => LEAD_MUTATING_TOOLS.includes(t))) {
        await onLeadsChanged?.()
      }

    } catch {
      const errMsg: Message = { id: existingId || 'err', role: 'assistant', content: '// CATASTROPHIC FAILURE: API ulaşılamıyor.' }
      if (existingId) {
        setMessages(prev => prev.map(m => m.id === existingId ? errMsg : m))
      } else {
        setMessages(prev => [...prev, errMsg])
      }
    } finally {
      setIsTyping(false)
    }
  }, [onLeadsChanged])

  const sendStreaming = useCallback(async (textToSend: string) => {
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: textToSend }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    const assistantId = (Date.now() + 1).toString()
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])

    try {
      const res = await fetch('/api/jarvis/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: textToSend })
      })

      if (!res.ok) throw new Error('Stream failed')

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            if (parsed.content) {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: m.content + parsed.content }
                    : m
                )
              )
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: '// Stream bağlantı hatası. Klasik mod deneniyor...' }
            : m
        )
      )
      // Fallback to non-streaming
      await sendClassic(textToSend, assistantId)
    } finally {
      setIsTyping(false)
    }
  }, [sendClassic])

  const handleSubmit = async (e?: React.FormEvent, textOverride?: string) => {
    e?.preventDefault()
    const textToSend = textOverride || input
    if (!textToSend.trim()) return

    if (useStreaming) {
      await sendStreaming(textToSend)
    } else {
      await sendClassic(textToSend)
    }
  }

  const AIMessage = ({ message }: { message: Message }) => {
    const words = message.content.split(' ')
    return (
      <div className="border-l-2 border-[var(--accent)] pl-3 py-1 my-4 group">
        <p className="text-[12px] leading-relaxed text-[var(--text-primary)] flex-1 whitespace-pre-wrap">
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

        {/* Approval badge */}
        {message.pendingApproval && (
          <div className="mt-2 flex items-center gap-2 bg-[var(--accent-muted)] border border-[var(--accent)]/30 rounded-lg px-3 py-2">
            <span className="text-[10px] text-[var(--accent)] font-bold tracking-wider uppercase">⚠️ ONAY BEKLİYOR</span>
            <span className="text-[10px] text-[var(--text-muted)]">• &quot;onayla&quot; veya &quot;gönder&quot; yazın</span>
          </div>
        )}

        {/* Tool calls badge */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.toolCalls.map((tc, i) => (
              <span key={i} className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--accent)]/20">
                {tc.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => {
              navigator.clipboard.writeText(message.content)
              setCopiedId(message.id)
              setTimeout(() => setCopiedId(null), 2000)
            }}
            className="text-[var(--text-muted)] hover:text-[var(--accent)]"
            title="Kopyala"
          >
            {copiedId === message.id
              ? <Check className="w-3 h-3 text-[var(--success)]" />
              : <Copy className="w-3 h-3" />}
          </button>
        </div>
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
          <h2 className="text-[11px] font-bold text-[var(--text-primary)] tracking-widest uppercase">Jarvis v3</h2>
          <div className={`w-1.5 h-1.5 rounded-full ${isTyping ? 'bg-[var(--accent)] animate-ping' : 'bg-[var(--text-muted)]'}`}></div>
          <span className="text-[9px] text-[var(--accent)] font-bold tracking-widest uppercase ml-1">
            {isTyping ? 'Düşünüyor' : 'Hazır'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUseStreaming(!useStreaming)}
            className={`text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded border transition-all ${
              useStreaming
                ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-muted)]'
                : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
            }`}
            title={useStreaming ? 'Streaming açık' : 'Streaming kapalı'}
          >
            {useStreaming ? 'STREAM' : 'KLASİK'}
          </button>
          <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <Minus className="w-4 h-4" />
          </button>
        </div>
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
              <AIMessage message={m} />
            )}
          </div>
        ))}
        {isTyping && messages[messages.length - 1]?.role !== 'assistant' && (
           <div className="flex border-l-2 border-[var(--accent)] pl-3 py-1 my-4 opacity-50">
             <p className="text-[12px] text-[var(--accent)] animate-pulse tracking-widest">{'// DÜŞÜNÜYOR...'}</p>
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

      {/* Footer Counter */}
      <div className="h-8 border-t border-[var(--border-subtle)] shrink-0 flex items-center justify-between px-4 bg-[var(--bg-base)]">
        <div className="flex items-center gap-3 text-[8px] text-[var(--text-muted)] font-bold tracking-widest uppercase">
          <span className="flex items-center gap-1">
            <Building2 className="w-2.5 h-2.5" />
            {leadsCount} İşletme
          </span>
          <span className="flex items-center gap-1">
            <Globe className="w-2.5 h-2.5" />
            {citiesScanned} Şehir
          </span>
          <span className="flex items-center gap-1">
            <Zap className="w-2.5 h-2.5" />
            {toolCounter} Tool
          </span>
        </div>
        <span className="text-[8px] text-[var(--text-muted)] font-bold tracking-widest uppercase">
          Gemini Flash Lite
        </span>
      </div>

    </div>
  )
}
