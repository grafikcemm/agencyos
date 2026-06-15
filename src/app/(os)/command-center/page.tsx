"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Zap,
  Bot,
  Layers,
  Coins,
  DollarSign,
  Terminal,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  MessageSquare
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

interface Task {
  id: string
  status: string
}

interface DirectiveResult {
  directiveId: string
  status: string
  debrief: string
  taskCount: number
}

const STATUS_VARIANT: Record<string, { dot: string; ring: string; label: string }> = {
  working: { dot: 'bg-[var(--accent)] animate-pulse', ring: 'border-[var(--accent)]/30 text-[var(--accent)]', label: 'ÇALIŞIYOR' },
  error: { dot: 'bg-[var(--danger)]', ring: 'border-[var(--danger)]/30 text-[var(--danger)]', label: 'HATA' },
  done: { dot: 'bg-[var(--success)]', ring: 'border-[var(--success)]/30 text-[var(--success)]', label: 'TAMAM' },
  idle: { dot: 'bg-[var(--text-muted)]', ring: 'border-[var(--border-subtle)] text-[var(--text-muted)]', label: 'BOŞTA' }
}

function statusMeta(status: string) {
  return STATUS_VARIANT[status] ?? STATUS_VARIANT.idle
}

interface EngineStat {
  abbr: string
  title: string
  value: string
  icon: typeof Zap
}

function StatCell({ stat }: { stat: EngineStat }) {
  const Icon = stat.icon
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between h-32 hover:border-[var(--border-highlight)] transition-colors">
      <div className="flex items-start justify-between">
        <span className="text-[10px] font-black tracking-widest text-[var(--accent)] uppercase">[{stat.abbr}]</span>
        <Icon className="w-4 h-4 text-[var(--text-muted)]" />
      </div>
      <div>
        <div className="text-[10px] text-[var(--text-secondary)] tracking-[0.15em] mb-1 font-bold uppercase">{stat.title}</div>
        <div className="num text-3xl font-bold text-[var(--text-primary)] tracking-tight">{stat.value}</div>
      </div>
      <div className="absolute -bottom-5 -right-5 w-14 h-14 border border-[var(--border-subtle)] rounded-full opacity-30" />
    </div>
  )
}

