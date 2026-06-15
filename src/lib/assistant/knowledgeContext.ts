// ─────────────────────────────────────────────────────────────────────────────
// Knowledge context loader (senkron — buildDynamicSystemPrompt korunur).
//
// İçerik knowledgeStore üzerinden gelir: prod'da Supabase `assistant_knowledge`,
// lokalde fs fallback. Senkron okuma; eager preload cache'i doldurur
// (bkz. knowledgeStore.ensureKnowledgeLoaded — async entry'lerde await edilir).
// ─────────────────────────────────────────────────────────────────────────────
import { readKnowledgeSync, listKnowledgeKeysSync } from "@/lib/assistant/knowledgeStore";

type KnowledgeCategory =
  | 'profile'
  | 'mentor'
  | 'nutrition'
  | 'finance'
  | 'business'
  | 'content'
  | 'private';

const CATEGORY_MAP: Record<KnowledgeCategory, string[]> = {
  private:   ['private/PRIVATE_DATA_RULES.md', 'personal/CHARACTER_PROFILE.md'],
  profile:   ['USER_PROFILE.md', 'Rol ve Persona.txt', 'ALİ CEM KİŞİSEL MENTÖR.txt'],
  mentor:    ['ALİ CEM KİŞİSEL MENTÖR.txt', 'PROMPT_STYLE_GUIDE.md', 'SYSTEMS_CONTEXT.md'],
  nutrition: ['health/NUTRITION_CONTEXT.md', 'health/HEALTH_NOTES_TEMPLATE.md'],
  finance:   ['finance'],
  business:  ['BUSINESS_MODEL.md', 'GRAFIKCEM_BRAND.md', 'PRICING_RULES.md'],
  content:   ['content', 'INSTAGRAM_CONTEXT.md'],
};

/**
 * Tek bir rel-path'i okur. Dosyaysa içeriğini, klasörse altındaki
 * tüm dosyaların birleşimini döndürür. Bulunamazsa boş string.
 */
function readEntry(relPath: string): string {
  const norm = relPath.replace(/[/\\]+/g, "/").replace(/\/$/, "");

  // Doğrudan dosya?
  const direct = readKnowledgeSync(norm);
  if (direct !== null) return direct;

  // Klasör → altındaki md/txt dosyalarını birleştir.
  const keys = listKnowledgeKeysSync(norm).filter((k) => k !== norm);
  if (keys.length > 0) {
    return keys
      .map((k) => readKnowledgeSync(k) ?? "")
      .filter((c) => c.trim().length > 0)
      .join("\n\n");
  }

  return "";
}

/**
 * Load knowledge context for assistant prompts.
 * private/profile always loaded first — explicit user prefs override template defaults.
 */
export function loadKnowledgeContext(
  categories: KnowledgeCategory[] = ['profile', 'mentor', 'nutrition']
): string {
  const orderedCategories: KnowledgeCategory[] = [
    'private',
    'profile',
    ...categories.filter(c => c !== 'private' && c !== 'profile'),
  ];

  const seen = new Set<string>();
  const parts: string[] = [];

  for (const cat of orderedCategories) {
    const files = CATEGORY_MAP[cat] ?? [];
    for (const f of files) {
      if (seen.has(f)) continue;
      seen.add(f);
      const content = readEntry(f);
      if (content.trim()) parts.push(content.trim());
    }
  }

  return parts.join('\n\n---\n\n');
}

export function loadNutritionContext(): string {
  return loadKnowledgeContext(['profile', 'nutrition']);
}
