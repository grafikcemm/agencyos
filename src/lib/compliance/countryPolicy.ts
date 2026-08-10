// ─────────────────────────────────────────────────────────────────────────────
// ÜLKE BAZLI UYUM MOTORU — FAIL-CLOSED.
//
// "Global" bütün dünyaya aynı şablonu gönderen bir anahtar DEĞİLDİR. Her alıcı
// bir ülke rejimine tabidir ve o rejimin gerektirdiği kanıt üretilmeden gönderim
// açılmaz. Kanıt eksikse sonuç `research_only`; ülke tanımsızsa `blocked`.
//
// TEK DOĞRULUK KAYNAĞI DİSİPLİNİ: `send_allowed` bir SÜTUN DEĞİLDİR. Veritabanı
// yalnız OLGULARI tutar (ülke, alıcı tipi, kanıt, e-posta güveni, suppression);
// karar bu modülde türetilir. Aksi hâlde kural değiştiğinde binlerce satır bayat
// bir izinle kalırdı.
//
// BU MODÜL HUKUK DANIŞMANI DEĞİLDİR. Ürettiği her metin ve karar "taslak —
// avukat/mali müşavir incelemesi gerekli" statüsündedir. Gerçek gönderim kapısı
// ülke belgesi ve kullanıcı onayı olmadan açılmaz.
// ─────────────────────────────────────────────────────────────────────────────

export type SendPolicy = 'allowed' | 'research_only' | 'blocked'

export type EntityType =
  | 'legal_entity'   // tüzel kişi / şirket
  | 'sole_trader'    // şahıs işletmesi / esnaf / sole trader
  | 'individual'     // gerçek kişi
  | 'unknown'

/**
 * Kanıtlanabilir gereklilikler. Her biri lead üzerinde `true` olarak
 * kanıtlanmadıkça sağlanmış sayılmaz — `undefined` "bilinmiyor"dur ve
 * fail-closed tarafta durur.
 */
export type PolicyRequirement =
  | 'sender_identity'              // gerçek gönderen kimliği ve iletişim bilgisi
  | 'accurate_subject'             // yanıltıcı olmayan konu/başlık
  | 'advertising_disclosure'       // reklam niteliğinin açıkça sunulması
  | 'physical_postal_address'      // geçerli fiziksel posta adresi
  | 'opt_out_mechanism'            // çalışan, tek tık ret mekanizması
  | 'privacy_notice_delivered'     // aydınlatma / Art.14 bildirimi
  | 'merchant_status_verified'     // TR: tacir veya esnaf statüsü doğrulandı
  | 'iys_consent_or_exemption'     // TR: İYS kaydı veya 6563 istisnası
  | 'corporate_subscriber_verified'// UK: corporate subscriber doğrulandı
  | 'lawful_basis_lia'             // meşru menfaat değerlendirmesi kaydı

export interface CountryPolicy {
  code: string
  name: string
  /** Uygulanan mevzuat rejimi — kullanıcıya ham enum değil bu metin gösterilir. */
  regime: string
  /** Ülke için mümkün olan EN İYİ sonuç. Kanıt eksikse buradan aşağı düşülür. */
  ceiling: SendPolicy
  eligibleEntityTypes: readonly EntityType[]
  requirements: readonly PolicyRequirement[]
  /** Ret talebinin uygulanması için azami iş günü. */
  suppressionDeadlineBusinessDays: number
  /** Bu ülkede outreach'e kapalı meslekler (statü istisnası uydurulmaz). */
  excludedProfessions: readonly string[]
  citation: string
  note: string
}

const COMMON_REQUIREMENTS = ['sender_identity', 'accurate_subject', 'opt_out_mechanism'] as const

export const TURKEY_POLICY: CountryPolicy = {
  code: 'TR',
  name: 'Türkiye',
  regime: 'KVKK + 6563 sayılı Kanun + İYS',
  // Tavan `allowed` DEĞİL: TR'de her alıcı için tacir/esnaf statüsü tek tek
  // doğrulanmadan gönderim açılamaz, bu yüzden varsayılan sonuç araştırmadır.
  ceiling: 'allowed',
  eligibleEntityTypes: ['legal_entity', 'sole_trader'],
  requirements: [
    ...COMMON_REQUIREMENTS,
    'merchant_status_verified',
    'iys_consent_or_exemption',
    'privacy_notice_delivered',
  ],
  suppressionDeadlineBusinessDays: 3,
  // Avukatlık gibi tacir/esnaf sayılmayan meslekler istisnaya SOKULMAZ.
  excludedProfessions: ['avukat', 'hukuk bürosu', 'noter', 'serbest muhasebeci', 'mali müşavir', 'doktor', 'diş hekimi', 'eczane'],
  citation: 'https://ticaret.gov.tr/ic-ticaret/ticari-elektronik-iletiler/genel-bilgiler',
  note:
    'Meslek adresinin internette açık olması gönderilebilirlik DEĞİLDİR (KVKK 2022/861). ' +
    'Ret talebi en geç üç iş gününde uygulanır; suppression anında etkilidir.',
}

