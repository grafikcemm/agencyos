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
          className="px-3 py-1.5 bg-[#111111] border border-[#1f1f1f] rounded-lg text-xs text-[#666666]
                     hover:border-[#2a2a2a] hover:text-[#888888] disabled:opacity-40 transition-all"
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
