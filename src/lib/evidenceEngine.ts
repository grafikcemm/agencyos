// Evidence Engine — website fetch + regex signals. No LLM.
// Called server-side during scan to populate evidence fields on a lead.

import { isEsnafAIFit } from './customerCategory'
import type { WebsiteQualityBand } from './types'

export interface EvidenceSignals {
  has_real_website: boolean
  has_whatsapp: boolean
  has_form: boolean
  has_online_booking: boolean
  has_ads_signal: boolean
  instagram_as_site: boolean
  is_slow_or_dead: boolean
  // Lead'in kendi sitesinde kariyer/işe-alım sinyali → büyüme + kreatif kapasite ihtiyacı.
  has_job_signal: boolean
  // Web sitesi kalite bandı — 'none' (site yok/ölü), 'poor' (var ama kötü tasarım),
  // 'ok'. "Site var ama kötü" sinyali; daha önce hiç yakalanmıyordu.
  website_quality_band: WebsiteQualityBand
  // Sitede sosyal medya (Instagram/FB/TikTok/LinkedIn/X/YouTube) bağlantısı var mı.
  has_social_link: boolean
}

export interface EvidenceResult extends EvidenceSignals {
  why_now: string
  pain_signals: string[]
  proof_points: string[]
  disqualification_reason: string | null
  recommended_offer_id: string
  recommended_offer_name: string
  sales_angle: string
  first_message: string
  next_best_action: string
  confidence: number
  // true when the lead's website HTML was actually fetched and parsed —
  // signals like has_whatsapp/has_form are verified facts only in that case.
  evidence_verified: boolean
  // e-mail found on the lead's website (mailto: or plain text), if any.
  found_email: string | null
}

function isInstagramUrl(url: string): boolean {
  return /instagram\.com/i.test(url)
}

function isSocialOnlyUrl(url: string): boolean {
  return /instagram\.com|facebook\.com|fb\.com|linktr\.ee|linktree/i.test(url)
}

// Junk e-mail patterns: image filenames matched by the regex, CDN/platform
// noise (wix/sentry), and placeholder domains.
const EMAIL_JUNK = /\.(png|jpe?g|gif|webp|svg)$|@(example\.|sentry\.|wixpress\.|placeholder|domain\.com)/i

export function extractEmails(html: string): string[] {
  const found = new Set<string>()
  const mailtoRe = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
  const plainRe = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,})\b/g
  for (const re of [mailtoRe, plainRe]) {
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      const email = m[1].toLowerCase()
      if (!EMAIL_JUNK.test(email) && email.length <= 254) found.add(email)
    }
  }
  // Prefer business-looking addresses (info@, iletisim@, contact@) first.
  return [...found].sort((a, b) => {
    const aBiz = /^(info|iletisim|iletişim|contact|destek|merhaba|hello)@/.test(a) ? 0 : 1
    const bBiz = /^(info|iletisim|iletişim|contact|destek|merhaba|hello)@/.test(b) ? 0 : 1
    return aBiz - bBiz
  })
}

// Sitede sosyal medya bağlantısı işareti.
const SOCIAL_LINK_RE = /instagram\.com|facebook\.com|fb\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com|linkedin\.com/i

