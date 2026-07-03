// Kanıt toplayıcı — bir aday için TÜM kanıt türlerini üretir.
// Kaynaklar: Google Places verisi (bedava, elimizde), guard'lı HTML fetch (SSRF korumalı),
// PSI masaüstü audit (metrik + screenshot). Kısmi hata ASLA koşuyu bloklamaz; başarısız
// kaynak sadece kanıt üretmez (uydurma yok → verified_evidence_count doğal düşer).

import { extractSignals, extractEmails } from '../evidenceEngine'
import { guardedFetch } from './urlGuard'
import { runPsiAudit, PsiResult } from './psi'
import type { EvidenceItem } from '../types'

export interface CandidateInput {
  businessName: string
  sector: string
  website: string | null
  phone: string | null
  rating: number | null
  reviewCount: number
  googlePlaceId: string | null
}

const HTML_TIMEOUT_MS = 8000

// Teknoloji izi tespiti — saf, testlenebilir.
export function detectTechStack(html: string): string[] {
  const found: string[] = []
  const checks: Array<[string, RegExp]> = [
    ['wordpress', /wp-content|wp-includes/i],
    ['wix', /wix\.com|wixstatic/i],
    ['squarespace', /squarespace/i],
    ['shopify', /cdn\.shopify|myshopify/i],
    ['godaddy', /godaddy/i],
    ['weebly', /weebly/i],
    ['nextjs', /__next|_next\/static/i],
    ['react', /react-dom|data-reactroot/i],
    ['jquery', /jquery/i],
    ['bootstrap', /bootstrap(\.min)?\.(css|js)/i],
  ]
  for (const [name, re] of checks) if (re.test(html)) found.push(name)
  return found
}

// CTA analizi — saf, testlenebilir.
export function analyzeCtas(html: string): {
  telLinks: number
  waLinks: number
  hasBookingCta: boolean
  ctaWords: string[]
} {
  const telLinks = (html.match(/href=["']tel:/gi) ?? []).length
  const waLinks = (html.match(/wa\.me|api\.whatsapp|whatsapp\.com\/send/gi) ?? []).length
  const lower = html.toLowerCase()
  const hasBookingCta = /randevu al|online randevu|book now|rezervasyon yap/i.test(lower)
  const ctaWords: string[] = []
  for (const w of ['randevu', 'teklif al', 'iletişim', 'hemen ara', 'satın al', 'fiyat al']) {
    if (lower.includes(w)) ctaWords.push(w)
  }
  return { telLinks, waLinks, hasBookingCta, ctaWords }
}

function placesEvidence(c: CandidateInput, now: Date): EvidenceItem[] {
  const items: EvidenceItem[] = [
    {
      kind: 'places_data',
      source: 'google_places',
      url: null,
      summary: `Google kaydı: ${c.businessName} — puan ${c.rating ?? 'yok'}, ${c.reviewCount} yorum, telefon ${c.phone ? 'var' : 'yok'}, web ${c.website ? 'var' : 'yok'}.`,
      payload: {
        rating: c.rating,
        review_count: c.reviewCount,
        has_phone: Boolean(c.phone),
        has_website: Boolean(c.website),
        google_place_id: c.googlePlaceId,
        collected_at: now.toISOString(),
      },
      confidence: 0.9,
      verified: Boolean(c.googlePlaceId),
    },
  ]
  if (c.reviewCount > 0) {
    items.push({
      kind: 'review_signal',
      source: 'google_places',
      url: null,
      summary: `${c.reviewCount} Google yorumu, ortalama ${c.rating ?? '?'} — müşteri mesaj/etkileşim hacmi göstergesi.`,
      payload: { rating: c.rating, review_count: c.reviewCount },
      confidence: 0.85,
      verified: Boolean(c.googlePlaceId),
    })
  }
  return items
}

async function htmlEvidence(c: CandidateInput, now: Date): Promise<EvidenceItem[]> {
  if (!c.website) return []
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HTML_TIMEOUT_MS)
  try {
    const result = await guardedFetch(c.website, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgencyOS/1.0)' },
    })
    if (!result.response || !result.response.ok) {
      const reason = 'blocked' in result ? result.blocked : `HTTP ${result.response?.status}`
      return [
        {
          kind: 'html_signal',
          source: 'html_fetch',
          url: c.website,
          summary: `Site yüklenemedi (${reason}) — ölü/yavaş site sinyali.`,
          payload: { fetch_failed: true, reason },
          confidence: 0.7,
          verified: true, // "yüklenemedi" doğrulanmış bir gözlemdir
        },
      ]
    }

    const html = result.response.body.slice(0, 80_000)
    const signals = extractSignals(html, result.finalUrl, now)
    const emails = extractEmails(html)
    const ctas = analyzeCtas(html)
    const tech = detectTechStack(html)

    const items: EvidenceItem[] = [
      {
        kind: 'html_signal',
        source: 'html_fetch',
        url: result.finalUrl,
        summary: `Site canlı; kalite bandı: ${signals.website_quality_band}. WhatsApp ${signals.has_whatsapp ? 'var' : 'yok'}, form ${signals.has_form ? 'var' : 'yok'}, online randevu ${signals.has_online_booking ? 'var' : 'yok'}.`,
        payload: { ...signals, found_emails: emails.slice(0, 3), html_bytes: html.length },
        confidence: 0.9,
        verified: true,
      },
      {
        kind: 'cta_analysis',
        source: 'html_fetch',
        url: result.finalUrl,
        summary: `CTA: ${ctas.telLinks} tel bağlantısı, ${ctas.waLinks} WhatsApp bağlantısı, rezervasyon CTA ${ctas.hasBookingCta ? 'var' : 'yok'}.`,
        payload: { ...ctas },
        confidence: 0.85,
        verified: true,
      },
      {
        kind: 'form_analysis',
        source: 'html_fetch',
        url: result.finalUrl,
        summary: signals.has_form ? 'Sitede iletişim/randevu formu mevcut.' : 'Sitede form tespit edilemedi — lead yakalama kanalı eksik.',
        payload: { has_form: signals.has_form, has_online_booking: signals.has_online_booking },
        confidence: 0.8,
        verified: true,
      },
    ]
    if (tech.length > 0) {
      items.push({
        kind: 'tech_stack',
        source: 'html_fetch',
        url: result.finalUrl,
        summary: `Teknoloji izi: ${tech.join(', ')}.`,
        payload: { stack: tech },
        confidence: 0.75,
        verified: true,
      })
    }
    return items
  } catch (error) {
    // Ağ hatası → kanıt üretme (uydurma yok), koşuyu düşürme.
    console.warn('[evidenceCollector] HTML fetch hatası:', error instanceof Error ? error.message : error)
    return []
  } finally {
    clearTimeout(timer)
  }
}

