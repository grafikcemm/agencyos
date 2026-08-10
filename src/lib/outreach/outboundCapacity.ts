// ─────────────────────────────────────────────────────────────────────────────
// COLD EMAIL KAPASİTESİ VE DELIVERABILITY HAZIRLIĞI.
//
// Hedef: steady-state aylık 2.500–3.000 TOPLAM outbound e-posta. Bu sayı
// ilk temas + follow-up TOPLAMIDIR — 3.000 ayrı kişiye spam DEĞİLDİR.
//
// İLK AY WARM-UP AYIDIR. Sistem hazır değilken 3.000 sayısını yakalamak için
// hiçbir güvenlik kapısı gevşetilmez. `evaluateReadiness()` fail-closed'dır:
// kanıtlanmamış her koşul engeldir.
// ─────────────────────────────────────────────────────────────────────────────

export interface OutboundTarget {
  /** Aylık toplam gönderim (ilk temas + follow-up). */
  readonly monthlyTotalMin: number
  readonly monthlyTotalMax: number
  /** Aylık yeni, doğrulanmış ve uygun prospect. */
  readonly monthlyNewProspectsMin: number
  readonly monthlyNewProspectsMax: number
  /** Prospect başına EN FAZLA bir follow-up; yanıt/opt-out/bounce'ta durur. */
  readonly maxFollowUpsPerProspect: number
  readonly workingDaysPerMonth: number
}

export const OUTBOUND_TARGET: OutboundTarget = Object.freeze({
  monthlyTotalMin: 2500,
  monthlyTotalMax: 3000,
  monthlyNewProspectsMin: 1400,
  monthlyNewProspectsMax: 1600,
  maxFollowUpsPerProspect: 1,
  workingDaysPerMonth: 22,
})

/**
 * Kullanıcının 90–100 ölçülebilir etkileşim ve 1–4 ücretli müşteri hedefi
 * GARANTİ DEĞİL, DENEY HEDEFİDİR. Bu ayrım metinlerde korunur.
 */
export const OUTCOME_HYPOTHESIS = Object.freeze({
  measurableEngagementsMin: 90,
  measurableEngagementsMax: 100,
  paidClientsMin: 1,
  paidClientsMax: 4,
  label: 'deney hedefi — garanti değil',
})

export interface DailyPlan {
  perDayMin: number
  perDayMax: number
  /** İlk temas / follow-up ayrışması — "3.000 kişi" yanılgısını önler. */
  firstTouchPerDay: number
  followUpPerDay: number
}