// "Site var ama kötü" tespiti — zaten çekilmiş HTML'den, deterministik. ≥2 kötü
// tasarım işareti → 'poor', aksi halde 'ok'. (Site yok/ölü durumu çağıran tarafta
// 'none' olarak ayarlanır; bu fonksiyon yalnız yüklenen siteler için çağrılır.)
// `now` enjekte edilir → telif-yılı işareti testte sabitlenebilir (determinism).
function computeWebsiteQualityBand(html: string, url: string, now: Date): WebsiteQualityBand {
  let bad = 0
  // Mobil değil — viewport meta yok.
  if (!/<meta[^>]+name=["']?viewport/i.test(html)) bad++
  // Eski telif yılı (2'den fazla yıl geride).
  const copyrightMatch = html.match(/(?:©|copyright|telif)[^0-9]{0,12}(20\d{2})/i)
  if (copyrightMatch) {
    const year = parseInt(copyrightMatch[1], 10)
    if (year < now.getFullYear() - 2) bad++
  }
  // Hazır site-builder izi (özelleştirilmemiş şablon sinyali).
  if (/wix\.com|wixstatic|godaddy|weebly|squarespace|webnode|zyrosite/i.test(html)) bad++
  // SSL yok (http-only).
  if (url.startsWith('http://')) bad++
  // Çok küçük sayfa (içerik yok denecek kadar).
  if (html.length < 1500) bad++
  // Doldurulmamış şablon/demo işareti.
  if (/lorem ipsum|template demo|powered by|untitled|default home/i.test(html)) bad++
  return bad >= 2 ? 'poor' : 'ok'
}

export function extractSignals(
  html: string,
  url: string,
  now: Date = new Date(),
): Omit<EvidenceSignals, 'has_ads_signal' | 'is_slow_or_dead'> {
  const lower = html.toLowerCase()

  const has_real_website = !isSocialOnlyUrl(url)
  const instagram_as_site = isSocialOnlyUrl(url)

  const has_whatsapp = /wa\.me|api\.whatsapp|whatsapp\.com\/send|whatsapp/i.test(html)

  const has_form =
    /<form[\s>]/i.test(html) ||
    /iletişim|randevu|form|contact|appointment/i.test(lower)

  const has_online_booking =
    /booking|randevu al|randevu-al|online randevu|reserve|appointment|calendly|setmore|acuityscheduling|booksy|treatwell/i.test(lower)

  // Kariyer/işe-alım sinyali: ekip büyütüyor → kreatif/içerik kapasite ihtiyacı.
  const has_job_signal =
    /kariyer|açık pozisyon|acik pozisyon|ekibimize katıl|ekibimize katil|iş ilan|is ilan|bize katıl|join our team|careers|we['’\s]?re hiring|open position/i.test(lower)

  const has_social_link = SOCIAL_LINK_RE.test(html)
  const website_quality_band = computeWebsiteQualityBand(html, url, now)

  return { has_real_website, has_whatsapp, has_form, has_online_booking, instagram_as_site, has_job_signal, has_social_link, website_quality_band }
}

async function fetchWebsite(url: string, timeoutMs = 4000): Promise<{ html: string; ok: boolean }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgencyOS/1.0)' },
    })
    clearTimeout(timer)
    if (!res.ok) return { html: '', ok: false }
    const html = await res.text()
    return { html: html.slice(0, 80_000), ok: true }
  } catch {
    clearTimeout(timer)
    return { html: '', ok: false }
  }
}

interface BuildContext {
  sector: string
  signals: EvidenceSignals
  rating: number | null
  reviewCount: number
  businessName: string
  // Website HTML fetched & parsed — absence claims are verified facts.
  verified: boolean
}

function buildPainAndProof(ctx: BuildContext): {
  pain_signals: string[]
  proof_points: string[]
  why_now: string
  disqualification_reason: string | null
} {
  const pain: string[] = []
  const proof: string[] = []

  if (ctx.signals.instagram_as_site) {
    pain.push('Web sitesi yok — sadece Instagram linki mevcut')
  } else if (!ctx.signals.has_real_website) {
    pain.push('Web sitesi yok')
  } else {
    proof.push('Web sitesi mevcut')
    if (ctx.signals.is_slow_or_dead) {
      pain.push('Web sitesi yavaş veya erişilemiyor')
    } else if (ctx.signals.website_quality_band === 'poor') {
      pain.push('Web sitesi var ama tasarımı eski/zayıf — yenileme fırsatı')
    }
    if (ctx.verified && !ctx.signals.has_social_link) {
      pain.push('Sitede sosyal medya bağlantısı yok — zayıf sosyal varlık')
    }
  }

  // Absence of WhatsApp/form/booking is a verified fact only when the site
  // HTML was actually parsed; otherwise phrase it as "not detectable" so the
  // operator never opens a call with a false claim.
  if (ctx.signals.has_whatsapp) {
    proof.push('WhatsApp kanalı var (sitede doğrulandı)')
  } else if (ctx.verified) {
    pain.push('Web sitesinde WhatsApp kanalı yok — lead kaçışı riski')
  } else {
    pain.push('WhatsApp kanalı tespit edilemedi (site doğrulanamadı)')
  }

  if (ctx.signals.has_form) {
    proof.push('İletişim formu var (sitede doğrulandı)')
  } else if (ctx.verified) {
    pain.push('Sitede iletişim/randevu formu yok')
  }

  if (ctx.signals.has_online_booking) {
    proof.push('Online randevu sistemi mevcut (sitede doğrulandı)')
  } else if (ctx.verified) {
    pain.push('Online randevu sistemi yok')
  } else if (!ctx.signals.has_real_website) {
    pain.push('Online randevu kanalı görünmüyor')
  }

  if (ctx.rating !== null) {
    if (ctx.rating < 4.0) {
      pain.push(`Google puanı düşük (${ctx.rating}) — itibar yönetimi fırsatı`)
    } else if (ctx.rating >= 4.5) {
      proof.push(`Yüksek Google puanı: ${ctx.rating}`)
    }
  }

  if (ctx.reviewCount < 10) {
    pain.push(`Çok az yorum (${ctx.reviewCount}) — sosyal kanıt zayıf`)
  } else if (ctx.reviewCount < 50) {
    pain.push(`Kısıtlı yorum (${ctx.reviewCount})`)
  } else if (ctx.reviewCount >= 100) {
    proof.push(`${ctx.reviewCount} Google yorumu — güçlü sosyal kanıt`)
  }

  if (ctx.signals.has_job_signal) {
    proof.push('Kariyer/işe-alım sayfası aktif — ekip büyütüyor (kreatif kapasite ihtiyacı)')
  }

  const disqualification_reason: string | null = null

  // NOT: 'sağlam bir temele sahip' substring'i korunuyor — daily-scan kalite
  // kapısı (route.ts) bu jenerik fallback'i bu ifadeyle reddediyor.
  const why_now = pain.length > 0
    ? `${ctx.businessName} şu an müşteri kaybediyor: ${pain.slice(0, 2).join('; ')}.`
    : `${ctx.businessName} sağlam bir temele sahip; net bir tasarım/web problemi öne çıkmıyor.`

  return { pain_signals: pain, proof_points: proof, why_now, disqualification_reason }
}

