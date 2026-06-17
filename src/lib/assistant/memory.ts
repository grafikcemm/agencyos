// ─────────────────────────────────────────────────────────────────────────────
// Mentor Memory — Supabase write-back/read katmanı (two-way adaptive mentor)
//
// Tablolar (migration 20260607 — schema DEĞİŞMEZ, sadece okur/yazar):
//   telegram_conversations  — her kullanıcı/asistan turu (date, role, message, agent, intent)
//   mentor_memory           — öğrenilen kalıplar (kind/key/value/confidence/occurrences/last_seen)
//   daily_commitments       — sabah taahhüt → akşam geri-çağırma (date PK)
//
// Service-role (lifeSupabaseAdmin) kullanılır — webhook/cron server bağlamında
// RLS'i bypass eder. Anon key (supabase/server createClient) RLS'e takılıp
// telegram_conversations insert/select'i SESSİZCE düşürebiliyordu → çok-turlu
// hafıza çalışmıyordu. Tüm fonksiyonlar best-effort: hata fırlatmaz.
// ─────────────────────────────────────────────────────────────────────────────
import { lifeSupabaseAdmin } from "@/lib/lifeSupabaseAdmin";

// Mevcut çağrı yerlerini (const supabase = createClient()) korumak için ince shim.
const createClient = () => lifeSupabaseAdmin;

export type ConversationRole = "user" | "assistant";

export type MentorMemoryKind =
  | "excuse"
  | "deferral"
  | "energy_pattern"
  | "win"
  | "commitment"
  | "note";

export interface TelegramTurn {
  date: string;
  role: ConversationRole;
  message: string;
  agent?: string | null;
  intent?: string | null;
}

export interface DailyCommitment {
  date: string;
  commitment: string | null;
  do_at: string | null;
  status: "pending" | "done" | "missed";
  blocker: string | null;
  asked_evening: boolean;
}

export interface MentorMemoryRow {
  id: string;
  kind: MentorMemoryKind;
  key: string | null;
  value: unknown;
  confidence: number;
  occurrences: number;
  last_seen: string;
}

const MAX_MESSAGE_LEN = 2000;

function truncate(text: string, max = MAX_MESSAGE_LEN): string {
  if (text.length <= max) return text;
  return text.slice(0, max);
}

// ── telegram_conversations ───────────────────────────────────────────────────

/** Bir konuşma turunu loglar (kullanıcı veya asistan). Best-effort. */
export async function logConversationTurn(turn: TelegramTurn): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.from("telegram_conversations").insert({
      date: turn.date,
      role: turn.role,
      message: truncate(turn.message),
      agent: turn.agent ?? null,
      intent: turn.intent ?? null,
    });
  } catch {
    /* non-critical */
  }
}

/**
 * Son N konuşma turunu kronolojik (eski→yeni) döndürür.
 * LLM serbest-metin fallback'inde geçmiş bağlam için kullanılır.
 */
export async function getRecentConversation(limit = 12): Promise<TelegramTurn[]> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("telegram_conversations")
      .select("date, role, message, agent, intent")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!data) return [];
    // En yeni→eski geldi; LLM için eski→yeni çevir.
    return data
      .map((r) => ({
        date: r.date as string,
        role: r.role as ConversationRole,
        message: r.message as string,
        agent: (r.agent as string | null) ?? null,
        intent: (r.intent as string | null) ?? null,
      }))
      .reverse();
  } catch {
    return [];
  }
}

// ── mentor_memory ────────────────────────────────────────────────────────────

/**
 * Bir kalıbı kaydeder/günceller. Aynı (kind,key) varsa occurrences++ ve
 * confidence artar (öğrenme); yoksa yeni satır açar.
 */
