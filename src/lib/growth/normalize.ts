// ─────────────────────────────────────────────────────────────────────────────
// LEAD NORMALIZASYONU — sağlayıcıdan gelen HERHANGİ bir şekli tek kanonik
// lead'e indirger. Bu dosya güvenlik sınırıdır: dışarıdan gelen her alan burada
// doğrulanır, kırpılır ya da DÜŞÜRÜLÜR.
//
// ÜÇ SERT KURAL (hepsi ölçülmüş bir arızadan doğdu):
//
//   1. KİŞİSEL E-POSTA OTOMATİK OUTREACH'E GİREMEZ. gmail/hotmail gibi bir
//      adres bir işletmenin sahibine ait olabilir, ama otomatik diziye sokmak
//      "kişiye soğuk mail" demektir. Kayıt DÜŞÜRÜLMEZ (CRM'de dursun), yalnız
//      `outreachEligible=false` işaretlenir; enqueue yolu bunu okur.
//
//   2. TELEFON HİÇ TAŞINMAZ. Sağlayıcı verse bile normalize çıktısında telefon
//      alanı YOKTUR. Taşınmayan veri sızdırılamaz; ayrıca bu motor e-posta
//      pilotudur, arama motoru değil.
//
//   3. HAM PAYLOAD SAKLANMAZ. Yalnız `sourceHash` — aynı kaydın iki farklı
//      gövdeyle geldiğini görmeye yeter, PII deposu olmaya yetmez.
//      (Migration 066'daki `payload_hash` kararının kod tarafı.)
//
// Dedupe sırası KASITLI: email → LinkedIn → ad+alan adı. E-posta en güçlü
// kimlik; LinkedIn ikinci; ad+alan adı en zayıf ve yalnız ikisi de yokken
// kullanılır (aynı isimli iki kişi aynı şirkette olabilir — bu yüzden en sonda).
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto'

/** Serbest metin alanlarında izin verilen azami uzunluk. */
const MAX_TEXT = 200
/** RFC 5321 pratik üst sınırı. */
const MAX_EMAIL = 254

/**
 * Ücretsiz/kişisel posta sağlayıcıları.
 *
 * Liste KAPALI ve kısadır: burada olmayan her alan adı "işletme" sayılır.
 * Tersi (beyaz liste) yanlış olurdu — dünyadaki tüm şirket alan adları
 * sayılamaz, ve bilinmeyen bir şirket alanını kişisel sayıp elemek gerçek
 * lead'leri sessizce yok ederdi.
 */
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com',
  'live.com', 'msn.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'icloud.com',
  'me.com', 'mac.com', 'aol.com', 'gmx.com', 'gmx.de', 'protonmail.com',
  'proton.me', 'yandex.com', 'yandex.ru', 'mail.ru', 'hey.com', 'zoho.com',
  'mynet.com', 'superonline.com', 'ttmail.com', 'windowslive.com',
])

/**
 * Rol adresleri (info@, sales@…).
 *
 * Bunlar İŞLETME adresidir ve outreach'e uygundur — ama karar vericiye değil,
 * ortak kutuya gider. Kokpit `missingDecisionMaker` sayacıyla bunu görür:
 * dizinin cevap oranı düşükse sebebi burada okunur.
 */
const ROLE_LOCAL_PARTS = new Set([
  'info', 'sales', 'contact', 'hello', 'hi', 'support', 'admin', 'office',
  'team', 'mail', 'bilgi', 'iletisim', 'satis', 'destek', 'musteri',
  'noreply', 'no-reply', 'postmaster', 'webmaster', 'abuse',
])

export type EmailKind = 'business' | 'personal' | 'role' | 'invalid'

export interface NormalizedLead {
  /** Kanonik dedupe anahtarı — hangi kimlikten türediği `identityBasis`'te. */
  dedupeKey: string
  identityBasis: 'email' | 'linkedin' | 'name_domain'
  fullName: string | null
  title: string | null
  companyName: string | null
  companyDomain: string | null
  email: string | null
  emailKind: EmailKind
  /** Otomatik diziye girebilir mi. Yalnız `business` e-posta true olur. */
  outreachEligible: boolean
  linkedinUrl: string | null
  websiteUrl: string | null
  city: string | null
  country: string | null
  /** Ham kaydın parmak izi — ham gövde DEĞİL. */
  sourceHash: string
}

export type RejectReason =
  | 'not_an_object'
  | 'no_identity'
  | 'invalid_email'
  | 'duplicate'