interface OfferHint {
  recommended_offer_id: string
  recommended_offer_name: string
  sales_angle: string
  first_message: string
  next_best_action: string
}

function selectOffer(sector: string, signals: EvidenceSignals, businessName: string): OfferHint {
  const s = (sector ?? '').toLowerCase()

  if (!signals.has_real_website || signals.instagram_as_site) {
    // Only claim "you use Instagram" when an Instagram URL was actually detected.
    const missingWebsiteCopy = signals.instagram_as_site
      ? 'web siteniz yerine Instagram kullanıyorsunuz'
      : 'Google profilinizde doğrulanabilir bir web sitesi görünmüyor'
    return {
      recommended_offer_id: 'website',
      recommended_offer_name: 'Web Sitesi',
      sales_angle: 'Dijital varlık sıfırdan kurulacak — en acil temel ihtiyaç',
      first_message: `Merhaba ${businessName}, ${missingWebsiteCopy} — bu durum ciddi müşteri kaybına yol açabilir. Sizi 5 dakikada değerlendirelim mi?`,
      next_best_action: 'Web sitesi ihtiyacını tespit eden mini audit gönder',
    }
  }

  const isHealthClinic = /diş|klinik|estetik|doktor|sağlık|fizyoterapi|göz|plastik/.test(s)
  const isBeauty = /güzellik|kuaför|berber|nail|tırnak|spa/.test(s)

  // "Esnaf AI uygunluğu" tek kaynaktan (customerCategory) gelir → kategori motoru
  // ve teklif seçimi AYNI tanımı kullanır; AI yalnız bu segmente pitchlenir.
  if (isEsnafAIFit(sector) && !signals.has_whatsapp && !signals.has_online_booking) {
    return {
      recommended_offer_id: 'ai_sales_assistant',
      recommended_offer_name: 'AI Satış Asistanı (WhatsApp/Instagram)',
      sales_angle: 'Soruları, randevuyu ve fiyat bilgisini 7/24 otomatik yanıtlayan satış asistanı — günde 2 saat kazandırır',
      first_message: `Merhaba ${businessName}, müşterileriniz mesaj atıp geç yanıt aldığında rakibe geçiyor. WhatsApp/Instagram'da soruları yanıtlayan, randevu alan ve müşteri bilgisi toplayan bir AI asistan kuruyoruz. 5 dakikalık bir demo paylaşabilir miyim?`,
      next_best_action: 'AI asistan demo videosu/linki gönder',
    }
  }

  if (isHealthClinic) {
    if (!signals.has_online_booking) {
      return {
        recommended_offer_id: 'appointment_recovery',
        recommended_offer_name: 'Randevu Kurtarma Sistemi',
        sales_angle: 'Online randevu yok → hastalar rakibe gidiyor',
        first_message: `Merhaba ${businessName}, online randevu sisteminiz yok — bu no-show ve kayıp randevu anlamına geliyor. 5 dakikada mevcut akışı inceleyelim mi?`,
        next_best_action: 'Randevu akışı audit mesajı gönder',
      }
    }
    return {
      recommended_offer_id: 'review_engine',
      recommended_offer_name: 'Review Engine',
      sales_angle: 'Google yorumları artırılarak güven ve dönüşüm iyileştirilir',
      first_message: `Merhaba ${businessName}, Google yorumlarınız rakiplerinizin gerisinde. 90 günde yorum sayınızı 3 katına çıkarmak mümkün — nasıl çalıştığını göstereyim mi?`,
      next_best_action: 'Review engine demo mesajı gönder',
    }
  }

  if (isBeauty) {
    return {
      recommended_offer_id: 'appointment_recovery',
      recommended_offer_name: 'Randevu Kurtarma Sistemi',
      sales_angle: 'No-show oranı düşürülerek gelir korunur',
      first_message: `Merhaba ${businessName}, no-show oranınızı yarıya indiren otomatik hatırlatma sistemi hakkında kısa bir demo paylaşabilir miyim?`,
      next_best_action: 'No-show demo linki gönder',
    }
  }

  if (!signals.has_whatsapp) {
    return {
      recommended_offer_id: 'ai_lead_response',
      recommended_offer_name: 'AI Lead Response Agent',
      sales_angle: 'WhatsApp kanalı olmadığından lead\'ler kaçıyor',
      first_message: `Merhaba ${businessName}, WhatsApp üzerinden müşteri sorularına 7/24 otomatik yanıt sistemi ilginizi çeker mi? Kısa bir demo paylaşayım.`,
      next_best_action: 'WhatsApp response demo gönder',
    }
  }

  return {
    recommended_offer_id: 'review_engine',
    recommended_offer_name: 'Review Engine',
    sales_angle: 'Google yorumları güçlendirilerek organik kazanım artırılır',
    first_message: `Merhaba ${businessName}, Google yorumlarınızı otomatik artıran sistemimiz 90 günde somut sonuç veriyor — göstereyim mi?`,
    next_best_action: 'Review engine teklif gönder',
  }
}

