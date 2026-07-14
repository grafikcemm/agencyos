"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
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
  Mail,
} from "lucide-react"

// ── Aktif Direktif (CEO ajanı doğal dil → görev dağıtımı) ──────────────────────
interface DirectiveResult {
  directiveId: string
  status: string
  debrief: string
  taskCount: number
}

export function DirectivePanel() {
  const [input, setInput] = useState("")
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<DirectiveResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runDirective() {
    if (!input.trim() || running) return
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/agents/directive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ input }),
      })
      if (!res.ok) throw new Error("Direktif çalıştırılamadı")
      setResult(await res.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu")
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Terminal className="w-4 h-4 text-[var(--accent)]" />
        <h2 className="label-eyebrow">
          Aktif Direktif
        </h2>
      </div>

      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6 space-y-4">
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed font-medium">
          Operasyon hedefini doğal dille tanımla. CEO ajanı görevleri uzmanlara dağıtır ve bir özet brifing döner.
        </p>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
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
            className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-black py-2.5 px-6 rounded-lg transition-all disabled:opacity-50 tracking-wider uppercase"
          >
            <Zap className={`w-3.5 h-3.5 ${running ? "animate-spin" : ""}`} />
            {running ? "ÇALIŞIYOR..." : "Çalıştır"}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-[var(--danger)] text-xs font-bold bg-[var(--danger)]/10 border border-[var(--danger)]/20 rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
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
  )
}

// ── Cold Email KPI (positive reply / bounce — open rate KULLANILMAZ) ───────────
interface OutreachMetrics {
  totalSent: number
  replyCount: number
  replyRate: number
  positiveReplyRate: number
  bounceRate: number
  sampleSufficient: boolean
  benchmark: "insufficient" | "below" | "ok" | "good"
}

interface SegmentTelemetry {
  segment: string
  counts: {
    sent: number
    replied: number
    positiveReplied: number
    meeting: number
    proposal: number
    won: number
  }
  positiveRate: number | null
  meetingRate: number | null
  wonRate: number | null
  insufficientData: boolean
}

interface OutreachMetricsPayload {
  metrics: OutreachMetrics
  outcomeReport: {
    overall: SegmentTelemetry
    bySector: SegmentTelemetry[]
    hasSignal: boolean
  }
}

const BENCHMARK_META: Record<OutreachMetrics["benchmark"], { label: string; color: string }> = {
  insufficient: { label: "VERİ BEKLİYOR", color: "var(--text-secondary)" },
  below: { label: "DÜŞÜK", color: "var(--danger)" },
  ok: { label: "İYİ", color: "var(--warning)" },
  good: { label: "GÜÇLÜ", color: "var(--success)" },
}

