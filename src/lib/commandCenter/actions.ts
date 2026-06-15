import { lifeSupabaseAdmin as supabaseAdmin } from "@/lib/lifeSupabaseAdmin";
import type { ActionKey, ActionState } from "./types";

const ALL_KEYS: ActionKey[] = ["agency_sales", "news_read", "xagent_approve"];

export async function initActions(date: string): Promise<void> {
  const rows = ALL_KEYS.map((key) => ({
    date,
    action_key: key,
    state: "pending" as ActionState,
    updated_at: new Date().toISOString(),
  }));
  await supabaseAdmin
    .from("command_actions")
    .upsert(rows, { onConflict: "date,action_key", ignoreDuplicates: true });
}

export async function getActions(date: string): Promise<Record<ActionKey, ActionState>> {
  const { data } = await supabaseAdmin
    .from("command_actions")
    .select("action_key,state")
    .eq("date", date);

  const result: Record<ActionKey, ActionState> = {
    agency_sales: "pending",
    news_read: "pending",
    xagent_approve: "pending",
  };

  for (const row of data ?? []) {
    if (ALL_KEYS.includes(row.action_key as ActionKey)) {
      result[row.action_key as ActionKey] = row.state as ActionState;
    }
  }
  return result;
}

export async function updateAction(
  date: string,
  key: ActionKey,
  state: "done" | "skipped"
): Promise<void> {
  await supabaseAdmin.from("command_actions").upsert(
    { date, action_key: key, state, updated_at: new Date().toISOString() },
    { onConflict: "date,action_key" }
  );
}
