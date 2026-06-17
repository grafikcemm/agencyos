'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bot, Shield, Scale, Rocket, RefreshCw, CheckCircle, Clock, Zap } from 'lucide-react';
import type { UnifiedTodayPlan, AgencyLoad, EnergyLevel, PlanMode } from '@/lib/dailyOrchestrator';
import type { CommandPlan, ActionKey, ActionState, SourceHealth } from '@/lib/commandCenter/types';
import { getActiveActionKeys } from '@/lib/commandCenter/planUtils';
import { REMINDER_SCHEDULE } from '@/data/orchestratorConfig';
import type { ReminderType } from '@/data/orchestratorConfig';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyState {
  date: string;
  agency_load: AgencyLoad;
  energy: EnergyLevel;
  mode: PlanMode;
  today_plan_json: UnifiedTodayPlan | null;
}

interface ReminderRow {
  date: string;
  reminder_type: ReminderType;
  sent_at: string;
  status: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MODE_ICONS: Record<PlanMode, React.ReactNode> = {
  koruma: <Shield size={14} className="text-[var(--danger)]" />,
  denge: <Scale size={14} className="text-[var(--warning)]" />,
  atak: <Rocket size={14} className="text-[var(--success)]" />,
};
const MODE_LABELS: Record<PlanMode, string> = {
  koruma: 'Koruma',
  denge: 'Denge',
  atak: 'Atak',
};
const MODE_COLORS: Record<PlanMode, string> = {
  koruma: 'var(--danger)',
  denge: 'var(--warning)',
  atak: 'var(--success)',
};
const AGENCY_LABELS: Record<AgencyLoad, string> = { low: 'Rahat', normal: 'Normal', high: 'Yoğun' };
const ENERGY_LABELS: Record<EnergyLevel, string> = { low: 'Düşük', medium: 'Orta', high: 'Yüksek' };
const REMINDER_LABELS: Record<ReminderType, string> = {
  morning_checkin: 'Sabah Check-in',
  midday_status: 'Gün Ortası Yoklama',
  evening_rhythm: 'Akşam Ritim',
  night_shutdown: 'Gece Shutdown',
};

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 ${className}`}>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] font-medium block mb-3">
      {children}
    </span>
  );
}

// ─── Sub-cards ────────────────────────────────────────────────────────────────

function TodayPlanCard({ state, onRefresh }: { state: DailyState | null; onRefresh: () => void }) {
  const plan = state?.today_plan_json;
  const mode = state?.mode ?? 'denge';
  const agencyLoad = state?.agency_load ?? 'normal';
  const energy = state?.energy ?? 'medium';

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <Label>Günlük Plan</Label>
        <button
          onClick={onRefresh}
          className="text-[var(--text-tertiary)] hover:text-[var(--text-muted)] transition-colors"
          title="Yenile"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
          style={{ backgroundColor: `${MODE_COLORS[mode]}18`, border: `1px solid ${MODE_COLORS[mode]}30` }}
        >
          {MODE_ICONS[mode]}
          <span style={{ color: MODE_COLORS[mode] }} className="text-[11px] font-medium">
            {MODE_LABELS[mode]}
          </span>
        </div>
        <span className="text-[11px] text-[var(--text-tertiary)]">Ajans: {AGENCY_LABELS[agencyLoad]}</span>
        <span className="text-[11px] text-[var(--text-tertiary)]">Enerji: {ENERGY_LABELS[energy]}</span>
      </div>

      {plan ? (
        <>
          <div className="bg-[var(--accent-muted)] border border-[var(--accent)]/20 rounded-lg px-3 py-2.5 mb-4">
            <span className="text-[10px] uppercase tracking-widest text-[var(--accent)] font-medium block mb-1">
              Kilit
            </span>
            <p className="text-sm text-[var(--text-secondary)]">{plan.todayLock}</p>
          </div>

          <div className="mb-3">
            <span className="text-[10px] text-[var(--text-tertiary)] block mb-2">
              Maks {plan.maxActiveTasks} aktif iş
            </span>
            {plan.priorityTasks.map((t, i) => (
              <div key={i} className="flex items-start gap-2 mb-1.5">
                <span className="text-[10px] text-[var(--text-tertiary)] mt-0.5 shrink-0">{i + 1}.</span>
                <span className="text-xs text-[var(--text-muted)]">{t.title}</span>
              </div>
            ))}
          </div>

          <div className="h-px bg-[var(--border-subtle)] mb-3" />

          <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-tertiary)]">
            <div>
              <span className="text-[10px] text-[var(--text-tertiary)] block">Sağlık</span>
              {plan.health.todaySummary}
            </div>
            {plan.readingTarget && (
              <div>
                <span className="text-[10px] text-[var(--text-tertiary)] block">Okuma</span>
                {plan.readingTarget}
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="text-xs text-[var(--text-tertiary)]">
          Plan henüz oluşturulmadı. Sabah check-in sonrasında Telegram&apos;dan /plan yaz.
        </p>
      )}
    </Card>
  );
}

function ConnectedSystemsCard({ plan }: { plan: UnifiedTodayPlan | null }) {
  const systems = [
    { label: 'Ritimler', value: plan ? `${plan.rhythms.length} aktif` : '—', color: 'var(--info)' },
    { label: 'Sağlık', value: plan ? `Gün ${plan.health.day}/30` : '—', color: 'var(--success)' },
    { label: 'Finans', value: plan ? 'Bağlı' : '—', color: 'var(--warning)' },
    { label: 'Kütüphane', value: plan?.readingTarget ? 'Aktif kitap' : 'Seçili değil', color: '#8b5cf6' },
    { label: 'Gelişim', value: plan ? 'Bağlı' : '—', color: 'var(--fire)' },
  ];

  return (
    <Card>
      <Label>Bağlı Modüller</Label>
      <div className="grid grid-cols-5 gap-2">
        {systems.map(s => (
          <div key={s.label} className="text-center">
            <div
              className="w-2 h-2 rounded-full mx-auto mb-1.5"
              style={{ backgroundColor: plan ? s.color : 'var(--border-subtle)' }}
            />
            <div className="text-[10px] text-[var(--text-tertiary)] font-medium">{s.label}</div>
            <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{s.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TelegramStatusCard({ reminders }: { reminders: ReminderRow[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayReminders = reminders.filter(r => r.date === today);
  const lastSent = todayReminders.sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0];
  const isConnected = !!process.env.NEXT_PUBLIC_TELEGRAM_CONNECTED;

  return (
    <Card>
      <Label>Telegram</Label>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
        <span className="text-xs text-[var(--text-muted)]">
          Feed The Goat Asistanı
        </span>
      </div>

      <div className="space-y-2">
        {lastSent ? (
          <div className="text-xs text-[var(--text-tertiary)]">
            Son gönderim: {REMINDER_LABELS[lastSent.reminder_type]} —{' '}
            {new Date(lastSent.sent_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        ) : (
          <div className="text-xs text-[var(--text-tertiary)]">Bugün henüz mesaj gönderilmedi.</div>
        )}

        <div className="space-y-1 mt-3">
          {(Object.entries(REMINDER_LABELS) as [ReminderType, string][]).map(([type, label]) => {
            const sent = todayReminders.find(r => r.reminder_type === type);
            return (
              <div key={type} className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-tertiary)]">{label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[var(--text-tertiary)]">{REMINDER_SCHEDULE[type]}</span>
                  {sent ? (
                    <CheckCircle size={11} className="text-[var(--success)]" />
                  ) : (
                    <Clock size={11} className="text-[var(--text-tertiary)]" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!isConnected && (
        <p className="text-[10px] text-[var(--text-tertiary)] mt-3">
          Env: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID gerekli
        </p>
      )}
    </Card>
  );
}

function ReminderSettingsCard() {
  const order: ReminderType[] = ['morning_checkin', 'midday_status', 'evening_rhythm', 'night_shutdown'];

  return (
    <Card>
      <Label>Hatırlatma Saatleri</Label>
      <div className="space-y-2">
        {order.map(type => (
          <div key={type} className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-tertiary)]">{REMINDER_LABELS[type]}</span>
            <span className="text-xs text-[var(--text-tertiary)] font-mono">{REMINDER_SCHEDULE[type]}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--text-tertiary)] mt-3">
        Hatırlatma saatleri sistem ayarlarından yönetilir.
      </p>
    </Card>
  );
}

function AssistantLog({ plan, reminders }: { plan: UnifiedTodayPlan | null; reminders: ReminderRow[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayReminders = reminders
    .filter(r => r.date === today)
    .sort((a, b) => b.sent_at.localeCompare(a.sent_at));

  return (
    <Card>
      <Label>Asistan Logu</Label>

      {plan && (
        <div className="mb-4">
          <span className="text-[10px] text-[var(--text-tertiary)] block mb-2">Bugünkü Telegram Mesajları</span>
          {[
            { key: 'morningCheckIn', label: 'Sabah' },
            { key: 'eveningRhythm', label: 'Akşam' },
            { key: 'nightShutdown', label: 'Gece' },
          ].map(({ key, label }) => (
            <details key={key} className="mb-1.5">
              <summary className="text-[11px] text-[var(--text-tertiary)] cursor-pointer hover:text-[var(--text-muted)] transition-colors">
                {label} mesajı
              </summary>
              <pre className="mt-1 text-[10px] text-[var(--text-tertiary)] whitespace-pre-wrap leading-relaxed pl-2 border-l border-[var(--border-subtle)]">
                {plan.telegramMessages[key as keyof typeof plan.telegramMessages]}
              </pre>
            </details>
          ))}
        </div>
      )}

      {todayReminders.length > 0 && (
        <div>
          <span className="text-[10px] text-[var(--text-tertiary)] block mb-2">Gönderilen Hatırlatmalar</span>
          {todayReminders.map((r, i) => (
            <div key={i} className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[var(--text-tertiary)]">{REMINDER_LABELS[r.reminder_type]}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  {new Date(r.sent_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <CheckCircle size={10} className="text-[var(--success)]" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!plan && todayReminders.length === 0 && (
        <p className="text-xs text-[var(--text-tertiary)]">
          Bugün henüz log yok. Sistem {process.env.NEXT_PUBLIC_ORCHESTRATOR_START ?? '1 Haziran 2026'}&apos;dan itibaren aktif.
        </p>
      )}
    </Card>
  );
}

// ─── QuickSend Panel ──────────────────────────────────────────────────────────

function QuickSendPanel() {
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendTelegramCommand(command: string) {
    setLoading(true);
    setStatus('');
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { text: command, chat: { id: 0 } } }),
      });
      setStatus(res.ok ? `${command} gönderildi.` : 'Hata oluştu.');
    } catch {
      setStatus('Bağlantı hatası.');
    } finally {
      setLoading(false);
    }
  }

  const quickCommands = ['/plan', '/ritimler', '/saglik', '/finans', '/shutdown'];

  return (
    <Card>
      <Label>Hızlı Gönder</Label>
      <div className="flex flex-wrap gap-2 mb-3">
        {quickCommands.map(cmd => (
          <button
            key={cmd}
            onClick={() => sendTelegramCommand(cmd)}
            disabled={loading}
            className="px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]
                       text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-muted)] hover:border-[var(--border-strong)]
                       transition-colors disabled:opacity-40 font-mono"
          >
            {cmd}
          </button>
        ))}
      </div>

      {status && (
        <p className="text-[11px] text-[var(--text-tertiary)] mt-2 flex items-center gap-1.5">
          <Zap size={10} />
          {status}
        </p>
      )}
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ─── Source health rozeti ─────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  ok: 'var(--success)',
  degraded: 'var(--warning)',
  stale: 'var(--warning)',
  down: 'var(--border-strong)',
  empty: 'var(--border-strong)',
};

function SourceBadge({ label, health }: { label: string; health: SourceHealth | undefined }) {
  const status = health?.status ?? 'down';
  const color = STATUS_COLORS[status] ?? 'var(--border-strong)';
  const tip = health?.staleSince ? `Stale: ${health.staleSince}` : health?.warnings?.[0] ?? status;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono"
      style={{ border: `1px solid ${color}30`, color, backgroundColor: `${color}12` }}
      title={tip}
    >
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

// ─── Komuta Kartı ─────────────────────────────────────────────────────────────

type KomutaCardProps = {
  plan: CommandPlan | null;
  loading: boolean;
  onRefresh: () => void;
  onAction: (key: ActionKey, state: 'done' | 'skipped') => void;
};

const ACTION_LABELS: Record<ActionKey, string> = {
  agency_sales: 'Satış',
  news_read: 'Bilgi Yakıtı',
  xagent_approve: 'İçerik',
};

function KomutaCard({ plan, loading, onRefresh, onAction }: KomutaCardProps) {
  if (loading) {
    return (
      <Card>
        <div className="h-28 flex items-center justify-center">
          <span className="text-[11px] text-[var(--text-tertiary)] animate-pulse">Komuta planı yükleniyor…</span>
        </div>
      </Card>
    );
  }

  if (!plan) {
    return (
      <Card>
        <div className="flex items-center justify-between mb-3">
          <Label>Ana Komuta</Label>
          <button onClick={onRefresh} className="text-[var(--text-tertiary)] hover:text-[var(--text-muted)] transition-colors" title="Plan üret">
            <RefreshCw size={12} />
          </button>
        </div>
        <p className="text-[11px] text-[var(--text-tertiary)]">Bugün henüz komuta planı yok. Üretmek için yenile.</p>
      </Card>
    );
  }

  const actionKeys = getActiveActionKeys(plan.lock.app, plan.support.map((s) => s.app));

  return (
    <Card>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Label>Ana Komuta</Label>
        <div className="flex items-center gap-2">
          <SourceBadge label="AOS" health={plan.sourceHealth?.agencyos} />
          <SourceBadge label="NAI" health={plan.sourceHealth?.newsAi} />
          <SourceBadge label="XAG" health={plan.sourceHealth?.xagent} />
          <button onClick={onRefresh} className="text-[var(--text-tertiary)] hover:text-[var(--text-muted)] ml-1 transition-colors" title="Planı yenile">
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Kilit */}
      <div className="mb-4 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
        <div className="flex items-start gap-2">
          <span className="text-[13px] shrink-0">🔒</span>
          <div>
            <p className="text-[12px] font-medium text-[var(--text-primary)] leading-snug">{plan.lock.title}</p>
            <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{plan.lock.why}</p>
          </div>
        </div>
      </div>

      {/* Destek aksiyonları */}
      {plan.support.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {plan.support.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
              <span className="text-[10px] text-[var(--text-tertiary)]">›</span>
              {s.title}
            </div>
          ))}
        </div>
      )}

      {/* Minimum gün */}
      <div className="mb-5 px-2.5 py-1.5 rounded bg-[var(--bg-base)] border border-[var(--border-subtle)]">
        <span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-widest mr-2">Min. gün</span>
        <span className="text-[11px] text-[var(--text-muted)]">{plan.minimumDay}</span>
      </div>

      {/* Aksiyon butonları */}
      <div className="flex flex-wrap gap-2">
        {actionKeys.map((key) => {
          const state: ActionState = plan.actions[key] ?? 'pending';
          return (
            <div key={key} className="flex items-center gap-1">
              <span
                className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-widest mr-1"
              >
                {ACTION_LABELS[key]}
              </span>
              {state === 'pending' ? (
                <>
                  <button
                    onClick={() => onAction(key, 'done')}
                    className="px-2 py-0.5 rounded text-[9px] border border-[var(--success)]/30 text-[var(--success)] hover:bg-[var(--success)]/10 transition-colors"
                  >
                    Yaptım
                  </button>
                  <button
                    onClick={() => onAction(key, 'skipped')}
                    className="px-2 py-0.5 rounded text-[9px] border border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:bg-[var(--bg-card-hover)] transition-colors"
                  >
                    Atla
                  </button>
                </>
              ) : (
                <span className={`text-[9px] ${state === 'done' ? 'text-[var(--success)]' : 'text-[var(--text-tertiary)]'}`}>
                  {state === 'done' ? '✓ tamam' : '— atlandı'}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

// Panel-invisible: mentör artık Telegram üzerinden iki yönlü çalışır. Bu panel
// yalnızca admin/debug içindir. Engine (API route'lar + cron) canlı kalır; sadece
// UI gizlenir. Görünür kılmak için NEXT_PUBLIC_SHOW_ORCHESTRATOR=1 ayarla.
const ORCHESTRATOR_PANEL_VISIBLE = process.env.NEXT_PUBLIC_SHOW_ORCHESTRATOR === '1';

export function OrchestratorPage() {
  if (!ORCHESTRATOR_PANEL_VISIBLE) return null;
  return <OrchestratorPageInner />;
}

function OrchestratorPageInner() {
  const today = new Date().toISOString().slice(0, 10);
  const [state, setState] = useState<DailyState | null>(null);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [commandPlan, setCommandPlan] = useState<CommandPlan | null>(null);
  const [commandLoading, setCommandLoading] = useState(true);

  const fetchState = useCallback(async () => {
    setLoading(true);
    try {
      const [stateRes, remindersRes] = await Promise.all([
        fetch(`/api/orchestrator/state?date=${today}`),
        fetch(`/api/orchestrator/reminders?date=${today}`),
      ]);
      if (stateRes.ok) setState(await stateRes.json() as DailyState);
      if (remindersRes.ok) setReminders(await remindersRes.json() as ReminderRow[]);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [today]);

  const fetchCommandPlan = useCallback(async (forceRefresh = false) => {
    setCommandLoading(true);
    try {
      const method = forceRefresh ? 'DELETE' : 'POST';
      const res = await fetch('/api/ai/command-center', { method });
      if (res.ok) {
        const json = await res.json() as { plan: CommandPlan };
        setCommandPlan(json.plan);
      }
    } catch { /* ignore */ }
    finally { setCommandLoading(false); }
  }, []);

  const markAction = useCallback(async (key: ActionKey, actionState: 'done' | 'skipped') => {
    try {
      await fetch('/api/ai/command-center/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, state: actionState }),
      });
      setCommandPlan(prev => prev
        ? { ...prev, actions: { ...prev.actions, [key]: actionState } }
        : prev
      );
    } catch { /* ignore */ }
  }, []);

  // fetchState sets state inside a callback invoked on mount — intentional data fetch→React sync
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchState(); }, [fetchState]);
  // fetchCommandPlan sets state inside a callback invoked on mount — intentional data fetch→React sync
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchCommandPlan(); }, [fetchCommandPlan]);

  const plan = state?.today_plan_json ?? null;

  return (
    <div className="max-w-[920px] mx-auto px-4 sm:px-6 pb-16">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Bot size={14} className="text-[var(--text-tertiary)]" strokeWidth={1.5} />
          <span className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] font-medium">
            Asistan — Günlük Orkestra
          </span>
        </div>
        <p className="text-[12px] text-[var(--text-tertiary)]">
          Tüm tabları birbirine bağlayan günlük planlama sistemi. Başlangıç: 1 Haziran 2026.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Komuta Kartı — ana blok */}
          <KomutaCard
            plan={commandPlan}
            loading={commandLoading}
            onRefresh={() => fetchCommandPlan(true)}
            onAction={markAction}
          />

          {/* Row 1: Plan + Systems */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
            <TodayPlanCard state={state} onRefresh={fetchState} />
            <div className="flex flex-col gap-4">
              <ConnectedSystemsCard plan={plan} />
              <QuickSendPanel />
            </div>
          </div>

          {/* Row 2: Telegram + Reminders */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TelegramStatusCard reminders={reminders} />
            <ReminderSettingsCard />
          </div>

          {/* Row 3: Log */}
          <AssistantLog plan={plan} reminders={reminders} />

          {/* Row 4: Original AssistantChat (kept) */}
          <div className="mt-2">
            <span className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] font-medium block mb-3">
              AI Sohbet
            </span>
            <div id="assistant-chat-slot" />
          </div>
        </div>
      )}
    </div>
  );
}
