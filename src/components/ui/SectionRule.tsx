import React from "react";

interface SectionRuleProps {
  /** İsteğe bağlı satır-içi mono etiket */
  label?: React.ReactNode;
  className?: string;
}

/**
 * Hairline bölüm ayıracı — editöryel Swiss ızgara çizgisi. Etiket verilirse
 * mono mikro-başlık + ince çizgi olarak render eder.
 */
export function SectionRule({ label, className = "" }: SectionRuleProps) {
  if (!label) {
    return (
      <hr
        className={`border-0 border-t border-[var(--border-subtle)] ${className}`}
      />
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="label-eyebrow whitespace-nowrap">{label}</span>
      <span className="h-px flex-1 bg-[var(--border-subtle)]" />
    </div>
  );
}
