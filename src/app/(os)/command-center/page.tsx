// Command Center — server-shell.
// Sıra: Bugünün kararları → kampanya sağlığı → TR/Global funnel → derinlik.
// Kişisel görev, alışkanlık ve ritim GrafikcemOS Agent Takımı'nın yüzeyidir.
import Link from "next/link"
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  GitBranch,
  Globe2,
  Mail,
  MapPinned,
  ShieldAlert,
  Sunrise,
  Target,
} from "lucide-react"
import { supabaseAdmin as agencyAdmin } from "@/lib/supabase"
import { getIstanbulDateAndDay } from "@/lib/assistant/timezone"
import { DirectivePanel, EngineStatus, OutreachKpi } from "./CommandCenterClient"
import { EditorialPageHeader } from "@/components/ui/EditorialPageHeader"
import { currentEpoch } from "@/lib/leads/epoch"

export const dynamic = "force-dynamic"

const CLOSED = new Set(["converted", "lost", "won"])

interface TopLead {
  name: string
  meta: string
  score: number
}

interface FunnelSummary {
  discovered: number
  active: number
  won: number
}

interface CommandSnapshot {
  funnels: { tr: FunnelSummary; global: FunnelSummary }
  campaign: { drafts: number; sent: number; replied: number; unknown: number }
  pendingApprovals: number | null
  warnings: string[]
}

const emptyFunnel = (): FunnelSummary => ({ discovered: 0, active: 0, won: 0 })
const ACTIVE = new Set(["contacted", "qualified", "proposal", "negotiation", "meeting"])
const WON = new Set(["converted", "won"])

