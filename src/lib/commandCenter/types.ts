// ─── Snapshot zarfı (her 3 app için ortak) ───────────────────────────────────

export type SnapshotStatus = "ok" | "degraded" | "empty";

export interface SnapshotEnvelope<T> {
  app: "agencyos" | "news-ai" | "xagent";
  date: string;
  status: SnapshotStatus;
  generatedAt: string;
  data: T | null;
  warnings: string[] | null;
}

// ─── AgencyOS ─────────────────────────────────────────────────────────────────

export interface AgencyTopLead {
  id: string;
  businessName: string;
  sector: string;
  district: string;
  tier: "A" | "B" | "C" | "D";
  qualityScore: number;
  whyNow: string;
  painSignals: string[];
  suggestedAction: "call_now" | "send_audit" | "warm_up" | "email";
  firstPitch: string;
  estMonthlyValueTl: number;
}

export interface AgencyData {
  topLead: AgencyTopLead | null;
  metrics: { leadsToday: number; tierA: number; tierB: number };
}

export type AgencySnapshot = SnapshotEnvelope<AgencyData> & { app: "agencyos" };

// ─── News AI ──────────────────────────────────────────────────────────────────

export interface InfoFuel {
  title: string;
  source: string;
  oneLineValue: string;
  whyPeopleCare: string;
  tweetAngle: string;
  xValueScore: number | null;
  contentFormat: string;
  url: string;
  origin: "content_opportunities" | "news_items_fallback";
}

export interface NewsData {
  infoFuel: InfoFuel | null;
  aiRankingsTop?: { model: string; rank: number }[];
}

export type NewsSnapshot = SnapshotEnvelope<NewsData> & { app: "news-ai" };

// ─── XAgent ───────────────────────────────────────────────────────────────────

export type XAgentAction =
  | "approve"
  | "schedule"
  | "publish"
  | "review_scheduled"
  | "generate"
  | "none";

export interface XAccountStatus {
  handle: string;
  xHandle: string;
  draftsPending: number;
  awaitingApproval: number;
  scheduled: number;
  publishedToday: number;
  minNextAction: { action: XAgentAction; reason: string };
}

export interface XAgentData {
  dbHealthy: boolean;
  accounts: XAccountStatus[];
}

export type XAgentSnapshot = SnapshotEnvelope<XAgentData> & { app: "xagent" };

// ─── Kaynak sağlık durumu ─────────────────────────────────────────────────────

export type SourceStatus = "ok" | "degraded" | "stale" | "down" | "empty";

export interface SourceHealth {
  status: SourceStatus;
  staleSince?: string;
  warnings?: string[];
}

export interface CollectedSnapshots {
  agencyos: AgencySnapshot | null;
  newsAi: NewsSnapshot | null;
  xagent: XAgentSnapshot | null;
  sourceHealth: {
    agencyos: SourceHealth;
    newsAi: SourceHealth;
    xagent: SourceHealth;
  };
}

// ─── Command Plan ─────────────────────────────────────────────────────────────

export type ActionState = "pending" | "done" | "skipped";
export type ActionKey = "agency_sales" | "news_read" | "xagent_approve";

export interface CommandLock {
  title: string;
  app: "agencyos" | "news-ai" | "xagent" | "feed-the-goat";
  why: string;
}

export interface CommandSupport {
  title: string;
  app: string;
  action: string;
}

export interface CommandPlan {
  date: string;
  energy: "low" | "medium" | "high";
  mode: "koruma" | "denge" | "atak";
  lock: CommandLock;
  support: CommandSupport[];
  minimumDay: string;
  actions: Record<ActionKey, ActionState>;
  sourceHealth: {
    agencyos: SourceHealth;
    newsAi: SourceHealth;
    xagent: SourceHealth;
  };
}
