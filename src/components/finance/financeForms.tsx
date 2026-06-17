"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Config-driven generic finans formu + etiket haritaları.
// 4 bölüm (gelir/değişken gider/sabit gider/abonelik) tek RecordForm ile beslenir.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { Check, X } from "lucide-react";

export const inputClass =
  "w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--cat-blue)]/40 transition-colors";
export const labelClass = "text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-bold block mb-1";

export type FieldType = "text" | "number" | "select" | "date" | "checkbox" | "textarea";
export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  span?: 1 | 2;
  placeholder?: string;
}

export type FormValues = Record<string, string | number | boolean | undefined>;

// ── Etiket / seçenek haritaları ───────────────────────────────────────────────

export const INCOME_CATEGORIES = [
  { value: "salary", label: "Maaş" },
  { value: "freelance", label: "Freelance" },
  { value: "extra", label: "Ek gelir" },
  { value: "refund", label: "İade" },
  { value: "other", label: "Diğer" },
];

export const EXPENSE_CATEGORIES = [
  { value: "credit_card", label: "Kredi Kartı" },
  { value: "loan", label: "Kredi" },
  { value: "restructured", label: "Yapılandırma" },
  { value: "market", label: "Market" },
  { value: "food", label: "Yemek" },
  { value: "personal", label: "Kişisel" },
  { value: "other", label: "Diğer" },
];

export const FIXED_CATEGORIES = [
  { value: "rent", label: "Kira" },
  { value: "utilities", label: "Fatura" },
  { value: "phone", label: "Telefon / İnternet" },
  { value: "insurance", label: "Sigorta" },
  { value: "education", label: "Eğitim / Kurs" },
  { value: "sport", label: "Spor" },
  { value: "other", label: "Diğer" },
];

export const SUB_CATEGORIES = [
  { value: "ai_saas", label: "AI / SaaS" },
  { value: "apple_google", label: "Apple / Google" },
  { value: "productivity", label: "Verimlilik" },
  { value: "design", label: "Tasarım" },
  { value: "education", label: "Eğitim" },
  { value: "entertainment", label: "Eğlence" },
  { value: "other", label: "Diğer" },
];

export const PRIORITY_OPTS = [
  { value: "critical", label: "Kritik" },
  { value: "high", label: "Yüksek" },
  { value: "medium", label: "Orta" },
  { value: "low", label: "Düşük" },
];

export const STATUS_OPTS = [
  { value: "waiting", label: "Bekliyor" },
  { value: "paid", label: "Ödendi" },
  { value: "deferred", label: "Ertelendi" },
  { value: "risky", label: "Riskli" },
];

export const REVENUE_IMPACT_OPTS = [
  { value: "direct", label: "Doğrudan gelir" },
  { value: "indirect", label: "Dolaylı" },
  { value: "none", label: "Yok" },
  { value: "unknown", label: "Belirsiz" },
];

export const AI_REC_OPTS = [
  { value: "keep", label: "Tut" },
  { value: "review", label: "Gözden geçir" },
  { value: "pause", label: "Dondur" },
  { value: "cancel", label: "İptal et" },
];