// PSI hatası SESSİZCE kaybolmaz: kanıt üretilmez ama not döner → assessment/run
// notlarında gözlemlenebilir (429/timeout/API hatası ayırt edilebilir).
async function psiEvidence(
  c: CandidateInput,
  psiRunner: typeof runPsiAudit,
  notes: string[]
): Promise<EvidenceItem[]> {
  if (!c.website) return []
  let psi: PsiResult
  try {
    psi = await psiRunner(c.website)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'bilinmeyen'
    notes.push(`PSI istisnası (${c.businessName}): ${msg}`)
    console.warn('[evidenceCollector] PSI hatası:', msg)
    return []
  }
  if (!psi.ok || !psi.metrics) {
    notes.push(`PSI başarısız (${c.businessName}): ${psi.error ?? 'metrik yok'} — pagespeed/screenshot kanıtı üretilmedi`)
    return []
  }

  const m = psi.metrics
  const items: EvidenceItem[] = [
    {
      kind: 'pagespeed',
      source: 'psi_v5',
      url: psi.finalUrl ?? c.website,
      summary: `PageSpeed (masaüstü): performans ${m.performanceScore ?? '?'}/100, LCP ${m.lcpMs != null ? Math.round(m.lcpMs) + 'ms' : '?'}, CLS ${m.cls ?? '?'}.`,
      payload: { ...m, strategy: 'desktop' },
      confidence: 0.95,
      verified: true,
    },
  ]
  if (psi.screenshot) {
    items.push({
      kind: 'screenshot',
      source: 'psi_v5',
      url: psi.finalUrl ?? c.website,
      summary: 'Masaüstü final ekran görüntüsü (Lighthouse final-screenshot).',
      payload: { mime: psi.screenshot.mime, strategy: 'desktop' },
      confidence: 0.95,
      verified: true,
      screenshot: psi.screenshot, // geçici — evidenceStore Storage'a yükler, satıra yazmaz
    })
  }
  return items
}

export interface CollectResult {
  items: EvidenceItem[]
  // Gözlemlenebilirlik: PSI/kaynak hataları (sessiz kayıp yok) — assessment/run notlarına akar.
  notes: string[]
}

// Ana giriş: tüm kaynaklar paralel (allSettled), kısmi hata tolere edilir ama NOTLANIR.
export async function collectEvidence(
  candidate: CandidateInput,
  opts: { now?: Date; psiRunner?: typeof runPsiAudit; skipPsi?: boolean } = {}
): Promise<CollectResult> {
  const now = opts.now ?? new Date()
  const psiRunner = opts.psiRunner ?? runPsiAudit
  const notes: string[] = []

  const tasks: Promise<EvidenceItem[]>[] = [
    Promise.resolve(placesEvidence(candidate, now)),
    htmlEvidence(candidate, now),
  ]
  if (!opts.skipPsi) tasks.push(psiEvidence(candidate, psiRunner, notes))

  const settled = await Promise.allSettled(tasks)
  const items: EvidenceItem[] = []
  for (const s of settled) {
    if (s.status === 'fulfilled') items.push(...s.value)
    else notes.push(`Kanıt kaynağı hatası: ${s.reason instanceof Error ? s.reason.message : 'bilinmeyen'}`)
  }
  return { items, notes }
}

export function countVerified(items: EvidenceItem[]): number {
  return items.filter((i) => i.verified).length
}