export const US_POLICY: CountryPolicy = {
  code: 'US',
  name: 'Amerika Birleşik Devletleri',
  regime: 'CAN-SPAM Act',
  ceiling: 'allowed',
  eligibleEntityTypes: ['legal_entity', 'sole_trader'],
  requirements: [...COMMON_REQUIREMENTS, 'advertising_disclosure', 'physical_postal_address'],
  suppressionDeadlineBusinessDays: 10,
  excludedProfessions: [],
  citation: 'https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business',
  note:
    'CAN-SPAM ticari B2B e-postasını da KAPSAR — "B2B istisnası" yoktur. ' +
    'Geçerli fiziksel posta adresi ve çalışan opt-out zorunludur.',
}

export const UK_POLICY: CountryPolicy = {
  code: 'GB',
  name: 'Birleşik Krallık',
  regime: 'PECR + UK GDPR',
  ceiling: 'allowed',
  // Sole trader ve bazı ortaklıklar birey gibi ele alınır → varsayılan bloklu.
  eligibleEntityTypes: ['legal_entity'],
  requirements: [
    ...COMMON_REQUIREMENTS,
    'corporate_subscriber_verified',
    'lawful_basis_lia',
    'privacy_notice_delivered',
  ],
  suppressionDeadlineBusinessDays: 5,
  excludedProfessions: [],
  citation:
    'https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/',
  note:
    'Yalnız doğrulanmış corporate subscriber. Kimlik saklanamaz, geçerli opt-out gerekir, ' +
    'kişisel iş e-postasında lawful basis/LIA ve aydınlatma zorunludur.',
}

/** AB/AEA — ePrivacy ulusal uygulaması ülkeye göre değişir; ülke kuralı yazılmadan gönderim yok. */
const EU_EEA_CODES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO',
] as const

function blockedPolicy(code: string, name: string, regime: string, citation: string, note: string): CountryPolicy {
  return {
    code,
    name,
    regime,
    ceiling: 'blocked',
    eligibleEntityTypes: [],
    requirements: [],
    suppressionDeadlineBusinessDays: 3,
    excludedProfessions: [],
    citation,
    note,
  }
}

const EU_NAMES: Record<string, string> = {
  AT: 'Avusturya', BE: 'Belçika', BG: 'Bulgaristan', HR: 'Hırvatistan', CY: 'Kıbrıs',
  CZ: 'Çekya', DK: 'Danimarka', EE: 'Estonya', FI: 'Finlandiya', FR: 'Fransa',
  DE: 'Almanya', GR: 'Yunanistan', HU: 'Macaristan', IE: 'İrlanda', IT: 'İtalya',
  LV: 'Letonya', LT: 'Litvanya', LU: 'Lüksemburg', MT: 'Malta', NL: 'Hollanda',
  PL: 'Polonya', PT: 'Portekiz', RO: 'Romanya', SK: 'Slovakya', SI: 'Slovenya',
  ES: 'İspanya', SE: 'İsveç', IS: 'İzlanda', LI: 'Lihtenştayn', NO: 'Norveç',
}

export const COUNTRY_POLICIES: Readonly<Record<string, CountryPolicy>> = Object.freeze({
  TR: TURKEY_POLICY,
  US: US_POLICY,
  GB: UK_POLICY,
  CA: blockedPolicy(
    'CA',
    'Kanada',
    'CASL',
    'https://crtc.gc.ca/eng/com500/guide.htm',
    'Express veya implied consent KANITI, kimlik ve unsubscribe koşulu belgelenmeden gönderim yok.',
  ),
  AU: blockedPolicy(
    'AU',
    'Avustralya',
    'Spam Act 2003',
    'https://www.acma.gov.au/',
    'Ülke politikası yazılıp onaylanmadan gönderim yok.',
  ),
  ...Object.fromEntries(
    EU_EEA_CODES.map((c) => [
      c,
      blockedPolicy(
        c,
        EU_NAMES[c] ?? c,
        'ePrivacy Direktifi Md.13 + GDPR (ulusal uygulama)',
        'https://eur-lex.europa.eu/eli/dir/2002/58/oj?locale=en',
        'ePrivacy ulusal uygulaması ülkeye göre değişir. Ülke bazlı hukuki kural ve onay olmadan otomatik cold send yok.',
      ),
    ]),
  ),
})

