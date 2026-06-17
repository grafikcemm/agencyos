"use client";

import { useState, useEffect } from "react";
import { Brain, Trash2, ChevronDown, ChevronUp, Plus } from "lucide-react";

const MEMORY_KEY = "feed-the-goat-assistant-memory-v1";

interface MemoryItem {
  id: string;
  text: string;
  category: "preference" | "goal" | "routine" | "warning" | "project" | "reflection";
  createdAt: string;
}

const DEFAULT_MEMORIES: MemoryItem[] = [
  { id: "d1", text: "Cem kalabalık dashboard görünce bunalıyor.", category: "preference", createdAt: "2024-01-01" },
  { id: "d2", text: "Cem'in ana hedefi kendini geliştirmek. İş veya freelance değil.", category: "goal", createdAt: "2024-01-01" },
  { id: "d3", text: "Günlük ana sayfada maksimum sade görev görmek istiyor.", category: "preference", createdAt: "2024-01-01" },
  { id: "d4", text: "Bugünün Kilidi tek ana iş olmalı.", category: "routine", createdAt: "2024-01-01" },
  { id: "d5", text: "Spor günlerinde akşam iş çıkışı direkt gitmeli.", category: "routine", createdAt: "2024-01-01" },
];

const CATEGORY_LABELS: Record<MemoryItem["category"], string> = {
  preference: "Tercih",
  goal: "Hedef",
  routine: "Rutin",
  warning: "Uyarı",
  project: "Proje",
  reflection: "Yansıma",
};

const CATEGORY_COLORS: Record<MemoryItem["category"], string> = {
  preference: "var(--info)",
  goal: "var(--success)",
  routine: "var(--accent)",
  warning: "var(--danger)",
  project: "var(--fire)",
  reflection: "#a855f7",
};

function loadMemories(): MemoryItem[] {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return DEFAULT_MEMORIES;
    return JSON.parse(raw) as MemoryItem[];
  } catch {
    return DEFAULT_MEMORIES;
  }
}

function saveMemories(memories: MemoryItem[]) {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memories));
  } catch { /* ignore */ }
}

export function AssistantMemoryPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [newText, setNewText] = useState("");
  const [newCategory, setNewCategory] = useState<MemoryItem["category"]>("preference");

  useEffect(() => {
    // reads persisted memories on mount — intentional external→React sync
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMemories(loadMemories());
  }, []);

  function deleteMemory(id: string) {
    const updated = memories.filter((m) => m.id !== id);
    setMemories(updated);
    saveMemories(updated);
  }

  function addMemory() {
    if (!newText.trim()) return;
    const item: MemoryItem = {
      id: Date.now().toString(),
      text: newText.trim(),
      category: newCategory,
      createdAt: new Date().toISOString().split("T")[0],
    };
    const updated = [item, ...memories];
    setMemories(updated);
    saveMemories(updated);
    setNewText("");
  }

  return (
    <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 pt-4 pb-3 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain size={13} className="text-[var(--text-tertiary)]" strokeWidth={1.8} />
          <span className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] font-medium">
            Asistan Hafızası
          </span>
          <span className="text-[10px] text-[var(--text-tertiary)]">({memories.length})</span>
        </div>
        {isOpen ? (
          <ChevronUp size={13} className="text-[var(--text-tertiary)]" />
        ) : (
          <ChevronDown size={13} className="text-[var(--text-tertiary)]" />
        )}
      </button>

      {isOpen && (
        <>
          <div className="h-px bg-[var(--border-subtle)]" />

          {/* Memory list */}
          <div className="px-5 py-3 flex flex-col gap-2 max-h-64 overflow-y-auto">
            {memories.map((m) => (
              <div
                key={m.id}
                className="flex items-start gap-2 group"
              >
                <span
                  className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                  style={{
                    color: CATEGORY_COLORS[m.category],
                    border: `1px solid ${CATEGORY_COLORS[m.category]}44`,
                    backgroundColor: `${CATEGORY_COLORS[m.category]}11`,
                  }}
                >
                  {CATEGORY_LABELS[m.category]}
                </span>
                <p className="text-xs text-[var(--text-muted)] flex-1 leading-relaxed">{m.text}</p>
                <button
                  onClick={() => deleteMemory(m.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <Trash2 size={11} className="text-[var(--text-tertiary)] hover:text-[var(--danger)] transition-colors" />
                </button>
              </div>
            ))}
          </div>

          {/* Add memory */}
          <div className="h-px bg-[var(--border-subtle)]" />
          <div className="px-5 py-3 flex flex-col gap-2">
            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addMemory()}
              placeholder="Yeni hafıza ekle..."
              className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-muted)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--border-strong)]"
            />
            <div className="flex items-center gap-2">
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as MemoryItem["category"])}
                className="flex-1 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-tertiary)] outline-none"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <button
                onClick={addMemory}
                disabled={!newText.trim()}
                className="flex items-center gap-1 px-3 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] disabled:opacity-40 transition-colors"
              >
                <Plus size={11} />
                Ekle
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
