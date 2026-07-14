// /bugun — gelir kokpiti (Sprint 1A, doc 33 §1A). Server component: veri
// tek seferde server'da toplanır (getTodayCockpit); onay→dry-run send akışı
// client panelde (PendingSendsPanel). Her panelin empty/error durumu tasarlı;
// loading → loading.tsx, sayfa-seviyesi hata → error.tsx.

import {
  Sunrise, Inbox, AlarmClock, Flame, type LucideIcon,
} from 'lucide-react'
import { getTodayCockpit } from '@/lib/cockpit/today'
import { PendingSendsPanel } from '@/components/cockpit/PendingSendsPanel'
import { CallListPanel } from '@/components/cockpit/CallListPanel'
import { SendIssuesPanel } from '@/components/cockpit/SendIssuesPanel'
import { OpsMetricsBar } from '@/components/cockpit/OpsMetricsBar'
import { TimeBudgetPlanner } from '@/components/cockpit/TimeBudgetPlanner'

export const dynamic = 'force-dynamic'

const STAGE_LABEL: Record<string, string> = {
  contacted: 'Temas',
  responded: 'Cevapladı',
  meeting: 'Görüşme',
  proposal: 'Teklif',
}

function tl(n: number): string {
  return `${new Intl.NumberFormat('tr-TR').format(n)} TL`
}

function Panel({
  icon: Icon, title, count, error, empty, children, testId,
}: {
  icon: LucideIcon
  title: string
  count: number
  error: string | null
  empty: string
  children: React.ReactNode
  testId: string
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-[var(--accent)]" />
        <h2 className="text-[12px] font-bold tracking-wide text-[var(--text-secondary)] uppercase">{title}</h2>
        {count > 0 && (
          <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
            {count}
          </span>
        )}
      </div>
      {error ? (
        <p className="text-[12px] text-red-400">Panel yüklenemedi: {error}</p>
      ) : count === 0 ? (
        <p className="text-[12px] text-[var(--text-muted)]">{empty}</p>
      ) : (
        children
      )}
    </section>
  )
}

export default async function BugunPage() {
  const c = await getTodayCockpit()
  const sendMode = process.env.GMAIL_SEND_ENABLED === 'true' ? 'live' : 'dry-run'

  return (
    <div className="max-w-6xl mx-auto px-5 py-8">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Sunrise className="w-6 h-6 text-[var(--accent)]" />
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Bugün</h1>
        {/* Faz 4.9: gerçek harcanan süre + tamamlanan gelir aksiyonları */}
        <div className="ml-auto">
          <OpsMetricsBar metrics={c.opsMetrics.data} error={c.opsMetrics.error} />
        </div>
      </div>

      {/* Beklenen gelir şeridi */}
      <section
        data-testid="panel-revenue"
        className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 mb-5"
      >
        {c.revenue.error ? (
          <p className="text-[12px] text-red-400">Gelir şeridi yüklenemedi: {c.revenue.error}</p>
        ) : c.revenue.data ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-wide">Beklenen aylık gelir (ağırlıklı)</div>
              <div className="text-2xl font-bold text-[var(--text-primary)]">{tl(c.revenue.data.weightedPipelineTl)}</div>
            </div>
            <div className="text-[12px] text-[var(--text-secondary)]">
              Hedef: <span className="font-semibold">{tl(c.revenue.data.targetTl)}</span>
            </div>
            <div className="flex gap-3 ml-auto">
              {c.revenue.data.byStage.map((s) => (
                <div key={s.stage} className="text-[11px] text-[var(--text-muted)]">
                  {STAGE_LABEL[s.stage] ?? s.stage}: <span className="text-[var(--text-secondary)] font-semibold">{s.count}</span> · {tl(s.weightedTl)}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* Faz 7: 30dk zaman bütçesi — değer/süre sıralı plan + görünür backlog */}
      <TimeBudgetPlanner actions={c.budgetActions} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <CallListPanel initial={c.leadsToCall} duplicates={c.callDuplicates} />

        <PendingSendsPanel initial={c.pendingSends} sendMode={sendMode} />

        <Panel icon={Inbox} title="Cevaplar" count={c.replies.items.length}
          error={c.replies.error}
          empty="Henüz gelen cevap yok. Reply ingest cron kayıtlı (3 saatte bir); GMAIL_INGEST_ENABLED açılınca gerçek cevaplar buraya düşer." testId="panel-replies">
          <ul className="flex flex-col gap-2">
            {c.replies.items.map((r) => (
              <li key={r.id} className="text-[13px] text-[var(--text-secondary)] truncate">
                {r.fromAddress ?? '—'} · {r.subject ?? '(konu yok)'}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel icon={AlarmClock} title="Geciken Follow-up'lar" count={c.overdueFollowups.items.length}
          error={c.overdueFollowups.error} empty="Geciken follow-up yok." testId="panel-followups">
          <ul className="flex flex-col gap-2">
            {c.overdueFollowups.items.map((f) => (
              <li key={f.id} data-testid={`followup-${f.id}`} tabIndex={-1} className="flex items-center gap-2 text-[13px]">
                <span className="text-[var(--text-primary)] truncate">{f.businessName}</span>
                <span className="text-[11px] text-[var(--text-muted)]">adım {f.step}</span>
                <span className="ml-auto text-[11px] text-amber-400">
                  {new Date(f.dueAt).toLocaleDateString('tr-TR')}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <SendIssuesPanel initial={c.sendIssues} />

        <Panel icon={Flame} title="Teklif Bekleyen Sıcak Lead'ler" count={c.hotLeads.items.length}
          error={c.hotLeads.error} empty="Şu an teklif bekleyen sıcak lead yok." testId="panel-hot">
          <ul className="flex flex-col gap-2">
            {c.hotLeads.items.map((l) => (
              <li key={l.id} className="flex items-center gap-2 text-[13px]">
                <span className="text-[var(--text-primary)] font-medium truncate">{l.businessName}</span>
                <span className="text-[10px] px-1.5 rounded bg-[var(--bg-elevated)] text-[var(--text-muted)]">{STAGE_LABEL[l.status] ?? l.status}</span>
                <span className="ml-auto text-[11px] text-[var(--accent)] font-semibold">{tl(l.expectedMonthlyTl)}/ay</span>
              </li>
            ))}
          </ul>
        </Panel>

      </div>
    </div>
  )
}
