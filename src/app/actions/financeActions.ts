"use server";

// ─────────────────────────────────────────────────────────────────────────────
// Finans CRUD (Supabase) — ay-ay görünüm + sabit giderler.
//
// Eski minimal action'lar (addTransaction/addSubscription/...) arşiv sayfası için
// korunur; bu dosya yeni Komuta Merkezi'nin tam CRUD'unu sağlar.
// ─────────────────────────────────────────────────────────────────────────────
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabaseServer";
import { assertSession } from "@/lib/auth";

type Result = { success: boolean; error?: string };

function ok(): Result { return { success: true }; }
function fail(error: string): Result { return { success: false, error }; }

// ── Transactions (gelir / değişken gider) ────────────────────────────────────

export interface FinanceTxInput {
  type: "income" | "expense";
  title: string;
  amount: number;
  month: string;
  category?: string | null;
  priority?: string | null;
  status?: string | null;
  due_date?: string | null;
  notes?: string | null;
}

export async function addFinanceTx(input: FinanceTxInput): Promise<Result> {
  await assertSession();
  if (!input.title.trim()) return fail("Başlık boş olamaz.");
  if (!(input.amount > 0)) return fail("Tutar 0'dan büyük olmalı.");
  if (!/^\d{4}-\d{2}$/.test(input.month)) return fail("Geçersiz ay.");
  const supabase = createServerSupabase();
  const { error } = await supabase.from("finance_transactions").insert({
    type: input.type,
    title: input.title.trim(),
    amount: input.amount,
    month: input.month,
    category: input.category ?? null,
    priority: input.priority ?? null,
    status: input.status ?? (input.type === "expense" ? "waiting" : null),
    due_date: input.due_date || null,
    notes: input.notes?.trim() || null,
  });
  if (error) return fail(error.message);
  revalidatePath("/");
  return ok();
}

export async function updateFinanceTx(
  id: string,
  patch: Partial<Omit<FinanceTxInput, "type" | "month">>,
): Promise<Result> {
  await assertSession();
  const supabase = createServerSupabase();
  const updates: Record<string, unknown> = {};
  if (patch.title !== undefined) updates.title = patch.title.trim();
  if (patch.amount !== undefined) updates.amount = patch.amount;
  if (patch.category !== undefined) updates.category = patch.category;
  if (patch.priority !== undefined) updates.priority = patch.priority;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.due_date !== undefined) updates.due_date = patch.due_date || null;
  if (patch.notes !== undefined) updates.notes = patch.notes?.trim() || null;
  if (Object.keys(updates).length === 0) return ok();
  const { error } = await supabase.from("finance_transactions").update(updates).eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/");
  return ok();
}

export async function deleteFinanceTx(id: string): Promise<Result> {
  await assertSession();
  const supabase = createServerSupabase();
  const { error } = await supabase.from("finance_transactions").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/");
  return ok();
}

// ── Fixed expenses (her ay tekrarlayan) ───────────────────────────────────────

export interface FixedExpenseInput {
  title: string;
  amount: number;
  currency?: string;
  category?: string | null;
  day_of_month?: number | null;
  note?: string | null;
}

export async function addFixedExpense(input: FixedExpenseInput): Promise<Result> {
  await assertSession();
  if (!input.title.trim()) return fail("Başlık boş olamaz.");
  if (!(input.amount > 0)) return fail("Tutar 0'dan büyük olmalı.");
  const supabase = createServerSupabase();
  const { error } = await supabase.from("finance_fixed_expenses").insert({
    title: input.title.trim(),
    amount: input.amount,
    currency: input.currency ?? "TRY",
    category: input.category ?? null,
    day_of_month: input.day_of_month ?? null,
    note: input.note?.trim() || null,
    is_active: true,
  });
  if (error) return fail(error.message);
  revalidatePath("/");
  return ok();
}