export async function runEvidenceEngine(params: {
  website: string | null | undefined
  sector: string
  businessName: string
  rating: number | null
  reviewCount: number
}): Promise<EvidenceResult> {
  const { website, sector, businessName, rating, reviewCount } = params

  let signals: EvidenceSignals = {
    has_real_website: false,
    has_whatsapp: false,
    has_form: false,
    has_online_booking: false,
    has_ads_signal: false,
    instagram_as_site: false,
    is_slow_or_dead: false,
    has_job_signal: false,
    // Default 'none': site yok/doğrulanamadı. Yüklenen sitelerde extractSignals
    // bunu 'poor'/'ok' ile override eder.
    website_quality_band: 'none',
    has_social_link: false,
  }
  let evidence_verified = false
  let found_email: string | null = null

  if (website) {
    if (isSocialOnlyUrl(website)) {
      signals.instagram_as_site = isInstagramUrl(website)
      signals.has_real_website = false
    } else {
      const { html, ok } = await fetchWebsite(website)
      if (!ok) {
        signals.is_slow_or_dead = true
        signals.has_real_website = true
      } else {
        const extracted = extractSignals(html, website, new Date())
        signals = { ...signals, ...extracted }
        evidence_verified = true
        found_email = extractEmails(html)[0] ?? null
      }
    }
  }

  const { pain_signals, proof_points, why_now, disqualification_reason } = buildPainAndProof({
    sector, signals, rating, reviewCount, businessName, verified: evidence_verified,
  })

  const offerHint = selectOffer(sector, signals, businessName)

  const signalCount = [website, rating !== null, reviewCount > 0, evidence_verified].filter(Boolean).length
  const confidence = Math.min(0.3 + signalCount * 0.175, 1.0)

  return {
    ...signals,
    why_now,
    pain_signals,
    proof_points,
    disqualification_reason,
    confidence,
    evidence_verified,
    found_email,
    ...offerHint,
  }
}
