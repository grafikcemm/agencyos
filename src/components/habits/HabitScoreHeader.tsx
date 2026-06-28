'use client'

import { Flame, Trophy, Check } from 'lucide-react'
import type { HabitScore } from '@/lib/habits/scoring'
import { cn } from '@/lib/utils'

/**
 * Oyunlaştırma başlığı: ÇEKİRDEK skor halkası (ADHD-koruyucu) + Seviye/XP + global zincir.
 * Çekirdekler (beslenme/su/vitamin) tamamsa "Gün başarılı" — diğerleri bonus.
 */
export function HabitScoreHeader({ score }: { score: HabitScore }) {
  const ratio = score.coreDue > 0 ? score.coreDone / score.coreDue : 0
  const success = score.coreComplete
  return (
    <header className="flex flex-col gap-4 pt-1">
      <div className="flex items-center gap-2.5">
        <Flame className="w-5 h-5 text-[var(--accent)]" />
        <h1 className="text-2xl sm:text-3xl font-semibold font-[family-name:var(--font-display)] tracking-tight text-[var(--text-primary)]">
          Alışkanlıklar
        </h1>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 sm:p-5 flex items-center gap-4 sm:gap-6">
        {/* Çekirdek skor halkası */}
        <ScoreRing ratio={ratio} done={score.coreDone} due={score.coreDue} success={success} />

        {/* Durum + Seviye + XP + zincir */}
        <div className="min-w-0 flex-1 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <span
              className={cn(
                'text-sm font-semibold truncate',
                success ? 'text-[var(--success,#34d399)]' : 'text-[var(--text-primary)]',
              )}
            >
              {success ? '🎯 Gün başarılı' : 'Çekirdek bitince gün başarılı'}
            </span>
            <div className="flex items-center gap-1.5 shrink-0" title={`${score.globalStreak} gün kesintisiz`}>
              <Flame
                className={cn(
                  'w-4 h-4',
                  score.globalStreak > 0 ? 'text-[var(--fire,#fb923c)]' : 'text-[var(--text-quaternary)]',
                )}
              />
              <span
                className={cn(
                  'num text-sm font-semibold',
                  score.globalStreak > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-quaternary)]',
                )}
              >
                {score.globalStreak}
              </span>
            </div>
          </div>

          {/* XP çubuğu */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span className="text-xs font-semibold text-[var(--text-primary)] shrink-0">Seviye {score.level}</span>
              <div className="ml-1 flex-1 h-2 rounded-full bg-[var(--bg-elevated,rgba(255,255,255,0.06))] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out motion-reduce:transition-none"
                  style={{ width: `${Math.round(score.levelProgress * 100)}%` }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
              <span className="num">{score.todayPoints} puan bugün · tümü {score.todayDone}/{score.todayDue}</span>
              <span className="num">Sonraki: {score.xpToNext} XP</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

function ScoreRing({
  ratio,
  done,
  due,
  success,
}: {
  ratio: number
  done: number
  due: number
  success: boolean
}) {
  const size = 76
  const stroke = 6
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.min(1, Math.max(0, ratio)))
  const ringColor = success ? 'var(--success,#34d399)' : 'var(--accent)'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border-strong,rgba(255,255,255,0.12))"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {success ? (
          <Check className="w-7 h-7 text-[var(--success,#34d399)]" strokeWidth={3} />
        ) : (
          <span className="num text-lg font-semibold leading-none text-[var(--text-primary)]">
            {done}/{due}
          </span>
        )}
        <span className="text-[8px] uppercase tracking-widest text-[var(--text-muted)] mt-0.5">Çekirdek</span>
      </div>
    </div>
  )
}
