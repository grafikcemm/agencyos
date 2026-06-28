'use client'

import { TARGET_AGNO, SAFE_AGNO, BASELINE, type AgnoBand } from '@/lib/akademi/agno'

const BAND_COLOR: Record<AgnoBand, string> = {
  red: '#ff5d6c',
  yellow: '#f5c451',
  green: '#46d39a',
}

const BAND_LABEL: Record<AgnoBand, string> = {
  red: 'Riskli — hedefin altında',
  yellow: 'Hedef üstü, güvenli bandın altında',
  green: 'Güvenli bant',
}

const MAX_AGNO = 4.0
const RADIUS = 70
const STROKE = 12
const CIRC = 2 * Math.PI * RADIUS

interface AgnoMeterProps {
  agno: number
  band: AgnoBand
  denominator: number
  gradAkts: number
  countedCourses: number
}

export function AgnoMeter({ agno, band, denominator, gradAkts, countedCourses }: AgnoMeterProps) {
  const color = BAND_COLOR[band]
  const fraction = Math.max(0, Math.min(1, agno / MAX_AGNO))
  const dash = CIRC * fraction
  const delta = agno - BASELINE.agno

  return (
    <section
      className="rounded-card border bg-[var(--bg-surface)] shadow-soft p-5 lg:p-6"
      style={{ borderColor: 'var(--border-subtle)' }}
      aria-label="Canlı AGNO projeksiyonu"
    >
      <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
        Canlı AGNO Projeksiyonu
      </p>

      <div className="mt-4 flex flex-col sm:flex-row items-center gap-6">
        {/* Ring */}
        <div className="relative shrink-0" style={{ width: 168, height: 168 }}>
          <svg width={168} height={168} viewBox="0 0 168 168" className="-rotate-90">
            <circle
              cx={84}
              cy={84}
              r={RADIUS}
              fill="none"
              stroke="var(--bg-elevated)"
              strokeWidth={STROKE}
            />
            <circle
              cx={84}
              cy={84}
              r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${CIRC}`}
              style={{ transition: 'stroke-dasharray 350ms cubic-bezier(0.16,1,0.3,1), stroke 200ms ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-display font-bold tabular-nums" style={{ color }}>
              {agno.toFixed(2)}
            </span>
            <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] mt-0.5">AGNO</span>
          </div>
        </div>

        {/* Detay */}
        <div className="flex-1 w-full space-y-3">
          <p className="text-sm font-medium" style={{ color }}>
            {BAND_LABEL[band]}
          </p>

          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs font-mono text-[var(--text-secondary)]">
            <Stat label="Baseline" value={BASELINE.agno.toFixed(2)} />
            <Stat
              label="Değişim"
              value={`${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`}
              color={delta >= 0 ? '#46d39a' : '#ff5d6c'}
            />
            <Stat label="Payda" value={`${denominator} / ${gradAkts}`} />
            <Stat label="Girilen ders" value={`${countedCourses}`} />
          </div>

          {/* Hedef bandı çubuğu */}
          <BandBar agno={agno} />
        </div>
      </div>
    </section>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[9px] uppercase text-[var(--text-muted)]">{label}</span>
      <span className="tabular-nums" style={color ? { color } : undefined}>
        {value}
      </span>
    </span>
  )
}

/** 0–4 ölçeğinde AGNO + hedef(2.00)/güvenli(2.25) işaretleri. */
function BandBar({ agno }: { agno: number }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / MAX_AGNO) * 100))}%`
  return (
    <div className="pt-1">
      <div className="relative h-2 rounded-full overflow-hidden bg-[var(--bg-elevated)]">
        {/* renk bantları */}
        <div className="absolute inset-y-0 left-0" style={{ width: pct(TARGET_AGNO), background: 'rgba(255,93,108,0.30)' }} />
        <div className="absolute inset-y-0" style={{ left: pct(TARGET_AGNO), width: pct(SAFE_AGNO - TARGET_AGNO), background: 'rgba(245,196,81,0.30)' }} />
        <div className="absolute inset-y-0" style={{ left: pct(SAFE_AGNO), right: 0, background: 'rgba(70,211,154,0.25)' }} />
        {/* mevcut konum */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-3.5 w-1 rounded-full bg-white"
          style={{ left: pct(agno), transition: 'left 350ms cubic-bezier(0.16,1,0.3,1)' }}
        />
      </div>
      <div className="relative mt-1 h-3 text-[9px] font-mono text-[var(--text-muted)]">
        <span className="absolute -translate-x-1/2" style={{ left: pct(TARGET_AGNO) }}>2.00</span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(SAFE_AGNO) }}>2.25</span>
      </div>
    </div>
  )
}
