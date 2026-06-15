"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Finans Komuta Merkezi — Supabase, ay-ay görünüm, 4 bölüm, sadeleştirilmiş.
//   Gelirler · Sabit Giderler (her ay tekrarlayan) · Değişken Giderler · Abonelikler
// Veri server'da loadFinanceMonth ile yüklenir, prop gelir. Mutasyonlar server action.
// Tek-seferlik: cihazdaki eski localStorage finans verisi Supabase'e taşınır.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Check, ChevronLeft, ChevronRight, Pencil, Repeat } from "lucide-react";
import { HAZIRAN_RULE } from "@/data/financeSeed";
import type { FinanceMonthData } from "@/lib/finance/financeData";
import { shiftMonth, formatMonthLabel, getCurrentFinanceMonth } from "@/lib/finance/financeData";
import {
  RecordForm, FormValues,
  INCOME_FIELDS, EXPENSE_FIELDS, FIXED_FIELDS, SUB_FIELDS,
} from "./financeForms";
import {
  addFinanceTx, updateFinanceTx, deleteFinanceTx,
  addFixedExpense, updateFixedExpense, deleteFixedExpense,
  addFinanceSubscription, updateFinanceSubscription, deleteFinanceSubscription,
  seedFinanceFromLocal,
} from "@/app/actions/financeActions";

const TRY = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} TL`;
const num = (v: FormValues[string]) => Number(v ?? 0) || 0;
const str = (v: FormValues[string]) => { const s = String(v ?? "").trim(); return s.length ? s : undefined; };

const MIGRATION_FLAG = "feed-the-goat-supabase-finance-migrated-v1";

// ── Tek-seferlik localStorage → Supabase taşıma ───────────────────────────────
// Görüntülenen aydan BAĞIMSIZ: eski localStorage verisi her zaman GÜNCEL aya seed edilir
// (geçmiş ay açıkken yanlış aya yazma riski yok). Flag yalnız temiz çalışmada set edilir.
function useLocalFinanceMigration() {
  const router = useRouter();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || typeof window === "undefined") return;
    ran.current = true;
    if (localStorage.getItem(MIGRATION_FLAG)) return;
    try {
      const incomes = JSON.parse(localStorage.getItem("feed-the-goat-income-items-v1") || "[]");
      const expenses = JSON.parse(localStorage.getItem("feed-the-goat-active-expenses-v1") || "[]");
      const subscriptions = JSON.parse(localStorage.getItem("feed-the-goat-subscriptions-v1") || "[]");
      const hasAny = incomes.length || expenses.length || subscriptions.length;
      if (!hasAny) { localStorage.setItem(MIGRATION_FLAG, "1"); return; }
      seedFinanceFromLocal({ month: getCurrentFinanceMonth(), incomes, expenses, subscriptions })
        .then((r) => { if (r.ok) localStorage.setItem(MIGRATION_FLAG, "1"); if (r.migrated) router.refresh(); })
        .catch(() => {});
    } catch { /* bozuk localStorage → atla */ }
  }, [router]);
}

// ── Tek satır gösterim ────────────────────────────────────────────────────────
function Row({
  label, sub, amount, accent, muted, onEdit, onDelete, extra,
}: {
  label: string; sub?: string; amount: number; accent: string;
  muted?: boolean; onEdit: () => void; onDelete: () => void; extra?: React.ReactNode;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className={`flex items-center gap-3 bg-[#0d0d0d] border border-[var(--border)] rounded-lg px-3 py-2.5 ${muted ? "opacity-50" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] text-white font-medium truncate">{label}</span>
          {extra}
        </div>
        {sub && <span className="text-[10px] text-[#555] block mt-0.5">{sub}</span>}
      </div>
      <span className="text-[13px] font-mono shrink-0" style={{ color: accent }}>{TRY(amount)}</span>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onEdit} className="w-6 h-6 flex items-center justify-center text-[#3a3a3a] hover:text-[#888] transition-colors" title="Düzenle"><Pencil size={11} /></button>
        {confirm ? (
          <div className="flex items-center gap-1">
            <button onClick={onDelete} className="text-[10px] text-[var(--danger)] border border-[var(--danger)]/30 px-1.5 py-px rounded">Sil</button>
            <button onClick={() => setConfirm(false)} className="text-[10px] text-[#555] border border-[var(--border)] px-1.5 py-px rounded">İptal</button>
          </div>
        ) : (
          <button onClick={() => setConfirm(true)} className="w-6 h-6 flex items-center justify-center text-[#3a3a3a] hover:text-[var(--danger)] transition-colors" title="Sil"><Trash2 size={11} /></button>
        )}
      </div>
    </div>
  );
}

