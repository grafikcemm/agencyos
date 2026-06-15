// Soğuk e-posta taslağı: prompt kurulumu, LLM çıktı parse'ı ve deterministik
// imza bloğu. LLM hiçbir zaman link/imza yazmaz — imza settings'ten okunup
// gövdenin sonuna kod tarafında eklenir (halüsinasyon/bozuk link riski sıfır).

import type { ColdEmailTemplate } from './coldEmailTemplates'

export interface ColdEmailLead {
  id: string
  business_name: string
  sector: string | null
  district: string | null
  rating: number | null
  review_count: number | null
  has_real_website: boolean | null
  has_whatsapp: boolean | null
  has_ads_signal: boolean | null
  has_job_signal: boolean | null
  instagram_as_site: boolean | null
  website: string | null
  pain_signals: string[] | null
  proof_points: string[] | null
  why_now: string | null
  why_this_will_convert: string | null
}

export const SIGNATURE_SETTING_KEYS = [
  'signature_website',
  'signature_instagram',
  'signature_behance',
  'signature_linkedin',
  'signature_google_business',
  'signature_email',
] as const

export const SIGNATURE_DEFAULTS: Record<string, string> = {
  signature_website: 'https://grafikcem.com',
  signature_instagram: 'https://instagram.com/grafikcem',
  signature_behance: 'https://behance.net/grafikcem',
  signature_linkedin: 'https://linkedin.com/in/grafikcem',
  signature_google_business: 'https://maps.app.goo.gl/cmYbYzmojz6v4eiu7?g_st=ic',
  signature_email: 'info@grafikcem.com',
}

// İYS/KVKK uyum footer ayarları — settings'ten okunur (migration 018).
export const COMPLIANCE_SETTING_KEYS = [
  'ticaret_unvani',
  'mersis_no',
  'compliance_enabled',
] as const

export function buildColdEmailSystemPrompt(): string {
  return [
    "Sen Ali Cem Bozma'sın (Grafikcem) — İstanbul'da çalışan freelance grafik ve web tasarımcısı.",
    'Küçük ve orta ölçekli işletmelere web sitesi, marka kimliği, sosyal medya tasarımı ve',
    'Google işletme profili iyileştirmesi yapıyorsun.',
    '',
    'GÖREV: Aşağıda verilen TEK işletmeye gönderilecek kısa bir soğuk e-posta taslağı yaz.',
    '',
    'KURALLAR:',
    '- Türkçe yaz. Samimi ama profesyonel; gerçek bir insanın elinden çıkmış gibi.',
    '- Gövde 60-120 kelime, en fazla 4 kısa paragraf.',
    '- YASAK klişeler: "Umarım bu mail sizi iyi bulur", "Değerli yetkili", "sektörünüzde lider",',
    '  "çözüm ortağınız", "sinerji", "değer katmak" ve benzeri kurumsal kalıplar.',
    '- İşletmeye dair EN AZ BİR somut gözlem kullan (Google puanı, yorum sayısı, web sitesinin',
    '  olmaması veya zayıf olması, verilen problem sinyalleri). Gözlemi suçlayıcı değil,',
    '  fırsat diliyle yaz.',
    '- Kendini en fazla bir cümlede tanıt; hizmet listesi sayma.',
    '- Yumuşak bir CTA ile bitir (ör. "15 dakikalık kısa bir görüşmeye açık olur musunuz?"',
    '  veya "İsterseniz birkaç örnek çalışmamı göndereyim.").',
    '- ASLA link, URL, e-posta adresi, telefon numarası veya imza yazma — imza otomatik eklenecek.',
    '- Köşeli parantezli placeholder ([isim] gibi) kullanma; bilmediğin bilgiyi yazmadan geç.',
    '',
    'ÇIKTI: SADECE geçerli JSON döndür, başka hiçbir şey yazma:',
    '{"subject": "...", "body": "..."}',
    '"subject" 50 karakteri geçmesin, clickbait olmasın; işletme adını veya somut gözlemi içersin.',
  ].join('\n')
}

