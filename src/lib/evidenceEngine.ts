// Evidence Engine — website fetch + regex signals. No LLM.
// Called server-side during scan to populate evidence fields on a lead.

export interface EvidenceSignals {
  has_real_website: boolean
  has_whatsapp: boolean
  has_form: boolean
  has_online_booking: boolean
  has_ads_signal: boolean
  instagram_as_site: boolean
  is_slow_or_dead: boolean
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
}

function isInstagramUrl(url: string): boolean {
  return /instagram\.com/i.test(url)
}

function isSocialOnlyUrl(url: string): boolean {
  return /instagram\.com|facebook\.com|fb\.com|linktr\.ee|linktree/i.test(url)
}

function extractSignals(html: string, url: string): Omit<EvidenceSignals, 'has_ads_signal' | 'is_slow_or_dead'> {
  const lower = html.toLowerCase()

  const has_real_website = !isSocialOnlyUrl(url)
  const instagram_as_site = isSocialOnlyUrl(url)

  const has_whatsapp = /wa\.me|api\.whatsapp|whatsapp\.com\/send|whatsapp/i.test(html)

  const has_form =
    /<form[\s>]/i.test(html) ||
    /iletişim|randevu|form|contact|appointment/i.test(lower)

  const has_online_booking =
    /booking|randevu al|randevu-al|online randevu|reserve|appointment|calendly|setmore|acuityscheduling|booksy|treatwell/i.test(lower)

  return { has_real_website, has_whatsapp, has_form, has_online_booking, instagram_as_site }
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
    if (ctx.signals.is_slow_or_dead) pain.push('Web sitesi yavaş veya erişilemiyor')
  }

  if (ctx.signals.has_whatsapp) {
    proof.push('WhatsApp kanalı var')
  } else if (!ctx.signals.has_real_website || ctx.signals.instagram_as_site || !ctx.signals.is_slow_or_dead) {
    pain.push('WhatsApp iletişim kanalı yok — lead kaçışı riski')
  }

  if (ctx.signals.has_form) {
    proof.push('İletişim formu var')
  } else if (!ctx.signals.has_real_website || ctx.signals.instagram_as_site || !ctx.signals.is_slow_or_dead) {
    pain.push('İletişim/randevu formu yok')
  }

  if (ctx.signals.has_online_booking) {
    proof.push('Online randevu sistemi mevcut')
  } else if (!ctx.signals.has_real_website || ctx.signals.instagram_as_site || !ctx.signals.is_slow_or_dead) {
    pain.push('Online randevu sistemi yok')
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

  const disqualification_reason: string | null = null

  const why_now = pain.length > 0
    ? `${ctx.businessName} şu an müşteri kaybediyor: ${pain.slice(0, 2).join('; ')}.`
    : `${ctx.businessName} sağlam bir temele sahip; bir sonraki büyüme adımı için AI çözümü değerlendirebilir.`

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
    return {
      recommended_offer_id: 'website',
      recommended_offer_name: 'Web Sitesi',
      sales_angle: 'Dijital varlık sıfırdan kurulacak — en acil temel ihtiyaç',
      first_message: `Merhaba ${businessName}, web siteniz yerine Instagram kullanıyorsunuz — bu durum ciddi müşteri kaybına yol açıyor. Sizi 5 dakikada değerlendirelim mi?`,
      next_best_action: 'Web sitesi ihtiyacını tespit eden mini audit gönder',
    }
  }

  const isHealthClinic = /diş|klinik|estetik|doktor|sağlık|fizyoterapi|göz|plastik/.test(s)
  const isBeauty = /güzellik|kuaför|berber|nail|tırnak|spa/.test(s)

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
  }

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
        const extracted = extractSignals(html, website)
        signals = { ...signals, ...extracted }
      }
    }
  }

  const { pain_signals, proof_points, why_now, disqualification_reason } = buildPainAndProof({
    sector, signals, rating, reviewCount, businessName,
  })

  const offerHint = selectOffer(sector, signals, businessName)

  const signalCount = [website, rating !== null, reviewCount > 0].filter(Boolean).length
  const confidence = Math.min(0.4 + signalCount * 0.2, 1.0)

  return {
    ...signals,
    why_now,
    pain_signals,
    proof_points,
    disqualification_reason,
    confidence,
    ...offerHint,
  }
}
