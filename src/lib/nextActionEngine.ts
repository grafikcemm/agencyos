// Next Best Action Engine — her lead için bir sonraki en mantıklı aksiyon.
// Callers (future): src/app/(os)/pipeline/page.tsx, dashboard, LeadDrawer.
// No existing nextAction* file (Glob boş). Saf hesaplama, I/O yok.

import { Lead, Priority } from './types'

export interface NextAction {
  label: string
  detail?: string
  priority: Priority
  category: 'message' | 'followup' | 'proposal' | 'meeting' | 'project' | 'wait'
  isOverdue: boolean
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24))
}

function parseDate(s?: string | null): Date | undefined {
  if (!s) return undefined
  const d = new Date(s)
  return isNaN(d.getTime()) ? undefined : d
}

const STAGE_SLA_DAYS: Record<string, number> = {
  new: 3,
  contacted: 4,
  responded: 3,
  meeting: 5,
  proposal: 5,
}

export function computeNextAction(lead: Partial<Lead>, now: Date = new Date()): NextAction {
  const status = lead.status || 'new'
  const total = lead.scores?.total ?? lead.potential_score ?? 0

  const followUpAt = parseDate(lead.next_follow_up_at)
  if (followUpAt && followUpAt <= now) {
    const lateDays = daysBetween(now, followUpAt)
    return {
      label: lateDays > 0 ? `Takip gecikmiş — ${lateDays} gündür bekliyor` : 'Bugün takip yapılacak',
      detail: 'Planlanmış follow-up zamanı geldi.',
      priority: 'high',
      category: 'followup',
      isOverdue: lateDays > 0,
    }
  }

  if (total > 0 && total < 50) {
    return {
      label: 'Düşük öncelik — bekleme listesine al',
      detail: 'Bu lead düşük öncelikli görünüyor. Önce daha sıcak lead\'lere odaklan.',
      priority: 'low',
      category: 'wait',
      isOverdue: false,
    }
  }

  const stageEnteredAt = parseDate(lead.stage_entered_at) || parseDate(lead.last_contact_at) || parseDate(lead.created_at)
  const stageAge = stageEnteredAt ? daysBetween(now, stageEnteredAt) : 0
  const sla = STAGE_SLA_DAYS[status] ?? 7
  const overdue = stageAge >= sla

  switch (status) {
    case 'new':
      return {
        label: total >= 80 ? 'Bugün ilk mesajı gönder' : 'İlk mesaj veya mini audit gönder',
        detail: total >= 80
          ? 'Yüksek skor — hemen iletişime geç.'
          : 'Önce mini audit veya değer gösteren bir mesaj at, fiyatı bahsetme.',
        priority: total >= 80 ? 'high' : 'normal',
        category: 'message',
        isOverdue: overdue,
      }
    case 'contacted':
      return {
        label: overdue ? 'Takip mesajı at — yanıt yok' : 'Yanıtı bekle, gerekirse hatırlat',
        detail: overdue
          ? `${stageAge} gündür yanıt yok. Farklı kanaldan (WA / Instagram) hatırlatmayı dene.`
          : 'Yanıt için 2-3 iş günü bekle.',
        priority: overdue ? 'high' : 'normal',
        category: 'followup',
        isOverdue: overdue,
      }
    case 'responded':
      return {
        label: 'Toplantı veya kısa keşif görüşmesi ayarla',
        detail: 'Yanıt geldi — fiyat söylemeden önce ihtiyacı net çıkar.',
        priority: 'high',
        category: 'meeting',
        isOverdue: overdue,
      }
    case 'meeting':
      return {
        label: 'Toplantı sonrası teklif hazırla',
        detail: 'Toplantı yapıldıysa 24-48 saat içinde teklif çıkar.',
        priority: 'high',
        category: 'proposal',
        isOverdue: overdue,
      }
    case 'proposal':
      return {
        label: overdue ? 'Teklif takibi gerekli' : 'Teklif yanıtı bekleniyor',
        detail: overdue
          ? `${stageAge} gündür yanıt yok. Kısa bir takip mesajı at, gerekirse kapanış sorularını sor.`
          : 'Müşteriye karar süresi tanı, 2-3 gün sonra takip et.',
        priority: overdue ? 'high' : 'normal',
        category: overdue ? 'followup' : 'proposal',
        isOverdue: overdue,
      }
    case 'converted':
      return {
        label: 'Projeye dönüştür ve onboarding başlat',
        detail: 'İlk görüşme notlarını kaydet, erişimleri al, kickoff planla.',
        priority: 'high',
        category: 'project',
        isOverdue: false,
      }
    case 'lost':
    case 'waiting':
      return {
        label: 'Beklemeye al — 30 gün sonra tekrar değerlendir',
        detail: '30 gün sonra sektör veya bütçe koşulları değişmiş olabilir.',
        priority: 'low',
        category: 'wait',
        isOverdue: false,
      }
    default:
      return {
        label: 'Durumu güncelle',
        detail: 'Lead status alanı tanımlanmamış. Pipeline\'da doğru aşamaya taşı.',
        priority: 'normal',
        category: 'message',
        isOverdue: false,
      }
  }
}

export function stageAgeDays(lead: Partial<Lead>, now: Date = new Date()): number {
  const d = parseDate(lead.stage_entered_at) || parseDate(lead.last_contact_at) || parseDate(lead.created_at)
  return d ? daysBetween(now, d) : 0
}
