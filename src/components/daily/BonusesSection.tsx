'use client';

import React, { useState, useTransition } from 'react';
import { toggleEnglishBonus } from '@/app/actions/dailyV2';
import { getEnglishPlanForToday } from '@/data/englishWeeklyPlan';

interface BonusesSectionProps {
  initialEnglishDone: boolean;
}

export function BonusesSection({ initialEnglishDone }: BonusesSectionProps) {
  const plan = getEnglishPlanForToday();
  const [englishDone, setEnglishDone] = useState(initialEnglishDone);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const toggleEnglish = () => {
    const prev = englishDone;
    const next = !prev;
    setEnglishDone(next);
    setError(null);
    startTransition(async () => {
      const result = await toggleEnglishBonus(next);
      if (result?.error) {
        // Rollback optimistic state
        setEnglishDone(prev);
        setError('Kaydedilemedi, tekrar dene');
        setTimeout(() => setError(null), 3000);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-card shadow-soft mt-3">
      <p className="font-mono text-[10px] font-semibold tracking-[0.18em] uppercase text-[#555555]">
        Bonuslar
      </p>
      <button
        onClick={toggleEnglish}
        className="flex items-center gap-3 text-left"
      >
        <span
          className={`w-5 h-5 rounded-sm border shrink-0 flex items-center justify-center transition-all ${
            englishDone ? 'bg-[#22c55e] border-[#22c55e]' : 'border-[#2a2a2a] bg-[#0a0a0a]'
          }`}
        >
          {englishDone && (
            <svg className="w-3.5 h-3.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </span>
        <div className="flex-1 min-w-0">
          <span className={`text-sm block transition-colors ${englishDone ? 'text-[#555555] line-through' : 'text-[#cccccc]'}`}>
            İngilizce — {plan.focus}
          </span>
          <span className="text-[10px] text-[#444444]">
            {plan.duration} · {plan.goal}
          </span>
        </div>
      </button>
      {error && (
        <p className="text-[10px] text-[#ef4444] mt-1 animate-in fade-in duration-200">
          {error}
        </p>
      )}
    </div>
  );
}
