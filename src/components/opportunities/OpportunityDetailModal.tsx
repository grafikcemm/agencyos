import { AlertTriangle, ArrowRight, CheckCircle2, CreditCard, Gauge, Target, X } from 'lucide-react'
import { ACTION_TIER_LABELS, CATEGORY_LABELS, Opportunity, OpportunityStatus, STATUS_LABELS } from '@/lib/opportunities'

interface ModalProps {
  opp: Opportunity
  onClose: () => void
  onStatusChange: (newStatus: OpportunityStatus) => void
}

export function OpportunityDetailModal({ opp, onClose, onStatusChange }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative mt-8">
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] sticky top-0 z-10">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] bg-[var(--accent-muted)] px-2 py-1 rounded-md">
                {ACTION_TIER_LABELS[opp.actionTier]}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] border border-[var(--border-subtle)] px-2 py-1 rounded-md">
                {CATEGORY_LABELS[opp.category]}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--success)]">
                Skor {opp.score.total}/100
              </span>
            </div>
            <h2 className="text-xl font-black text-[var(--text-primary)] leading-tight">{opp.title}</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-3xl">{opp.decision}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-card-hover)] rounded-md transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label="Kapat">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <div className="space-y-5">
              <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Signal label="İlk gelir hedefi" value={opp.firstRevenueTarget} />
                <Signal label="Ana metrik" value={opp.primaryMetric} />
                <Signal label="Fiyat" value={opp.priceRange} />
              </section>

              <section className="rounded-lg border border-[var(--accent)]/25 bg-[var(--accent-muted)] p-4">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[var(--accent)] mb-2">
                  <ArrowRight className="w-4 h-4" />
                  Sonraki aksiyon
                </div>
                <p className="text-sm font-black text-[var(--text-primary)] leading-relaxed">{opp.nextAction}</p>
              </section>

              <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoBlock title="Problem" text={opp.problem} />
                <InfoBlock title="Çözüm" text={opp.solution} />
              </section>

              <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">
                  <CreditCard className="w-4 h-4" />
                  Ödeme ve satış yolu
                </div>
                <p className="text-sm text-[var(--text-primary)] leading-relaxed">{opp.paymentPlan}</p>
              </section>

              <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ListBlock title="Bugünkü icraat" items={opp.actionSteps} tone="action" />
                <ListBlock title="Bitmiş sayılması için" items={opp.completionCriteria} tone="done" />
              </section>

              <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ListBlock title="Neden mantıklı" items={opp.whyItMakesSense} tone="done" />
                <ListBlock title="Riskler" items={opp.risks} tone="risk" />
              </section>

              <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">
                  {STATUS_LABELS[opp.status]} kontrol listesi
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {opp.currentStageChecklist.map((item, idx) => (
                    <label key={idx} className="flex items-center gap-2 p-2 rounded-md hover:bg-[var(--bg-elevated)] cursor-pointer transition-colors">
                      <input type="checkbox" defaultChecked={item.checked} className="w-4 h-4 accent-[var(--accent)] bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded shrink-0" />
                      <span className="text-[12px] text-[var(--text-secondary)]">{item.label}</span>
                    </label>
                  ))}
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Aşama</label>
                <select
                  value={opp.status}
                  onChange={(e) => onStatusChange(e.target.value as OpportunityStatus)}
                  className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] text-sm py-2 px-3 rounded-md text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                >
                  {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">
                  <Gauge className="w-4 h-4" />
                  Puan motoru
                </div>
                <ScoreRow label="Gelir" value={opp.score.revenuePotential} />
                <ScoreRow label="Hız" value={opp.score.speedToLaunch} />
                <ScoreRow label="Kitle uyumu" value={opp.score.audienceFit} />
                <ScoreRow label="Ödeme hazır" value={opp.score.paymentReadiness} />
                <ScoreRow label="Aksiyon netliği" value={opp.score.actionClarity} />
              </div>

              <div className="rounded-lg border border-[var(--danger)]/25 bg-[var(--danger)]/10 p-4">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[var(--danger)] mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  Blokaj
                </div>
                <p className="text-sm font-bold text-[var(--danger)] leading-relaxed">{opp.launchBlocker}</p>
              </div>

              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2">
                  <Target className="w-4 h-4" />
                  Odak kuralı
                </div>
                <p className="text-sm font-bold text-[var(--text-primary)] leading-relaxed">{opp.antiDistractionRule}</p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}

function Signal({ label, value }: { label: string, value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">{label}</div>
      <div className="text-sm font-black text-[var(--text-primary)] leading-snug">{value}</div>
    </div>
  )
}

function InfoBlock({ title, text }: { title: string, text: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2">{title}</h3>
      <p className="text-sm text-[var(--text-primary)] leading-relaxed">{text}</p>
    </div>
  )
}

function ListBlock({ title, items, tone }: { title: string, items: string[], tone: 'action' | 'done' | 'risk' }) {
  const iconColor = tone === 'risk' ? 'text-[var(--danger)]' : tone === 'action' ? 'text-[var(--accent)]' : 'text-[var(--success)]'

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">{title}</h3>
      <ul className="space-y-2">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-start gap-2 text-[13px] text-[var(--text-secondary)] leading-relaxed">
            <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${iconColor}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ScoreRow({ label, value }: { label: string, value: number }) {
  return (
    <div className="py-2 border-b border-[var(--border-subtle)] last:border-b-0">
      <div className="flex justify-between text-[12px] mb-1">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="font-bold text-[var(--text-primary)]">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--bg-base)] overflow-hidden">
        <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  )
}