export function dailyPlan(target: OutboundTarget = OUTBOUND_TARGET): DailyPlan {
  const d = target.workingDaysPerMonth
  const firstTouch = Math.round((target.monthlyNewProspectsMin + target.monthlyNewProspectsMax) / 2 / d)
  return {
    perDayMin: Math.round(target.monthlyTotalMin / d),
    perDayMax: Math.round(target.monthlyTotalMax / d),
    firstTouchPerDay: firstTouch,
    followUpPerDay: Math.round(target.monthlyTotalMax / d) - firstTouch,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deliverability eşikleri — Google gönderen yönergeleri.
// ─────────────────────────────────────────────────────────────────────────────
export const DELIVERABILITY_THRESHOLDS = Object.freeze({
  /** Postmaster spam oranı hedefi. */
  spamRateTarget: 0.001,
  /** Bu değere ULAŞILDIĞINDA gönderim SERT DURDURULUR. */
  spamRateHardStop: 0.003,
  hardBounceCeiling: 0.02,
  hardBounceOperationalTarget: 0.01,
})

export interface MailboxPlan {
  /** Ana web domaini cold outreach'te KULLANILMAZ. */
  readonly primaryDomainUsedForOutreach: false
  readonly secondaryDomainsMin: number
  readonly secondaryDomainsMax: number
  readonly mailboxesMin: number
  readonly mailboxesMax: number
  /** Mailbox başına warm-up rampası (gün → günlük azami). */
  readonly warmupRamp: readonly { day: number; maxPerDay: number }[]
}

export const MAILBOX_PLAN: MailboxPlan = Object.freeze({
  primaryDomainUsedForOutreach: false,
  secondaryDomainsMin: 2,
  secondaryDomainsMax: 3,
  mailboxesMin: 5,
  mailboxesMax: 6,
  // Ani sıçrama yok: her mailbox düşük hacimden kademeli çıkar.
  warmupRamp: Object.freeze([
    { day: 1, maxPerDay: 5 },
    { day: 4, maxPerDay: 10 },
    { day: 8, maxPerDay: 15 },
    { day: 15, maxPerDay: 20 },
    { day: 22, maxPerDay: 25 },
    { day: 30, maxPerDay: 30 },
  ]),
})

/** Warm-up rampasındaki gün için azami günlük hacim. */
export function warmupCeiling(dayIndex: number, plan: MailboxPlan = MAILBOX_PLAN): number {
  let ceiling = 0
  for (const step of plan.warmupRamp) {
    if (dayIndex >= step.day) ceiling = step.maxPerDay
  }
  return ceiling
}

/** Tam kapasitede kaç mailbox gerekir — hedef ile rampa tutarlı mı. */
export function requiredMailboxes(target: OutboundTarget = OUTBOUND_TARGET, plan: MailboxPlan = MAILBOX_PLAN): number {
  const perDay = Math.ceil(target.monthlyTotalMax / target.workingDaysPerMonth)
  const steadyPerMailbox = plan.warmupRamp[plan.warmupRamp.length - 1].maxPerDay
  return Math.ceil(perDay / steadyPerMailbox)
}

// ─────────────────────────────────────────────────────────────────────────────
// Hazırlık kontrol listesi — hepsi kanıtlanmadan gerçek gönderim açılmaz.
// ─────────────────────────────────────────────────────────────────────────────
export type ReadinessCheck =
  | 'spf'
  | 'dkim'
  | 'dmarc_alignment'
  | 'tls'
  | 'separate_sending_domain'
  | 'tracking_domain_secured'
  | 'one_click_unsubscribe'
  | 'postmaster_monitoring'
  | 'warmup_completed'
  | 'legal_country_policy_approved'
  | 'user_explicit_send_consent'

export const READINESS_CHECKS: readonly ReadinessCheck[] = [
  'spf',
  'dkim',
  'dmarc_alignment',
  'tls',
  'separate_sending_domain',
  'tracking_domain_secured',
  'one_click_unsubscribe',
  'postmaster_monitoring',
  'warmup_completed',
  'legal_country_policy_approved',
  'user_explicit_send_consent',
] as const

const READINESS_LABEL: Record<ReadinessCheck, string> = {
  spf: 'SPF kaydı',
  dkim: 'DKIM imzası',
  dmarc_alignment: 'DMARC hizalaması',
  tls: 'TLS aktarımı',
  separate_sending_domain: 'Ana web domaininden ayrı gönderim domaini',
  tracking_domain_secured: 'Ayrı takip domaininin güvenliği',
  one_click_unsubscribe: 'Tek tık abonelikten çıkma',
  postmaster_monitoring: 'Postmaster/sağlık ölçümü',
  warmup_completed: 'Mailbox ısıtması tamamlandı',
  legal_country_policy_approved: 'Ülke bazlı hukuki onay',
  user_explicit_send_consent: 'Kullanıcının ayrı gerçek-gönderim onayı',
}

export interface ReadinessState {
  checks: Partial<Record<ReadinessCheck, boolean>>
  /** Ölçülen spam oranı (0-1). Bilinmiyorsa null → hazır sayılmaz. */
  spamRate: number | null
  /** Ölçülen hard bounce oranı (0-1). Bilinmiyorsa null → hazır sayılmaz. */
  hardBounceRate: number | null
  /** Gerçek gönderim bayrakları. */
  gmailSendEnabled: boolean
  instantlyEnabled: boolean
}

export interface ReadinessVerdict {
  ready: boolean
  /** Kullanıcı diliyle engeller — ham enum değil. */
  blockers: string[]
  missingChecks: ReadinessCheck[]
  /** Sert durdurma tetiklendi mi (ölçülen spam oranı eşiği aştı). */
  hardStop: boolean
}

/**
 * FAIL-CLOSED: kanıtlanmamış her koşul engeldir. Ölçüm yoksa "iyi" varsayılmaz.
 */
export function evaluateReadiness(state: ReadinessState): ReadinessVerdict {
  const missingChecks = READINESS_CHECKS.filter((c) => state.checks[c] !== true)
  const blockers: string[] = missingChecks.map((c) => READINESS_LABEL[c] + ' eksik')

  let hardStop = false
  if (state.spamRate == null) blockers.push('Spam oranı ölçülmedi')
  else if (state.spamRate >= DELIVERABILITY_THRESHOLDS.spamRateHardStop) {
    hardStop = true
    blockers.push(
      `Spam oranı %${(state.spamRate * 100).toFixed(2)} — sert durdurma eşiği %${(DELIVERABILITY_THRESHOLDS.spamRateHardStop * 100).toFixed(2)}`,
    )
  }

  if (state.hardBounceRate == null) blockers.push('Hard bounce oranı ölçülmedi')
  else if (state.hardBounceRate > DELIVERABILITY_THRESHOLDS.hardBounceCeiling) {
    blockers.push(`Hard bounce %${(state.hardBounceRate * 100).toFixed(1)} — tavan %2`)
  }

  if (!state.gmailSendEnabled && !state.instantlyEnabled) {
    blockers.push('Gerçek gönderim bayrağı kapalı (GMAIL_SEND_ENABLED / INSTANTLY_ENABLED)')
  }

  return { ready: blockers.length === 0 && !hardStop, blockers, missingChecks, hardStop }
}

/**
 * Ortamdan okunan hazırlık.
 *
 * `OUTBOUND_READINESS_CONFIRMED` — operatörün DOĞRULADIĞI kontrollerin virgüllü
 * listesi (ör. `spf,dkim,dmarc_alignment`). Tanımsızsa HİÇBİRİ doğrulanmamıştır.
 * `OUTBOUND_SPAM_RATE` / `OUTBOUND_HARD_BOUNCE_RATE` — Postmaster'dan okunan
 * ölçümler. Tanımsızsa `null` kalır ve hazırlık DÜŞER (ölçüm yoksa "iyi" değil).
 *
 * Bu, bir bypass DEĞİL bir BEYAN yüzeyidir: hepsi tek tek listelenmeden hazırlık
 * oluşmaz ve `user_explicit_send_consent` de listenin bir üyesidir.
 */
export function readinessFromEnv(env: Record<string, string | undefined> = process.env): ReadinessState {
  const confirmed = (env.OUTBOUND_READINESS_CONFIRMED ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => (READINESS_CHECKS as readonly string[]).includes(s)) as ReadinessCheck[]
  const num = (raw: string | undefined): number | null => {
    if (raw == null || raw.trim() === '') return null
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  return {
    checks: Object.fromEntries(confirmed.map((c) => [c, true])),
    spamRate: num(env.OUTBOUND_SPAM_RATE),
    hardBounceRate: num(env.OUTBOUND_HARD_BOUNCE_RATE),
    gmailSendEnabled: env.GMAIL_SEND_ENABLED === 'true',
    instantlyEnabled: env.INSTANTLY_ENABLED === 'true',
  }
}

/**
 * Gönderim altyapısı bu an gönderime hazır mı — `leadPolicyGate` bunu
 * `mailboxReady` olarak kullanır. Ölçüm yokken DAİMA false.
 */
export function mailboxReady(state: ReadinessState = readinessFromEnv()): boolean {
  return evaluateReadiness(state).ready
}

/**
 * "Etkileşim" open pixel DEĞİLDİR. Ölçülebilir sonuç merdiveni — her basamak
 * KENDİ paydasıyla raporlanır, tek bir "başarı" sayısı üretilmez.
 */
export const ENGAGEMENT_LADDER = [
  { key: 'delivered', label: 'Ulaştı', denominator: 'sent' },
  { key: 'reply', label: 'Yanıt', denominator: 'delivered' },
  { key: 'positive_reply', label: 'Olumlu yanıt', denominator: 'delivered' },
  { key: 'qualified_reply', label: 'Nitelikli yanıt', denominator: 'delivered' },
  { key: 'meeting', label: 'Görüşme', denominator: 'delivered' },
  { key: 'proposal', label: 'Teklif', denominator: 'meeting' },
  { key: 'paid_entry_offer', label: 'Ücretli giriş teklifi', denominator: 'meeting' },
  { key: 'core_project', label: 'Ana proje', denominator: 'paid_entry_offer' },
  { key: 'retained_client', label: 'Kalıcı müşteri', denominator: 'core_project' },
] as const

/** Open tracking VARSAYILAN KAPALI — üçüncü taraf open-rate'i güvenilir değil. */
export const OPEN_TRACKING_DEFAULT_ENABLED = false
