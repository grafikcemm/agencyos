import { lifeSupabaseAdmin as supabaseAdmin } from "@/lib/lifeSupabaseAdmin";
import type {
  AgencySnapshot,
  NewsSnapshot,
  XAgentSnapshot,
  CollectedSnapshots,
  SourceHealth,
  SnapshotEnvelope,
} from "./types";

const TIMEOUT_MS = 6000;

async function fetchSnapshot<T>(
  url: string,
  token: string | undefined
): Promise<SnapshotEnvelope<T> | null> {
  if (!url || !token) return null;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as SnapshotEnvelope<T>;
  } catch {
    return null;
  }
}

async function loadStaleSnapshot<T>(
  app: string,
  date: string
): Promise<SnapshotEnvelope<T> | null> {
  const { data } = await supabaseAdmin
    .from("command_snapshots")
    .select("app,date,status,data,warnings,generated_at")
    .eq("app", app)
    .lt("date", date)
    .order("date", { ascending: false })
    .limit(1)
    .single();
  if (!data) return null;
  return {
    app: data.app as SnapshotEnvelope<T>["app"],
    date: data.date,
    status: data.status,
    generatedAt: data.generated_at,
    data: data.data as T,
    warnings: data.warnings as string[] | null,
  };
}

async function saveSnapshot(
  snapshot: SnapshotEnvelope<unknown>,
  date: string
): Promise<void> {
  await supabaseAdmin.from("command_snapshots").upsert(
    {
      app: snapshot.app,
      date,
      status: snapshot.status,
      data: snapshot.data,
      warnings: snapshot.warnings,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "app,date" }
  );
}

function buildSourceHealth(
  live: SnapshotEnvelope<unknown> | null,
  stale: SnapshotEnvelope<unknown> | null,
  staleDate?: string
): SourceHealth {
  if (live) {
    if (live.status === "degraded") return { status: "degraded", warnings: live.warnings ?? undefined };
    if (live.status === "empty") return { status: "empty", warnings: live.warnings ?? undefined };
    return { status: "ok" };
  }
  if (stale) {
    return { status: "stale", staleSince: staleDate };
  }
  return { status: "down" };
}

export async function collectSnapshots(date: string): Promise<CollectedSnapshots> {
  const makeUrl = (base: string | undefined, path: string) =>
    base ? `${base}${path}?date=${date}` : "";

  const agencyUrl = makeUrl(process.env.AGENCYOS_BASE_URL, "/api/integrations/feed-the-goat/snapshot");
  const newsUrl = makeUrl(process.env.NEWS_AI_BASE_URL, "/api/integrations/feed-the-goat/snapshot");
  const xagentUrl = makeUrl(process.env.XAGENT_BASE_URL, "/api/integrations/feed-the-goat/snapshot");

  const [agencyResult, newsResult, xagentResult] = await Promise.allSettled([
    fetchSnapshot<AgencySnapshot["data"]>(agencyUrl, process.env.AGENCYOS_SNAPSHOT_TOKEN),
    fetchSnapshot<NewsSnapshot["data"]>(newsUrl, process.env.NEWS_AI_SNAPSHOT_TOKEN),
    fetchSnapshot<XAgentSnapshot["data"]>(xagentUrl, process.env.XAGENT_SNAPSHOT_TOKEN),
  ]);

  const agencyLive = agencyResult.status === "fulfilled" ? agencyResult.value : null;
  const newsLive = newsResult.status === "fulfilled" ? newsResult.value : null;
  const xagentLive = xagentResult.status === "fulfilled" ? xagentResult.value : null;

  // Başarılı snapshot'ları sakla
  await Promise.allSettled([
    agencyLive ? saveSnapshot(agencyLive as SnapshotEnvelope<unknown>, date) : Promise.resolve(),
    newsLive ? saveSnapshot(newsLive as SnapshotEnvelope<unknown>, date) : Promise.resolve(),
    xagentLive ? saveSnapshot(xagentLive as SnapshotEnvelope<unknown>, date) : Promise.resolve(),
  ]);

  // Başarısız olanlar için stale fallback yükle
  const [agencyStale, newsStale, xagentStale] = await Promise.all([
    !agencyLive ? loadStaleSnapshot<AgencySnapshot["data"]>("agencyos", date) : Promise.resolve(null),
    !newsLive ? loadStaleSnapshot<NewsSnapshot["data"]>("news-ai", date) : Promise.resolve(null),
    !xagentLive ? loadStaleSnapshot<XAgentSnapshot["data"]>("xagent", date) : Promise.resolve(null),
  ]);

  return {
    agencyos: (agencyLive ?? agencyStale) as AgencySnapshot | null,
    newsAi: (newsLive ?? newsStale) as NewsSnapshot | null,
    xagent: (xagentLive ?? xagentStale) as XAgentSnapshot | null,
    sourceHealth: {
      agencyos: buildSourceHealth(agencyLive, agencyStale, agencyStale?.date),
      newsAi: buildSourceHealth(newsLive, newsStale, newsStale?.date),
      xagent: buildSourceHealth(xagentLive, xagentStale, xagentStale?.date),
    },
  };
}