export default function CommandCenterPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<DirectiveResult | null>(null)
  const [directiveError, setDirectiveError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoadingData(true)
    setLoadError(null)
    try {
      const [agentsRes, tasksRes] = await Promise.all([
        fetch('/api/agents', { credentials: 'include' }),
        fetch('/api/tasks?status=queued', { credentials: 'include' })
      ])
      if (!agentsRes.ok) throw new Error('Ajanlar yüklenemedi')
      const agentsData = await agentsRes.json()
      const tasksData = tasksRes.ok ? await tasksRes.json() : { tasks: [] }
      setAgents(Array.isArray(agentsData.agents) ? agentsData.agents : [])
      setTasks(Array.isArray(tasksData.tasks) ? tasksData.tasks : [])
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Veri yüklenemedi')
    } finally {
      setLoadingData(false)
    }
  }

  async function runDirective() {
    if (!input.trim() || running) return
    setRunning(true)
    setDirectiveError(null)
    setResult(null)
    try {
      const res = await fetch('/api/agents/directive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ input })
      })
      if (!res.ok) throw new Error('Direktif çalıştırılamadı')
      const data = await res.json()
      setResult(data)
      loadData()
    } catch (e: unknown) {
      setDirectiveError(e instanceof Error ? e.message : 'Bir hata oluştu')
    } finally {
      setRunning(false)
    }
  }

  const activeAgents = agents.filter(a => a.status === 'working').length
  const queueDepth = tasks.length
  const totalTokens = agents.reduce((acc, a) => acc + a.telemetry.tokensIn + a.telemetry.tokensOut, 0)
  const totalCost = agents.reduce((acc, a) => acc + a.telemetry.costUsd, 0)

  const stats: EngineStat[] = [
    { abbr: 'AJN', title: 'Aktif Ajan', value: String(activeAgents), icon: Bot },
    { abbr: 'KYR', title: 'Kuyruk Derinliği', value: String(queueDepth), icon: Layers },
    { abbr: 'TKN', title: 'Toplam Token', value: totalTokens.toLocaleString('tr-TR'), icon: Coins },
    { abbr: 'USD', title: 'AI Maliyet', value: `$${totalCost.toFixed(2)}`, icon: DollarSign }
  ]

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-base)] p-6 scrollbar-thin">
      <div className="max-w-6xl mx-auto flex flex-col gap-8">

        {/* CURRENT DIRECTIVE */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-[11px] font-black tracking-widest text-[var(--text-secondary)] uppercase">
              Aktif Direktif
            </h2>
          </div>

          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6 space-y-4">
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed font-medium">
              Operasyon hedefini doğal dille tanımla. CEO ajanı görevleri uzmanlara dağıtır ve bir özet brifing döner.
            </p>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              aria-label="Operasyon direktifi"
              placeholder="Örn: Sağlık sektöründeki yeni leadleri analiz et ve en yüksek potansiyelli 5 firmaya teklif taslağı hazırla..."
              className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl text-sm px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] min-h-[120px] leading-relaxed font-medium scrollbar-thin"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-muted)] font-medium tracking-wide">
                {input.trim().length} karakter
              </span>
              <button
                onClick={runDirective}
                disabled={running || !input.trim()}
                className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-black text-xs font-black py-2.5 px-6 rounded-lg transition-all disabled:opacity-50 tracking-wider uppercase"
              >
                <Zap className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
                {running ? 'ÇALIŞIYOR...' : 'Çalıştır'}
              </button>
            </div>

            {directiveError && (
              <div className="flex items-center gap-2 text-[var(--danger)] text-xs font-bold bg-[var(--danger)]/10 border border-[var(--danger)]/20 rounded-lg px-4 py-3">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {directiveError}
              </div>
            )}

            {result && (
              <div className="bg-[var(--bg-base)] border border-[var(--accent)]/30 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[10px] font-black text-[var(--accent)] tracking-widest uppercase">
                    <CheckCircle2 className="w-4 h-4" /> Brifing
                  </span>
                  <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-wider uppercase border border-[var(--border-subtle)] rounded px-2 py-0.5">
                    {result.taskCount} GÖREV · {result.status}
                  </span>
                </div>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap font-medium">
                  {result.debrief}
                </p>
                <Link
                  href="/tasks"
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--accent)] hover:gap-2.5 transition-all uppercase tracking-wider"
                >
                  Görev kuyruğunu izle <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* ENGINE STATUS */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-black tracking-widest text-[var(--text-secondary)] uppercase">
              Motor Durumu
            </h2>
            <span className="text-[9px] text-[var(--text-muted)] font-bold tracking-widest uppercase">SERVERLESS</span>
          </div>
          {loadError ? (
            <div className="flex items-center gap-2 text-[var(--danger)] text-xs font-bold bg-[var(--danger)]/10 border border-[var(--danger)]/20 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {loadError}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map(s => <StatCell key={s.abbr} stat={s} />)}
            </div>
          )}
        </section>

        {/* CHAT WITH AGENT */}
        <section className="space-y-4">
          <h2 className="text-[11px] font-black tracking-widest text-[var(--text-secondary)] uppercase">
            Ajanlarla Sohbet
          </h2>

          {loadingData ? (
            <div className="flex items-center justify-center gap-3 py-12 text-[var(--text-muted)]">
              <div className="w-5 h-5 rounded-full border-2 border-t-[var(--accent)] border-[var(--border-subtle)] animate-spin" />
              <span className="text-xs font-bold tracking-widest uppercase">Ajanlar yükleniyor...</span>
            </div>
          ) : agents.length === 0 ? (
            <div className="text-center py-12 text-xs text-[var(--text-muted)] italic">
              Kayıtlı ajan bulunamadı.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map(agent => {
                const meta = statusMeta(agent.status)
                return (
                  <Link
                    key={agent.key}
                    href="/agents"
                    className="group bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 flex flex-col gap-3 hover:border-[var(--border-highlight)] transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">{agent.name}</h3>
                        <p className="text-[11px] text-[var(--text-muted)] font-medium mt-0.5">{agent.role}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9px] font-black tracking-wider uppercase ${meta.ring}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--accent)] mt-auto group-hover:gap-2.5 transition-all uppercase tracking-wider">
                      <MessageSquare className="w-3.5 h-3.5" /> Sohbet
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
