// ─────────────────────────────────────────────────────────────────────────────
// Persuasion OUTCOME telemetry (FINAL PILOT BLOCKERS Faz 7).
//
// 180 sentetik matris "üst düzey ikna kanıtı" DEĞİLDİR (audit bulgu #11). Bu
// modül GERÇEK funnel sonuçlarını (sent → reply → positive reply → meeting →
// proposal → won) sektör/aşama bazında toplar ve — YETERSİZ örnekte — SAHTE
// "optimize edildi" iddiası yapmadan dürüst "yetersiz veri" işaretler.
//
// Saf hesap (deterministik): sayımlar enjekte edilen ham satırlardan üretilir;
// I/O çağıran ince runner ayrıdır.
// ─────────────────────────────────────────────────────────────────────────────

/** Bir funnel adımını üretmek için gereken MİNİMUM gerçek gözlem — altında
 *  "optimize et" iddiası YAPILMAZ, yalnız dürüst "yetersiz veri". */
export const MIN_SAMPLES_FOR_SIGNAL = 20

export interface FunnelCounts {
  sent: number
  replied: number
  positiveReplied: number
  meeting: number
  proposal: number
  won: number
}

export interface SegmentTelemetry {
  segment: string // sektör ya da 'all'
  counts: FunnelCounts
  /** Oranlar YALNIZ yeterli örnekte anlamlıdır. */
  replyRate: number | null
  positiveRate: number | null
  meetingRate: number | null
  wonRate: number | null
  /** true → örnek sayısı MIN_SAMPLES altında; oranlar null; iddia YAPILMAZ. */
  insufficientData: boolean
}

export interface OutcomeInputRow {
  sector: string | null
  /** outreach gönderildi mi (sent_at dolu / status sent). */
  sent: boolean
  /** lead'e inbound cevap geldi mi. */
  replied: boolean
  /** cevap pozitif mi (FSM positive_interest ya da lead responded+ilerledi). */
  positive: boolean
  /** lead meeting aşamasına geçti mi. */
  meeting: boolean
  /** lead için teklif oluşturuldu mu. */
  proposal: boolean
  /** lead converted/won mu. */
  won: boolean
}

function ratio(num: number, den: number, enough: boolean): number | null {
  if (!enough || den === 0) return null
  return Math.round((num / den) * 1000) / 1000
}

function summarize(segment: string, rows: OutcomeInputRow[]): SegmentTelemetry {
  const counts: FunnelCounts = {
    sent: rows.filter((r) => r.sent).length,
    replied: rows.filter((r) => r.replied).length,
    positiveReplied: rows.filter((r) => r.positive).length,
    meeting: rows.filter((r) => r.meeting).length,
    proposal: rows.filter((r) => r.proposal).length,
    won: rows.filter((r) => r.won).length,
  }
  const enough = counts.sent >= MIN_SAMPLES_FOR_SIGNAL
  return {
    segment,
    counts,
    replyRate: ratio(counts.replied, counts.sent, enough),
    positiveRate: ratio(counts.positiveReplied, counts.sent, enough),
    meetingRate: ratio(counts.meeting, counts.sent, enough),
    wonRate: ratio(counts.won, counts.sent, enough),
    insufficientData: !enough,
  }
}

export interface OutcomeReport {
  overall: SegmentTelemetry
  bySector: SegmentTelemetry[]
  /** GERÇEK sonuç sinyali var mı — hiçbir segment yeterli değilse false; UI
   *  "kalibrasyon için gerçek gönderim gerekli" der (sahte optimizasyon yok). */
  hasSignal: boolean
}

/** Ham satırlardan segment raporu üretir (saf). */
export function computeOutcomeTelemetry(rows: OutcomeInputRow[]): OutcomeReport {
  const overall = summarize('all', rows)
  const sectors = new Map<string, OutcomeInputRow[]>()
  for (const r of rows) {
    const key = r.sector?.trim() || 'bilinmeyen'
    const list = sectors.get(key) ?? []
    list.push(r)
    sectors.set(key, list)
  }
  const bySector = [...sectors.entries()]
    .map(([sector, list]) => summarize(sector, list))
    .sort((a, b) => b.counts.sent - a.counts.sent)
  const hasSignal = !overall.insufficientData || bySector.some((s) => !s.insufficientData)
  return { overall, bySector, hasSignal }
}
