// ─────────────────────────────────────────────────────────────────────────────
// Knowledge Store — asistan beyninin runtime kaynağı.
//
// Lokal `knowledge/` klasörü gitignore'da (kişisel veri public repoya gitmez).
// Prod'da (Vercel) bu dosyalar repo'da YOK → bu yüzden knowledge içeriği
// Supabase `assistant_knowledge` tablosundan okunur (service-role, RLS kapalı).
//
// Strateji:
//   1) Supabase'ten tüm satırları bir kez çek → in-memory cache (eager preload).
//   2) Senkron okuyucular (loadKnowledgeContext / buildDynamicSystemPrompt) cache'ten okur.
//   3) Cache boşsa (lokal dev, tablo seed edilmemiş) → fs fallback (knowledge/ klasörü).
//
// Seed: `node --env-file=.env scripts/seed-knowledge.mjs`
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { lifeSupabaseAdmin as supabaseAdmin } from "@/lib/lifeSupabaseAdmin";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");

let cache: Map<string, string> | null = null;
let loadPromise: Promise<void> | null = null;

function norm(rel: string): string {
  return rel.replace(/\\/g, "/");
}

/** Supabase'ten knowledge satırlarını cache'e yükler (idempotent, tek sefer). */
export function ensureKnowledgeLoaded(): Promise<void> {
  if (cache) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const { data, error } = await supabaseAdmin
        .from("assistant_knowledge")
        .select("rel, content");
      if (!error && data && data.length > 0) {
        const m = new Map<string, string>();
        for (const row of data as Array<{ rel: string; content: string }>) {
          m.set(norm(row.rel), row.content);
        }
        cache = m;
      }
      // error veya boş veri → cache null kalır, fs fallback devreye girer.
    } catch {
      // Supabase erişilemez → fs fallback.
    } finally {
      loadPromise = null;
    }
  })();
  return loadPromise;
}

/** Cache yüklü mü (Supabase'ten doldu mu)? */
function hasCache(): boolean {
  return cache !== null && cache.size > 0;
}

function readFsSync(rel: string): string | null {
  try {
    const full = path.normalize(path.join(KNOWLEDGE_DIR, norm(rel)));
    if (!full.startsWith(KNOWLEDGE_DIR)) return null; // path-traversal koruması
    if (!fs.existsSync(full)) return null;
    if (fs.statSync(full).isDirectory()) return null;
    return fs.readFileSync(full, "utf8");
  } catch {
    return null;
  }
}

/**
 * Tek bir knowledge dosyasını senkron okur.
 * Cache (Supabase) varsa oradan; yoksa fs fallback.
 */
export function readKnowledgeSync(rel: string): string | null {
  const key = norm(rel);
  if (hasCache()) {
    return cache!.get(key) ?? null;
  }
  return readFsSync(key);
}

/**
 * Bir klasör (prefix) altındaki tüm dosya rel-key'lerini döndürür.
 * Cache varsa cache key'lerinden; yoksa fs readdir fallback.
 */
export function listKnowledgeKeysSync(prefix: string): string[] {
  const p = norm(prefix).replace(/\/$/, "");
  if (hasCache()) {
    const out: string[] = [];
    for (const k of cache!.keys()) {
      if (k === p || k.startsWith(p + "/")) out.push(k);
    }
    return out.sort();
  }
  // fs fallback — prefix bir klasörse içindeki md/txt dosyaları.
  try {
    const dir = path.normalize(path.join(KNOWLEDGE_DIR, p));
    if (!dir.startsWith(KNOWLEDGE_DIR) || !fs.existsSync(dir)) return [];
    if (!fs.statSync(dir).isDirectory()) return [p];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".md") || f.endsWith(".txt"))
      .map((f) => `${p}/${f}`)
      .sort();
  } catch {
    return [];
  }
}

/** Cache'i temizler (seed sonrası / knowledge güncellenince). */
export function clearKnowledgeCache(): void {
  cache = null;
  loadPromise = null;
}

// Eager preload — modül yüklendiğinde Supabase'ten çekmeyi başlat.
// Senkron okuyucular ilk isteğe kadar cache'in dolmasına fırsat verir.
void ensureKnowledgeLoaded();
