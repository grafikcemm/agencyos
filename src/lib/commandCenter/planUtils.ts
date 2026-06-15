import type { ActionKey } from "./types";

// Normalise AI-generated app names to canonical slugs.
const APP_ALIASES: Record<string, string> = {
  news: "news-ai",
  news_ai: "news-ai",
  "news ai": "news-ai",
  newsai: "news-ai",
  xagent: "xagent",
  xAgent: "xagent",
  XAgent: "xagent",
  XAGENT: "xagent",
  agencyos: "agencyos",
  AgencyOS: "agencyos",
  "agency-os": "agencyos",
  agency_os: "agencyos",
  AGENCYOS: "agencyos",
  "feed-the-goat": "feed-the-goat",
  feedthegoat: "feed-the-goat",
};

export function canonicalizeApp(app: string): string {
  if (!app) {
    // Fallback for empty app names
    return "feed-the-goat";
  }

  // trim + lowercase
  const cleaned = app.trim().toLowerCase();
  
  // Normalize spaces, underscores, and hyphens to empty string for comparison
  const normalized = cleaned.replace(/[\s_-]+/g, "");

  // agency os, agency-os, agency_os, Agency OS -> agencyos
  if (normalized === "agencyos" || normalized === "agency") {
    return "agencyos";
  }
  // news-ai -> news-ai
  if (normalized === "newsai" || normalized === "news") {
    return "news-ai";
  }
  // xagent -> xagent
  if (normalized === "xagent") {
    return "xagent";
  }
  // feed-the-goat -> feed-the-goat
  if (normalized === "feedthegoat" || normalized === "goat") {
    return "feed-the-goat";
  }

  const aliased = APP_ALIASES[cleaned] ?? APP_ALIASES[normalized];
  if (aliased) return aliased;

  /*
   * Fallback for unknown app values is "feed-the-goat".
   * Note: "feed-the-goat" is not present in APP_TO_ACTION, meaning it will naturally
   * remain excluded from the active action keys in getActiveActionKeys.
   */
  return "feed-the-goat";
}

const APP_TO_ACTION: Record<string, ActionKey> = {
  agencyos: "agency_sales",
  "news-ai": "news_read",
  xagent: "xagent_approve",
};

const ALL_ACTION_KEYS: ActionKey[] = ["agency_sales", "news_read", "xagent_approve"];

export function getActiveActionKeys(lockApp: string, supportApps: string[]): ActionKey[] {
  const apps = new Set([canonicalizeApp(lockApp), ...supportApps.map(canonicalizeApp)]);
  return ALL_ACTION_KEYS.filter((k) =>
    Object.entries(APP_TO_ACTION).some(([app, key]) => key === k && apps.has(app))
  );
}
