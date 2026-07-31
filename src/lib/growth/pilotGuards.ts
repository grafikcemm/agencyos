// ─────────────────────────────────────────────────────────────────────────────
// PİLOT GÜVENCELERİ — ısınma, günlük tavan, sert duraklatma.
//
// Bu kurallar KOD'da yaşıyor, bir ayar sayfasında değil. Sebep basit: bir soğuk
// e-posta pilotunda yanlış giden şey geri alınamaz. Gönderilmiş bir mail geri
// çağrılamaz; şikâyet almış bir alan adı temizlenemez. Bu yüzden kapılar
// atlanabilir değil, fail-closed.
//
// ISINMA (warmup): doğrulanmamış ısınma SIFIR sayılır. Yeni bir alan adından
// birinci gün 20 mail atmak, o alan adını yakar — ve yanan alan adı yalnız bu
// pilotu değil, gerçek müşteri yazışmasını da götürür.
//
// TAVANLAR: hafta 1 = 5, hafta 2 = 10, hafta 3+ = 20. Bu rakamlar ÖLÇÜM DEĞİL,
// seçilmiş muhafazakâr eşiklerdir; pilot ilerledikçe gerçek teslim/şikâyet
// verisiyle güncellenmeli. Öyle olduğu burada yazılı ki kimse bunları "kanıt"
// sanmasın.
//
// SERT DURAKLATMA: bounce ya da şikâyet oranı eşiği aşarsa gönderim DURUR ve
// kendiliğinden geri açılmaz. Otomatik geri açılma, aynı arızayı ikinci kez
// üretmenin en kısa yoludur.
// ─────────────────────────────────────────────────────────────────────────────

export class PilotBlockedError extends Error {
  constructor(
    readonly code:
      | 'pilot_disabled'
      | 'warmup_unverified'
      | 'warmup_insufficient'
      | 'daily_cap_reached'
      | 'hard_paused',
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'PilotBlockedError'
  }
}

/** Hafta numarasına göre günlük gönderim tavanı. */
export const DAILY_CAPS = Object.freeze([5, 10, 20])
export const MAX_DAILY_CAP = 20

/** Sert duraklatma eşikleri — seçilmiş, ölçülmüş DEĞİL. */
export const HARD_PAUSE = Object.freeze({
  /** Bu sayıdan az gönderimde oran hesaplanmaz (istatistiksel gürültü). */
  minSampleForRates: 20,
  bounceRate: 0.03,
  complaintRate: 0.001,
  /** Ardışık belirsiz/başarısız gönderim — sağlayıcı tarafında bir şey bozuk. */
  consecutiveFailures: 3,
})

export interface WarmupStatus {
  /** Isınmanın gerçekten yapıldığı DOĞRULANDI mı. Doğrulanmadıysa gönderim yok. */
  verified: boolean
  /** Isınmanın kaçıncı haftası (1 tabanlı). Bilinmiyorsa `null`. */
  weekNumber: number | null
}

export interface SendWindowStats {
  /** Bugün (İstanbul günü) yapılan gönderim sayısı. */
  sentToday: number
  /** Pilot boyunca toplam teslim edilen. */
  delivered: number
  bounced: number
  complaints: number
  consecutiveFailures: number
  /** Operatörün elle koyduğu duraklatma. */
  manualPause?: boolean
}

export interface PilotDecision {
  allowed: true
  dailyCap: number
  remainingToday: number
  weekNumber: number
}

/** Haftaya göre tavan; hafta 3 ve sonrası sabit üst sınır. */
export function capForWeek(weekNumber: number): number {
  if (!Number.isFinite(weekNumber) || weekNumber < 1) return DAILY_CAPS[0]
  const idx = Math.min(Math.floor(weekNumber) - 1, DAILY_CAPS.length - 1)
  return DAILY_CAPS[idx]
}

export type PauseReason = 'bounce_rate' | 'complaint_rate' | 'consecutive_failures' | 'manual'

/**
 * Sert duraklatma gerekiyor mu.
 *
 * Oranlar YALNIZ yeterli örneklemde hesaplanır: 3 gönderimin 1'i bounce ettiyse
 * bu %33 değil, "henüz bilmiyoruz"dur. Küçük örneklemde oran hesaplamak,
 * çalışan bir pilotu gürültü yüzünden durdururdu.
 */
export function hardPauseReasons(stats: SendWindowStats): PauseReason[] {
  const reasons: PauseReason[] = []
  if (stats.manualPause) reasons.push('manual')
  if (stats.consecutiveFailures >= HARD_PAUSE.consecutiveFailures) reasons.push('consecutive_failures')

  const sample = stats.delivered + stats.bounced
  if (sample >= HARD_PAUSE.minSampleForRates) {
    if (stats.bounced / sample >= HARD_PAUSE.bounceRate) reasons.push('bounce_rate')
    if (stats.complaints / sample >= HARD_PAUSE.complaintRate) reasons.push('complaint_rate')
  }
  return reasons
}

/**
 * Enqueue/gönderim yolunun tek kapısı.
 *
 * SIRA: bayrak → sert duraklatma → ısınma → günlük tavan. Duraklatma ısınmadan
 * ÖNCE bakılır: ısınma tamamlanmış olsa bile şikâyet alan bir hesap gönderime
 * devam etmemeli.
 */
export function assertCanEnqueue(input: {
  pilotEnabled: boolean
  warmup: WarmupStatus
  stats: SendWindowStats
}): PilotDecision {
  if (!input.pilotEnabled) {
    throw new PilotBlockedError('pilot_disabled', 'EMAIL_PILOT_ENABLED kapalı — kuyruğa alma yapılmaz.')
  }

  const pauses = hardPauseReasons(input.stats)
  if (pauses.length) {
    throw new PilotBlockedError('hard_paused', `Pilot durduruldu (${pauses.join(', ')}) — kendiliğinden açılmaz.`, {
      reasons: pauses,
    })
  }

  // DOĞRULANMAMIŞ ısınma sıfır sayılır.
  if (!input.warmup.verified) {
    throw new PilotBlockedError('warmup_unverified', 'Isınma doğrulanmadı — gönderim yapılmaz.')
  }
  if (input.warmup.weekNumber === null || input.warmup.weekNumber < 1) {
    throw new PilotBlockedError('warmup_insufficient', 'Isınma haftası bilinmiyor — tavan belirlenemez, gönderim yapılmaz.')
  }

  const dailyCap = capForWeek(input.warmup.weekNumber)
  const remainingToday = dailyCap - input.stats.sentToday
  if (remainingToday <= 0) {
    throw new PilotBlockedError('daily_cap_reached', `Günlük tavan doldu (${input.stats.sentToday}/${dailyCap}).`, {
      dailyCap,
      sentToday: input.stats.sentToday,
    })
  }

  return { allowed: true, dailyCap, remainingToday, weekNumber: Math.floor(input.warmup.weekNumber) }
}

/** Kokpit satırı — neden gönderilemediğini DEĞER olarak gösterir. */
export function describePilotGate(input: {
  pilotEnabled: boolean
  warmup: WarmupStatus
  stats: SendWindowStats
}) {
  try {
    const d = assertCanEnqueue(input)
    return { canSend: true as const, ...d, blockedReason: null }
  } catch (e) {
    const err = e instanceof PilotBlockedError ? e : null
    return {
      canSend: false as const,
      dailyCap: input.warmup.weekNumber ? capForWeek(input.warmup.weekNumber) : null,
      remainingToday: 0,
      weekNumber: input.warmup.weekNumber,
      blockedReason: err?.code ?? 'unknown',
      detail: err?.detail ?? null,
    }
  }
}
