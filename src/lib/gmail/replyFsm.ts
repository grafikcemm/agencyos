// ─────────────────────────────────────────────────────────────────────────────
// Inbound cevap sınıflandırma FSM'i (FINALIZATION Faz 7) — DETERMİNİSTİK.
//
// Sınıflar ve zorunlu yan etkiler (ingest uygular):
//   opt_out           → suppression + do_not_contact + TÜM açık follow-up iptal
//   positive_interest → lead 'responded' + açık follow-up iptal (cevap geldi)
//   objection         → lead 'responded' + follow-up iptal (insan devralır)
//   not_now           → lead 'responded' + follow-up iptal (insan yeniden planlar)
//   auto_reply        → HİÇBİR mutasyon (out-of-office follow-up'ı durdurmaz)
//   other             → lead 'responded' + follow-up iptal (güvenli varsayılan:
//                       gerçek insan cevabına otomatik takip GÖNDERİLMEZ)
//
// LLM YOK — kelime kalıpları açık ve test edilebilir. Model-judge katmanı
// pilotta ayrı değerlendirme olarak eklenebilir (karar mercii yine insan).
// ─────────────────────────────────────────────────────────────────────────────

export type ReplyClass =
  | 'opt_out'
  | 'positive_interest'
  | 'objection'
  | 'not_now'
  | 'auto_reply'
  | 'other'

function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ş/g, 's')
    .replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u')
}

const OPT_OUT_PATTERNS = [
  /\bret\b/,
  /listeden cik/,
  /abonelik(ten)? iptal/,
  /unsubscribe/,
  /bir daha (mail|e-?posta) (atma|gonderme)/,
  /rahatsiz etmeyin/,
]

const AUTO_REPLY_PATTERNS = [
  /out of office/,
  /ofis disinda/,
  /otomatik (yanit|cevap)/,
  /auto-?reply/,
  /yillik izin/,
  /tatilde(yim)?/,
]

const POSITIVE_PATTERNS = [
  /fiyat/,
  /teklif/,
  /detay/,
  /gorusme|gorusebilir|goruselim/,
  /uygun(um)?\b/,
  /ilgilen(iyorum|iriz)/,
  /arar misiniz|arayin/,
  /randevu/,
]

const NOT_NOW_PATTERNS = [
  /daha sonra/,
  /simdi degil/,
  /sonraki (ay|hafta|donem)/,
  /(\d+\s*(ay|hafta))\s*sonra/,
  /yogunuz|yogunum/,
]

const OBJECTION_PATTERNS = [
  /pahali/,
  /butce(miz)? yok/,
  /ihtiyac(imiz)? yok/,
  /zaten (var|calisiyoruz|anlasmaliyiz)/,
  /baska (bir )?(firma|ajans)/,
  /memnunuz/,
]

export function classifyReply(text: string): ReplyClass {
  const t = fold(text ?? '')
  if (!t.trim()) return 'other'
  // Sıra ÖNEMLİ: opt-out her şeyi ezer; auto-reply mutasyonsuzdur.
  if (OPT_OUT_PATTERNS.some((p) => p.test(t))) return 'opt_out'
  if (AUTO_REPLY_PATTERNS.some((p) => p.test(t))) return 'auto_reply'
  if (OBJECTION_PATTERNS.some((p) => p.test(t))) return 'objection'
  if (NOT_NOW_PATTERNS.some((p) => p.test(t))) return 'not_now'
  if (POSITIVE_PATTERNS.some((p) => p.test(t))) return 'positive_interest'
  return 'other'
}

/** Sınıf → mutasyon kararı (ingest bu karara göre davranır). */
export function replyEffects(cls: ReplyClass): {
  suppress: boolean
  markResponded: boolean
  cancelFollowups: boolean
} {
  if (cls === 'opt_out') return { suppress: true, markResponded: true, cancelFollowups: true }
  if (cls === 'auto_reply') return { suppress: false, markResponded: false, cancelFollowups: false }
  return { suppress: false, markResponded: true, cancelFollowups: true }
}
