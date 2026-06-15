import type {
  CollectedSnapshots,
  CommandPlan,
  CommandLock,
  CommandSupport,
  ActionKey,
  ActionState,
} from "./types";
import type { EnergyLevel, PlanMode, AgencyLoad } from "@/lib/dailyOrchestrator";

function deriveMode(agencyLoad: AgencyLoad, energy: EnergyLevel): PlanMode {
  if (agencyLoad === "high" && energy === "low") return "koruma";
  if (agencyLoad === "high") return "koruma";
  if (agencyLoad === "low" && energy === "high") return "atak";
  return "denge";
}

export function buildLocalCommandPlan(
  date: string,
  energy: EnergyLevel,
  agencyLoad: AgencyLoad,
  snapshots: CollectedSnapshots
): CommandPlan {
  const mode = deriveMode(agencyLoad, energy);

  const agency = snapshots.agencyos?.data?.topLead ?? null;
  const infoFuel = snapshots.newsAi?.data?.infoFuel ?? null;
  const xAccounts = snapshots.xagent?.data?.accounts ?? [];
  const xPending = xAccounts.find((a) => a.draftsPending > 0 || a.awaitingApproval > 0) ?? null;

  // Kilit seçimi: en güvenilir ve değerli kaynaktan
  let lock: CommandLock;
  if (agency && snapshots.sourceHealth.agencyos.status !== "down") {
    const agencyLabel =
      agency.suggestedAction === "call_now" ? "Ara" :
      agency.suggestedAction === "send_audit" ? "Mini audit gönder" :
      agency.suggestedAction === "warm_up" ? "Isıt / takip hazırla" :
      "Mail at";
    lock = {
      title: `${agency.businessName} — ${agencyLabel}`,
      app: "agencyos",
      why: agency.whyNow,
    };
  } else if (xPending && snapshots.sourceHealth.xagent.status !== "down") {
    lock = {
      title: `@${xPending.xHandle} taslağını onayla`,
      app: "xagent",
      why: xPending.minNextAction.reason,
    };
  } else if (infoFuel && snapshots.sourceHealth.newsAi.status !== "down") {
    lock = {
      title: `Bilgi yakıtı: ${infoFuel.title.slice(0, 60)}`,
      app: "news-ai",
      why: infoFuel.oneLineValue || infoFuel.whyPeopleCare,
    };
  } else {
    lock = {
      title: "Kritik rutinleri tamamla",
      app: "feed-the-goat",
      why: "Dış sistemler erişilemiyor — iç rutine odaklan",
    };
  }

  // Destek aksiyonları (max 2)
  const support: CommandSupport[] = [];
  if (lock.app !== "xagent" && xPending) {
    support.push({ title: `@${xPending.xHandle}: ${xPending.minNextAction.reason}`, app: "xagent", action: xPending.minNextAction.action });
  }
  if (lock.app !== "news-ai" && infoFuel && support.length < 2) {
    support.push({ title: `Oku: ${infoFuel.title.slice(0, 50)}`, app: "news-ai", action: "read" });
  }
  if (lock.app !== "agencyos" && agency && support.length < 2) {
    const supportLabel =
      agency.suggestedAction === "call_now" ? "ara" :
      agency.suggestedAction === "send_audit" ? "mini audit gönder" :
      agency.suggestedAction === "warm_up" ? "isıt" :
      "mail at";
    support.push({ title: `Lead: ${agency.businessName}`, app: "agencyos", action: supportLabel });
  }

  const minimumDay =
    mode === "koruma"
      ? `Sadece: "${lock.title.slice(0, 50)}"`
      : support.length > 0
      ? `"${lock.title.slice(0, 40)}" + ${support[0].title.slice(0, 35)}`
      : lock.title.slice(0, 70);

  const actions: Record<ActionKey, ActionState> = {
    agency_sales: "pending",
    news_read: "pending",
    xagent_approve: "pending",
  };

  return {
    date,
    energy,
    mode,
    lock,
    support: support.slice(0, 2),
    minimumDay,
    actions,
    sourceHealth: snapshots.sourceHealth,
  };
}
