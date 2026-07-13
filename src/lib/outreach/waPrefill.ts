// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp prefill kalite kapısı (Faz 2.1) — client-safe, SAF.
//
// Harita/LeadDrawer, DOĞRULANMAMIŞ first_message'ı wa.me?text= içine koyamaz.
// Aynı deterministik lint (qualityLint) burada da kapıdır. Client'ta evidence
// bağı DOĞRULANAMAZ → evidenceIds=[] ile koşulur: sayı/başarı/gözlem iddiası
// taşıyan metinler FAIL-CLOSED bloklanır (kanıt bağıyla gönderim kokpitten).
// Lint geçmezse link yalnız sohbeti açar (metinsiz) + neden kullanıcıya görünür.
// ─────────────────────────────────────────────────────────────────────────────

import { lintOutreachDraft } from './qualityLint'

export interface WaPrefillResult {
  /** Lint'i geçtiyse encode edilmemiş metin; geçmediyse null (metinsiz link). */
  text: string | null
  /** null değilse: prefill'in neden bloklandığının kısa, kullanıcıya gösterilebilir nedeni. */
  blockedReason: string | null
}

export function gateWaPrefill(input: {
  firstMessage: string | null | undefined
  businessName: string
}): WaPrefillResult {
  const msg = (input.firstMessage ?? '').trim()
  if (!msg) return { text: null, blockedReason: null }

  const lint = lintOutreachDraft({
    subject: null,
    body: msg,
    businessName: input.businessName,
    evidenceIds: [], // client'ta kanıt bağı doğrulanamaz → iddialar bloklanır
    bannedPhrases: [],
    channel: 'whatsapp',
  })
  if (lint.ok) return { text: msg, blockedReason: null }
  const first = lint.violations[0]
  return {
    text: null,
    blockedReason: `Kalite kapısı: ${first.code} — ${first.detail}. Doğrulanmış taslak için kokpiti kullan.`,
  }
}

/** wa.me URL'si — metin yalnız kapıdan geçtiyse eklenir. */
export function buildWaHref(phoneDigits: string, prefill: WaPrefillResult): string {
  return `https://wa.me/${phoneDigits}${prefill.text ? `?text=${encodeURIComponent(prefill.text)}` : ''}`
}
