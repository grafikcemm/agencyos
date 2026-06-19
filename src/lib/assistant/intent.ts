// ─────────────────────────────────────────────────────────────────────────────
// Mesaj intent sınıflandırıcı — taahhüt state-machine'inin her serbest metni
// "günlük taahhüt" sanmasını engeller (ör. "Selam" → taahhüt OLMAZ).
//
// Deterministik heuristik (LLM YOK) → hızlı, ucuz, test edilebilir.
// route.ts default case bunu taahhüt-yakalama guard'ı olarak kullanır.
// ─────────────────────────────────────────────────────────────────────────────

export type MessageIntent =
  | 'command'             // "/plan" gibi slash komut
  | 'greeting'            // "selam", "merhaba", "günaydın", "nasılsın"
  | 'meta'                // "ne yapabilirsin", "kimsin", "yeteneklerin"
  | 'question'            // soru (taahhüt değil)
  | 'commitment_candidate'// gerçek bir taahhüt/eylem cümlesi
  | 'smalltalk'           // kısa, taahhüt olmayan sohbet

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ş/g, 's')
    .replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .trim()
}

// Tek başına selamlama (opsiyonel "cem"/"abi" + noktalama ile).
const GREETING_RE =
  /^(selam(lar)?|merhaba|mrb|sa|selamun aleykum|gunaydin|iyi gunler|iyi aksamlar|iyi geceler|hey+|naber|ne haber|nasilsin|nasilsiniz|napiyorsun|napiyon|hello|hi)\b[\s,!.]*(cem|abi|kanka|dostum)?[\s,!.?]*$/

// Yetenek/meta sorular.
const META_RE =
  /(ne yapabilirsin|neler yapabilirsin|yeteneklerin|ne ise yararsin|nasil kullanilir|komutlar|kimsin|sen kimsin|sen nesin|yardim et|yardim$|\/yardim|nelere bakabilirsin)/

// Soru kelimeleri (cümle başı) + soru işareti.
const QUESTION_WORD_RE =
  /^(ne|neden|niye|nasil|kim|kac|kacta|hangi|nerede|nereye|ne zaman|mi|mu|mı|mü)\b/

// Taahhüt/gelecek-eylem ipuçları (Türkçe): "-acagim/-ecegim", yaygın fiiller.
const COMMITMENT_CUE_RE =
  /(acag[iı]m|ecegim|aca[gğ][iı]m|ece[gğ]im|yapacam|edecem|bitirecegim|bitirecem|hallederim|yapar[iı]m|yapacag[iı]m|tamamlayacagim|gidecegim|cal[iı]sacagim|yazacagim|cekecegim|arayacagim)\b/

export function classifyMessageIntent(text: string): MessageIntent {
  const raw = (text ?? '').trim()
  if (!raw) return 'smalltalk'
  const norm = normalize(raw)

  if (raw.startsWith('/')) return 'command'
  if (META_RE.test(norm)) return 'meta'
  if (GREETING_RE.test(norm)) return 'greeting'

  const isQuestion = raw.includes('?') || QUESTION_WORD_RE.test(norm)
  if (isQuestion) return 'question'

  const wordCount = norm.split(/\s+/).filter(Boolean).length

  // Net taahhüt ipucu → kesin commitment.
  if (COMMITMENT_CUE_RE.test(norm)) return 'commitment_candidate'

  // Yeterince uzun, bildirim cümlesi (soru/komut/selam değil) → taahhüt adayı.
  if (wordCount >= 3 || raw.length >= 14) return 'commitment_candidate'

  // Kısa, taahhüt olmayan kalıntı → sohbet.
  return 'smalltalk'
}