export function OutreachKpi() {
  const [payload, setPayload] = useState<OutreachMetricsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch("/api/outreach/metrics", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("Metrikler yüklenemedi")
        return res.json()
      })
      .then((data) => {
        if (alive && data?.metrics && data?.outcomeReport) setPayload(data)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Metrikler yüklenemedi")
      })
    return () => {
      alive = false
    }
  }, [])

  if (error || !payload) return null

  const metrics = payload.metrics
  const pct = (n: number) => `%${(n * 100).toFixed(1)}`
  const bm = BENCHMARK_META[metrics.benchmark]
  const topSegments = payload.outcomeReport.bySector.filter((s) => s.counts.sent > 0).slice(0, 3)
  const hasNicheSignal = topSegments.some((segment) => !segment.insufficientData)

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-[var(--accent)]" />
        <h2 className="label-eyebrow">
          Soğuk E-posta KPI
        </h2>
      </div>
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <div className="text-[10px] text-[var(--text-secondary)] tracking-[0.15em] mb-1 font-bold uppercase">Gönderilen</div>
          <div className="num text-2xl font-bold text-[var(--text-primary)]">{metrics.totalSent}</div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-secondary)] tracking-[0.15em] mb-1 font-bold uppercase">Pozitif Yanıt</div>
          <div className="num text-2xl font-bold text-[var(--text-primary)]">{pct(metrics.positiveReplyRate)}</div>
          <div className="text-[9px] text-[var(--text-muted)] mt-1">İnsan yanıtı {pct(metrics.replyRate)}</div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-secondary)] tracking-[0.15em] mb-1 font-bold uppercase">Bounce</div>
          <div className="num text-2xl font-bold text-[var(--text-primary)]">{pct(metrics.bounceRate)}</div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-secondary)] tracking-[0.15em] mb-1 font-bold uppercase">Durum</div>
          <div className="text-2xl font-bold tracking-tight" style={{ color: bm.color }}>{bm.label}</div>
          {!metrics.sampleSufficient && (
            <div className="text-[9px] text-[var(--text-muted)] mt-1">En az 20 gerçek gönderim gerekir</div>
          )}
        </div>
      </div>

      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-black tracking-[0.15em] text-[var(--accent)] uppercase">3 Niş Deneyi</div>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Gerçek gönderim → pozitif yanıt → görüşme → satış. Follow-up&apos;lar aynı lead&apos;i ikinci kez saymaz.
            </p>
          </div>
          <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            {hasNicheSignal ? "Niş kararı için sinyal var" : "Niş başına en az 20 gerçek lead"}
          </span>
        </div>

        {topSegments.length === 0 ? (
          <p className="py-3 text-center text-xs italic text-[var(--text-muted)]">
            Gerçek Gmail gönderimi başladığında sektör deneyleri burada oluşacak.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {topSegments.map((segment) => (
              <div key={segment.segment} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">{segment.segment}</h3>
                    <p className="mt-1 text-[10px] text-[var(--text-muted)]">{segment.counts.sent} benzersiz lead</p>
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-wider ${segment.insufficientData ? "text-[var(--warning)]" : "text-[var(--success)]"}`}>
                    {segment.insufficientData ? "Test sürüyor" : "Sinyal var"}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="num text-lg font-bold text-[var(--text-primary)]">{segment.counts.positiveReplied}</div>
                    <div className="text-[9px] text-[var(--text-muted)]">Pozitif</div>
                  </div>
                  <div>
                    <div className="num text-lg font-bold text-[var(--text-primary)]">{segment.counts.meeting}</div>
                    <div className="text-[9px] text-[var(--text-muted)]">Görüşme</div>
                  </div>
                  <div>
                    <div className="num text-lg font-bold text-[var(--text-primary)]">{segment.counts.won}</div>
                    <div className="text-[9px] text-[var(--text-muted)]">Satış</div>
                  </div>
                </div>
                <p className="mt-3 text-center text-[9px] text-[var(--text-muted)]">
                  {segment.insufficientData
                    ? `${Math.max(0, 20 - segment.counts.sent)} lead daha test et`
                    : `Pozitif ${pct(segment.positiveRate ?? 0)} · Görüşme ${pct(segment.meetingRate ?? 0)} · Satış ${pct(segment.wonRate ?? 0)}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// ── Motor Durumu (ajan telemetri — periyodik poll) ─────────────────────────────
interface AgentTelemetry {
  tokensIn: number
  tokensOut: number
  costUsd: number
}
interface Agent {
  key: string
  status: string
  telemetry: AgentTelemetry
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

const POLL_MS = 30000

export function EngineStatus() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [queueDepth, setQueueDepth] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [agentsRes, tasksRes] = await Promise.all([
          fetch("/api/agents", { credentials: "include" }),
          fetch("/api/tasks?status=queued", { credentials: "include" }),
        ])
        if (!agentsRes.ok) throw new Error("Ajanlar yüklenemedi")
        const agentsData = await agentsRes.json()
        const tasksData = tasksRes.ok ? await tasksRes.json() : { tasks: [] }
        if (!alive) return
        setAgents(Array.isArray(agentsData.agents) ? agentsData.agents : [])
        setQueueDepth(Array.isArray(tasksData.tasks) ? tasksData.tasks.length : 0)
        setError(null)
      } catch (e: unknown) {
        if (alive) setError(e instanceof Error ? e.message : "Veri yüklenemedi")
      }
    }
    load()
    const id = setInterval(load, POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const activeAgents = agents.filter((a) => a.status === "working").length
  const totalTokens = agents.reduce(
    (acc, a) => acc + (a.telemetry?.tokensIn ?? 0) + (a.telemetry?.tokensOut ?? 0),
    0,
  )
  const totalCost = agents.reduce((acc, a) => acc + (a.telemetry?.costUsd ?? 0), 0)

  const stats: EngineStat[] = [
    { abbr: "AJN", title: "Aktif Ajan", value: String(activeAgents), icon: Bot },
    { abbr: "KYR", title: "Kuyruk Derinliği", value: String(queueDepth), icon: Layers },
    { abbr: "TKN", title: "Toplam Token", value: totalTokens.toLocaleString("tr-TR"), icon: Coins },
    { abbr: "USD", title: "AI Maliyet", value: `$${totalCost.toFixed(2)}`, icon: DollarSign },
  ]

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="label-eyebrow">Motor Durumu</h2>
        <span className="text-[9px] text-[var(--text-muted)] font-bold tracking-widest uppercase">SERVERLESS</span>
      </div>
      {error ? (
        <div className="flex items-center gap-2 text-[var(--danger)] text-xs font-bold bg-[var(--danger)]/10 border border-[var(--danger)]/20 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <StatCell key={s.abbr} stat={s} />
          ))}
        </div>
      )}
    </section>
  )
}
