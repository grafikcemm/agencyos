"use client"

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, AlertTriangle, Clock, Bot } from 'lucide-react'

interface Task {
  id: string
  directive_id: string
  agent_key: string
  title: string
  status: string
  tokens_in: number
  tokens_out: number
  error: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

const COLUMNS: { status: string; label: string; accent: string; dot: string }[] = [
  { status: 'queued', label: 'KUYRUKTA', accent: 'text-[var(--text-secondary)]', dot: 'bg-[var(--text-muted)]' },
  { status: 'working', label: 'ÇALIŞIYOR', accent: 'text-[var(--accent)]', dot: 'bg-[var(--accent)] animate-pulse' },
  { status: 'done', label: 'TAMAMLANDI', accent: 'text-emerald-400', dot: 'bg-emerald-500' },
  { status: 'error', label: 'HATA', accent: 'text-red-400', dot: 'bg-red-500' }
]

const REFRESH_INTERVAL_MS = 15000

function relativeTime(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'az önce'
  if (mins < 60) return `${mins} dk önce`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} sa önce`
  const days = Math.floor(hours / 24)
  return `${days} gün önce`
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadTasks = useCallback(async (isAuto = false) => {
    if (isAuto) setRefreshing(true)
    try {
      const res = await fetch('/api/tasks?limit=100', { credentials: 'include' })
      if (!res.ok) throw new Error('Görevler yüklenemedi')
      const data = await res.json()
      setTasks(Array.isArray(data.tasks) ? data.tasks : [])
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Görevler yüklenemedi')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    // loadTasks is an async fetch callback; setState runs after await, not synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount + polling, not a synchronous render-time setState
    loadTasks()
    const id = setInterval(() => loadTasks(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [loadTasks])

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--bg-base)]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="label-eyebrow">Görev Kuyruğu</h2>
          <span className="text-[9px] text-[var(--text-muted)] font-bold tracking-wider uppercase border-l border-[var(--border-subtle)] pl-2">
            {tasks.length} GÖREV
          </span>
        </div>
        <button
          onClick={() => loadTasks(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-highlight)] rounded-lg text-[10px] font-bold text-[var(--text-secondary)] transition-all uppercase tracking-wider disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Yenile
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 flex-1 text-[var(--text-muted)]">
          <div className="w-6 h-6 rounded-full border-2 border-t-[var(--accent)] border-[var(--border-subtle)] animate-spin" />
          <span className="text-xs font-bold tracking-widest uppercase">Görevler yükleniyor...</span>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-red-400 text-xs font-bold bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 scrollbar-thin">
          <div className="grid grid-cols-4 gap-4 h-full min-w-[900px]">
            {COLUMNS.map(col => {
              const colTasks = tasks.filter(t => t.status === col.status)
              return (
                <div key={col.status} className="flex flex-col h-full min-h-0">
                  <div className="flex items-center justify-between mb-3 shrink-0">
                    <span className={`flex items-center gap-2 text-[10px] font-black tracking-widest uppercase ${col.accent}`}>
                      <span className={`w-2 h-2 rounded-full ${col.dot}`} /> {col.label}
                    </span>
                    <span className="text-[10px] font-bold text-[var(--text-muted)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5">
                      {colTasks.length}
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
                    {colTasks.length === 0 ? (
                      <div className="text-[10px] text-[var(--text-muted)] italic text-center py-6 border border-dashed border-[var(--border-subtle)] rounded-xl">
                        Görev yok
                      </div>
                    ) : (
                      colTasks.map(task => (
                        <div
                          key={task.id}
                          className={`bg-[var(--bg-surface)] border rounded-xl p-3.5 space-y-2.5 transition-colors hover:border-[var(--border-highlight)] ${
                            task.status === 'error' ? 'border-red-500/20' : 'border-[var(--border-subtle)]'
                          }`}
                        >
                          <p className="text-xs font-semibold text-[var(--text-primary)] leading-snug">{task.title}</p>

                          {task.status === 'error' && task.error && (
                            <p className="text-[10px] text-red-400 leading-relaxed bg-red-500/5 border border-red-500/15 rounded-lg px-2 py-1.5 font-medium">
                              {task.error}
                            </p>
                          )}

                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[var(--text-secondary)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 uppercase tracking-wider">
                              <Bot className="w-2.5 h-2.5" /> {task.agent_key}
                            </span>
                            <span className="text-[9px] font-mono text-[var(--text-muted)]">
                              {(task.tokens_in + task.tokens_out).toLocaleString('tr-TR')} tk
                            </span>
                          </div>

                          <div className="flex items-center gap-1 text-[9px] text-[var(--text-muted)] font-medium">
                            <Clock className="w-2.5 h-2.5" /> {relativeTime(task.created_at)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