async function loadCommandSnapshot(): Promise<CommandSnapshot> {
  const warnings: string[] = []
  const funnels = { tr: emptyFunnel(), global: emptyFunnel() }

  try {
    const scoped = await agencyAdmin
      .from("leads")
      .select("market_scope,status")
      .eq("acquisition_epoch", currentEpoch())
      .is("retired_at", null)
      .limit(5000)
    let rows: Array<{ market_scope: string | null; status: string | null }> = []
    if (scoped.error) {
      // Eski epoch'u yeniden görünür kılmak yerine boş ve açıklanmış durum.
      rows = []
      warnings.push("Pazar kapsamı migration'ı bekliyor; eski lead dönemi bu özette gizlendi.")
    } else {
      rows = scoped.data ?? []
    }
    for (const row of rows) {
      const scope = row.market_scope === "global" ? "global" : "tr"
      const status = (row.status ?? "new").toLowerCase()
      if (["archived", "lost", "disqualified", "suppressed"].includes(status)) continue
      funnels[scope].discovered++
      if (ACTIVE.has(status)) funnels[scope].active++
      if (WON.has(status)) funnels[scope].won++
    }
  } catch {
    warnings.push("Lead funnel okunamadı.")
  }

  const campaign = { drafts: 0, sent: 0, replied: 0, unknown: 0 }
  try {
    const { data, error } = await agencyAdmin
      .from("outreach_messages")
      .select("status,provider_state")
      .limit(5000)
    if (error) throw error
    for (const row of data ?? []) {
      const status = String(row.status ?? "").toLowerCase()
      if (["draft", "approved", "queued", "pending"].includes(status)) campaign.drafts++
      if (["sent", "delivered", "replied"].includes(status)) campaign.sent++
      if (status === "replied") campaign.replied++
      if (row.provider_state === "provider_unknown") campaign.unknown++
    }
  } catch {
    warnings.push("Kampanya telemetrisi okunamadı.")
  }

  let pendingApprovals: number | null = null
  try {
    const { count, error } = await agencyAdmin
      .from("approval_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
    if (error) throw error
    pendingApprovals = count ?? 0
  } catch {
    warnings.push("Onay kuyruğu okunamadı.")
  }

  return { funnels, campaign, pendingApprovals, warnings }
}

async function loadTopLeads(): Promise<TopLead[]> {
  try {
    const { data } = await agencyAdmin
      .from("leads")
      .select("business_name, city, sector, potential_score, score, status")
      .eq("acquisition_epoch", currentEpoch())
      .is("retired_at", null)
      .order("potential_score", { ascending: false, nullsFirst: false })
      .limit(20)
    const rows = (data ?? []) as Array<{
      business_name: string | null
      city: string | null
      sector: string | null
      potential_score: number | null
      score: number | null
      status: string | null
    }>
    return rows
      .filter((r) => !CLOSED.has((r.status ?? "").toLowerCase()))
      .slice(0, 3)
      .map((r) => ({
        name: r.business_name ?? "(isimsiz lead)",
        meta: [r.city, r.sector].filter(Boolean).join(" · "),
        score: r.potential_score ?? r.score ?? 0,
      }))
  } catch {
    return []
  }
}

export default async function CommandCenterPage() {
  const { todayStr } = getIstanbulDateAndDay()
  const [leads, snapshot] = await Promise.all([loadTopLeads(), loadCommandSnapshot()])

  const dateLabel = new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(todayStr + "T12:00:00"),
  )

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-base)] px-4 py-6 sm:px-6 sm:py-8 scrollbar-thin">
      <div className="max-w-7xl mx-auto flex flex-col gap-7">
        <EditorialPageHeader
          eyebrow={dateLabel}
          title="Ana Merkez"
          description="Karar, kampanya ve pazar sağlığı. Kişisel görevler ve alışkanlıklar GrafikcemOS'ta kalır."
          actions={(
            <Link
              href="/bugun"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-[var(--accent-hover)]"
            >
              <Sunrise className="h-4 w-4" />
              Bugünü İşle
            </Link>
          )}
        />

        <section aria-labelledby="today-decisions" className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr_1.2fr]">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
            <div className="flex items-center gap-2">
              <CircleDot className="h-4 w-4 text-[var(--accent)]" />
              <h2 id="today-decisions" className="label-eyebrow">Bugünün kararları</h2>
            </div>
            <div className="mt-4 divide-y divide-[var(--border-subtle)]">
              <DecisionRow
                label="İnsan onayı bekleyen"
                value={snapshot.pendingApprovals === null ? "Ölçülemedi" : String(snapshot.pendingApprovals)}
                href="/agents"
                urgent={(snapshot.pendingApprovals ?? 0) > 0}
              />
              <DecisionRow label="Öncelikli açık hesap" value={String(leads.length)} href="/harita" urgent={leads.length > 0} />
              <DecisionRow label="Teklif / sözleşme merkezi" value="Hazırla" href="/belgeler" />
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[var(--accent)]" />
              <h2 className="label-eyebrow">Kampanya sağlığı</h2>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5">
              <Metric label="Taslak / kuyruk" value={snapshot.campaign.drafts} />
              <Metric label="Gönderilen" value={snapshot.campaign.sent} />
              <Metric label="Yanıt" value={snapshot.campaign.replied} />
              <Metric label="Sonucu belirsiz" value={snapshot.campaign.unknown} warn={snapshot.campaign.unknown > 0} />
            </div>
            <div className="mt-5 flex items-center gap-2 border-t border-[var(--border-subtle)] pt-4 text-[10px] text-[var(--text-muted)]">
              {snapshot.campaign.sent === 0 ? <ShieldAlert className="h-3.5 w-3.5 text-[var(--warning)]" /> : <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />}
              {snapshot.campaign.sent === 0 ? "Canlı gönderim başlamadı; insan onayı kapısı açık." : "Gerçek gönderim telemetrisi ölçülüyor."}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-[var(--accent)]" />
                <h2 className="label-eyebrow">Pazar funnel</h2>
              </div>
              <Link href="/harita" className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">Radar</Link>
            </div>
            <div className="mt-4 space-y-3">
              <MarketFunnel label="Türkiye" icon={MapPinned} funnel={snapshot.funnels.tr} />
              <MarketFunnel label="Global" icon={Globe2} funnel={snapshot.funnels.global} />
            </div>
          </div>
        </section>

        {snapshot.warnings.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-[var(--warning)]/20 bg-[var(--warning)]/5 px-4 py-3 text-[11px] text-[var(--text-secondary)]">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
            <span>{snapshot.warnings.join(" ")}</span>
          </div>
        )}

        {/* En yüksek potansiyelli 3 lead */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-[var(--accent)]" />
              <h2 className="label-eyebrow">Öncelikli Lead&apos;ler</h2>
            </div>
            <Link
              href="/pipeline"
              className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--accent)] hover:gap-1.5 transition-all uppercase tracking-wider"
            >
              Tümü <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {leads.length === 0 ? (
            <div className="text-center py-8 text-xs text-[var(--text-muted)] italic bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl">
              Açık lead bulunamadı.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {leads.map((l, i) => (
                <div
                  key={`${l.name}-${i}`}
                  className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] leading-snug">{l.name}</h3>
                    <span className="num shrink-0 text-[10px] font-black text-white bg-[var(--accent)] rounded px-1.5 py-0.5">
                      {l.score}
                    </span>
                  </div>
                  {l.meta && <p className="text-[11px] text-[var(--text-muted)] font-medium">{l.meta}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sonuç KPI'ları — karar özetinin altında ayrıntı. */}
        <OutreachKpi />

        <details className="group rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-xs font-bold text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-2"><Mail className="h-4 w-4 text-[var(--accent)]" /> Yeni operasyon direktifi</span>
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] group-open:hidden">Aç</span>
          </summary>
          <div className="border-t border-[var(--border-subtle)] p-5"><DirectivePanel /></div>
        </details>

        <details className="group rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-xs font-bold text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-2"><Activity className="h-4 w-4 text-[var(--accent)]" /> Ajan motoru ve teknik telemetri</span>
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] group-open:hidden">Aç</span>
          </summary>
          <div className="border-t border-[var(--border-subtle)] p-5"><EngineStatus /></div>
        </details>
      </div>
    </div>
  )
}

function DecisionRow({ label, value, href, urgent = false }: { label: string; value: string; href: string; urgent?: boolean }) {
  return (
    <Link href={href} className="group flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <span className="text-xs font-medium text-[var(--text-secondary)] transition-colors group-hover:text-[var(--text-primary)]">{label}</span>
      <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider ${urgent ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
        {value}<ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  )
}

function Metric({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div>
      <div className={`num text-2xl font-bold ${warn ? "text-[var(--warning)]" : "text-[var(--text-primary)]"}`}>{value}</div>
      <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
    </div>
  )
}

function MarketFunnel({ label, icon: Icon, funnel }: { label: string; icon: typeof Globe2; funnel: FunnelSummary }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]"><Icon className="h-3.5 w-3.5 text-[var(--accent)]" />{label}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Keşif → Aktif → Kazanım</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[funnel.discovered, funnel.active, funnel.won].map((value, index) => (
          <div key={index} className="rounded-md bg-[var(--bg-surface)] py-2">
            <div className="num text-lg font-bold text-[var(--text-primary)]">{value}</div>
            <div className="text-[8px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{["Keşif", "Aktif", "Kazanım"][index]}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
