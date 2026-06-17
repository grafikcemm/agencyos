"use client";

import React, { useState, useEffect } from "react";

const MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const DAYS = [
  "Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi",
];

function greetingFor(hour: number): string {
  if (hour < 6) return "Gece sessiz";
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi öğleden sonra";
  return "İyi akşamlar";
}

interface EditorialGreetingProps {
  /** optional progress line under the name (e.g. "3/8 tamam") */
  progressLabel?: string;
}

/**
 * Sakin editöryel selamlama başlığı — timeline omurgasının tepesinde.
 * font-display, büyük; tarih font-mono küçük üst-etiket.
 */
export function EditorialGreeting({ progressLabel }: EditorialGreetingProps) {
  const [mounted, setMounted] = useState(false);
  const [dateString, setDateString] = useState("");
  const [hello, setHello] = useState("Merhaba");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Hydration mount guard — intentional one-time sync of client-only date/time
    setMounted(true);
    const d = new Date();
    setDateString(`${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${DAYS[d.getDay()]}`);
    setHello(greetingFor(d.getHours()));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!mounted) {
    return (
      <div className="flex flex-col gap-2 mb-2">
        <div className="h-3 w-44 bg-[var(--surface)] rounded animate-pulse" />
        <div className="h-10 w-64 bg-[var(--surface)] rounded animate-pulse" />
      </div>
    );
  }

  return (
    <header className="flex flex-col mb-1">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
        {dateString}
      </p>
      <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-[var(--text-primary)] leading-[1.02] mt-2">
        {hello},
        <br />
        <span className="text-[var(--text-secondary)]">Cem.</span>
      </h1>
      {progressLabel && (
        <p className="font-mono text-[11px] text-[var(--text-muted)] mt-3 tabular-nums">{progressLabel}</p>
      )}
    </header>
  );
}