/** Tanımsız ülke için kanonik sonuç. Sessizce "izinli" varsayımı ASLA yapılmaz. */
export const UNKNOWN_COUNTRY_POLICY: CountryPolicy = blockedPolicy(
  'ZZ',
  'Tanımlanmamış ülke',
  'politika yazılmadı',
  '',
  'Bu ülke için politika kaydı yok. Ülke politikası onaylanmadan gönderim yapılamaz.',
)

export function policyFor(countryCode: string | null | undefined): CountryPolicy {
  const code = String(countryCode ?? '').trim().toUpperCase()
  if (code === '') return UNKNOWN_COUNTRY_POLICY
  return COUNTRY_POLICIES[code] ?? UNKNOWN_COUNTRY_POLICY
}

/** İlk allowlist — bu üçü dışındaki her ülke araştırma/bloklu başlar. */
export const SEND_ALLOWLIST_COUNTRIES = ['TR', 'US', 'GB'] as const

// ─────────────────────────────────────────────────────────────────────────────
// Karar
// ─────────────────────────────────────────────────────────────────────────────

export type EmailConfidence = 'guessed' | 'probable' | 'verified'

export interface RecipientFacts {
  countryCode: string | null
  entityType: EntityType
  /** Alıcının mesleği/kategorisi — TR'de statü istisnası kontrolü için. */
  profession?: string | null
  /** Kanıtlanan gereklilikler. Eksik anahtar = kanıtlanmadı. */
  provenRequirements?: Partial<Record<PolicyRequirement, boolean>>
  suppressed: boolean
  emailConfidence: EmailConfidence | null
  /** Mailbox/domain sağlığı gönderime hazır mı (deliverability kapısı). */
  mailboxReady?: boolean
}

export interface PolicyDecision {
  policy: SendPolicy
  draftAllowed: boolean
  sendAllowed: boolean
  regime: string | null
  /** Kullanıcıya gösterilecek insan dilinde gerekçeler — ham enum değil. */
  reasons: string[]
  /** Kanıtlanmamış gereklilik anahtarları — operatörün yapılacaklar listesi. */
  missing: PolicyRequirement[]
  suppressionDeadlineBusinessDays: number
  citation: string
}

const REQUIREMENT_LABEL: Record<PolicyRequirement, string> = {
  sender_identity: 'Gönderen kimliği ve iletişim bilgisi',
  accurate_subject: 'Yanıltıcı olmayan konu satırı',
  advertising_disclosure: 'Reklam niteliğinin açık sunumu',
  physical_postal_address: 'Geçerli fiziksel posta adresi',
  opt_out_mechanism: 'Çalışan tek tık ret mekanizması',
  privacy_notice_delivered: 'Aydınlatma metninin iletilmesi',
  merchant_status_verified: 'Tacir/esnaf statüsünün doğrulanması',
  iys_consent_or_exemption: 'İYS kaydı veya 6563 istisnası',
  corporate_subscriber_verified: 'Corporate subscriber doğrulaması',
  lawful_basis_lia: 'Meşru menfaat değerlendirmesi (LIA) kaydı',
}

const ENTITY_LABEL: Record<EntityType, string> = {
  legal_entity: 'tüzel kişi',
  sole_trader: 'şahıs işletmesi',
  individual: 'gerçek kişi',
  unknown: 'tipi bilinmeyen alıcı',
}

/**
 * Fail-closed karar. Sıra önemlidir: suppression her şeyi ezer, sonra ülke,
 * sonra alıcı tipi, sonra kanıt, en sonda teknik gönderilebilirlik.
 */