export async function recordMemory(
  kind: MentorMemoryKind,
  key: string | null,
  value: unknown,
  confidenceDelta = 0.1,
): Promise<void> {
  try {
    const supabase = createClient();
    const nowIso = new Date().toISOString();

    // Mevcut (kind,key) ara.
    let query = supabase
      .from("mentor_memory")
      .select("id, occurrences, confidence")
      .eq("kind", kind)
      .limit(1);
    query = key === null ? query.is("key", null) : query.eq("key", key);
    const { data: existing } = await query.maybeSingle();

    if (existing) {
      const nextOccurrences = (existing.occurrences ?? 1) + 1;
      const nextConfidence = Math.min(1, (existing.confidence ?? 0.5) + confidenceDelta);
      await supabase
        .from("mentor_memory")
        .update({
          value: value as never,
          occurrences: nextOccurrences,
          confidence: nextConfidence,
          last_seen: nowIso,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("mentor_memory").insert({
        kind,
        key,
        value: value as never,
        confidence: 0.5,
        occurrences: 1,
        last_seen: nowIso,
      });
    }
  } catch {
    /* non-critical */
  }
}

/** Belirli bir (kind,key) için occurrences sayısını döndürür (0 = yeni). */
export async function getMemoryOccurrences(
  kind: MentorMemoryKind,
  key: string,
): Promise<number> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("mentor_memory")
      .select("occurrences")
      .eq("kind", kind)
      .eq("key", key)
      .maybeSingle();
    return data?.occurrences ?? 0;
  } catch {
    return 0;
  }
}

/** En sık tekrarlanan kalıpları döndürür (prompt'a "öğrenilenler" olarak enjekte). */
export async function getTopMemories(limit = 8): Promise<MentorMemoryRow[]> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("mentor_memory")
      .select("id, kind, key, value, confidence, occurrences, last_seen")
      .order("occurrences", { ascending: false })
      .order("last_seen", { ascending: false })
      .limit(limit);
    return (data as MentorMemoryRow[] | null) ?? [];
  } catch {
    return [];
  }
}

/**
 * Öğrenilen kalıpları prompt'a gömülecek kısa, doğal Türkçe metne çevirir.
 * Boş ise boş string döner.
 */
export function formatMemoriesForPrompt(memories: MentorMemoryRow[]): string {
  if (!memories.length) return "";
  const lines: string[] = [];
  for (const m of memories) {
    if (m.occurrences < 2 && m.kind !== "win") continue; // gürültüyü ele
    const v =
      typeof m.value === "string"
        ? m.value
        : m.value && typeof m.value === "object" && "text" in (m.value as Record<string, unknown>)
          ? String((m.value as Record<string, unknown>).text)
          : JSON.stringify(m.value);
    const kindLabel: Record<MentorMemoryKind, string> = {
      excuse: "Sık bahane",
      deferral: "Erteleme kalıbı",
      energy_pattern: "Enerji kalıbı",
      win: "Kazanım",
      commitment: "Taahhüt geçmişi",
      note: "Not",
    };
    const keyPart = m.key ? ` (${m.key})` : "";
    lines.push(`- ${kindLabel[m.kind] ?? m.kind}${keyPart}: ${v} [${m.occurrences}x]`);
  }
  if (!lines.length) return "";
  return `Cem hakkında zamanla öğrendiklerin (kullanıcıyı yargılamadan, ince ayar için):\n${lines.join("\n")}`;
}

// ── daily_commitments ────────────────────────────────────────────────────────

/** Bugünün taahhüdünü döndürür (yoksa null). */
export async function getCommitment(date: string): Promise<DailyCommitment | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("daily_commitments")
      .select("date, commitment, do_at, status, blocker, asked_evening")
      .eq("date", date)
      .maybeSingle();
    if (!data) return null;
    return {
      date: data.date as string,
      commitment: (data.commitment as string | null) ?? null,
      do_at: (data.do_at as string | null) ?? null,
      status: (data.status as DailyCommitment["status"]) ?? "pending",
      blocker: (data.blocker as string | null) ?? null,
      asked_evening: Boolean(data.asked_evening),
    };
  } catch {
    return null;
  }
}

/** Sabah taahhüdünü yazar/günceller (date PK upsert). */
export async function setCommitment(
  date: string,
  patch: Partial<Omit<DailyCommitment, "date">>,
): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.from("daily_commitments").upsert(
      {
        date,
        ...patch,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "date" },
    );
  } catch {
    /* non-critical */
  }
}

/** Taahhüdü tamamlandı işaretler + kazanım belleğe yazar. */
export async function markCommitmentDone(date: string): Promise<void> {
  await setCommitment(date, { status: "done" });
}

/** Taahhüdü kaçırıldı işaretler + blocker'ı saklar. */
export async function markCommitmentMissed(date: string, blocker?: string): Promise<void> {
  await setCommitment(date, { status: "missed", blocker: blocker ?? null });
  if (blocker && blocker.trim().length > 0) {
    await recordMemory("excuse", "commitment_blocker", { text: truncate(blocker, 200) });
  }
}
