// KARİYER KOKPİTİ — /gelisim ekranının veri modeli.
//
// ─────────────────────────────────────────────────────────────────────────────
// NE DEĞİŞTİ
//
// Eski model: 45 eş ağırlıklı beceri kartı + 67 kaynak linki + "Tamamlandı"
// düğmesi. Hacim ilerleme sanılıyordu.
//
// Yeni model: dört aylık rota + ayın TEK ana çıktısı + haftanın TEK teslimi +
// DOĞRULANMIŞ kanıt. İlerleme yalnız `verified` kanıttan hesaplanır; manuel
// işaretleme tek başına bir ayı açmaz.
//
// ─────────────────────────────────────────────────────────────────────────────
// "ÖLÇÜLMEDİ" ≠ "0"
//
// Kapasite GrafikcemOS'tan gelir. Köprü kapalıysa `actualHours` NULL kalır ve
// ekran "ölçülmedi" yazar. `0` yazmak, Cem'in o hafta hiç çalışmadığını iddia
// etmek olurdu — sistem bunu bilmiyor.

import {
  CAREER_MONTHS,
  CONTINUOUS_LANES,
  NORTH_STAR,
  WEEKLY_CAPACITY,
  WEEKLY_CAPACITY_TOTAL,
  type CareerMonth,
  type ContinuousLane,
  type EvidenceRequirement,
} from '@/data/careerRoute'
import { countsTowardProgress, degradesProgress, type VerificationStatus } from './evidenceFetch'

export interface EvidenceRecord {
  id: string
  requirement_id: string | null
  competency_id: string | null
  month_id: string | null
  kind: string
  url: string | null
  title: string
  verification_status: VerificationStatus
  occurred_at: string
  verified_at: string | null
}

/** GrafikcemOS'tan gelen kapasite özeti. PII taşımaz. */
export interface CapacitySummary {
  /** Bu hafta kariyer işine ayrılabilen GERÇEK saat. Bilinmiyorsa null. */
  actualHours: number | null
  /** 'light' | 'normal' | 'heavy' — yoğunluk sınıfı. */
  loadClass: string | null
  /** Teslim/toplantı çakışması var mı. */
  hasConflict: boolean
  /** Kullanıcının kilitlediği öncelik. */
  lockedPriority: string | null
}

export type MonthState = 'done' | 'current' | 'next' | 'locked'

export interface MonthProgress {
  month: CareerMonth
  state: MonthState
  verifiedCount: number
  totalCount: number
  /** Doğrulanmış kanıtı olan gereksinimler. */
  satisfied: string[]
  /** Kanıt bekleyen gereksinimler. */
  awaiting: EvidenceRequirement[]
  /** Bu ayı kilitleyen önceki kanıtlar (yalnız `locked` durumda dolu). */
  lockedBy: string[]
}

export interface LaneStatus {
  lane: ContinuousLane
  /** Son 7 günde bu şerit için kanıt geldi mi. */
  recentProof: boolean
  isBlocker: boolean
}

export interface EvidenceTally {
  verified: number
  pending: number
  grace: number
  unreachable: number
  total: number
}

export interface CareerCockpit {
  northStar: typeof NORTH_STAR
  months: MonthProgress[]
  current: MonthProgress
  /** Bu haftanın TEK ana teslimi. */
  weekMilestone: { title: string; index: number; total: number }
  lanes: LaneStatus[]
  evidence: EvidenceTally
  capacity: {
    plannedHours: number
    breakdown: typeof WEEKLY_CAPACITY
    actualHours: number | null
    /** Kapasite kaynağı — 'cemos' veya 'olculmedi'. */
    source: 'cemos' | 'olculmedi'
    loadClass: string | null
    hasConflict: boolean
  }
  /** Sıradaki bağımlılık/engel. Yoksa null. */
  nextBlocker: string | null
  /** Veri kaynağı sağlığı — LIFE DB okunamadıysa görünür olsun. */
  degraded: { evidence: boolean; capacity: boolean }
}

const MS_PER_DAY = 86_400_000

/**
 * Kokpiti hesaplar. SAF — veritabanına gitmez, `Date.now()` çağırmaz.
 *
 * @param evidence LIFE DB'deki kanıt kayıtları
 * @param capacity GrafikcemOS özeti; köprü kapalıysa null
 * @param nowMs    "şimdi" — deterministik test için dışarıdan
 */
