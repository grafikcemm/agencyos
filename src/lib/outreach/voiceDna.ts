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

// Sprint-3 Faz 3.5: Supabase read/write hataları YUTULMAZ — hata görünür throw
// olur; "okunamadı" ile "kayıt yok" ayrıdır. Kapı çağıranları throw'u zaten
// fail-closed işler (onay oluşmaz / gönderim yürümez).
async function readSetting(key: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  if (error) throw new Error(`settings okunamadı (${key}): ${error.message}`)
  return (data?.value as string) ?? null
}

async function writeSetting(key: string, value: string): Promise<void> {
  const { data: existing, error: readErr } = await supabaseAdmin
    .from('settings')
    .select('id')
    .eq('key', key)
    .maybeSingle()
  if (readErr) throw new Error(`settings okunamadı (${key}): ${readErr.message}`)
  if (existing) {
    const { error } = await supabaseAdmin
      .from('settings')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw new Error(`settings yazılamadı (${key}): ${error.message}`)
  } else {
    const { error } = await supabaseAdmin.from('settings').insert({ key, value })
    if (error) throw new Error(`settings yazılamadı (${key}): ${error.message}`)
  }
}

/**
 * Onaylı yasak ifadeler — lint yalnız bunu uygular.
 * Faz 3.6: OKUNAMAZSA THROW — outbound kalite kapısı fail-closed davranır
 * (okuma hatası ASLA "yasak liste boş" gibi fail-open sonuç üretmez).
 * Kayıt yoksa veya değer bozuksa-ama-okunabildiyse: bozuk değer de güvensizdir → throw.
 */
export async function getBannedPhrases(): Promise<string[]> {
  const raw = await readSetting('voice_banned_phrases') // hata → throw (fail-closed)
  if (!raw) return [] // kayıt yok = henüz onaylı yasak ifade tanımlanmamış
  const parsed: unknown = JSON.parse(raw) // bozuk JSON → throw (fail-closed)
  return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
}

export interface PhraseCandidate {
  phrase: string
  count: number
  lastSeen: string
  /** true → operatör onayına hazır (occurrence >= eşik). */
  readyForReview: boolean
}

