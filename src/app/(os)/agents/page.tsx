"use client"

import { useState, useEffect, useRef } from 'react'
import {
  Crown,
  Bot,
  Send,
  X,
  AlertTriangle,
  Cpu,
  ListChecks,
  Coins,
  XCircle
} from 'lucide-react'

interface AgentTelemetry {
  taskCount: number
  doneCount: number
  errorCount: number
  tokensIn: number
  tokensOut: number
  costUsd: number
}

interface Agent {
  key: string
  name: string
  role: string
  description: string
  model: string
  status: string
  sort_order: number
  telemetry: AgentTelemetry
}

interface ChatMessage {
  from: 'operator' | 'agent'
  text: string
  tokensIn?: number
  tokensOut?: number
}

const STATUS_VARIANT: Record<string, { dot: string; ring: string; label: string }> = {
  working: { dot: 'bg-[var(--accent)] animate-pulse', ring: 'border-[var(--accent)]/30 text-[var(--accent)]', label: 'ÇALIŞIYOR' },
  error: { dot: 'bg-red-500', ring: 'border-red-500/30 text-red-400', label: 'HATA' },
  done: { dot: 'bg-emerald-500', ring: 'border-emerald-500/30 text-emerald-400', label: 'TAMAM' },
  idle: { dot: 'bg-[var(--text-muted)]', ring: 'border-[var(--border-subtle)] text-[var(--text-muted)]', label: 'BOŞTA' }
}

function statusMeta(status: string) {
  return STATUS_VARIANT[status] ?? STATUS_VARIANT.idle
}