export function computeCockpit(
  evidence: EvidenceRecord[],
  capacity: CapacitySummary | null,
  nowMs: number,
  degraded: { evidence: boolean; capacity: boolean } = { evidence: false, capacity: false },
): CareerCockpit {
  const tally: EvidenceTally = { verified: 0, pending: 0, grace: 0, unreachable: 0, total: evidence.length }
  for (const e of evidence) tally[e.verification_status] += 1

  // Bir gereksinim, DOĞRULANMIŞ en az bir kanıtla karşılanır.
  // `grace` saymaz ama düşürmez de: geçici belirsizlik ne kayıp ne kazanç.
  const satisfiedIds = new Set(
    evidence
      .filter((e) => e.requirement_id && countsTowardProgress(e.verification_status))
      .map((e) => e.requirement_id as string),
  )

  // Erişilemez hale gelmiş kanıt, daha önce sağlanmış bir gereksinimi DÜŞÜRÜR —
  // ama yalnız o gereksinimin başka doğrulanmış kanıtı yoksa.
  for (const e of evidence) {
    if (e.requirement_id && degradesProgress(e.verification_status)) {
      const hasOther = evidence.some(
        (o) =>
          o.requirement_id === e.requirement_id &&
          o.id !== e.id &&
          countsTowardProgress(o.verification_status),
      )
      if (!hasOther) satisfiedIds.delete(e.requirement_id)
    }
  }

  const months: MonthProgress[] = CAREER_MONTHS.map((month) => {
    const total = month.evidenceRequirements.length
    const satisfied = month.evidenceRequirements.filter((r) => satisfiedIds.has(r.id))
    const awaiting = month.evidenceRequirements.filter((r) => !satisfiedIds.has(r.id))
    const lockedBy = month.dependsOnEvidence.filter((id) => !satisfiedIds.has(id))

    return {
      month,
      state: 'locked' as MonthState, // aşağıda düzeltilir
      verifiedCount: satisfied.length,
      totalCount: total,
      satisfied: satisfied.map((r) => r.id),
      awaiting,
      lockedBy,
    }
  })

  // Durum atama: bağımlılığı karşılanmış ve kendi kanıtı eksik olan İLK ay
  // "current". Öncesindekiler "done", sonrakiler "next"/"locked".
  let currentIndex = months.findIndex((m) => m.lockedBy.length === 0 && m.verifiedCount < m.totalCount)
  if (currentIndex === -1) {
    // Hepsi tamamsa son ay güncel kalır; hiçbiri açık değilse ilk ay.
    currentIndex = months.every((m) => m.verifiedCount === m.totalCount) ? months.length - 1 : 0
  }

  months.forEach((m, i) => {
    if (i < currentIndex) m.state = 'done'
    else if (i === currentIndex) m.state = 'current'
    else if (m.lockedBy.length === 0) m.state = 'next'
    else m.state = 'locked'
  })

  const current = months[currentIndex]

  // Haftanın tek teslimi: ayın karşılanmış kanıt sayısına göre ilerler.
  const milestones = current.month.weeklyMilestones
  const milestoneIndex = Math.min(current.verifiedCount, milestones.length - 1)

  const sevenDaysAgo = nowMs - 7 * MS_PER_DAY
  const lanes: LaneStatus[] = CONTINUOUS_LANES.map((lane) => ({
    lane,
    recentProof: evidence.some(
      (e) =>
        e.competency_id === lane.id &&
        countsTowardProgress(e.verification_status) &&
        Date.parse(e.occurred_at) >= sevenDaysAgo,
    ),
    isBlocker: Boolean(lane.blocker),
  }))

  // Sıradaki engel önceliği: (1) blocker şeritler, (2) ayın eksik kanıtı,
  // (3) kapasite çakışması. Tek satır gösterilir — liste karar verdirmez.
  let nextBlocker: string | null = null
  const blockerLane = lanes.find((l) => l.isBlocker && !l.recentProof)
  if (blockerLane?.lane.blocker) {
    nextBlocker = blockerLane.lane.blocker
  } else if (current.awaiting.length > 0) {
    nextBlocker = `Kanıt bekliyor: ${current.awaiting[0].title}`
  } else if (capacity?.hasConflict) {
    nextBlocker = 'Bu hafta teslim veya toplantı çakışması var'
  }

  return {
    northStar: NORTH_STAR,
    months,
    current,
    weekMilestone: {
      title: milestones[milestoneIndex],
      index: milestoneIndex + 1,
      total: milestones.length,
    },
    lanes,
    evidence: tally,
    capacity: {
      plannedHours: WEEKLY_CAPACITY_TOTAL,
      breakdown: WEEKLY_CAPACITY,
      actualHours: capacity?.actualHours ?? null,
      source: capacity?.actualHours == null ? 'olculmedi' : 'cemos',
      loadClass: capacity?.loadClass ?? null,
      hasConflict: capacity?.hasConflict ?? false,
    },
    nextBlocker,
    degraded,
  }
}

/**
 * LIFE DB'den kanıtları okur ve kokpiti kurar.
 *
 * FAIL-SOFT: kanıt tablosu yoksa (migration 008 uygulanmamış) veya okuma
 * başarısızsa boş kanıtla devam eder ve `degraded.evidence` işaretlenir.
 * Ekranın komple çökmesi, "kanıt yok" bilgisinden daha kötüdür — ama sessizce
 * "her şey yolunda" göstermek de kabul edilmez.
 */
export async function loadCareerCockpit(nowMs: number = Date.now()): Promise<CareerCockpit> {
  const degraded = { evidence: false, capacity: false }
  let evidence: EvidenceRecord[] = []

  try {
    const { lifeSupabaseAdmin } = await import('@/lib/lifeSupabaseAdmin')
    const { data, error } = await lifeSupabaseAdmin
      .from('career_evidence')
      .select('id,requirement_id,competency_id,month_id,kind,url,title,verification_status,occurred_at,verified_at')
      .order('occurred_at', { ascending: false })
      .limit(500)

    if (error) degraded.evidence = true
    else evidence = (data ?? []) as unknown as EvidenceRecord[]
  } catch {
    degraded.evidence = true
  }

  // Kapasite köprüsü: GrafikcemOS → AgencyOS yönü henüz canlı değil.
  // Bilinçli olarak null bırakılır; ekran "ölçülmedi" yazar, 0 yazmaz.
  const capacity: CapacitySummary | null = null
  degraded.capacity = true

  return computeCockpit(evidence, capacity, nowMs, degraded)
}
