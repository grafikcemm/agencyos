import React from "react";

interface StatBlockProps {
  /** Büyük sayı/değer */
  value: React.ReactNode;
  /** Alt mono etiket */
  label: React.ReactNode;
  /** Değerin yanındaki küçük üst-simge (birim / işaret, örn. "+", "₺", "%") */
  sup?: React.ReactNode;
  /** Değeri kırmızı accent yap */
  accent?: boolean;
  className?: string;
}

/**
 * Referansın 60 / 1000 / 100 000 motifi: dev tabular sayı + minik mono etiket.
 */
export function StatBlock({
  value,
  label,
  sup,
  accent = false,
  className = "",
}: StatBlockProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-start gap-1">
        <span
          className={`stat-number ${
            accent ? "text-[var(--accent)]" : "text-[var(--text-primary)]"
          }`}
        >
          {value}
        </span>
        {sup ? (
          <span className="label-eyebrow mt-1 text-[var(--text-muted)]">{sup}</span>
        ) : null}
      </div>
      <span className="label-eyebrow">{label}</span>
    </div>
  );
}