function MiniStat({ icon: Icon, label, value, danger }: { icon: typeof Cpu; label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-[8px] font-black tracking-wider text-[var(--text-muted)] uppercase">
        <Icon className="w-3 h-3" /> {label}
      </span>
      <span className={`text-sm font-bold ${danger ? 'text-red-400' : 'text-[var(--text-primary)]'}`}>{value}</span>
    </div>
  )
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeAgent, setActiveAgent] = useState<Agent | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadAgents()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadAgents() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/agents', { credentials: 'include' })
      if (!res.ok) throw new Error('Ajanlar yüklenemedi')
      const data = await res.json()
      setAgents(Array.isArray(data.agents) ? data.agents : [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ajanlar yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  function openChat(agent: Agent) {
    setActiveAgent(agent)
    setMessages([])
    setDraft('')
  }

  async function sendMessage() {
    if (!draft.trim() || !activeAgent || sending) return
    const message = draft.trim()
    setMessages(prev => [...prev, { from: 'operator', text: message }])
    setDraft('')
    setSending(true)
    try {
      const res = await fetch(`/api/agents/${activeAgent.key}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message })
      })
      if (!res.ok) throw new Error('Yanıt alınamadı')
      const data = await res.json()
      setMessages(prev => [...prev, {
        from: 'agent',
        text: data.reply ?? '(boş yanıt)',
        tokensIn: data.tokensIn,
        tokensOut: data.tokensOut
      }])
    } catch (e: unknown) {
      setMessages(prev => [...prev, { from: 'agent', text: `Hata: ${e instanceof Error ? e.message : 'Yanıt alınamadı'}` }])
    } finally {
      setSending(false)
    }
  }

  const ceo = agents.find(a => a.key === 'ceo' || a.sort_order === 1)
  const specialists = agents.filter(a => a !== ceo)

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden bg-[var(--bg-base)]">
      {/* Agent network */}
      <div className={`flex-1 overflow-y-auto p-6 scrollbar-thin transition-all ${activeAgent ? 'hidden lg:block' : ''}`}>
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-[var(--text-muted)]">
            <div className="w-6 h-6 rounded-full border-2 border-t-[var(--accent)] border-[var(--border-subtle)] animate-spin" />
            <span className="text-xs font-bold tracking-widest uppercase">Ajan ağı yükleniyor...</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-400 text-xs font-bold bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 max-w-md">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-20 text-xs text-[var(--text-muted)] italic">Kayıtlı ajan bulunamadı.</div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-8">

            {/* CEO HERO */}
            {ceo && (
              <button
                onClick={() => openChat(ceo)}
                className="w-full text-left bg-gradient-to-br from-[var(--accent-muted)] to-transparent border border-[var(--accent)]/30 rounded-3xl p-6 hover:border-[var(--accent)] transition-all relative overflow-hidden group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--accent)] flex items-center justify-center shrink-0 shadow-lg shadow-[var(--accent)]/25">
                      <Crown className="w-6 h-6 text-black" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-black text-[var(--text-primary)]">{ceo.name}</h2>
                        <span className="text-[9px] font-black tracking-widest text-[var(--accent)] uppercase border border-[var(--accent)]/30 rounded px-1.5 py-0.5">CEO</span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] font-semibold">{ceo.role}</p>
                      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed max-w-xl mt-1">{ceo.description}</p>
                      <p className="text-[10px] font-mono text-[var(--text-muted)] mt-1">{ceo.model}</p>
                    </div>
                  </div>
                  {(() => {
                    const meta = statusMeta(ceo.status)
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[9px] font-black tracking-wider uppercase shrink-0 ${meta.ring}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                      </span>
                    )
                  })()}
                </div>
                <div className="flex gap-8 mt-5 pt-5 border-t border-[var(--accent)]/15">
                  <MiniStat icon={ListChecks} label="Görev" value={String(ceo.telemetry.taskCount)} />
                  <MiniStat icon={XCircle} label="Hata" value={String(ceo.telemetry.errorCount)} danger={ceo.telemetry.errorCount > 0} />
                  <MiniStat icon={Coins} label="Token" value={(ceo.telemetry.tokensIn + ceo.telemetry.tokensOut).toLocaleString('tr-TR')} />
                </div>
              </button>
            )}

            {/* Hierarchy connector */}
            <div className="flex flex-col items-center gap-1 -my-3">
              <div className="w-px h-6 bg-[var(--border-highlight)]" />
              <span className="text-[8px] font-black tracking-widest text-[var(--text-muted)] uppercase">Uzman Ajanlar</span>
            </div>

            {/* SPECIALISTS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {specialists.map(agent => {
                const meta = statusMeta(agent.status)
                return (
                  <button
                    key={agent.key}
                    onClick={() => openChat(agent)}
                    className="text-left bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 flex flex-col gap-3 hover:border-[var(--border-highlight)] transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
                          <Bot className="w-4 h-4 text-[var(--accent)]" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-[var(--text-primary)]">{agent.name}</h3>
                          <p className="text-[10px] text-[var(--text-muted)] font-medium">{agent.role}</p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[8px] font-black tracking-wider uppercase shrink-0 ${meta.ring}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-[var(--text-muted)] truncate">{agent.model}</p>
                    <div className="flex gap-5 mt-auto pt-3 border-t border-[var(--border-subtle)]">
                      <MiniStat icon={ListChecks} label="Görev" value={String(agent.telemetry.taskCount)} />
                      <MiniStat icon={XCircle} label="Hata" value={String(agent.telemetry.errorCount)} danger={agent.telemetry.errorCount > 0} />
                      <MiniStat icon={Coins} label="Token" value={(agent.telemetry.tokensIn + agent.telemetry.tokensOut).toLocaleString('tr-TR')} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* CHAT PANEL */}
      {activeAgent && (
        <div className="w-full lg:w-[420px] shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)] shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
                {activeAgent.key === 'ceo' ? <Crown className="w-4 h-4 text-[var(--accent)]" /> : <Bot className="w-4 h-4 text-[var(--accent)]" />}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">{activeAgent.name}</h3>
                <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">{activeAgent.model}</p>
              </div>
            </div>
            <button
              onClick={() => setActiveAgent(null)}
              aria-label="Sohbeti kapat"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin">
            {messages.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic text-center py-10">
                {activeAgent.role} ile sohbete başlayın.
              </p>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`flex ${m.from === 'operator' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                    m.from === 'operator'
                      ? 'bg-[var(--accent)] text-white font-semibold'
                      : 'bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-medium'
                  }`}>
                    {m.text}
                    {m.from === 'agent' && (m.tokensIn !== undefined || m.tokensOut !== undefined) && (
                      <div className="mt-1.5 text-[9px] text-[var(--text-muted)] font-mono">
                        {(m.tokensIn ?? 0) + (m.tokensOut ?? 0)} token
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-2xl px-4 py-2.5">
                  <div className="w-4 h-4 rounded-full border-2 border-t-[var(--accent)] border-[var(--border-subtle)] animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-[var(--border-subtle)] shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder="Mesaj yaz..."
                aria-label="Ajana mesaj"
                rows={1}
                className="flex-1 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl text-xs px-3 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] resize-none max-h-32 scrollbar-thin font-medium"
              />
              <button
                onClick={sendMessage}
                disabled={sending || !draft.trim()}
                aria-label="Mesaj gönder"
                className="w-10 h-10 flex items-center justify-center bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl transition-all disabled:opacity-50 shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
