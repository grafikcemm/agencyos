// ─────────────────────────────────────────────────────────────────────────────
// Finans veri katmanı (Supabase) — ay-ay görünüm.
//
// Kaynak: finance_transactions (month'lu, type=income/expense),
//         finance_fixed_expenses (her ay tekrarlayan), finance_subscriptions.
// Eski localStorage hook'larının (useIncomeItems/useActiveExpenses/useSubscriptions)
// yerini alır — kalıcı veri sadece Supabase (CLAUDE.md kural #4).
//
// NOT: Bu dosya saf tutulur (server importu YOK) — client bileşenleri tip + helper
// için güvenle import edebilsin. Server loader ayrı dosyada (loadFinanceMonth.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { getIstanbulDateAndDay } from "@/lib/assistant/timezone";

export type FinanceTxType = "income" | "expense";

export interface FinanceTx {
  id: string;
  type: FinanceTxType;
  title: string;
  amount: number;
  month: string;
  category: string | null;
  priority: string | null;
  status: string | null;
  due_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface FixedExpense {
  id: string;
  title: string;
  amount: number;
  currency: string;
  category: string | null;
  day_of_month: number | null;
  is_active: boolean;
  note: string | null;
}

export interface FinanceSubscription {
  id: string;
  title: string;
  amount: number;
  currency: string;
  is_active: boolean;
  category: string | null;
  billing_cycle: string | null;
  is_essential: boolean | null;
  revenue_impact: string | null;
  ai_recommendation: string | null;
  purpose: string | null;
  renewal_day: number | null;
  notes: string | null;
}

export interface FinanceTotals {
  income: number;
  expenses: number;
  fixed: number;
  subscriptions: number;
  totalExpense: number;
  net: number;
}

export interface FinanceMonthData {
  month: string;
  income: FinanceTx[];
  expenses: FinanceTx[];
  fixed: FixedExpense[];
  subscriptions: FinanceSubscription[];
  totals: FinanceTotals;
}

/** Istanbul "yyyy-MM" — varsayılan görüntülenen ay. */
export function getCurrentFinanceMonth(): string {
  return getIstanbulDateAndDay().todayStr.slice(0, 7);
}

/** "yyyy-MM" → bir önceki/sonraki ay. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, (m - 1) + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[(m - 1) % 12] ?? month} ${y}`;
}

/** Değişken gider toplamı (ödenmemiş/arşivlenmemiş). Server loader + client paylaşır. */
export function sumActiveExpenses(rows: FinanceTx[]): number {
  return rows
    .filter((t) => t.status !== "paid" && t.status !== "archived")
    .reduce((s, t) => s + (t.amount || 0), 0);
}
