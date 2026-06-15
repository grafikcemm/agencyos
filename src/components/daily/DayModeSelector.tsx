'use client';

import React, { useState, useTransition } from 'react';
import { setDayMode } from '@/app/actions/dailyV2';

type DayMode = 'normal' | 'yogun' | 'dagilmis';

interface DayModeSelectorProps {
  initialMode: DayMode | null;
  onModeSelected?: (mode: DayMode) => void;
}

const MODES: { value: DayMode; label: string; desc: string; color: string }[] = [
  { value: 'normal',   label: 'Normal',   desc: '3 görev', color: '#22c55e' },
  { value: 'yogun',    label: 'Yoğun',    desc: '2 görev', color: 'var(--warning)' },
  { value: 'dagilmis', label: 'Dağılmış', desc: '1 görev', color: '#ef4444' },
];

export function DayModeSelector({ initialMode, onModeSelected }: DayModeSelectorProps) {
  const [selected, setSelected] = useState<DayMode | null>(initialMode);
  const [expanded, setExpanded] = useState<boolean>(initialMode === null);
  const [, startTransition] = useTransition();

  const handleSelect = (mode: DayMode) => {
    const prev = selected;
    setSelected(mode);
    setExpanded(false);
    startTransition(async () => {
      const result = await setDayMode(mode);
      if (result.error) {
        setSelected(prev);
        setExpanded(true);
        return;
      }
      onModeSelected?.(mode);
    });
  };

  const currentMode = MODES.find(m => m.value === selected);

  if (!expanded && selected) {
    return (
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-card shadow-soft">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: currentMode?.color ?? '#22c55e' }}
          />
          <span className="text-sm text-[#cccccc]">
            Bugün: <span className="font-semibold" style={{ color: currentMode?.color }}>{currentMode?.label}</span>
          </span>
        </div>
        <button
          onClick={() => setExpanded(true)}
          className="text-[10px] text-[#444444] hover:text-[#888888] transition-colors"
        >
          değiştir
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-card shadow-soft">
      <p className="font-mono text-[10px] font-semibold tracking-[0.18em] uppercase text-[#555555]">
        Bugün modun ne?
      </p>
      <div className="flex gap-2">
        {MODES.map(m => (
          <button
            key={m.value}
            onClick={() => handleSelect(m.value)}
            className={`flex-1 py-2.5 px-3 rounded-card text-sm font-medium transition-all border ${
              selected === m.value
                ? 'text-black border-transparent'
                : 'bg-[#0a0a0a] border-[#1f1f1f] text-[#666666] hover:border-[#333333] hover:text-white'
            }`}
            style={selected === m.value ? { backgroundColor: m.color, borderColor: m.color } : {}}
          >
            <span className="block">{m.label}</span>
            <span className="block text-[10px] opacity-70 mt-0.5">{m.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
