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
  preference: "#3b82f6",
  goal: "#22c55e",
  routine: "var(--accent)",
  warning: "#ef4444",
  project: "#f97316",
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
    <div className="bg-[#111111] rounded-xl border border-[#1f1f1f] overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 pt-4 pb-3 flex items-center justify-between hover:bg-[#161616] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain size={13} className="text-[#555555]" strokeWidth={1.8} />
          <span className="text-[10px] uppercase tracking-widest text-[#444444] font-medium">
            Asistan Hafızası
          </span>
          <span className="text-[10px] text-[#333333]">({memories.length})</span>
        </div>
        {isOpen ? (
          <ChevronUp size={13} className="text-[#444444]" />
        ) : (
          <ChevronDown size={13} className="text-[#444444]" />
        )}
      </button>

      {isOpen && (
        <>
          <div className="h-px bg-[#1a1a1a]" />

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
                <p className="text-xs text-[#666666] flex-1 leading-relaxed">{m.text}</p>
                <button
                  onClick={() => deleteMemory(m.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <Trash2 size={11} className="text-[#444444] hover:text-[#ef4444] transition-colors" />
                </button>
              </div>
            ))}
          </div>

          {/* Add memory */}
          <div className="h-px bg-[#1a1a1a]" />
          <div className="px-5 py-3 flex flex-col gap-2">
            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addMemory()}
              placeholder="Yeni hafıza ekle..."
              className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2 text-xs text-[#888888] placeholder:text-[#333333] outline-none focus:border-[#2a2a2a]"
            />
            <div className="flex items-center gap-2">
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as MemoryItem["category"])}
                className="flex-1 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-1.5 text-xs text-[#555555] outline-none"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <button
                onClick={addMemory}
                disabled={!newText.trim()}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-[#666666] hover:text-[#888888] disabled:opacity-40 transition-colors"
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
