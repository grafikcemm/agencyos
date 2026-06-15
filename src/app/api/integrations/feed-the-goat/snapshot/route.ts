import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase snapshot env is not configured");
  }
  return createClient(url, key);
}

function requireSnapshotAuth(req: NextRequest): boolean {
  const token = process.env.AGENCYOS_SNAPSHOT_TOKEN;
  // Token zorunlu: ayarlı değilse her ortamda reddet (dev'de de açık bırakma).
  if (!token) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${token}`;
}

export async function GET(req: NextRequest) {
  if (!requireSnapshotAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dateParam = new URL(req.url).searchParams.get("date");
  const date = dateParam ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

  // Istanbul gün sınırları (UTC+3)
  const dayStart = new Date(`${date}T00:00:00+03:00`).toISOString();
  const dayEnd = new Date(`${date}T23:59:59+03:00`).toISOString();

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select(
        "id,business_name,sector,district,lead_tier,quality_score,why_now,pain_signals,next_action_priority,first_30_seconds_pitch,expected_monthly_value_tl"
      )
      .in("lead_tier", ["A", "B"])
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .order("quality_score", { ascending: false })
      .limit(1);

    const [{ count: totalToday }, { count: tierA }, { count: tierB }] = await Promise.all([
      supabaseAdmin.from("leads").select("id", { count: "exact", head: true }).gte("created_at", dayStart).lte("created_at", dayEnd),
      supabaseAdmin.from("leads").select("id", { count: "exact", head: true }).eq("lead_tier", "A").gte("created_at", dayStart).lte("created_at", dayEnd),
      supabaseAdmin.from("leads").select("id", { count: "exact", head: true }).eq("lead_tier", "B").gte("created_at", dayStart).lte("created_at", dayEnd),
    ]);

    const topLead = leads?.[0] ?? null;

    return NextResponse.json({
      app: "agencyos",
      date,
      status: topLead ? "ok" : "empty",
      generatedAt: new Date().toISOString(),
      data: {
        topLead: topLead
          ? {
              id: topLead.id,
              businessName: topLead.business_name,
              sector: topLead.sector,
              district: topLead.district,
              tier: topLead.lead_tier,
              qualityScore: topLead.quality_score,
              whyNow: topLead.why_now,
              painSignals: Array.isArray(topLead.pain_signals) ? topLead.pain_signals : [],
              suggestedAction: topLead.next_action_priority ?? "email",
              firstPitch: topLead.first_30_seconds_pitch ?? "",
              estMonthlyValueTl: topLead.expected_monthly_value_tl ?? 0,
            }
          : null,
        metrics: {
          leadsToday: totalToday ?? 0,
          tierA: tierA ?? 0,
          tierB: tierB ?? 0,
        },
      },
      warnings: topLead ? null : ["Bugün henüz tier A/B lead üretilmedi"],
    });
  } catch (err) {
    console.error("[AgencyOS snapshot]", err);
    return NextResponse.json(
      { app: "agencyos", date, status: "degraded", generatedAt: new Date().toISOString(), data: null, warnings: ["Sorgu hatası"] },
      { status: 500 }
    );
  }
}
