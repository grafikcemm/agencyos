// Command Center — server-shell.
// Sıra: Asistan brief → Aktif Direktif → 3 lead → ritim+alışkanlık → motor.
// Sunucu tarafı veri: 3 lead (AgencyOS DB), bugünün rutin/görev özeti + alışkanlık
// zinciri (FTG DB). İnteraktif parçalar (direktif + motor polling) CommandCenterClient'te.
import Link from "next/link"
import { Target, Activity, Flame, AlertTriangle, ArrowRight, Sunrise } from "lucide-react"
import { supabaseAdmin as agencyAdmin } from "@/lib/supabase"
import { createServerSupabase } from "@/lib/supabaseServer"
import { loadDailyRoutines } from "@/lib/dailyRoutines"
import { loadActiveTasks } from "@/lib/activeTasks"
import { getHabitsOverview } from "@/app/actions/habitActions"
import { showsLifeUi } from "@/lib/lifeFlags"
import { getIstanbulDateAndDay } from "@/lib/assistant/timezone"
import { DailyBriefCard } from "@/components/assistant/DailyBriefCard"
import { DirectivePanel, EngineStatus, OutreachKpi } from "./CommandCenterClient"
import { EditorialPageHeader } from "@/components/ui/EditorialPageHeader"
import { StatBlock } from "@/components/ui/StatBlock"
import { DailyPrayerCard } from "@/components/cockpit/DailyPrayerCard"

export const dynamic = "force-dynamic"

const DAY_KEY_MAP: Record<number, string> = {
  0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat",
}
const CLOSED = new Set(["converted", "lost", "won"])

interface TopLead {
  name: string
  meta: string
  score: number
}

async function loadTopLeads(): Promise<TopLead[]> {
  try {
    const { data } = await agencyAdmin
      .from("leads")
      .select("business_name, city, sector, potential_score, score, status")
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

async function loadRhythm(): Promise<{ routinesDone: number; routinesTotal: number; nextTask: string | null }> {
  const { todayStr, dow } = getIstanbulDateAndDay()
  const dayKey = DAY_KEY_MAP[dow] ?? "mon"
  try {
    const supabase = createServerSupabase()
    const [routinesRes, completionsRes, tasksRes] = await Promise.all([
      loadDailyRoutines(supabase),
      supabase.from("daily_completions").select("template_id").eq("date", todayStr),
      loadActiveTasks(supabase),
    ])
    const doneIds = new Set((completionsRes.data ?? []).map((c: { template_id: string }) => c.template_id))
    const active = routinesRes.routines.filter(
      (r) => !r.active_days || r.active_days.length === 0 || r.active_days.includes(dayKey),
    )
    const nextTask =
      tasksRes.tasks.find((t) => t.category === "active" && !t.is_done)?.title ?? null
    return {
      routinesDone: active.filter((r) => doneIds.has(r.id)).length,
      routinesTotal: active.length,
      nextTask,
    }
  } catch {
    return { routinesDone: 0, routinesTotal: 0, nextTask: null }
  }
}

async function loadHabitSummary(): Promise<{ done: number; due: number; atRisk: string[] }> {
  try {
    const items = await getHabitsOverview()
    const due = items.filter((h) => h.computed.todayStatus !== "not_due")
    return {
      done: due.filter((h) => h.computed.todayStatus === "done").length,
      due: due.length,
      atRisk: items.filter((h) => h.computed.atRisk).map((h) => h.label),
    }
  } catch {
    return { done: 0, due: 0, atRisk: [] }
  }
}

export default async function CommandCenterPage() {
  const lifeUi = showsLifeUi()
  const { todayStr } = getIstanbulDateAndDay()
  const [leads, rhythm, habits] = await Promise.all([loadTopLeads(), loadRhythm(), loadHabitSummary()])

  const energyInput = {
    completedTasksYesterday: 0,
    criticalRoutineCompletionRate: rhythm.routinesTotal > 0 ? rhythm.routinesDone / rhythm.routinesTotal : 0,
    dailyPeakClean: null as boolean | null,
    activeTasksCount: 0,
    waitingTasksCount: 0,
    rhythmCountToday: rhythm.routinesDone,
  }

  const dateLabel = new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(todayStr + "T12:00:00"),
  )

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-base)] px-6 py-8 scrollbar-thin">
      <div className="max-w-6xl mx-auto flex flex-col gap-10">
        <DailyPrayerCard />

        <EditorialPageHeader
          eyebrow={dateLabel}
          title="Ana Merkez"
          description="Yaşam, satış ve sistem özetin. Günlük müşteri operasyonunu Bugün ekranında tamamla."
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

        {/* 1 — Asistan brief */}
        <DailyBriefCard energyInput={energyInput} today={todayStr} />

        {/* 2 — Aktif Direktif */}
        <DirectivePanel />

        {/* 3 — En yüksek potansiyelli 3 lead */}
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

        {/* 4 — Ritim + Alışkanlık.
            SAHIPLIK KAPISI (RT-A2): `LIFE_UI_OWNER=cemos` iken bu blok
            gizlenir. Iki panelde ayni kisisel sayaci gostermek, hangisinin
            guncel oldugu sorusunu her gun yeniden dogururdu. */}
        {lifeUi && (
        <section className="space-y-4">
          <h2 className="label-eyebrow">Bugünün Ritmi</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[var(--accent)]" />
                <span className="label-eyebrow">Rutin</span>
              </div>
              <StatBlock value={`${rhythm.routinesDone}/${rhythm.routinesTotal}`} label="Tamamlanan rutin" accent />
              {rhythm.nextTask && (
                <p className="text-[11px] text-[var(--text-muted)] font-medium">
                  Sıradaki görev: <span className="text-[var(--text-secondary)]">{rhythm.nextTask}</span>
                </p>
              )}
            </div>

            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-[var(--accent)]" />
                  <span className="label-eyebrow">Alışkanlık</span>
                </div>
                <Link
                  href="/aliskanliklar"
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--accent)] hover:gap-1.5 transition-all uppercase tracking-wider"
                >
                  Zincir <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <StatBlock value={`${habits.done}/${habits.due}`} label="Bugün biten zincir" accent />
              {habits.atRisk.length > 0 ? (
                <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--warning)]">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Risk: {habits.atRisk.slice(0, 3).join(", ")}
                  {habits.atRisk.length > 3 ? ` +${habits.atRisk.length - 3}` : ""}
                </p>
              ) : (
                <p className="text-[11px] text-[var(--text-muted)] font-medium">Zincirler güvende.</p>
              )}
            </div>
          </div>
        </section>
        )}

        {/* 5 — Soğuk E-posta KPI */}
        <OutreachKpi />

        {/* 6 — Motor Durumu */}
        <EngineStatus />
      </div>
    </div>
  )
}
