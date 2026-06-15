// ─────────────────────────────────────────────────────────────────────────────
// AgencyOS Köprüsü — asistanın iş tarafını (lead/pipeline) + alışkanlık zincirini
// "GERÇEK VERİ" bloğuna taşır. liveContext.factsBlock'a eklenir.
//
// İKİ AYRI DB: bu modül AgencyOS DB'sini okur (@/lib/supabase → supabaseAdmin).
// FTG/LIFE DB ayrı (@/lib/supabaseServer). İsim çakışmasını önlemek için alias.
// Tüm sorgular best-effort: tablo/kolon yoksa blok kısmi/boş döner, asla throw etmez.
// ─────────────────────────────────────────────────────────────────────────────
import { supabaseAdmin as agencyAdmin } from "@/lib/supabase";
import { getHabitsOverview } from "@/app/actions/habitActions";

interface LeadRow {
  business_name: string | null;
  city: string | null;
  sector: string | null;
  potential_score: number | null;
  score: number | null;
  status: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

const CLOSED_STATUSES = new Set(["converted", "lost", "won"]);

export interface CallableCustomer {
  name: string
  contact: string
  loc: string
  score: number
}

/** Yapılı liste — deterministik brief için (LLM'e bağımlı değil, telefon halüsinasyonu yok). */
export async function getCallableCustomers(limit = 4): Promise<CallableCustomer[]> {
  try {
    const { data } = await agencyAdmin
      .from("leads")
      .select("business_name, city, sector, potential_score, score, status, phone, email, website")
      .order("potential_score", { ascending: false, nullsFirst: false })
      .limit(60)
    const rows = (data ?? []) as LeadRow[]
    return rows
      .filter((r) => !CLOSED_STATUSES.has((r.status ?? "").toLowerCase()))
      .filter((r) => (r.phone && r.phone.trim()) || (r.email && r.email.trim()))
      .slice(0, limit)
      .map((r) => ({
        name: r.business_name ?? "(isimsiz)",
        contact: [r.phone?.trim(), r.email?.trim()].filter(Boolean).join(" / "),
        loc: [r.city, r.sector].filter(Boolean).join(" · "),
        score: r.potential_score ?? r.score ?? 0,
      }))
  } catch {
    return []
  }
}

/**
 * Bugün aranacak 3-4 müşteri — açık, yüksek potansiyelli, iletişim bilgisi olan lead'ler.
 * Sabah brief'inde "Ara: <isim> — <telefon/mail>" olarak sunulur.
 */
export async function loadCallableCustomers(limit = 4): Promise<string> {
  const lines: string[] = ["=== BUGÜN ARANACAK MÜŞTERİLER ==="];
  try {
    const { data } = await agencyAdmin
      .from("leads")
      .select("business_name, city, sector, potential_score, score, status, phone, email, website")
      .order("potential_score", { ascending: false, nullsFirst: false })
      .limit(60);
    const rows = (data ?? []) as LeadRow[];
    const callable = rows
      .filter((r) => !CLOSED_STATUSES.has((r.status ?? "").toLowerCase()))
      .filter((r) => (r.phone && r.phone.trim()) || (r.email && r.email.trim()))
      .slice(0, limit);
    if (callable.length === 0) {
      lines.push("İletişim bilgisi olan açık lead yok.");
      return lines.join("\n");
    }
    for (const r of callable) {
      const contact = [r.phone?.trim(), r.email?.trim()].filter(Boolean).join(" / ");
      const loc = [r.city, r.sector].filter(Boolean).join(" · ");
      const sc = r.potential_score ?? r.score ?? 0;
      lines.push(`  • ${r.business_name ?? "(isimsiz)"}${loc ? ` (${loc})` : ""} — skor ${sc} — ${contact}`);
    }
  } catch {
    lines.push("(müşteri iletişim verisi okunamadı)");
  }
  return lines.join("\n");
}

/** AgencyOS iş durumu + alışkanlık zincirleri — birleşik metin bloğu. */
export async function loadAgencyContextBlock(): Promise<string> {
  const [business, habits] = await Promise.all([loadBusinessBlock(), loadHabitsBlock()]);
  return [business, habits].filter((b) => b.trim().length > 0).join("\n\n");
}

async function loadBusinessBlock(): Promise<string> {
  const lines: string[] = ["=== AGENCYOS İŞ DURUMU ==="];
  try {
    const { data, count } = await agencyAdmin
      .from("leads")
      .select("business_name, city, sector, potential_score, score, status", { count: "exact" })
      .order("potential_score", { ascending: false, nullsFirst: false })
      .limit(40);

    const rows = (data ?? []) as LeadRow[];
    const open = rows.filter((r) => !CLOSED_STATUSES.has((r.status ?? "").toLowerCase()));
    const qualified = rows.filter((r) => (r.potential_score ?? r.score ?? 0) >= 60);

    lines.push(
      `Toplam lead: ${count ?? rows.length} · Nitelikli (≥60): ${qualified.length} · Açık: ${open.length}`,
    );

    const top = open.slice(0, 3);
    if (top.length > 0) {
      lines.push("En yüksek potansiyelli açık lead'ler:");
      for (const r of top) {
        const sc = r.potential_score ?? r.score ?? 0;
        const loc = [r.city, r.sector].filter(Boolean).join(" · ");
        lines.push(`  • ${r.business_name ?? "(isimsiz)"}${loc ? ` (${loc})` : ""} — skor ${sc}`);
      }
    } else {
      lines.push("Açık lead yok.");
    }
  } catch {
    lines.push("(lead verisi okunamadı)");
  }
  return lines.join("\n");
}

async function loadHabitsBlock(): Promise<string> {
  const lines: string[] = ["=== ALIŞKANLIK ZİNCİRLERİ ==="];
  try {
    const items = await getHabitsOverview();
    if (items.length === 0) {
      lines.push("Alışkanlık kaydı yok.");
      return lines.join("\n");
    }
    const atRisk = items.filter((h) => h.computed.atRisk);
    const done = items.filter((h) => h.computed.todayStatus === "done").length;
    const due = items.filter((h) => h.computed.todayStatus !== "not_due").length;
    lines.push(`Bugün: ${done}/${due} tamamlandı · Risk altındaki zincir: ${atRisk.length}`);
    for (const h of items) {
      const status =
        h.computed.todayStatus === "done"
          ? "✓ bugün yapıldı"
          : h.computed.todayStatus === "not_due"
            ? "bugün gerekli değil"
            : h.computed.atRisk
              ? "⚠ bugün eksik"
              : "bekliyor";
      lines.push(`  • ${h.label}: ${h.computed.currentStreak}g zincir — ${status}`);
    }
  } catch {
    lines.push("(alışkanlık verisi okunamadı)");
  }
  return lines.join("\n");
}
