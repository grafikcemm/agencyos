"use client"

// Agency OS Konsol — Faz 4 UI. Registry sayaçları (kayıtlı vs aktif/eval-geçmiş +
// kapasite), bekleyen onay kartları (yalnız redacted_preview + approve/reject),
// son run'lar (mode/durum/maliyet). Tek operatör admin yüzeyi; /api/{registry,
// approvals,runs} okur. Framer dark canvas token'ları.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ShieldCheck, Check, X, Activity, Boxes, Clock } from 'lucide-react'

interface RegistryData {
  skills: { codeRegistered: number; dbRegistered: number; active: number; integrityIssues: number }
  agents: { dbRegistered: number; active: number }
  teams: Record<string, number>
  capacity: { agents: number; skills: number }
}
interface ApprovalItem {
  id: string
  action: string
  redacted_preview: string
  expires_at: string
}
interface RunItem {
  id: string
  operator_input: string | null
  intent: string | null
  mode: string
  status: string
  cost_usd: number | null
  created_at: string
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    const body = await res.json()
    return body?.success === false ? null : (body.data as T)
  } catch {
    return null
  }
}

export default function KonsolPage() {
  const [registry, setRegistry] = useState<RegistryData | null>(null)
  const [approvals, setApprovals] = useState<ApprovalItem[]>([])
  const [runs, setRuns] = useState<RunItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refreshApprovals = useCallback(async () => {
    const data = await getJson<{ approvals: ApprovalItem[] }>('/api/approvals')
    setApprovals(data?.approvals ?? [])
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [reg, appr, runData] = await Promise.all([
        getJson<RegistryData>('/api/registry'),
        getJson<{ approvals: ApprovalItem[] }>('/api/approvals'),
        getJson<{ runs: RunItem[] }>('/api/runs?limit=25'),
      ])
      if (!alive) return
      setRegistry(reg)
      setApprovals(appr?.approvals ?? [])
      setRuns(runData?.runs ?? [])
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [])

  const decide = useCallback(
    async (id: string, decision: 'approved' | 'rejected') => {
      setBusyId(id)
      try {
        await fetch(`/api/approvals/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision }),
        })
        await refreshApprovals()
      } finally {
        setBusyId(null)
      }
    },
    [refreshApprovals],
  )

  return (
    <div className="max-w-6xl mx-auto px-5 py-8">
      <header className="mb-8">
        <div className="label-eyebrow mb-1">AGENCY OS</div>
        <h1 className="font-display text-3xl font-bold text-[var(--text-primary)] tracking-tight">Konsol</h1>
        <p className="text-[13px] text-[var(--text-tertiary)] mt-1">
          Registry, insan-onayı kuyruğu ve çalışma izleri — tek beyin, tek geçit.
        </p>
      </header>

      {/* Registry kapasite şeridi — büyük sayı kontrastı, uniform grid değil */}
      <section aria-labelledby="reg-h" className="mb-10">
        <h2 id="reg-h" className="label-eyebrow mb-3 flex items-center gap-2">
          <Boxes className="w-3.5 h-3.5 text-[var(--accent)]" /> Registry
        </h2>
        {loading || !registry ? (
          <div className="h-24 rounded-xl bg-[var(--bg-card)] animate-pulse" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CapacityCard
              label="Skill"
              registered={registry.skills.codeRegistered}
              active={registry.skills.active}
              cap={registry.capacity.skills}
              note={`${registry.skills.dbRegistered} DB · ${registry.skills.integrityIssues} bütünlük sorunu`}
            />
            <CapacityCard
              label="Ajan"
              registered={registry.agents.dbRegistered}
              active={registry.agents.active}
              cap={registry.capacity.agents}
              note="7 arketip · veri-güdümlü"
            />
            <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Takımlar</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(registry.teams).map(([team, n]) => (
                  <span
                    key={team}
                    className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--accent-muted)] text-[var(--text-secondary)]"
                  >
                    {team} · {n}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* İki kolon: onay kuyruğu (aksiyon) + son run'lar (izleme) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <section aria-labelledby="appr-h" className="lg:col-span-2">
          <h2 id="appr-h" className="label-eyebrow mb-3 flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent)]" /> Onay Kuyruğu
            {approvals.length > 0 && (
              <span className="ml-1 text-[10px] font-black px-1.5 py-0.5 rounded-full bg-[var(--warning,#d97706)]/20 text-[var(--warning,#d97706)]">
                {approvals.length}
              </span>
            )}
          </h2>
          {approvals.length === 0 ? (
            <EmptyRow icon={<ShieldCheck className="w-4 h-4" />} text="Bekleyen onay yok — write/spend güvenli." />
          ) : (
            <div className="flex flex-col gap-3">
              {approvals.map((a) => (
                <article
                  key={a.id}
                  className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 hover:border-[var(--accent)]/40 transition-colors"
                >
                  <div className="text-[11px] font-bold text-[var(--accent)] mb-1 font-mono">{a.action}</div>
                  <p className="text-[13px] text-[var(--text-secondary)] leading-snug mb-3">{a.redacted_preview}</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === a.id}
                      onClick={() => decide(a.id, 'approved')}
                      className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white hover:brightness-110 active:scale-95 transition disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" /> Onayla
                    </button>
                    <button
                      type="button"
                      disabled={busyId === a.id}
                      onClick={() => decide(a.id, 'rejected')}
                      className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] active:scale-95 transition disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" /> Reddet
                    </button>
                    <span className="ml-auto text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {new Date(a.expires_at).toLocaleDateString('tr-TR')}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="runs-h" className="lg:col-span-3">
          <h2 id="runs-h" className="label-eyebrow mb-3 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-[var(--accent)]" /> Son Çalışmalar
          </h2>
          {loading ? (
            <div className="h-40 rounded-xl bg-[var(--bg-card)] animate-pulse" />
          ) : runs.length === 0 ? (
            <EmptyRow icon={<Activity className="w-4 h-4" />} text="Henüz run yok. Brain active mode açılınca burada belirir." />
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border-subtle)] rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] overflow-hidden">
              {runs.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <ModeBadge mode={r.mode} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-[var(--text-primary)] truncate">{r.intent || r.operator_input || '—'}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{new Date(r.created_at).toLocaleString('tr-TR')}</div>
                  </div>
                  <StatusDot status={r.status} />
                  <span className="text-[11px] font-mono text-[var(--text-tertiary)] tabular-nums">
                    ${(r.cost_usd ?? 0).toFixed(3)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function CapacityCard({ label, registered, active, cap, note }: { label: string; registered: number; active: number; cap: number; note: string }) {
  const pct = cap > 0 ? Math.min(100, Math.round((registered / cap) * 100)) : 0
  return (
    <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-bold text-[var(--text-primary)] tabular-nums">{registered}</span>
        <span className="text-[13px] text-[var(--text-muted)]">/ {cap} {label}</span>
      </div>
      <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
        <span className="text-[var(--success)] font-semibold">{active} aktif</span> · eval-geçmiş
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[10px] text-[var(--text-muted)] mt-2">{note}</div>
    </div>
  )
}

function ModeBadge({ mode }: { mode: string }) {
  const active = mode === 'active'
  return (
    <span
      className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
        active ? 'bg-[var(--accent-muted)] text-[var(--accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
      }`}
    >
      {mode}
    </span>
  )
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'done' ? 'var(--success)' : status === 'error' ? 'var(--danger,#ef4444)' : 'var(--text-muted)'
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {status}
    </span>
  )
}

function EmptyRow({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-[var(--bg-card)] border border-dashed border-[var(--border-subtle)] px-4 py-6 text-[13px] text-[var(--text-muted)]">
      <span className="text-[var(--text-tertiary)]">{icon}</span>
      {text}
    </div>
  )
}
