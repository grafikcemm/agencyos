"use client";

interface QuickActionsProps {
  onAction: (action: string) => void;
  loading: boolean;
}

const ACTIONS = [
  { id: "plan",      label: "Bugünü planla" },
  { id: "simplify",  label: "Görevleri sadeleştir" },
  { id: "waiting",   label: "Bekleyenleri toparla" },
  { id: "shutdown",  label: "Günü kapat" },
  { id: "weekly",    label: "Haftalık özet" },
] as const;

export function QuickActions({ onAction, loading }: QuickActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.map((a) => (
        <button
          key={a.id}
          onClick={() => onAction(a.id)}
          disabled={loading}
          className="px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-muted)]
                     hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)] disabled:opacity-40 transition-all"
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