export function buildColdEmailUserPrompt(lead: ColdEmailLead, template?: ColdEmailTemplate): string {
  const lines: string[] = ['İŞLETME BİLGİLERİ:', `Ad: ${lead.business_name}`]

  if (lead.sector) lines.push(`Sektör: ${lead.sector}`)
  if (lead.district) lines.push(`Konum: ${lead.district}, İstanbul`)
  if (lead.rating != null) {
    const reviews = lead.review_count != null ? ` (${lead.review_count} yorum)` : ''
    lines.push(`Google puanı: ${lead.rating}${reviews}`)
  }

  if (lead.has_real_website === false) {
    lines.push('Web sitesi: YOK veya sadece sosyal medya linki var')
  } else if (lead.website) {
    lines.push(`Web sitesi: var (${lead.website})`)
  }
  if (lead.has_whatsapp === false) {
    lines.push('WhatsApp iletişim kanalı: tespit edilemedi')
  }

  if (lead.pain_signals && lead.pain_signals.length > 0) {
    lines.push(`Tespit edilen problemler: ${lead.pain_signals.join('; ')}`)
  }
  if (lead.proof_points && lead.proof_points.length > 0) {
    lines.push(`Güçlü yönleri: ${lead.proof_points.join('; ')}`)
  }
  if (lead.why_now) lines.push(`Neden şimdi: ${lead.why_now}`)
  if (lead.why_this_will_convert) lines.push(`Dönüşüm gerekçesi: ${lead.why_this_will_convert}`)

  if (template) {
    lines.push(
      '',
      'TERCİH EDİLEN AÇI (bu açıyı kullan; iskeleti birebir kopyalama, ton/yapı referansı al):',
      `Açı: ${template.angle}`,
      `İskelet: ${template.skeleton}`,
    )
  }

  return lines.join('\n')
}

/**
 * LLM çıktısını {subject, body} olarak parse eder. Önce markdown fence'leri
 * temizleyip JSON.parse dener; bozuk JSON'da regex fallback. İkisi de
 * başarısızsa null — route 502 döndürür.
 */
export function parseColdEmailOutput(raw: string): { subject: string; body: string } | null {
  const cleaned = raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()

  try {
    const parsed: unknown = JSON.parse(cleaned)
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).subject === 'string' &&
      typeof (parsed as Record<string, unknown>).body === 'string'
    ) {
      const subject = ((parsed as Record<string, string>).subject || '').trim()
      const body = ((parsed as Record<string, string>).body || '').trim()
      if (subject && body) return { subject, body }
    }
  } catch {
    // JSON bozuk — regex fallback'e düş
  }

  const subjectMatch = cleaned.match(/"subject"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  const bodyMatch = cleaned.match(/"body"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  if (subjectMatch && bodyMatch) {
    const unescape = (s: string) => s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    const subject = unescape(subjectMatch[1]).trim()
    const body = unescape(bodyMatch[1]).trim()
    if (subject && body) return { subject, body }
  }

  return null
}

/** İmza bloğu — settings değerlerinden deterministik üretilir, LLM dokunmaz. */
export function buildSignatureBlock(links: Record<string, string>): string {
  const value = (key: string) => links[key] || SIGNATURE_DEFAULTS[key]
  return [
    'Ali Cem Bozma',
    'Grafikcem — Grafik & Web Tasarım',
    '',
    `🌐 Website: ${value('signature_website')}`,
    `📸 Instagram: ${value('signature_instagram')}`,
    `🎨 Behance: ${value('signature_behance')}`,
    `💼 LinkedIn: ${value('signature_linkedin')}`,
    `📍 Google Business: ${value('signature_google_business')}`,
    `📩 E-posta: ${value('signature_email')}`,
  ].join('\n')
}

/**
 * İYS/KVKK uyum footer'ı — 6563 sayılı ETK uyarınca B2B ticari iletide ticaret
 * unvanı, MERSİS no ve kolay ret imkânı zorunlu. Settings'ten deterministik üretilir.
 * compliance_enabled='false' ise veya unvan/MERSİS boşsa boş string döner (footer eklenmez).
 * Manuel-gönder modeli olduğundan ret, link yerine "yanıtla" talimatıyla sağlanır.
 */
export function buildComplianceFooter(settings: Record<string, string>): string {
  const enabled = (settings.compliance_enabled ?? 'true').toLowerCase() !== 'false'
  if (!enabled) return ''

  const unvan = (settings.ticaret_unvani ?? '').trim()
  const mersis = (settings.mersis_no ?? '').trim()
  if (!unvan && !mersis) return ''

  const identityParts = [unvan, mersis ? `MERSİS: ${mersis}` : ''].filter(Boolean)
  return [
    '—',
    identityParts.join(' | '),
    'Bu ileti B2B ticari ileti niteliğindedir.',
    'Bu tür e-postaları almak istemezseniz "ret" yazarak yanıtlamanız yeterlidir.',
  ].join('\n')
}