export interface NormalizeResult {
  leads: NormalizedLead[]
  /** migration 066 `prospect_import_batches` sayaçlarıyla BİREBİR aynı isimler. */
  metrics: {
    receivedCount: number
    acceptedCount: number
    invalidCount: number
    duplicateCount: number
    missingCompanyCount: number
    missingDecisionMakerCount: number
  }
  /** Neden düştüğü — ham içerik değil, kapalı küme sebep + sıra numarası. */
  rejects: Array<{ index: number; reason: RejectReason }>
}

// ───────────────────────────── alan temizleyiciler ───────────────────────────

/**
 * Serbest metin temizleyici.
 *
 * Kontrol karakterleri ve yön-değiştirme (RTL override) işaretleri SİLİNİR:
 * bunlar terminal/panel çıktısında görünen metni gerçek değerden farklı
 * gösterebilir. Uzunluk da kırpılır — 4 MB'lık bir "şirket adı" bir DoS'tur.
 */
export function cleanText(v: unknown, max = MAX_TEXT): string | null {
  if (typeof v !== 'string') return null
  // C0/C1 kontrol karakterleri + Unicode yon isaretleri (LRM/RLM/LRO/RLO).
  const stripped = v.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
  const t = stripped.replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.slice(0, max)
}

/**
 * E-posta doğrulama + sınıflandırma.
 *
 * Boşluk/CR/LF reddi KASITLI ve tek başına bir güvenlik kontrolüdür: bir
 * e-posta başlığına giren "\r\nBcc:" bir başlık enjeksiyonudur. Apollo
 * istemcisi (`personLeads/apollo.ts`) aynı kontrolü yapıyor — burada tekrar
 * yapılıyor çünkü bu yolda Apollo'dan başka sağlayıcılar da var.
 */
export function classifyEmail(v: unknown): { email: string | null; kind: EmailKind } {
  if (typeof v !== 'string') return { email: null, kind: 'invalid' }
  const raw = v.trim()
  if (!raw || raw.length > MAX_EMAIL) return { email: null, kind: 'invalid' }
  // Boşluk/kontrol karakteri → başlık enjeksiyonu riski.
  if (/[\s\u0000-\u001f\u007f-\u009f]/.test(raw)) return { email: null, kind: 'invalid' }
  const parts = raw.split('@')
  if (parts.length !== 2) return { email: null, kind: 'invalid' }
  const [local, domainRaw] = parts
  const domain = domainRaw.toLowerCase()
  if (!local || !domain) return { email: null, kind: 'invalid' }
  if (local.startsWith('.') || local.endsWith('.')) return { email: null, kind: 'invalid' }
  // Alan adı: en az bir nokta, geçerli etiketler, tire ile başlamaz/bitmez.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    return { email: null, kind: 'invalid' }
  }
  // Apollo'nun kilitli adres göstergesi — gerçek adres değil.
  if (local.includes('not_unlocked')) return { email: null, kind: 'invalid' }

  const email = `${local.toLowerCase()}@${domain}`
  if (PERSONAL_EMAIL_DOMAINS.has(domain)) return { email, kind: 'personal' }
  const localKey = local.toLowerCase().split('+')[0]
  if (ROLE_LOCAL_PARTS.has(localKey)) return { email, kind: 'role' }
  return { email, kind: 'business' }
}

/**
 * URL doğrulama — YALNIZ http(s).
 *
 * `javascript:` ve `data:` şemaları bir panelde tıklanabilir bağlantı olarak
 * render edilirse XSS'tir. Şema beyaz listesi tek güvenli yoldur.
 */
export function cleanUrl(v: unknown, requireHost?: string): string | null {
  const s = cleanText(v, 500)
  if (!s) return null
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (requireHost) {
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    if (host !== requireHost && !host.endsWith(`.${requireHost}`)) return null
  }
  return u.toString()
}

