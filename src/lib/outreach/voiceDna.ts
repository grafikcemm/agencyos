// ─────────────────────────────────────────────────────────────────────────────
// Voice DNA v0 (Faz D1) — kullanıcının ONAYLADIĞI düzenlemelerden öğrenme.
//
// Kaynak: request-send'e gelen finalBody (operatörün düzenlediği hali) vs
// taslağın original body'si. Operatörün SİLDİĞİ cümle/ifadeler "aday yasak
// ifade" olarak sayılır (occurrence tabanlı — memory governance deseni).
//
// KURALLAR:
// - Salt model çıktısı ASLA "kullanıcının sesi" olarak öğrenilmez — yalnız
//   operatör düzenlemesinin SİLDİKLERİ sayılır.
// - Otomatik yasaklama YOK: occurrence >= PROMOTE_THRESHOLD adaylar operatör
//   onayıyla (ayarlar) 'voice_banned_phrases' listesine taşınır; lint yalnız
//   ONAYLI listeyi uygular.
// - Depo: settings key/value (yeni migration YOK):
//     voice_banned_phrases   → JSON string[] (onaylı)
//     voice_phrase_candidates→ JSON {phrase: {count, lastSeen}}
// - PII taşımamak için aday ifadeler 100 karakterle sınırlı ve e-posta/telefon
//   içerenler atlanır.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '@/lib/supabase'

export const PROMOTE_THRESHOLD = 3
const MAX_CANDIDATES = 60
const MIN_PHRASE_LEN = 8
const MAX_PHRASE_LEN = 100

function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ş/g, 's')
    .replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/\s+/g, ' ')
    .trim()
}

function containsPii(s: string): boolean {
  return /@|https?:\/\/|<pii>|\+?\d[\d\s-]{7,}/.test(s)
}

/** Cümle/parça bölme: nokta, soru, ünlem, satır sonu.
 *  E-posta/URL önce maskelenir — içlerindeki nokta cümleyi yanlış bölüp
 *  PII'nin yarısını 'temiz parça' gibi sızdırmasın. */
function splitPhrases(text: string): string[] {
  return text
    .replace(/\S+@\S+|https?:\/\/\S+/g, ' <pii> ')
    .split(/[.!?\n]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= MIN_PHRASE_LEN && p.length <= MAX_PHRASE_LEN)
}

/**
 * SAF fonksiyon: original'de olup final'de OLMAYAN ifadeler (operatörün sildikleri).
 * Fold'lanmış karşılaştırma — küçük yazım farkları silme sayılmaz.
 */
export function extractRemovedPhrases(originalBody: string, finalBody: string): string[] {
  const finalFolded = fold(finalBody)
  const seen = new Set<string>()
  const out: string[] = []
  for (const phrase of splitPhrases(originalBody)) {
    const f = fold(phrase)
    if (!f || seen.has(f)) continue
    seen.add(f)
    if (containsPii(phrase)) continue
    if (!finalFolded.includes(f)) out.push(phrase)
  }
  return out
}

async function readSetting(key: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  return (data?.value as string) ?? null
}

async function writeSetting(key: string, value: string): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('settings')
    .select('id')
    .eq('key', key)
    .maybeSingle()
  if (existing) {
    await supabaseAdmin
      .from('settings')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    await supabaseAdmin.from('settings').insert({ key, value })
  }
}

/** Onaylı yasak ifadeler — lint yalnız bunu uygular. */
export async function getBannedPhrases(): Promise<string[]> {
  try {
    const raw = await readSetting('voice_banned_phrases')
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

export interface PhraseCandidate {
  phrase: string
  count: number
  lastSeen: string
  /** true → operatör onayına hazır (occurrence >= eşik). */
  readyForReview: boolean
}

export async function getPhraseCandidates(): Promise<PhraseCandidate[]> {
  try {
    const raw = await readSetting('voice_phrase_candidates')
    const parsed = (raw ? JSON.parse(raw) : {}) as Record<string, { count: number; lastSeen: string }>
    return Object.entries(parsed)
      .map(([phrase, v]) => ({
        phrase,
        count: v.count ?? 0,
        lastSeen: v.lastSeen ?? '',
        readyForReview: (v.count ?? 0) >= PROMOTE_THRESHOLD,
      }))
      .sort((a, b) => b.count - a.count)
  } catch {
    return []
  }
}

/**
 * Operatör düzenlemesinden öğren (best-effort — outreach akışını asla düşürmez).
 * Silinen ifadelerin sayacını artırır; hiçbir şeyi otomatik yasaklamaz.
 */
export async function recordVoiceDelta(originalBody: string, finalBody: string): Promise<number> {
  try {
    const removed = extractRemovedPhrases(originalBody, finalBody)
    if (!removed.length) return 0
    const raw = await readSetting('voice_phrase_candidates')
    const map = (raw ? JSON.parse(raw) : {}) as Record<string, { count: number; lastSeen: string }>
    const nowIso = new Date().toISOString()
    for (const phrase of removed) {
      const key = phrase.slice(0, MAX_PHRASE_LEN)
      const prev = map[key]
      map[key] = { count: (prev?.count ?? 0) + 1, lastSeen: nowIso }
    }
    // Sınırla: en çok görülen MAX_CANDIDATES aday tutulur.
    const trimmed = Object.fromEntries(
      Object.entries(map)
        .sort((a, b) => (b[1].count ?? 0) - (a[1].count ?? 0))
        .slice(0, MAX_CANDIDATES),
    )
    await writeSetting('voice_phrase_candidates', JSON.stringify(trimmed))
    return removed.length
  } catch {
    return 0
  }
}

/** Operatör onayı: adayı onaylı yasak listeye taşır (tek yönlü, açık eylem). */
export async function approveBannedPhrase(phrase: string): Promise<void> {
  const banned = await getBannedPhrases()
  if (!banned.includes(phrase)) {
    banned.push(phrase)
    await writeSetting('voice_banned_phrases', JSON.stringify(banned))
  }
}
