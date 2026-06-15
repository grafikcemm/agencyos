import { z } from "zod";
import { callOpenRouter, extractJSON } from "@/lib/assistant/llm";
import { lifeSupabaseAdmin as supabaseAdmin } from "@/lib/lifeSupabaseAdmin";
import { collectSnapshots } from "./collector";
import { buildLocalCommandPlan } from "./localPlan";
import { initActions, getActions } from "./actions";
import { canonicalizeApp } from "./planUtils";
import type { CommandPlan } from "./types";
import type { EnergyLevel, AgencyLoad } from "@/lib/dailyOrchestrator";

const AIPlanSchema = z.object({
  lock: z.object({
    title: z.string().min(1).max(80),
    app: z.string(),
    why: z.string().max(120).default(""),
  }),
  support: z.array(z.object({
    title: z.string().max(70),
    app: z.string().default("feed-the-goat"),
    action: z.string().default(""),
  })).max(2).default([]),
  minimumDay: z.string().max(100).default(""),
});

const COMMAND_PLAN_PROMPT = `Sen Feed The Goat'taki Ana Komuta Asistanısın. Dış sistem verilerine ve Cem'in günlük durumuna bakarak tek bir günlük komuta planı üret.

KURALLAR:
- En fazla 1 ana kilit (lock) seç
- En fazla 2 destek aksiyonu (support) seç
- Minimum gün: lock + 0-1 destek ile kurtarılabilecek minimum plan
- Dış aksiyon ALMA — sadece öner
- Stale/degraded kaynaklara daha az ağırlık ver
- Enerji düşükse plan küçülsün (koruma modu: tek kilit)
- Türkçe cevap ver
- SADECE geçerli JSON döndür

JSON formatı:
{
  "lock": { "title": "string (max 80 char)", "app": "agencyos|news-ai|xagent|feed-the-goat", "why": "string (max 120 char)" },
  "support": [{ "title": "string (max 70 char)", "app": "string", "action": "string" }],
  "minimumDay": "string (max 100 char)"
}`;

/**
 * Central orchestrator to fetch or generate today's command plan.
 * Used by UI endpoints and Telegram notifications cron jobs alike.
 */