/** Alan adını URL ya da e-postadan türet; şema/yol/www taşımaz. */
export function domainOf(value: unknown): string | null {
  const s = cleanText(value, 500)
  if (!s) return null
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`
  try {
    const host = new URL(withScheme).hostname.toLowerCase().replace(/^www\./, '')
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null
  } catch {
    return null
  }
}

const hashOf = (raw: unknown) =>
  createHash('sha256').update(JSON.stringify(raw ?? null)).digest('hex')

// ─────────────────────────────── normalize ───────────────────────────────────

/** Sağlayıcıya özgü alan adlarını kanonik ada eşleyen okuma yardımcısı. */
function pick(rec: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = rec[k]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

/**
 * Ham kayıtları kanonik lead'e indirger.
 *
 * ŞEMA KAYMASI TOLERE EDİLİR: bilinmeyen alanlar SESSİZCE atlanır, tanınan
 * alanlardan hiçbiri yoksa kayıt `no_identity` ile düşer. Sağlayıcı bir alanı
 * yeniden adlandırdığında motor çökmez — sayaçlar düşer ve kokpitte görünür.
 * Sessiz sıfır YOK: `receivedCount` her zaman gerçek girdi sayısıdır.
 */
export function normalizeLeads(raw: unknown): NormalizeResult {
  const list = Array.isArray(raw) ? raw : []
  const leads: NormalizedLead[] = []
  const rejects: NormalizeResult['rejects'] = []
  const seen = new Set<string>()
  let invalidCount = 0
  let duplicateCount = 0
  let missingCompanyCount = 0
  let missingDecisionMakerCount = 0

  list.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      invalidCount++
      rejects.push({ index, reason: 'not_an_object' })
      return
    }
    const rec = item as Record<string, unknown>

    const { email, kind } = classifyEmail(
      pick(rec, ['email', 'emailAddress', 'email_address', 'contactEmail', 'work_email']),
    )
    const linkedinUrl = cleanUrl(
      pick(rec, ['linkedinUrl', 'linkedin_url', 'linkedIn', 'linkedin']),
      'linkedin.com',
    )
    const websiteUrl = cleanUrl(pick(rec, ['website', 'websiteUrl', 'url', 'domain_url', 'site']))
    const fullName = cleanText(
      pick(rec, ['fullName', 'full_name', 'name', 'personName', 'contactName']),
    )
    const companyName = cleanText(
      pick(rec, ['companyName', 'company_name', 'company', 'organizationName', 'title_company']),
    )
    const companyDomain =
      domainOf(pick(rec, ['companyDomain', 'company_domain', 'domain', 'primary_domain'])) ??
      (websiteUrl ? domainOf(websiteUrl) : null) ??
      (kind === 'business' || kind === 'role' ? (email?.split('@')[1] ?? null) : null)

    // Kimlik sırası: e-posta > LinkedIn > ad+alan adı.
    let dedupeKey: string | null = null
    let identityBasis: NormalizedLead['identityBasis'] = 'email'
    if (email) {
      dedupeKey = `email:${email}`
      identityBasis = 'email'
    } else if (linkedinUrl) {
      dedupeKey = `linkedin:${linkedinUrl.toLowerCase()}`
      identityBasis = 'linkedin'
    } else if (fullName && companyDomain) {
      dedupeKey = `name_domain:${fullName.toLowerCase()}|${companyDomain}`
      identityBasis = 'name_domain'
    }

    if (!dedupeKey) {
      invalidCount++
      // E-posta alanı VARDI ama geçersizdi → sebep bunu ayırt etsin.
      const hadEmailField =
        pick(rec, ['email', 'emailAddress', 'email_address', 'contactEmail', 'work_email']) !== undefined
      rejects.push({ index, reason: hadEmailField ? 'invalid_email' : 'no_identity' })
      return
    }

    if (seen.has(dedupeKey)) {
      duplicateCount++
      rejects.push({ index, reason: 'duplicate' })
      return
    }
    seen.add(dedupeKey)

    if (!companyName && !companyDomain) missingCompanyCount++
    // "Karar verici yok" = kişi adı yok ya da adres ortak kutu.
    if (!fullName || kind === 'role') missingDecisionMakerCount++

    leads.push({
      dedupeKey,
      identityBasis,
      fullName,
      title: cleanText(pick(rec, ['title', 'jobTitle', 'job_title', 'position', 'headline'])),
      companyName,
      companyDomain,
      email,
      emailKind: kind,
      // TEK yer: otomatik outreach hakkı. `role` bilinçli olarak DIŞARIDA
      // değil — ortak kutu meşru bir işletme adresidir; `personal` ise
      // kesinlikle dışarıdadır.
      outreachEligible: kind === 'business' || kind === 'role',
      linkedinUrl,
      websiteUrl,
      city: cleanText(pick(rec, ['city', 'locality', 'town'])),
      country: cleanText(pick(rec, ['country', 'countryCode', 'country_code'])),
      sourceHash: hashOf(rec),
      // NOT: telefon alanı KASITLI olarak yok — bkz. dosya başlığı kural 2.
    })
  })

  return {
    leads,
    metrics: {
      receivedCount: list.length,
      acceptedCount: leads.length,
      invalidCount,
      duplicateCount,
      missingCompanyCount,
      missingDecisionMakerCount,
    },
    rejects,
  }
}

/** Otomatik diziye girebilecek lead'ler — enqueue yolunun TEK girdisi. */
export const outreachEligible = (r: NormalizeResult) => r.leads.filter((l) => l.outreachEligible)
