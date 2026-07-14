// ─────────────────────────────────────────────────────────────────────────────
// Telegram → AgencyOS satış komut parser'ı (Faz B5/B6).
//
// KRİTİK SIRA KURALI: webhook bu parser'ı hayat-asistanı intent'lerinden ve
// taahhüt (commitment) yakalayıcısından ÖNCE çalıştırır. Böylece
// "cold email hazırla", "Klinik X arandı", "bugün kimi arayayım?" gibi satış
// komutları ASLA taahhüt olarak kaydedilmez.
//
// Deterministik regex — LLM yok. Tanınmayan mesaj null döner (hayat akışına düşer).
// ─────────────────────────────────────────────────────────────────────────────

export type SalesCommand =
  | { type: 'sales_today' }
  | { type: 'sales_calls' }
  | { type: 'sales_drafts' }
  | { type: 'sales_followups' }
  | { type: 'sales_issues' }
  | { type: 'sales_pipeline' }
  | { type: 'lead_action'; action: 'called' | 'no_answer' | 'meeting' | 'later' | 'note'; leadName: string; note?: string; timeHint?: string }
  | { type: 'prepare_draft'; kind: 'cold_email' | 'follow_up'; leadName: string | null }
  | { type: 'show_proposals'; leadName: string | null }
  // FINALIZATION Faz 5 — web kokpitiyle parity komutları:
  | { type: 'draft_status'; leadName: string | null }
  | { type: 'request_send_approval'; leadName: string }
  | { type: 'create_proposal'; leadName: string }
  | { type: 'show_reconcile' }
  // FINAL PILOT BLOCKERS Faz 6 — imzalı satış aksiyonları (kod'lu teyit):
  | { type: 'confirm_action'; code: string }
  | { type: 'send_draft'; leadName: string }
  | { type: 'approval_decision'; leadName: string; decision: 'approved' | 'rejected' }
  | { type: 'proposal_decision'; leadName: string; decision: 'approved' | 'rejected' }
  | { type: 'reconcile_decision'; leadName: string; confirmNotFound: boolean }
  | { type: 'generic_approve'; raw: string }

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ş/g, 's')
    .replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .trim()
}

const SLASH_COMMANDS: Record<string, SalesCommand> = {
  '/bugun': { type: 'sales_today' },
  '/aranacaklar': { type: 'sales_calls' },
  '/taslaklar': { type: 'sales_drafts' },
  '/takipler': { type: 'sales_followups' },
  '/sorunlar': { type: 'sales_issues' },
  '/pipeline': { type: 'sales_pipeline' },
  '/teklifler': { type: 'show_proposals', leadName: null },
  '/reconcile': { type: 'show_reconcile' },
}

// "Klinik X arandı" / "arandı Klinik X" — işletme adı + eylem.
const CALLED_RE = /^(.{2,60}?)\s+arandi$|^arandi[:\s]+(.{2,60})$/
const NO_ANSWER_RE = /^(.{2,60}?)\s+(ulasilamadi|ulasamadim|acmadi)$|^(ulasilamadi|ulasamadim)[:\s]+(.{2,60})$/
const MEETING_RE = /^(.{2,60}?)\s+(gorusme oldu|gorustum|gorusme)$|^gorusme[:\s]+(.{2,60})$/
const LATER_RE = /^(.{2,60}?)\s+daha sonra(?:\s+ara)?(?:\s+(.+))?$/
const NOTE_RE = /^(.{2,60}?)\s+not[:\s]+(.+)$/

const PREPARE_COLD_RE = /(cold\s*email|soguk\s*e?-?posta|soguk\s*mail)\s*(hazirla|yaz|olustur|taslagi)/
const PREPARE_FOLLOWUP_RE = /(follow[\s-]?up|takip\s*maili?)\s*(hazirla|yaz|olustur)/
const SHOW_PROPOSALS_RE = /teklif(ler)?i?n?i?\s*(goster|listele|neler)/
const CREATE_PROPOSAL_RE = /teklif\s*(hazirla|olustur)/
const DRAFT_STATUS_RE = /taslak\s*durum(u|unu)?(\s*goster)?/
const REQUEST_APPROVAL_RE = /onaya\s*al/
const RECONCILE_RE = /^(reconcile|belirsizler|bekleyen sorunlar)$/
const WHO_TO_CALL_RE = /(bugun\s+)?kimi\s+aray[a-z]*|aranacaklar(i)?\s*(kim|goster|listele)?$/
// Faz 6 — imzalı aksiyon regexleri (SIRA: confirm > lead-scoped > generic).
// Kod alfabesi 0/O/1/I hariç; küçük-harf normalise sonrası [a-z2-9]{6}.
const CONFIRM_CODE_RE = /^onayla\s+([a-z2-9]{6})$/
const SEND_DRAFT_RE = /^(.{2,60}?)\s+g[oö]nder$/
const DRAFT_APPROVE_RE = /^(.{2,60}?)\s+taslak\s*(onayla|reddet)$/
const PROPOSAL_DECISION_RE = /^(.{2,60}?)\s+teklif\s*(onayla|reddet)$/
const RECONCILE_DECISION_RE = /^(.{2,60}?)\s+(gonderildi|gonderilmedi)$/
const GENERIC_APPROVE_RE = /^(onayla|onay|gonder|evet gonder|send)$/

