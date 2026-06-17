"use client";

import React, { useState, useEffect } from 'react';
import { getSupplementsForDay } from '@/data/supplements';
import { WORKOUT_DAYS } from '@/data/healthProtocol';
import { fireTaskConfetti } from '@/lib/confetti';
import { cn } from '@/utils/cn';
import { Check, Sparkles } from 'lucide-react';

interface VitaminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTakeAll: () => void;
}

export function VitaminModal({ 
  isOpen, 
  onClose, 
  onTakeAll
}: VitaminModalProps) {
  const [isWorkoutDay, setIsWorkoutDay] = useState(false);
  const [takenStatus, setTakenStatus] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Hydration mount guard — intentional one-time sync of client-only workout-day flag
    setMounted(true);
    const dayOfWeek = new Date().getDay();
    setIsWorkoutDay(WORKOUT_DAYS.has(dayOfWeek));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Load current supplement taken status from localStorage on open
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Reading external localStorage state into local UI state on open — intentional sync
    if (isOpen && mounted) {
      try {
        const key = "feed-the-goat-health-completions-v1";
        const storedRaw = localStorage.getItem(key);
        if (storedRaw) {
          const completions = JSON.parse(storedRaw);
          if (completions[today] && completions[today].supplements) {
            setTakenStatus(completions[today].supplements);
            return;
          }
        }
      } catch {}
      setTakenStatus({});
    }
  }, [isOpen, mounted, today]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!isOpen) return null;

  const activeSupps = getSupplementsForDay(isWorkoutDay);
  const allTaken = activeSupps.length > 0 && activeSupps.every(s => !!takenStatus[s.key]);

  const handleTakeAllClick = () => {
    // 1. Update localStorage
    try {
      const key = "feed-the-goat-health-completions-v1";
      const storedRaw = localStorage.getItem(key);
      const completions = storedRaw ? JSON.parse(storedRaw) : {};
      
      const todayCompletion = completions[today] || {
        date: today,
        waterDone: false,
        proteinDone: false,
        noDairyGlutenSugar: false,
        shampooDone: false,
        faceMorningDone: false,
        faceEveningDone: false,
        psylliumDone: false,
        creatineDone: false,
        hygieneDone: false,
        noPickingDone: false,
        meals: { breakfast: false, lunch: false, snack: false, dinner: false, night: false },
        supplements: {
          d3k2: false, omega3: false, veganProtein: false, creatine: false,
          magnimore: false, psyllium: false, optionalGlutamine: false, optionalTyrosine: false,
        },
        backRoutine: false,
      };

      activeSupps.forEach(item => {
        todayCompletion.supplements[item.key] = true;
      });

      completions[today] = todayCompletion;
      localStorage.setItem(key, JSON.stringify(completions));
    } catch (err) {
      console.error("Failed to save health completions:", err);
    }

    // 2. Fire confetti and call parent handler to check routine checkbox
    fireTaskConfetti();
    onTakeAll();
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-t-2xl">
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
              <Sparkles size={16} className="text-[var(--accent)]" /> BUGÜNÜN TAKVİYELERİ
            </h2>
            <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--text-tertiary)] mt-1">
              {isWorkoutDay ? "💪 ANTRENMAN GÜNÜ REÇETESİ" : "💤 DİNLENME GÜNÜ REÇETESİ"}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg-card-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all text-lg font-medium"
          >
            ×
          </button>
        </div>

        {/* Success Alert */}
        {allTaken && (
          <div className="px-5 pt-5 animate-in slide-in-from-top-3 duration-500">
            <div className="bg-[var(--success)]/10 border border-[var(--success)]/20 rounded-xl py-2.5 px-3.5 text-[var(--success)] text-xs font-semibold text-center flex items-center justify-center gap-2">
              <Check size={12} strokeWidth={4} />
              <span>TÜM SUPPLEMENTLER ALINDI & ONAYLANDI</span>
            </div>
          </div>
        )}

        {/* Content List */}
        <div className="p-5 flex flex-col gap-2">
          {activeSupps.map(pkg => {
            const isTaken = !!takenStatus[pkg.key];
            return (
              <div 
                key={pkg.key}
                className={cn(
                  "border rounded-xl px-4 py-3 bg-[var(--bg-base)] transition-all duration-300 flex items-center justify-between gap-4",
                  isTaken ? "border-[var(--success)]/25 opacity-70" : "border-[var(--border-subtle)]"
                )}
              >
                <div className="flex-1 min-w-0">
                  <h3 className={cn(
                    "text-xs font-semibold tracking-tight transition-colors",
                    isTaken ? "text-[var(--text-tertiary)] line-through" : "text-[var(--text-primary)]"
                  )}>
                    {pkg.label}
                    {pkg.optional && <span className="text-[9px] text-[var(--text-tertiary)] ml-1">(opsiyonel)</span>}
                  </h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[9px] text-[var(--text-tertiary)] font-mono">{pkg.time}</span>
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full flex items-center justify-center border transition-all duration-300",
                      isTaken ? "bg-[var(--success)] border-[var(--success)] text-black" : "border-[var(--border-strong)]"
                    )}
                  >
                    {isTaken && <Check size={10} strokeWidth={4} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Footer */}
        <div className="p-5 pt-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-b-2xl">
          {!allTaken ? (
            <button
              onClick={handleTakeAllClick}
              className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
            >
              <Check size={14} strokeWidth={3} /> HEPSİNİ ALDIM
            </button>
          ) : (
            <button
              onClick={onClose}
              className="w-full py-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)] text-xs font-semibold rounded-xl hover:text-[var(--text-primary)] transition-all"
            >
              KAPAT
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