export async function updateFixedExpense(
  id: string,
  patch: Partial<FixedExpenseInput> & { is_active?: boolean },
): Promise<Result> {
  await assertSession();
  const supabase = createServerSupabase();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) updates.title = patch.title.trim();
  if (patch.amount !== undefined) updates.amount = patch.amount;
  if (patch.currency !== undefined) updates.currency = patch.currency;
  if (patch.category !== undefined) updates.category = patch.category;
  if (patch.day_of_month !== undefined) updates.day_of_month = patch.day_of_month;
  if (patch.note !== undefined) updates.note = patch.note?.trim() || null;
  if (patch.is_active !== undefined) updates.is_active = patch.is_active;
  const { error } = await supabase.from("finance_fixed_expenses").update(updates).eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/");
  return ok();
}

export async function deleteFixedExpense(id: string): Promise<Result> {
  await assertSession();
  const supabase = createServerSupabase();
  const { error } = await supabase.from("finance_fixed_expenses").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/");
  return ok();
}

// ── Subscriptions (dijital SaaS) ──────────────────────────────────────────────

export interface SubscriptionInput {
  title: string;
  amount: number;
  currency?: string;
  category?: string | null;
  billing_cycle?: string | null;
  is_essential?: boolean;
  revenue_impact?: string | null;
  ai_recommendation?: string | null;
  purpose?: string | null;
  renewal_day?: number | null;
  notes?: string | null;
}

export async function addFinanceSubscription(input: SubscriptionInput): Promise<Result> {
  await assertSession();
  if (!input.title.trim()) return fail("Başlık boş olamaz.");
  if (!(input.amount > 0)) return fail("Tutar 0'dan büyük olmalı.");
  const supabase = createServerSupabase();
  const { error } = await supabase.from("finance_subscriptions").insert({
    title: input.title.trim(),
    amount: input.amount,
    currency: input.currency ?? "TRY",
    is_active: true,
    category: input.category ?? "other",
    billing_cycle: input.billing_cycle ?? "monthly",
    is_essential: input.is_essential ?? false,
    revenue_impact: input.revenue_impact ?? "unknown",
    ai_recommendation: input.ai_recommendation ?? null,
    purpose: input.purpose?.trim() || null,
    renewal_day: input.renewal_day ?? null,
    notes: input.notes?.trim() || null,
  });
  if (error) return fail(error.message);
  revalidatePath("/");
  return ok();
}

export async function updateFinanceSubscription(
  id: string,
  patch: Partial<SubscriptionInput> & { is_active?: boolean },
): Promise<Result> {
  await assertSession();
  const supabase = createServerSupabase();
  const updates: Record<string, unknown> = {};
  if (patch.title !== undefined) updates.title = patch.title.trim();
  if (patch.amount !== undefined) updates.amount = patch.amount;
  if (patch.currency !== undefined) updates.currency = patch.currency;
  if (patch.category !== undefined) updates.category = patch.category;
  if (patch.billing_cycle !== undefined) updates.billing_cycle = patch.billing_cycle;
  if (patch.is_essential !== undefined) updates.is_essential = patch.is_essential;
  if (patch.revenue_impact !== undefined) updates.revenue_impact = patch.revenue_impact;
  if (patch.ai_recommendation !== undefined) updates.ai_recommendation = patch.ai_recommendation;
  if (patch.purpose !== undefined) updates.purpose = patch.purpose?.trim() || null;
  if (patch.renewal_day !== undefined) updates.renewal_day = patch.renewal_day;
  if (patch.notes !== undefined) updates.notes = patch.notes?.trim() || null;
  if (patch.is_active !== undefined) updates.is_active = patch.is_active;
  if (Object.keys(updates).length === 0) return ok();
  const { error } = await supabase.from("finance_subscriptions").update(updates).eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/");
  return ok();
}

export async function deleteFinanceSubscription(id: string): Promise<Result> {
  await assertSession();
  const supabase = createServerSupabase();
  const { error } = await supabase.from("finance_subscriptions").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/");
  return ok();
}

