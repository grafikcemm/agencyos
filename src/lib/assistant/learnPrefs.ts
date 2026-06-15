import { extractPrefSignals, type PrefSignals } from "./prefSignals";

export { extractPrefSignals, type PrefSignals };

export async function upsertAssistantPrefs(signals: PrefSignals): Promise<void> {
  if (
    !signals.food_likes?.length &&
    !signals.food_dislikes?.length &&
    !signals.notes
  ) return;

  const { lifeSupabaseAdmin: supabaseAdmin } = await import("@/lib/lifeSupabaseAdmin");

  const { data: existing } = await supabaseAdmin
    .from("assistant_prefs")
    .select("food_likes, food_dislikes, notes")
    .eq("id", 1)
    .maybeSingle();

  const mergedLikes = Array.from(new Set([...(existing?.food_likes ?? []), ...(signals.food_likes ?? [])]));
  const mergedDislikes = Array.from(new Set([...(existing?.food_dislikes ?? []), ...(signals.food_dislikes ?? [])]));
  const mergedNotes = { ...(existing?.notes ?? {}), ...(signals.notes ?? {}) };

  await supabaseAdmin.from("assistant_prefs").upsert(
    {
      id: 1,
      food_likes: mergedLikes,
      food_dislikes: mergedDislikes,
      notes: mergedNotes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
}