export async function getPhraseCandidates(): Promise<PhraseCandidate[]> {
  // Hata yutulmaz: UI sahte boş-liste yerine gerçek hatayı görür (Faz 3.5).
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
  } catch (err) {
    // Öğrenme kaydı outreach akışını DÜŞÜRMEZ ama hata da YUTULMAZ — görünür log.
    console.error('[voiceDna] recordVoiceDelta yazılamadı:', err instanceof Error ? err.message : 'unknown')
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

// ── Faz 4.1: YAPISAL stil profili — yalnız silinen ifade değil ───────────────
// Onaylı original→final düzenlemelerinden yapı çıkarılır: açılış biçimi,
// resmiyet, cümle uzunluğu, CTA biçimi, kanıt kullanımı. Sektör varyantı
// opsiyonel anahtarla ayrışır. HİÇBİR kural otomatik aktive OLMAZ:
// candidate → (operatör onayı) → approved → active. Veri sıfırken profil
// 'baseline' etiketlidir — "kullanıcının dili öğrenildi" İDDİA EDİLMEZ.

const FORMAL_MARKERS = /\b(siz|sizin|sizinle|rica|memnun olurum|bey|hanım|hanim)\b/gi
const INFORMAL_MARKERS = /\b(sen|senin|selam|naber|kanka)\b/gi
const CTA_FORMS: Array<{ label: string; re: RegExp }> = [
  { label: 'soru-15dk', re: /15\s*dakika.*(uygun|müsait|musait)/i },
  { label: 'soru-kisa-gorusme', re: /k[ıi]sa bir g[öo]r[üu][şs]me/i },
  { label: 'izin-arama', re: /arayabilir miyim/i },
  { label: 'oneri-gorusme', re: /g[öo]r[üu][şs]elim mi/i },
]
const EVIDENCE_MARKERS = /(inceledim|bakt[ıi]m|fark ettim|g[öo]rd[üu]m|g[öo]r[üu]n[üu]yor)/i

function countMatches(re: RegExp, s: string): number {
  re.lastIndex = 0
  return [...s.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].length
}

function avgSentenceWords(s: string): number {
  const sentences = s.split(/[.!?\n]+/).map((x) => x.trim()).filter((x) => x.length > 3)
  if (!sentences.length) return 0
  const words = sentences.reduce((acc, x) => acc + x.split(/\s+/).length, 0)
  return words / sentences.length
}

export interface StyleDelta {
  /** Operatörün finalde kullandığı açılış parçası (PII'siz, ≤60 kr) — yoksa null. */
  finalOpening: string | null
  /** 1 = final daha resmi, -1 = daha samimi, 0 = fark yok. */
  formalityDelta: -1 | 0 | 1
  sentenceLen: 'shorter' | 'longer' | 'same'
  /** Finalde hayatta kalan CTA biçimi etiketi (yoksa null). */
  ctaForm: string | null
  /** Final kanıt/gözlem dili içeriyor mu (operatör kanıtı korudu/ekledi). */
  keepsEvidence: boolean
}

/** SAF: onaylı düzenlemeden yapısal stil deltası çıkarır. */
export function analyzeStyleDelta(originalBody: string, finalBody: string): StyleDelta {
  const openingRaw = splitPhrases(finalBody)[0] ?? null
  const finalOpening = openingRaw && !containsPii(openingRaw) ? openingRaw.slice(0, 60) : null

  const formalFinal = countMatches(FORMAL_MARKERS, fold(finalBody))
  const informalFinal = countMatches(INFORMAL_MARKERS, fold(finalBody))
  const formalOrig = countMatches(FORMAL_MARKERS, fold(originalBody))
  const informalOrig = countMatches(INFORMAL_MARKERS, fold(originalBody))
  const scoreFinal = formalFinal - informalFinal
  const scoreOrig = formalOrig - informalOrig
  const formalityDelta: -1 | 0 | 1 = scoreFinal > scoreOrig ? 1 : scoreFinal < scoreOrig ? -1 : 0

  const lenOrig = avgSentenceWords(originalBody)
  const lenFinal = avgSentenceWords(finalBody)
  const sentenceLen: StyleDelta['sentenceLen'] =
    lenFinal < lenOrig * 0.85 ? 'shorter' : lenFinal > lenOrig * 1.15 ? 'longer' : 'same'

  const ctaForm = CTA_FORMS.find((c) => c.re.test(finalBody))?.label ?? null
  const keepsEvidence = EVIDENCE_MARKERS.test(finalBody)

  return { finalOpening, formalityDelta, sentenceLen, ctaForm, keepsEvidence }
}

interface StyleObservations {
  total: number
  openings: Record<string, number>
  formality: { formal: number; informal: number; same: number }
  sentenceLen: Record<'shorter' | 'longer' | 'same', number>
  cta: Record<string, number>
  evidenceKept: number
  /** Sektör varyantı: sektör → aynı sayaçların küçültülmüş hâli. */
  sectors: Record<string, { total: number; formality: { formal: number; informal: number; same: number } }>
}

const EMPTY_OBS: StyleObservations = {
  total: 0,
  openings: {},
  formality: { formal: 0, informal: 0, same: 0 },
  sentenceLen: { shorter: 0, longer: 0, same: 0 },
  cta: {},
  evidenceKept: 0,
  sectors: {},
}

async function readObservations(): Promise<StyleObservations> {
  const raw = await readSetting('voice_style_observations') // hata → throw (yutulmaz)
  return raw ? { ...EMPTY_OBS, ...(JSON.parse(raw) as StyleObservations) } : { ...EMPTY_OBS }
}

/** Onaylı düzenlemeden yapısal gözlem biriktir (best-effort; akış düşmez). */
export async function recordStyleDelta(
  originalBody: string,
  finalBody: string,
  sector?: string | null,
): Promise<void> {
  try {
    const d = analyzeStyleDelta(originalBody, finalBody)
    const obs = await readObservations()
    obs.total += 1
    if (d.finalOpening) obs.openings[fold(d.finalOpening)] = (obs.openings[fold(d.finalOpening)] ?? 0) + 1
    const fKey = d.formalityDelta === 1 ? 'formal' : d.formalityDelta === -1 ? 'informal' : 'same'
    obs.formality[fKey] += 1
    obs.sentenceLen[d.sentenceLen] += 1
    if (d.ctaForm) obs.cta[d.ctaForm] = (obs.cta[d.ctaForm] ?? 0) + 1
    if (d.keepsEvidence) obs.evidenceKept += 1
    if (sector) {
      const s = obs.sectors[sector] ?? { total: 0, formality: { formal: 0, informal: 0, same: 0 } }
      s.total += 1
      s.formality[fKey] += 1
      obs.sectors[sector] = s
    }
    await writeSetting('voice_style_observations', JSON.stringify(obs))
  } catch (err) {
    // Akışı düşürmez ama sessiz de kalmaz (Faz 3.5).
    console.error('[voiceDna] recordStyleDelta yazılamadı:', err instanceof Error ? err.message : 'unknown')
  }
}

export interface StyleRuleCandidate {
  rule: string
  polarity: 'positive' | 'negative'
  count: number
  readyForReview: boolean
}

/** Gözlemlerden ADAY kurallar (onaysız hiçbiri aktif değildir). */
export async function getStyleCandidates(): Promise<StyleRuleCandidate[]> {
  const obs = await readObservations()
  const out: StyleRuleCandidate[] = []
  const push = (rule: string, polarity: 'positive' | 'negative', count: number) =>
    out.push({ rule, polarity, count, readyForReview: count >= PROMOTE_THRESHOLD })

  for (const [opening, count] of Object.entries(obs.openings)) {
    if (count >= 2) push(`Açılış biçimi: "${opening}"`, 'positive', count)
  }
  if (obs.formality.formal > 0) push('Daha resmi ton (siz dili)', 'positive', obs.formality.formal)
  if (obs.formality.informal > 0) push('Daha samimi ton', 'positive', obs.formality.informal)
  if (obs.sentenceLen.shorter > 0) push('Daha kısa cümleler', 'positive', obs.sentenceLen.shorter)
  if (obs.sentenceLen.longer > 0) push('Daha uzun/açıklayıcı cümleler', 'positive', obs.sentenceLen.longer)
  for (const [cta, count] of Object.entries(obs.cta)) {
    push(`CTA biçimi: ${cta}`, 'positive', count)
  }
  if (obs.evidenceKept > 0) push('Somut gözlem/kanıt cümlesi korunur', 'positive', obs.evidenceKept)
  return out.sort((a, b) => b.count - a.count)
}

export interface VoiceProfile {
  /** true → hiç onaylı veri yok; profesyonel BASELINE kullanılıyor ("öğrenildi" DENMEZ). */
  baseline: boolean
  observationCount: number
  approved: { positive: string[]; negative: string[] }
  bannedPhrases: string[]
}

export async function getApprovedStyleRules(): Promise<{ positive: string[]; negative: string[] }> {
  // Hata yutulmaz (Faz 3.5): okunamadıysa çağıran bilir; kayıt yoksa boş küme.
  const raw = await readSetting('voice_style_rules')
  const parsed = raw ? (JSON.parse(raw) as { positive?: string[]; negative?: string[] }) : {}
  return { positive: parsed.positive ?? [], negative: parsed.negative ?? [] }
}

/** Operatör onayı: stil kuralını aktif profile taşır (tek yönlü, açık eylem). */
export async function approveStyleRule(rule: string, polarity: 'positive' | 'negative'): Promise<void> {
  const rules = await getApprovedStyleRules()
  const list = rules[polarity]
  if (!list.includes(rule)) {
    list.push(rule)
    await writeSetting('voice_style_rules', JSON.stringify(rules))
  }
}

/** Üretici tarafının tek-noktadan Voice bağlamı: onaylı kurallar + yasaklı
 *  ifadeler. Okuma hatası FIRLATILIR (çağıran degraded bayrağıyla görünür kılar
 *  ya da fail-closed davranır) — sessizce kuralsız üretim YOK. */
export async function getVoiceContext(): Promise<{
  rules: { positive: string[]; negative: string[] }
  banned: string[]
}> {
  const [rules, banned] = await Promise.all([getApprovedStyleRules(), getBannedPhrases()])
  return { rules, banned }
}

/** Üretim tarafının kullanacağı profil — sıfır veri = dürüst baseline. */
export async function getVoiceProfile(): Promise<VoiceProfile> {
  const [rules, banned, obs] = await Promise.all([
    getApprovedStyleRules(),
    getBannedPhrases(),
    readObservations(),
  ])
  const baseline = rules.positive.length === 0 && rules.negative.length === 0
  return { baseline, observationCount: obs.total, approved: rules, bannedPhrases: banned }
}
