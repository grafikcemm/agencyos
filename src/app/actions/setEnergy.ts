"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabaseServer";
import { z } from "zod";

const schema = z.object({
  energy: z.enum(["LOW", "MID", "HIGH"]),
});

export async function setEnergy(input: { energy: "LOW" | "MID" | "HIGH" }) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: "Invalid energy value" };
  }

  const supabase = createServerSupabase();
  const today = new Date().toISOString().split("T")[0];

  const { error } = await supabase
    .from("energy_checkins")
    .upsert(
      { date: today, energy: parsed.data.energy, created_at: new Date().toISOString() },
      { onConflict: "date" }
    );

  if (error) {
    return { success: false as const, error: error.message };
  }

  revalidatePath("/");
  return { success: true as const };
}

export async function getEnergy(): Promise<"LOW" | "MID" | "HIGH" | null> {
  const supabase = createServerSupabase();
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("energy_checkins")
    .select("energy")
    .eq("date", today)
    .maybeSingle();

  if (error || !data) return null;
  return data.energy as "LOW" | "MID" | "HIGH";
}