export const CURRENCY_OPTS = [
  { value: "TRY", label: "TL" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
];

// ── Bölüm bazlı alan tanımları ────────────────────────────────────────────────

export const INCOME_FIELDS: FormField[] = [
  { key: "title", label: "Başlık", type: "text", span: 2, placeholder: "Gelir adı" },
  { key: "amount", label: "Tutar (TL)", type: "number", placeholder: "0" },
  { key: "category", label: "Kategori", type: "select", options: INCOME_CATEGORIES },
  { key: "notes", label: "Not (opsiyonel)", type: "textarea", span: 2 },
];

export const EXPENSE_FIELDS: FormField[] = [
  { key: "title", label: "Başlık", type: "text", span: 2, placeholder: "Gider adı" },
  { key: "amount", label: "Tutar (TL)", type: "number", placeholder: "0" },
  { key: "category", label: "Kategori", type: "select", options: EXPENSE_CATEGORIES },
  { key: "priority", label: "Öncelik", type: "select", options: PRIORITY_OPTS },
  { key: "status", label: "Durum", type: "select", options: STATUS_OPTS },
  { key: "due_date", label: "Son ödeme", type: "date" },
  { key: "notes", label: "Not (opsiyonel)", type: "textarea", span: 2 },
];

export const FIXED_FIELDS: FormField[] = [
  { key: "title", label: "Başlık", type: "text", span: 2, placeholder: "Kira, spor salonu…" },
  { key: "amount", label: "Tutar (TL)", type: "number", placeholder: "0" },
  { key: "category", label: "Kategori", type: "select", options: FIXED_CATEGORIES },
  { key: "day_of_month", label: "Ayın günü", type: "number", placeholder: "örn 5" },
  { key: "note", label: "Not (opsiyonel)", type: "textarea", span: 2 },
];

export const SUB_FIELDS: FormField[] = [
  { key: "title", label: "Ad", type: "text", span: 2, placeholder: "Claude, ChatGPT…" },
  { key: "amount", label: "Tutar", type: "number", placeholder: "0" },
  { key: "currency", label: "Para birimi", type: "select", options: CURRENCY_OPTS },
  { key: "category", label: "Kategori", type: "select", options: SUB_CATEGORIES },
  { key: "billing_cycle", label: "Döngü", type: "select", options: [
    { value: "monthly", label: "Aylık" }, { value: "yearly", label: "Yıllık" }, { value: "one_time", label: "Tek seferlik" },
  ] },
  { key: "revenue_impact", label: "Gelir etkisi", type: "select", options: REVENUE_IMPACT_OPTS },
  { key: "ai_recommendation", label: "AI önerisi", type: "select", options: AI_REC_OPTS },
  { key: "is_essential", label: "Zorunlu mu?", type: "checkbox" },
  { key: "purpose", label: "Amaç (opsiyonel)", type: "textarea", span: 2 },
];

// ── Generic form ──────────────────────────────────────────────────────────────

export function RecordForm({
  title,
  fields,
  initial,
  onSubmit,
  onCancel,
}: {
  title: string;
  fields: FormField[];
  initial?: FormValues;
  onSubmit: (values: FormValues) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormValues>(initial ?? {});
  const set = (k: string, v: string | number | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const titleVal = String(form.title ?? "").trim();
    const amountVal = Number(form.amount ?? 0);
    if (!titleVal || !(amountVal > 0)) return;
    onSubmit(form);
  };

  return (
    <form onSubmit={submit} className="bg-[var(--bg-base)] border border-[var(--border)] rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--text-primary)] font-medium">{title}</span>
        <button type="button" onClick={onCancel} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"><X size={14} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {fields.map((f) => (
          <div key={f.key} className={f.span === 2 ? "col-span-2" : ""}>
            {f.type !== "checkbox" && <label className={labelClass}>{f.label}</label>}
            {f.type === "text" && (
              <input className={inputClass} placeholder={f.placeholder} value={String(form[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} />
            )}
            {f.type === "number" && (
              <input type="number" min={0} className={inputClass} placeholder={f.placeholder} value={form[f.key] === undefined ? "" : String(form[f.key])} onChange={(e) => set(f.key, e.target.value === "" ? "" : Number(e.target.value))} />
            )}
            {f.type === "date" && (
              <input type="date" className={inputClass} value={String(form[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} />
            )}
            {f.type === "textarea" && (
              <textarea rows={2} className={inputClass} placeholder={f.placeholder} value={String(form[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} />
            )}
            {f.type === "select" && (
              <select className={inputClass} value={String(form[f.key] ?? f.options?.[0]?.value ?? "")} onChange={(e) => set(f.key, e.target.value)}>
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            {f.type === "checkbox" && (
              <label className="flex items-center gap-2 mt-5 cursor-pointer">
                <input type="checkbox" checked={!!form[f.key]} onChange={(e) => set(f.key, e.target.checked)} className="accent-[var(--cat-blue)]" />
                <span className="text-[11px] text-[var(--text-secondary)]">{f.label}</span>
              </label>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" className="flex-1 flex items-center justify-center gap-1.5 bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/25 text-[var(--accent-green)] text-[11px] font-medium py-2 rounded-lg hover:bg-[var(--accent-green)]/15 transition-all">
          <Check size={12} />Kaydet
        </button>
        <button type="button" onClick={onCancel} className="flex-1 text-[var(--text-muted)] text-[11px] border border-[var(--border)] py-2 rounded-lg hover:text-[var(--text-secondary)] transition-colors">İptal</button>
      </div>
    </form>
  );
}
