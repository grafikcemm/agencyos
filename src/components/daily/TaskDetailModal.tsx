"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import { cn } from "@/utils/cn";
import type { ActiveTask } from "@/types/tasks";
import { TaskSteps } from "./TaskSteps";
import {
  updateActiveTask,
  toggleTaskPriority,
  updateActiveTaskNote,
  deleteActiveTask,
} from "@/app/actions/taskActions";

interface TaskDetailModalProps {
  task: ActiveTask;
  onClose: () => void;
}

const MICRO_START_SECONDS = 5 * 60;

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Görev detay/düzenleme ekranı — "başlaması kolay" hedefi:
 *  - Başlık / açıklama / son tarih düzenlenir (görevi netleştir).
 *  - Sıradaki somut adım sabitlenir + "5 dakika başla" mikro-başlangıç sayacı.
 *  - Adımlar (TaskSteps) ve "kendime not" aynı yerde.
 */
export function TaskDetailModal({ task, onClose }: TaskDetailModalProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [note, setNote] = useState(task.note ?? "");
  const [priority, setPriority] = useState(!!task.is_priority);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, startTransition] = useTransition();

  // Mikro-başlangıç sayacı (saniye). null = başlamadı.
  const [timer, setTimer] = useState<number | null>(null);
  useEffect(() => {
    if (timer === null || timer <= 0) return;
    const id = setTimeout(() => setTimer(timer - 1), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  // Escape ile kapat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const steps = task.steps ?? [];
  const nextStep = [...steps].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).find((s) => !s.is_done);

  const handleSaveDetails = useCallback(() => {
    setSaveState("saving");
    startTransition(async () => {
      const res = await updateActiveTask(task.id, {
        title,
        description,
        due_date: dueDate || null,
      });
      let noteOk = true;
      if (note !== (task.note ?? "")) {
        const nr = await updateActiveTaskNote(task.id, note);
        noteOk = !nr.error;
      }
      setSaveState(res.success && noteOk ? "saved" : "error");
    });
  }, [task.id, task.note, title, description, dueDate, note]);

  const handlePriorityToggle = () => {
    const current = priority; // flip öncesi snapshot — başarısızlıkta doğru rollback için
    setPriority(!current);
    startTransition(async () => {
      const res = await toggleTaskPriority(task.id, current);
      if (res && !res.success) setPriority(current);
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const res = await deleteActiveTask(task.id);
      if (res && res.success) onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto bg-[#0f0f0f] border border-[var(--border)] rounded-card shadow-soft">
        {/* Header: düzenlenebilir başlık + öncelik + kapat */}
        <div className="flex items-start gap-3 p-5 border-b border-[var(--border)]">
          <button
            onClick={handlePriorityToggle}
            title={priority ? "Önceliği kaldır" : "Öncelikli işaretle"}
            className={cn(
              "mt-1 shrink-0 font-bold text-lg leading-none transition-colors",
              priority ? "text-[var(--danger)] scale-110" : "text-[#444] hover:text-[#888]",
            )}
          >
            !
          </button>
          <textarea
            value={title}
            onChange={(e) => { setTitle(e.target.value); setSaveState("idle"); }}
            rows={1}
            className="flex-1 bg-transparent text-white text-lg font-display font-medium resize-none focus:outline-none leading-snug"
            placeholder="Görev başlığı"
          />
          <button onClick={onClose} className="shrink-0 text-[#555] hover:text-white transition-colors mt-1" title="Kapat">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Mikro-başlangıç: sıradaki adımı sabitle + 5 dk sayaç */}
          <div className="rounded-card border border-[var(--cat-blue)]/25 bg-[var(--cat-blue)]/8 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--cat-blue)] block mb-1">
                  Sıradaki somut adım
                </span>
                <p className="text-sm text-white leading-snug truncate">
                  {nextStep ? nextStep.title : "Aşağıdan ilk adımı ekle — büyük hedefi parçala."}
                </p>
              </div>
              {timer === null ? (
                <button
                  onClick={() => setTimer(MICRO_START_SECONDS)}
                  className="shrink-0 rounded-pill bg-[var(--cat-blue)]/20 border border-[var(--cat-blue)]/40 text-[var(--cat-blue)] text-xs font-medium px-3 py-2 hover:bg-[var(--cat-blue)]/30 transition-colors"
                >
                  5 dakika başla
                </button>
              ) : timer > 0 ? (
                <div className="shrink-0 text-center">
                  <span className="font-mono text-2xl text-[var(--cat-blue)] tabular-nums block leading-none">{fmt(timer)}</span>
                  <button onClick={() => setTimer(null)} className="text-[9px] text-[#555] hover:text-[#888] mt-1">durdur</button>
                </div>
              ) : (
                <span className="shrink-0 text-xs text-[var(--accent-green)] font-medium text-right max-w-[40%]">
                  Süreyi geçtin 💪 devam et.
                </span>
              )}
            </div>
          </div>

          {/* Açıklama */}
          <div>
            <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#555] block mb-1.5">Açıklama</label>
            <textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); setSaveState("idle"); }}
              rows={3}
              placeholder="Bu görev tam olarak ne? Tamamlanmış sayılması için ne olmalı?"
              className="w-full bg-[#0a0a0a] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] text-[#cfcfcf] placeholder-[#333] focus:outline-none focus:border-[var(--cat-blue)]/40 transition-colors resize-none leading-relaxed"
            />
          </div>

          {/* Son tarih */}
          <div className="flex items-center gap-3">
            <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#555] shrink-0">Son tarih</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => { setDueDate(e.target.value); setSaveState("idle"); }}
              className="bg-[#0a0a0a] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[13px] text-[#cfcfcf] focus:outline-none focus:border-[var(--cat-blue)]/40 transition-colors"
            />
            {dueDate && (
              <button onClick={() => { setDueDate(""); setSaveState("idle"); }} className="text-[10px] text-[#555] hover:text-[#888]">temizle</button>
            )}
          </div>

          {/* Adımlar (mevcut bileşen) */}
          <div className="border-t border-[var(--border)] -mx-1">
            <TaskSteps taskId={task.id} steps={steps} encourageNextStep={steps.length === 0} />
          </div>

          {/* Kendime not */}
          <div>
            <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#555] block mb-1.5">Kendime not</label>
            <input
              type="text"
              value={note}
              onChange={(e) => { setNote(e.target.value); setSaveState("idle"); }}
              placeholder="Kısa hatırlatma…"
              className="w-full bg-[#0a0a0a] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] text-[#cfcfcf] placeholder-[#333] focus:outline-none focus:border-[var(--cat-blue)]/40 transition-colors"
            />
          </div>
        </div>

        {/* Footer: kaydet + sil */}
        <div className="flex items-center justify-between gap-3 p-5 border-t border-[var(--border)] sticky bottom-0 bg-[#0f0f0f]">
          <button
            onClick={handleDelete}
            className="text-xs text-[#555] hover:text-[var(--danger)] transition-colors"
          >
            Görevi sil
          </button>
          <div className="flex items-center gap-3">
            {saveState === "saved" && <span className="text-xs text-[var(--accent-green)]">Kaydedildi ✓</span>}
            {saveState === "error" && <span className="text-xs text-[var(--danger)]">Kaydedilemedi</span>}
            <button
              onClick={handleSaveDetails}
              disabled={saveState === "saving" || !title.trim()}
              className="rounded-pill bg-[var(--cat-blue)]/20 border border-[var(--cat-blue)]/40 text-[var(--cat-blue)] text-sm font-medium px-5 py-2 hover:bg-[var(--cat-blue)]/30 transition-colors disabled:opacity-40"
            >
              {saveState === "saving" ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
