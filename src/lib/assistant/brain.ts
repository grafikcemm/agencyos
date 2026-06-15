// ─────────────────────────────────────────────────────────────────────────────
// Grafikcem_OS Beyin Loader — mentor'ın tek doğruluk kaynağı (runtime, read-only)
//
// İçerik knowledgeStore'dan gelir: prod'da Supabase `assistant_knowledge`,
// lokalde fs fallback (knowledge/ klasörü). Prompt'lar koda gömülmez.
//
// PRIVACY_RULES: private/ ve finans şablonları (kart/masraf) ASLA okunmaz.
// ─────────────────────────────────────────────────────────────────────────────
import { ensureKnowledgeLoaded, readKnowledgeSync } from "./knowledgeStore";

// Tier-1 — her mentor çağrısında sistem prompt'a DAİMA yüklenir (küçük, ~5-8k token).
const CORE_FILES: readonly string[] = [
  "USER_PROFILE.md",
  "LIFE_GOALS.md",
  "personal/DISCIPLINE_CONTEXT.md",
  "personal/BOUNDARIES_CONTEXT.md",
  "personal/CHARACTER_PROFILE.md",
  "health/RECOVERY_RULES.md",
  "health/NUTRITION_CONTEXT.md",
  "finance/INCOME_TARGETS.md",
];

// Mentor persona (serbest metin — "kişisel mentör" sesi).
const PERSONA_FILES: readonly string[] = [
  "ALİ CEM KİŞİSEL MENTÖR.txt",
  "Rol ve Persona.txt",
];

// ASLA okunmaz (PRIVACY_RULES) — hassas / özel veri.
const DENY_PATTERNS: readonly string[] = [
  "private/",
  "finance/MONTHLY_EXPENSES",
  "finance/CREDIT_CARD",
  "finance/SUBSCRIPTIONS",
];

function normalizeRel(rel: string): string {
  return rel.replace(/\\/g, "/");
}

function isDenied(rel: string): boolean {
  const norm = normalizeRel(rel);
  return DENY_PATTERNS.some((d) => norm.startsWith(d) || norm.includes("/" + d));
}

let coreCache: string | null = null;

/** Tier-1 çekirdek beyni döndürür (cache'li). Sistem prompt'a enjekte edilir. */
export async function loadBrainCore(): Promise<string> {
  if (coreCache !== null) return coreCache;
  await ensureKnowledgeLoaded();
  const parts: string[] = [];
  for (const rel of [...PERSONA_FILES, ...CORE_FILES]) {
    if (isDenied(rel)) continue;
    const content = readKnowledgeSync(rel);
    if (content && content.trim().length > 0) {
      parts.push(`### ${rel}\n${content.trim()}`);
    }
  }
  coreCache = parts.join("\n\n---\n\n");
  return coreCache;
}

/** İhtiyaç anında tek bir knowledge dosyasını okur (örn. içerik için X-persona). */
export async function loadBrainFile(rel: string): Promise<string | null> {
  if (isDenied(rel)) return null;
  await ensureKnowledgeLoaded();
  return readKnowledgeSync(rel);
}

/** Cache'i temizler (knowledge güncellenince). */
export function clearBrainCache(): void {
  coreCache = null;
}