export function evaluateSendPolicy(facts: RecipientFacts): PolicyDecision {
  const policyDef = policyFor(facts.countryCode)
  const reasons: string[] = []
  const proven = facts.provenRequirements ?? {}
  const missing = policyDef.requirements.filter((r) => proven[r] !== true)

  const base: Omit<PolicyDecision, 'policy' | 'draftAllowed' | 'sendAllowed'> = {
    regime: policyDef.code === 'ZZ' ? null : policyDef.regime,
    reasons,
    missing,
    suppressionDeadlineBusinessDays: policyDef.suppressionDeadlineBusinessDays,
    citation: policyDef.citation,
  }

  // 1. Suppression / opt-out — mutlak. Taslak bile üretilmez.
  if (facts.suppressed) {
    reasons.push('Bu alıcı ret listesinde. Hiçbir koşulda mesaj hazırlanamaz veya gönderilemez.')
    return { ...base, policy: 'blocked', draftAllowed: false, sendAllowed: false }
  }

  // 2. Ülke tavanı.
  if (policyDef.ceiling === 'blocked') {
    reasons.push(
      policyDef.code === 'ZZ'
        ? 'Alıcının ülkesi belirlenemedi. Ülke politikası olmadan gönderim yapılamaz.'
        : `${policyDef.name} için gönderim kapalı: ${policyDef.note}`,
    )
    return { ...base, policy: 'blocked', draftAllowed: false, sendAllowed: false }
  }

  // 3. Alıcı tipi uygunluğu.
  if (!policyDef.eligibleEntityTypes.includes(facts.entityType)) {
    reasons.push(
      `${policyDef.name} politikası ${ENTITY_LABEL[facts.entityType]} alıcıya gönderime izin vermiyor. ` +
        'Yalnız araştırma yapılabilir.',
    )
    return { ...base, policy: 'research_only', draftAllowed: true, sendAllowed: false }
  }

  // 4. Meslek istisnası (TR: tacir/esnaf sayılmayanlar).
  const profession = String(facts.profession ?? '').trim().toLowerCase()
  if (profession !== '') {
    const hit = policyDef.excludedProfessions.find((p) => profession.includes(p))
    if (hit) {
      reasons.push(
        `"${hit}" ${policyDef.name} mevzuatında tacir/esnaf statüsüne sokulamaz. ` +
          'Bu alıcıya ticari elektronik ileti gönderilmez.',
      )
      return { ...base, policy: 'blocked', draftAllowed: false, sendAllowed: false }
    }
  }

  // 5. Kanıt eksikleri — taslak serbest, gönderim kapalı.
  if (missing.length > 0) {
    reasons.push(
      `${policyDef.regime} gereği eksik kanıt: ` + missing.map((m) => REQUIREMENT_LABEL[m]).join(', ') + '.',
    )
    return { ...base, policy: 'research_only', draftAllowed: true, sendAllowed: false }
  }

  // 6. E-posta güveni.
  //
  // TAHMİN EDİLMİŞ (`guessed`) adres taslağı ENGELLEMEZ, gönderimi ENGELLER —
  // uydurulmuş bir adrese gönderim doğrudan bounce ve itibar kaybıdır.
  //
  // BİLİNMEYEN (`null`) adres burada YAPISAL OLARAK ENGELLENMEZ ve bu bilinçli
  // bir karardır: web sitesinden doğrudan okunan kurumsal adresler henüz
  // doğrulama hattından geçmemiş olabilir. Bu bir HUKUKİ kapı değil VERİ
  // KALİTESİ sinyalidir; gerekçeye yazılır, deliverability hazırlığında
  // "doğrulanmış gönderilebilir e-posta oranı" olarak ÖLÇÜLÜR ve gerçek
  // gönderim ayrıca mailbox hazırlığı + insan onayı kapısından geçer.
  if (facts.emailConfidence === 'guessed') {
    reasons.push('E-posta adresi tahmin edilmiş — gönderim için doğrulama gerekli.')
    return { ...base, policy: 'research_only', draftAllowed: true, sendAllowed: false }
  }
  if (facts.emailConfidence === null) {
    reasons.push('E-posta adresi doğrulama hattından geçmedi (veri kalitesi uyarısı).')
  }

  // 7. Teknik gönderilebilirlik (mailbox/domain sağlığı).
  if (facts.mailboxReady === false) {
    reasons.push('Gönderim altyapısı (mailbox/domain sağlığı) hazır değil.')
    return { ...base, policy: 'research_only', draftAllowed: true, sendAllowed: false }
  }

  reasons.push(`${policyDef.regime} gereklilikleri karşılandı.`)
  return { ...base, policy: 'allowed', draftAllowed: true, sendAllowed: true }
}

/** Kullanıcı arayüzünde gösterilecek kısa durum etiketi. */
export function policyLabel(policy: SendPolicy): string {
  switch (policy) {
    case 'allowed': return 'Gönderime uygun'
    case 'research_only': return 'Yalnız araştırma'
    case 'blocked': return 'Gönderim kapalı'
  }
}