export async function ensureCommandPlan(
  date: string,
  options?: { force?: boolean }
): Promise<{ plan: CommandPlan; cached: boolean }> {
  // 1. Force refresh if requested
  if (options?.force) {
    await supabaseAdmin.from("command_plans").delete().eq("date", date);
  }

  // 2. Try fetching from cached Supabase row
  const { data: cached } = await supabaseAdmin
    .from("command_plans")
    .select("plan")
    .eq("date", date)
    .single();

  if (cached?.plan) {
    const actions = await getActions(date);
    return { plan: { ...(cached.plan as CommandPlan), actions }, cached: true };
  }

  // 3. Gather daily state parameters (defaulting to moderate/normal load)
  const { data: dailyState } = await supabaseAdmin
    .from("assistant_daily_state")
    .select("energy,agency_load,mode")
    .eq("date", date)
    .single();

  const energy: EnergyLevel = (dailyState?.energy as EnergyLevel) ?? "medium";
  const agencyLoad: AgencyLoad = (dailyState?.agency_load as AgencyLoad) ?? "normal";

  // 4. Collect snapshots from sector modules (AgencyOS, NewsAI, XAgent)
  const snapshots = await collectSnapshots(date);
  const { agencyos, newsAi, xagent, sourceHealth } = snapshots;

  // 5. Build dynamic contextual input lines
  const lines: string[] = [
    `Tarih: ${date}`,
    `Enerji: ${energy}`,
    `Ajans yoğunluğu: ${agencyLoad}`,
  ];

  const agencyStale = sourceHealth.agencyos.status === "stale" ? " [STALE]" : "";
  if (agencyos?.data?.topLead) {
    const l = agencyos.data.topLead;
    const actionLabel =
      l.suggestedAction === "call_now"
        ? "ARA"
        : l.suggestedAction === "send_audit"
        ? "Mini audit gönder"
        : l.suggestedAction === "warm_up"
        ? "Isın"
        : "MAİL";
    lines.push(
      `\nAGENCYOS${agencyStale}:\n${l.businessName} (${l.sector}, ${l.district}) Tier:${
        l.tier
      } Skor:${l.qualityScore}\nNeden şimdi: ${l.whyNow}\nÖneri: ${actionLabel}\nPitch: ${l.firstPitch?.slice(
        0,
        100
      )}`
    );
  } else {
    lines.push(
      `\nAGENCYOS${agencyStale}: ${
        sourceHealth.agencyos.status === "down" ? "erişilemiyor" : "bugün lead yok"
      }`
    );
  }

  const newsNote =
    sourceHealth.newsAi.status === "stale"
      ? " [STALE]"
      : sourceHealth.newsAi.status === "degraded"
      ? " [DEGRADED-fallback]"
      : "";
  if (newsAi?.data?.infoFuel) {
    const f = newsAi.data.infoFuel;
    lines.push(
      `\nNEWS AI${newsNote}:\n${f.title}\nNeden: ${f.whyPeopleCare?.slice(
        0,
        100
      )}\nX açısı: ${f.tweetAngle?.slice(0, 80)}`
    );
  } else {
    lines.push(
      `\nNEWS AI${newsNote}: ${
        sourceHealth.newsAi.status === "down" ? "erişilemiyor" : "içerik yok"
      }`
    );
  }

  const xNote =
    sourceHealth.xagent.status === "stale"
      ? " [STALE]"
      : sourceHealth.xagent.status === "degraded"
      ? " [DEGRADED-db?]"
      : "";
  if (xagent?.data?.accounts?.length) {
    lines.push(`\nXAGENT${xNote}:`);
    for (const acc of xagent.data.accounts) {
      if (acc.draftsPending > 0 || acc.awaitingApproval > 0 || acc.publishedToday > 0) {
        lines.push(
          `@${acc.xHandle}: taslak=${acc.draftsPending} onay=${acc.awaitingApproval} yayın=${acc.publishedToday} → ${acc.minNextAction.reason}`
        );
      }
    }
  } else {
    lines.push(
      `\nXAGENT${xNote}: ${
        sourceHealth.xagent.status === "down" ? "erişilemiyor" : "veri yok"
      }`
    );
  }

  // 6. Generate command plan (AI or fallback)
  let plan: CommandPlan;
  try {
    const aiResponse = await callOpenRouter(
      [
        { role: "system", content: COMMAND_PLAN_PROMPT },
        { role: "user", content: lines.join("\n") },
      ],
      { maxTokens: 600, temperature: 0.3 }
    );

    const rawParsed = aiResponse ? extractJSON(aiResponse) : null;
    const validated = rawParsed ? AIPlanSchema.safeParse(rawParsed) : null;

    if (validated?.success) {
      const v = validated.data;
      plan = {
        date,
        energy,
        mode: dailyState?.mode ?? (energy === "low" ? "koruma" : "denge"),
        lock: { ...v.lock, app: canonicalizeApp(v.lock.app) as CommandPlan["lock"]["app"] },
        support: v.support.map((s) => ({ ...s, app: canonicalizeApp(s.app) })).slice(0, 2),
        minimumDay: v.minimumDay || v.lock.title,
        actions: { agency_sales: "pending", news_read: "pending", xagent_approve: "pending" },
        sourceHealth: snapshots.sourceHealth,
      };
    } else {
      plan = buildLocalCommandPlan(date, energy, agencyLoad, snapshots);
    }
  } catch {
    plan = buildLocalCommandPlan(date, energy, agencyLoad, snapshots);
  }

  // 7. Persist generated plan in DB
  await Promise.all([
    supabaseAdmin.from("command_plans").upsert(
      { date, plan, updated_at: new Date().toISOString() },
      { onConflict: "date" }
    ),
    initActions(date), // ignoreDuplicates ensures it doesn't clear already updated states
  ]);

  const actions = await getActions(date);
  return { plan: { ...plan, actions }, cached: false };
}
