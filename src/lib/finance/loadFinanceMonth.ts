// ─────────────────────────────────────────────────────────────────────────────
// Finans ay yükleyici (SERVER) — Supabase'ten seçili ayın verisini toplar.
// financeData.ts saf tutulduğu için (client import edebilsin) server bağımlılığı
// burada izole edilir.
// ─────────────────────────────────────────────────────────────────────────────
import { createServerSupabase } from "@/lib/supabaseServer";
import {
  getCurrentFinanceMonth,
  sumActiveExpenses,
  type FinanceMonthData,
  type FinanceTx,
  type FixedExpense,
  type FinanceSubscription,
} from "./financeData";

/**
 * Transactions aya göre filtrelenir; sabit gider + abonelik her ay tekrarlar (aya bağlı değil).
 */
export async function loadFinanceMonth(month?: string): Promise<FinanceMonthData> {
  const targetMonth = month ?? getCurrentFinanceMonth();
  const supabase = createServerSupabase();

  const [txRes, fixedRes, subRes] = await Promise.all([
    supabase.from("finance_transactions").select("*").eq("month", targetMonth).order("created_at", { ascending: false }),
    supabase.from("finance_fixed_expenses").select("*").order("amount", { ascending: false }),
    supabase.from("finance_subscriptions").select("*").order("amount", { ascending: false }),
  ]);

  const txs = (txRes.data ?? []) as FinanceTx[];
  const income = txs.filter((t) => t.type === "income");
  const expenses = txs.filter((t) => t.type === "expense");
  const fixed = ((fixedRes.data ?? []) as FixedExpense[]).filter((f) => f.is_active !== false);
  // Yalnız aktif abonelikler — gösterilen liste ile toplam tutarlı olsun.
  const subscriptions = ((subRes.data ?? []) as FinanceSubscription[]).filter((s) => s.is_active);

  const incomeTotal = income
    .filter((t) => t.status !== "archived")
    .reduce((s, t) => s + (t.amount || 0), 0);
  const expensesTotal = sumActiveExpenses(expenses);
  const fixedTotal = fixed.reduce((s, f) => s + (f.amount || 0), 0);
  const subscriptionsTotal = subscriptions.reduce((s, sub) => s + (sub.amount || 0), 0);

  const totalExpense = expensesTotal + fixedTotal + subscriptionsTotal;

  return {
    month: targetMonth,
    income,
    expenses,
    fixed,
    subscriptions,
    totals: {
      income: incomeTotal,
      expenses: expensesTotal,
      fixed: fixedTotal,
      subscriptions: subscriptionsTotal,
      totalExpense,
      net: incomeTotal - totalExpense,
    },
  };
}