// ── Bölüm kabuğu ──────────────────────────────────────────────────────────────
function SectionCard({
  title, hint, total, accent, adding, onToggleAdd, children,
}: {
  title: string; hint?: string; total: number; accent: string;
  adding: boolean; onToggleAdd: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-[#0f0f0f] border border-[var(--border)] rounded-card overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-[#555] font-bold block">{title}</span>
          <span className="text-sm font-mono mt-0.5 block" style={{ color: accent }}>{TRY(total)}</span>
          {hint && <span className="text-[9px] text-[#444]">{hint}</span>}
        </div>
        <button
          onClick={onToggleAdd}
          className="flex items-center gap-1.5 text-[10px] text-[#666] hover:text-white border border-[var(--border)] hover:border-[#2a2a2a] px-2.5 py-1.5 rounded-lg transition-all"
        >
          <Plus size={11} />{adding ? "Kapat" : "Ekle"}
        </button>
      </div>
      <div className="p-3 space-y-2">{children}</div>
    </div>
  );
}

type EditTarget = { section: string; id: string } | null;

export function FinanceCommandCenter({ data, month }: { data: FinanceMonthData; month: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditTarget>(null);

  useLocalFinanceMigration();

  const { totals } = data;
  const netColor = totals.net > 0 ? "var(--accent-green)" : totals.net < 0 ? "var(--danger)" : "var(--warning)";

  const closeForms = () => { setAddOpen(null); setEdit(null); };
  const go = (m: string) => { closeForms(); router.push(`/?tab=FINANS&fmonth=${m}`); };
  const run = (fn: () => Promise<unknown>) => startTransition(async () => { await fn(); router.refresh(); });

  const metrics = [
    { label: "Gelir", value: totals.income, color: "var(--accent-green)" },
    { label: "Sabit", value: totals.fixed, color: "var(--warning)" },
    { label: "Değişken", value: totals.expenses, color: "var(--danger)" },
    { label: "Abonelik", value: totals.subscriptions, color: "var(--cat-blue)" },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto px-6 py-8 animate-in duration-500">
      {/* ── Ay seçici + net ── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => go(shiftMonth(month, -1))} className="w-9 h-9 flex items-center justify-center rounded-lg border border-[var(--border)] text-[#888] hover:text-white hover:border-[#2a2a2a] transition-all"><ChevronLeft size={16} /></button>
          <div className="text-center">
            <span className="text-[10px] uppercase tracking-widest text-[#555] font-bold block">Finans · Ay</span>
            <span className="text-lg font-display font-medium text-white">{formatMonthLabel(month)}</span>
          </div>
          <button onClick={() => go(shiftMonth(month, 1))} className="w-9 h-9 flex items-center justify-center rounded-lg border border-[var(--border)] text-[#888] hover:text-white hover:border-[#2a2a2a] transition-all"><ChevronRight size={16} /></button>
        </div>

        <div className="text-center mb-4">
          <span className="text-4xl font-mono font-bold" style={{ color: netColor }}>
            {totals.net > 0 ? "+" : ""}{TRY(totals.net)}
          </span>
          <span className="text-[10px] text-[#555] block mt-1">Net Bakiye (gelir − sabit − değişken − abonelik)</span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {metrics.map((m) => (
            <div key={m.label} className="bg-[#0d0d0d] border border-[var(--border)] rounded-lg px-2 py-2 text-center">
              <span className="text-[9px] text-[#444] uppercase tracking-wider block">{m.label}</span>
              <span className="text-[11px] font-mono font-bold mt-0.5 block" style={{ color: m.color }}>{TRY(m.value)}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 bg-[var(--danger)]/5 border border-[var(--danger)]/15 rounded-lg px-3 py-2">
          <p className="text-[10px] text-[var(--danger)] font-medium tracking-wide">{HAZIRAN_RULE}</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* ── Gelirler ── */}
        <SectionCard title="Gelirler" total={totals.income} accent="var(--accent-green)" adding={addOpen === "income"} onToggleAdd={() => { closeForms(); setAddOpen(addOpen === "income" ? null : "income"); }}>
          {addOpen === "income" && (
            <RecordForm title="Yeni Gelir" fields={INCOME_FIELDS} onCancel={closeForms}
              onSubmit={(v) => run(async () => { await addFinanceTx({ type: "income", title: String(v.title), amount: num(v.amount), month, category: str(v.category) ?? null, notes: str(v.notes) ?? null }); closeForms(); })} />
          )}
          {data.income.map((t) => edit?.section === "income" && edit.id === t.id ? (
            <RecordForm key={t.id} title="Geliri Düzenle" fields={INCOME_FIELDS} onCancel={closeForms}
              initial={{ title: t.title, amount: t.amount, category: t.category ?? "salary", notes: t.notes ?? "" }}
              onSubmit={(v) => run(async () => { await updateFinanceTx(t.id, { title: String(v.title), amount: num(v.amount), category: str(v.category) ?? null, notes: str(v.notes) ?? null }); closeForms(); })} />
          ) : (
            <Row key={t.id} label={t.title} sub={t.notes ?? undefined} amount={t.amount} accent="var(--accent-green)"
              onEdit={() => { closeForms(); setEdit({ section: "income", id: t.id }); }}
              onDelete={() => run(() => deleteFinanceTx(t.id))} />
          ))}
          {data.income.length === 0 && addOpen !== "income" && <p className="text-[11px] text-[#444] italic text-center py-2">Gelir yok.</p>}
        </SectionCard>

        {/* ── Sabit Giderler ── */}
        <SectionCard title="Sabit Giderler" hint="Her ay otomatik tekrarlar" total={totals.fixed} accent="var(--warning)" adding={addOpen === "fixed"} onToggleAdd={() => { closeForms(); setAddOpen(addOpen === "fixed" ? null : "fixed"); }}>
          {addOpen === "fixed" && (
            <RecordForm title="Yeni Sabit Gider" fields={FIXED_FIELDS} onCancel={closeForms}
              onSubmit={(v) => run(async () => { await addFixedExpense({ title: String(v.title), amount: num(v.amount), category: str(v.category) ?? null, day_of_month: v.day_of_month ? num(v.day_of_month) : null, note: str(v.note) ?? null }); closeForms(); })} />
          )}
          {data.fixed.map((f) => edit?.section === "fixed" && edit.id === f.id ? (
            <RecordForm key={f.id} title="Sabit Gideri Düzenle" fields={FIXED_FIELDS} onCancel={closeForms}
              initial={{ title: f.title, amount: f.amount, category: f.category ?? "other", day_of_month: f.day_of_month ?? "", note: f.note ?? "" }}
              onSubmit={(v) => run(async () => { await updateFixedExpense(f.id, { title: String(v.title), amount: num(v.amount), category: str(v.category) ?? null, day_of_month: v.day_of_month ? num(v.day_of_month) : null, note: str(v.note) ?? null }); closeForms(); })} />
          ) : (
            <Row key={f.id} label={f.title} amount={f.amount} accent="var(--warning)"
              sub={f.day_of_month ? `Her ayın ${f.day_of_month}'i` : "Aylık tekrar"}
              extra={<Repeat size={10} className="text-[var(--warning)]/60" />}
              onEdit={() => { closeForms(); setEdit({ section: "fixed", id: f.id }); }}
              onDelete={() => run(() => deleteFixedExpense(f.id))} />
          ))}
          {data.fixed.length === 0 && addOpen !== "fixed" && <p className="text-[11px] text-[#444] italic text-center py-2">Sabit gider yok. Kira, spor salonu, kurs ekle.</p>}
        </SectionCard>

        {/* ── Değişken Giderler ── */}
        <SectionCard title="Değişken Giderler" hint="Bu aya özel" total={totals.expenses} accent="var(--danger)" adding={addOpen === "expense"} onToggleAdd={() => { closeForms(); setAddOpen(addOpen === "expense" ? null : "expense"); }}>
          {addOpen === "expense" && (
            <RecordForm title="Yeni Gider" fields={EXPENSE_FIELDS} onCancel={closeForms}
              onSubmit={(v) => run(async () => { await addFinanceTx({ type: "expense", title: String(v.title), amount: num(v.amount), month, category: str(v.category) ?? null, priority: str(v.priority) ?? null, status: str(v.status) ?? "waiting", due_date: str(v.due_date) ?? null, notes: str(v.notes) ?? null }); closeForms(); })} />
          )}
          {data.expenses.map((t) => edit?.section === "expense" && edit.id === t.id ? (
            <RecordForm key={t.id} title="Gideri Düzenle" fields={EXPENSE_FIELDS} onCancel={closeForms}
              initial={{ title: t.title, amount: t.amount, category: t.category ?? "other", priority: t.priority ?? "medium", status: t.status ?? "waiting", due_date: t.due_date ?? "", notes: t.notes ?? "" }}
              onSubmit={(v) => run(async () => { await updateFinanceTx(t.id, { title: String(v.title), amount: num(v.amount), category: str(v.category) ?? null, priority: str(v.priority) ?? null, status: str(v.status) ?? null, due_date: str(v.due_date) ?? null, notes: str(v.notes) ?? null }); closeForms(); })} />
          ) : (
            <Row key={t.id} label={t.title} amount={t.amount} accent={t.status === "paid" ? "var(--accent-green)" : "var(--danger)"} muted={t.status === "paid"}
              sub={[t.status === "paid" ? "Ödendi" : null, t.due_date ? `Son: ${t.due_date.slice(5)}` : null].filter(Boolean).join(" · ") || undefined}
              extra={t.status !== "paid" ? (
                <button onClick={() => run(() => updateFinanceTx(t.id, { status: "paid" }))} className="text-[var(--accent-green)]/70 hover:text-[var(--accent-green)]" title="Ödendi işaretle"><Check size={12} /></button>
              ) : undefined}
              onEdit={() => { closeForms(); setEdit({ section: "expense", id: t.id }); }}
              onDelete={() => run(() => deleteFinanceTx(t.id))} />
          ))}
          {data.expenses.length === 0 && addOpen !== "expense" && <p className="text-[11px] text-[#444] italic text-center py-2">Bu ay değişken gider yok.</p>}
        </SectionCard>

        {/* ── Abonelikler ── */}
        <SectionCard title="Abonelikler" hint="Dijital / SaaS" total={totals.subscriptions} accent="var(--cat-blue)" adding={addOpen === "sub"} onToggleAdd={() => { closeForms(); setAddOpen(addOpen === "sub" ? null : "sub"); }}>
          {addOpen === "sub" && (
            <RecordForm title="Yeni Abonelik" fields={SUB_FIELDS} onCancel={closeForms}
              onSubmit={(v) => run(async () => { await addFinanceSubscription({ title: String(v.title), amount: num(v.amount), currency: str(v.currency) ?? "TRY", category: str(v.category) ?? "other", billing_cycle: str(v.billing_cycle) ?? "monthly", revenue_impact: str(v.revenue_impact) ?? null, ai_recommendation: str(v.ai_recommendation) ?? null, is_essential: !!v.is_essential, purpose: str(v.purpose) ?? null }); closeForms(); })} />
          )}
          {data.subscriptions.map((s) => edit?.section === "sub" && edit.id === s.id ? (
            <RecordForm key={s.id} title="Aboneliği Düzenle" fields={SUB_FIELDS} onCancel={closeForms}
              initial={{ title: s.title, amount: s.amount, currency: s.currency ?? "TRY", category: s.category ?? "other", billing_cycle: s.billing_cycle ?? "monthly", revenue_impact: s.revenue_impact ?? "unknown", ai_recommendation: s.ai_recommendation ?? "keep", is_essential: !!s.is_essential, purpose: s.purpose ?? "" }}
              onSubmit={(v) => run(async () => { await updateFinanceSubscription(s.id, { title: String(v.title), amount: num(v.amount), currency: str(v.currency), category: str(v.category) ?? null, billing_cycle: str(v.billing_cycle) ?? null, revenue_impact: str(v.revenue_impact) ?? null, ai_recommendation: str(v.ai_recommendation) ?? null, is_essential: !!v.is_essential, purpose: str(v.purpose) ?? null }); closeForms(); })} />
          ) : (
            <Row key={s.id} label={s.title} amount={s.amount} accent={s.is_active ? "var(--cat-blue)" : "#555"} muted={!s.is_active}
              sub={[s.purpose, s.is_essential ? "Zorunlu" : null].filter(Boolean).join(" · ") || undefined}
              extra={s.ai_recommendation && s.ai_recommendation !== "keep" ? (
                <span className="text-[8px] uppercase tracking-wide text-[var(--warning)] border border-[var(--warning)]/25 px-1 rounded">{s.ai_recommendation === "cancel" ? "iptal?" : s.ai_recommendation === "pause" ? "dondur?" : "gözden geçir"}</span>
              ) : undefined}
              onEdit={() => { closeForms(); setEdit({ section: "sub", id: s.id }); }}
              onDelete={() => run(() => deleteFinanceSubscription(s.id))} />
          ))}
          {data.subscriptions.length === 0 && addOpen !== "sub" && <p className="text-[11px] text-[#444] italic text-center py-2">Abonelik yok.</p>}
        </SectionCard>
      </div>
    </div>
  );
}
