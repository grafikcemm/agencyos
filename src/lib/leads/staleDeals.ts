// Soğuyan deal (stale) kuralları — saf fonksiyon. Bir lead, aşamasına göre belirli
// gün sayısı dokunulmazsa bir takip aksiyonu üretir. Araştırma: teklif sonrası
// takip yanıt oranını ciddi artırır; soğuyan deal sessizce ölmemeli.

export type StaleAction =
  | 'send_next_touch' // outreach aktif — sıradaki dokunuş
  | 'manual_followup' // yanıt geldi — manuel takip görevi
  | 'proposal_followup' // teklif gönderildi — hatırlatma
  | 'close_loop' // toplantı/müzakere durdu — kapanış mesajı
  | 'move_to_nurture' // teklif çok bekledi — nurture'a al
  | null

export interface StaleInput {
  status: string | null
  /** Son aktivite zamanı (ms). null ise stale sayılmaz. */
  lastActivityMs: number | null
  /** Referans an (ms). */
  nowMs: number
}

const DAY_MS = 24 * 60 * 60 * 1000

// Aşama → (eşik günü, aşılınca aksiyon). proposal'da iki kademe (önce followup, sonra nurture).
const RULES: Record<string, { days: number; action: StaleAction }> = {
  contacted: { days: 3, action: 'send_next_touch' },
  responded: { days: 2, action: 'manual_followup' },
  meeting: { days: 7, action: 'close_loop' },
  proposal: { days: 4, action: 'proposal_followup' },
}

const PROPOSAL_NURTURE_DAYS = 14

export function staleActionFor(input: StaleInput): StaleAction {
  if (input.lastActivityMs == null) return null
  const ageDays = (input.nowMs - input.lastActivityMs) / DAY_MS
  if (ageDays < 0) return null

  const status = (input.status ?? '').toLowerCase()

  if (status === 'proposal') {
    if (ageDays >= PROPOSAL_NURTURE_DAYS) return 'move_to_nurture'
    if (ageDays >= RULES.proposal.days) return 'proposal_followup'
    return null
  }

  const rule = RULES[status]
  if (rule && ageDays >= rule.days) return rule.action
  return null
}

/** Aksiyon → operatöre gösterilecek Türkçe etiket. */
export const STALE_ACTION_LABELS: Record<Exclude<StaleAction, null>, string> = {
  send_next_touch: 'Sıradaki dokunuşu gönder',
  manual_followup: 'Manuel takip — yanıt soğuyor',
  proposal_followup: 'Teklif takibi gönder',
  close_loop: 'Kapanış mesajı (close-loop)',
  move_to_nurture: 'Nurture listesine al',
}