// ── Tek-seferlik localStorage → Supabase taşıma ───────────────────────────────
// Cihazdaki gerçek finans verisi kaybolmasın diye client mount'ta bir kez çağrılır.
// İdempotent: ay zaten doluysa transaction eklemez; abonelik başlığı varsa atlar.

export interface LocalFinancePayload {
  month: string;
  incomes: Array<{ title: string; amount: number; category?: string; status?: string; note?: string }>;
  expenses: Array<{ title: string; amount: number; category?: string; priority?: string; status?: string; dueDate?: string; note?: string }>;
  subscriptions: Array<{ name: string; amount: number; currency?: string; category?: string; billingCycle?: string; status?: string; purpose?: string; isEssential?: boolean; revenueImpact?: string; aiRecommendation?: string; note?: string; renewalDay?: number }>;
}

export async function seedFinanceFromLocal(
  payload: LocalFinancePayload,
): Promise<{ ok: boolean; migrated: boolean; txInserted: number; subsInserted: number }> {
  await assertSession();
  const supabase = createServerSupabase();
  const month = /^\d{4}-\d{2}$/.test(payload.month) ? payload.month : null;
  if (!month) return { ok: false, migrated: false, txInserted: 0, subsInserted: 0 };

  let txInserted = 0;
  let subsInserted = 0;
  let ok = true; // bir insert hata verirse false → client flag'i SET ETMEZ, sonraki mount'ta tekrar dener.

  // 1) Transactions — yalnız ay BOŞSA ekle (çift kayıt önlenir).
  const { count: existingTxCount } = await supabase
    .from("finance_transactions")
    .select("id", { count: "exact", head: true })
    .eq("month", month);

  if ((existingTxCount ?? 0) === 0) {
    const rows = [
      ...payload.incomes
        .filter((i) => i.amount > 0 && i.title?.trim())
        .map((i) => ({
          type: "income", title: i.title.trim(), amount: i.amount, month,
          category: i.category ?? null, status: i.status ?? null, notes: i.note?.trim() || null,
        })),
      ...payload.expenses
        .filter((e) => e.amount > 0 && e.title?.trim())
        .map((e) => ({
          type: "expense", title: e.title.trim(), amount: e.amount, month,
          category: e.category ?? null, priority: e.priority ?? null,
          status: e.status ?? "waiting", due_date: e.dueDate || null, notes: e.note?.trim() || null,
        })),
    ];
    if (rows.length > 0) {
      const { error } = await supabase.from("finance_transactions").insert(rows);
      if (error) ok = false; else txInserted = rows.length;
    }
  }

  // 2) Subscriptions — başlık zaten varsa atla (dedupe).
  const { data: existingSubs } = await supabase.from("finance_subscriptions").select("title");
  const existingTitles = new Set((existingSubs ?? []).map((s: { title: string }) => s.title.trim().toLowerCase()));
  const newSubs = payload.subscriptions
    .filter((s) => s.amount > 0 && s.name?.trim() && !existingTitles.has(s.name.trim().toLowerCase()))
    .map((s) => ({
      title: s.name.trim(), amount: s.amount, currency: s.currency ?? "TRY",
      is_active: s.status ? s.status === "active" || s.status === "trial" : true,
      category: s.category ?? "other", billing_cycle: s.billingCycle ?? "monthly",
      is_essential: s.isEssential ?? false, revenue_impact: s.revenueImpact ?? "unknown",
      ai_recommendation: s.aiRecommendation ?? null, purpose: s.purpose?.trim() || null,
      renewal_day: s.renewalDay ?? null, notes: s.note?.trim() || null,
    }));
  if (newSubs.length > 0) {
    const { error } = await supabase.from("finance_subscriptions").insert(newSubs);
    if (error) ok = false; else subsInserted = newSubs.length;
  }

  revalidatePath("/");
  return { ok, migrated: txInserted > 0 || subsInserted > 0, txInserted, subsInserted };
}