/** İşletme adını komut kalıntılarından arındırır. */
function cleanLeadName(raw: string | undefined): string {
  return (raw ?? '').replace(/^["']|["']$/g, '').trim()
}

/**
 * Satış komutu mu? Null → satış değil, hayat-asistanı akışına düşsün.
 * NOT: bu fonksiyon webhook'ta taahhüt yakalayıcısından ÖNCE çağrılır.
 */
export function parseSalesCommand(text: string): SalesCommand | null {
  const raw = text.trim()
  const lower = raw.toLowerCase()
  const norm = normalise(raw)

  const slash = SLASH_COMMANDS[lower]
  if (slash) return slash

  // Faz 6 — imzalı aksiyonlar generic'ten ÖNCE (spesifik kazanır).
  const confirmM = norm.match(CONFIRM_CODE_RE)
  if (confirmM) return { type: 'confirm_action', code: confirmM[1] }

  let sm = norm.match(DRAFT_APPROVE_RE)
  if (sm) {
    return {
      type: 'approval_decision',
      leadName: extractOriginal(raw, sm[1]),
      decision: sm[2] === 'onayla' ? 'approved' : 'rejected',
    }
  }
  sm = norm.match(PROPOSAL_DECISION_RE)
  if (sm) {
    return {
      type: 'proposal_decision',
      leadName: extractOriginal(raw, sm[1]),
      decision: sm[2] === 'onayla' ? 'approved' : 'rejected',
    }
  }
  sm = norm.match(RECONCILE_DECISION_RE)
  if (sm) {
    return {
      type: 'reconcile_decision',
      leadName: extractOriginal(raw, sm[1]),
      confirmNotFound: sm[2] === 'gonderilmedi',
    }
  }
  sm = norm.match(SEND_DRAFT_RE)
  if (sm) return { type: 'send_draft', leadName: extractOriginal(raw, sm[1]) }

  if (GENERIC_APPROVE_RE.test(norm)) return { type: 'generic_approve', raw }

  if (WHO_TO_CALL_RE.test(norm)) return { type: 'sales_calls' }
  if (RECONCILE_RE.test(norm)) return { type: 'show_reconcile' }

  // FINALIZATION Faz 5 — sıralama önemli: 'X için teklif hazırla' göster'den önce.
  if (CREATE_PROPOSAL_RE.test(norm)) {
    const m = raw.match(/^(.{2,60}?)\s+i[cç]in\s+/i)
    const name = cleanLeadName(m?.[1])
    if (name) return { type: 'create_proposal', leadName: name }
    return { type: 'create_proposal', leadName: '' }
  }
  if (SHOW_PROPOSALS_RE.test(norm)) {
    // 'X tekliflerini göster' → lead adı; yalnız 'teklifleri göster' → global.
    const m = norm.match(/^(.{2,60}?)\s+teklif/)
    return { type: 'show_proposals', leadName: m ? extractOriginal(raw, m[1]) : null }
  }
  if (DRAFT_STATUS_RE.test(norm)) {
    const m = norm.match(/^(.{2,60}?)\s+taslak/)
    return { type: 'draft_status', leadName: m ? extractOriginal(raw, m[1]) : null }
  }
  if (REQUEST_APPROVAL_RE.test(norm)) {
    const m = norm.match(/^(.{2,60}?)\s+onaya\s*al/)
    const name = m ? extractOriginal(raw, m[1]) : ''
    if (name) return { type: 'request_send_approval', leadName: name }
    return { type: 'request_send_approval', leadName: '' }
  }

  if (PREPARE_COLD_RE.test(norm)) {
    // "X için cold email hazırla" → lead adını "için"den önce al.
    const m = raw.match(/^(.{2,60}?)\s+i[cç]in\s+/i)
    return { type: 'prepare_draft', kind: 'cold_email', leadName: cleanLeadName(m?.[1]) || null }
  }
  if (PREPARE_FOLLOWUP_RE.test(norm)) {
    const m = raw.match(/^(.{2,60}?)\s+i[cç]in\s+/i)
    return { type: 'prepare_draft', kind: 'follow_up', leadName: cleanLeadName(m?.[1]) || null }
  }

  // Satır aksiyonları — normalize edilmiş metinde eşleş, adı ORİJİNAL metinden çek
  // (Türkçe karakterler işletme adında korunmalı).
  let m = norm.match(NOTE_RE)
  if (m) {
    const nameNorm = m[1]
    return {
      type: 'lead_action',
      action: 'note',
      leadName: extractOriginal(raw, nameNorm),
      note: raw.slice(raw.toLowerCase().indexOf('not') + 3).replace(/^[:\s]+/, '').trim(),
    }
  }
  m = norm.match(CALLED_RE)
  if (m) return { type: 'lead_action', action: 'called', leadName: extractOriginal(raw, m[1] ?? m[2]) }
  m = norm.match(NO_ANSWER_RE)
  if (m) return { type: 'lead_action', action: 'no_answer', leadName: extractOriginal(raw, m[1] ?? m[4]) }
  m = norm.match(MEETING_RE)
  if (m) return { type: 'lead_action', action: 'meeting', leadName: extractOriginal(raw, m[1] ?? m[3]) }
  m = norm.match(LATER_RE)
  if (m && /daha sonra/.test(norm)) {
    return { type: 'lead_action', action: 'later', leadName: extractOriginal(raw, m[1]), timeHint: m[2]?.trim() }
  }

  return null
}

/** Normalize edilmiş ad parçasının orijinal (Türkçe karakterli) karşılığını döner. */
function extractOriginal(raw: string, normPart: string | undefined): string {
  if (!normPart) return ''
  const len = normPart.trim().length
  // normalise uzunluk-korur (1:1 karakter map) → aynı offset'ten kes.
  const idx = normalise(raw).indexOf(normPart.trim())
  if (idx < 0) return cleanLeadName(normPart)
  return cleanLeadName(raw.slice(idx, idx + len))
}
