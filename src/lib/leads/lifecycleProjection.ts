// Lead yaşam döngüsü PROJEKSİYONU — okuma tarafı, tek yön.
//
// ─────────────────────────────────────────────────────────────────────────────
// TEK DOĞRULUK KAYNAĞI
//
// Sistemde `lifecycle_stage` diye bir sütun YOKTUR ve olmayacaktır. Aşama,
// iki mevcut kaynaktan TÜRETİLİR:
//   • `leads.status`               — yazılabilir tek durum alanı (mig 058/069)
//   • `lead_lifecycle_events`      — append-only geçiş akışı (mig 069)
//
// Bu modül saf fonksiyonlardan oluşur: veritabanına gitmez, yazmaz. Böylece
// projeksiyon mantığı testte tam kapsanabilir ve UI ile arka uç aynı sonucu
// üretmek zorunda kalır.
//
// RECONCILIATION: `reconcile()` projeksiyonun `leads.status` ile çeliştiği anı
// yakalar. Çelişki bir HATA değil, bir SİNYALDİR — RPC dışından yapılmış bir
// yazma veya uygulanmamış bir migration anlamına gelir ve görünür olmalıdır.

export const LIFECYCLE_STAGES = [
  'found',              // hesap bulundu
  'signal_verified',    // sinyal doğrulandı (kanıt URL + tarih)
  'qualified',          // nitelendirildi (açıklanabilir skor)
  'contact_enriched',   // kişi zenginleştirildi
  'compliance_checked', // uygunluk kontrol edildi
  'drafted',            // taslak hazırlandı
  'awaiting_approval',  // insan onayı bekliyor
  'sent',               // gönderildi
  'replied',            // yanıtlandı
  'converted',          // dönüştü
  'onboarded',          // onboard edildi
  'case_produced',      // vaka üretildi
  'grown',              // büyüdü
] as const

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number]

/** Olumsuz sonuçlar ilerlemenin bir parçası değil, akışın SONUdur. */
export const TERMINAL_STAGES = ['disqualified', 'suppressed', 'lost', 'archived'] as const
export type TerminalStage = (typeof TERMINAL_STAGES)[number]

export type Stage = LifecycleStage | TerminalStage | 'unknown'

/** RPC eylemi → ulaşılan aşama. Mevcut 5 eylem burada YOK: olay yazmıyorlar. */
const ACTION_TO_STAGE: Record<string, Stage> = {
  verify_signal: 'signal_verified',
  qualify: 'qualified',
  enrich_contact: 'contact_enriched',
  compliance_check: 'compliance_checked',
  draft: 'drafted',
  request_approval: 'awaiting_approval',
  send: 'sent',
  reply: 'replied',
  convert: 'converted',
  onboard: 'onboarded',
  produce_case: 'case_produced',
  grow: 'grown',
  disqualify: 'disqualified',
  suppress: 'suppressed',
  archive: 'archived',
}

const STAGE_ORDER = new Map<string, number>(LIFECYCLE_STAGES.map((s, i) => [s, i]))

export function isTerminal(stage: Stage): stage is TerminalStage {
  return (TERMINAL_STAGES as readonly string[]).includes(stage)
}

export interface LifecycleEvent {
  action: string
  from_status: string | null
  to_status: string
  evidence: Record<string, unknown> | null
  actor: string
  occurred_at: string
}

/** Projeksiyon için gereken minimum lead alanları. `select('*')` gerekmez. */
export interface LeadProjectionInput {
  status: string | null
  evidence_urls?: unknown
  verified_at?: string | null
  research_score?: number | null
  contact_status?: string | null
  lawful_basis?: string | null
  suppression_status?: string | null
  contacted_at?: string | null
  replied_at?: string | null
  converted_at?: string | null
  archived_at?: string | null
}

export interface Projection {
  /** Ulaşılmış en ileri aşama. Terminal ise akış kapanmıştır. */
  stage: Stage
  /** Sırayla tamamlanmış aşamalar. */
  reached: Stage[]
  /** Sıradaki güvenli aşama; terminal veya son aşamada `null`. */
  next: LifecycleStage | null
  /** `next`e geçmek için eksik olan kanıt/koşullar. Boşsa geçiş serbest. */
  blockers: string[]
  terminal: boolean
}

/** Aşamaya geçebilmek için sağlanması gereken önkoşullar. */
function blockersFor(stage: LifecycleStage, lead: LeadProjectionInput): string[] {
  const missing: string[] = []
  switch (stage) {
    case 'signal_verified': {
      const urls = lead.evidence_urls
      const hasUrls = Array.isArray(urls) ? urls.length > 0 : Boolean(urls)
      if (!hasUrls) missing.push('kanıt URL’si yok')
      if (!lead.verified_at) missing.push('doğrulama tarihi yok')
      break
    }
    case 'qualified':
      if (lead.research_score == null) missing.push('açıklanabilir skor yok')
      break
    case 'contact_enriched':
      if (!lead.contact_status || lead.contact_status === 'unenriched') {
        missing.push('karar verici doğrulanmadı')
      }
      break
    case 'compliance_checked':
      if (!lead.lawful_basis) missing.push('yasal dayanak tanımsız')
      if ((lead.suppression_status ?? 'unknown') !== 'clear') {
        missing.push('suppression durumu clear değil')
      }
      break
    case 'sent':
      missing.push('insan onayı gerekir (otomatik gönderim yok)')
      break
    case 'case_produced':
      missing.push('müşteri izni gerekir')
      break
    default:
      break
  }
  return missing
}

/**
 * Olay akışı + lead durumundan aşamayı türetir.
 *
 * Olaylar sıralı gelmek ZORUNDA DEĞİL — en ileri aşama alınır. Terminal bir
 * olay varsa, sırası ne olursa olsun akış kapanmış sayılır: bir lead
 * suppress edildikten sonra "ileri" gitmiş gibi gösterilemez.
 */
export function project(lead: LeadProjectionInput, events: LifecycleEvent[]): Projection {
  const reached: Stage[] = []
  let terminalStage: TerminalStage | null = null
  let bestIndex = -1

  for (const ev of events) {
    const stage = ACTION_TO_STAGE[ev.action]
    if (!stage) continue
    if (isTerminal(stage)) {
      terminalStage = stage
      continue
    }
    const idx = STAGE_ORDER.get(stage)
    if (idx == null) continue
    if (!reached.includes(stage)) reached.push(stage)
    if (idx > bestIndex) bestIndex = idx
  }

  // Olay akışı yoksa `leads.status` tek kanıttır (mig 069 öncesi kayıtlar).
  if (bestIndex < 0 && !terminalStage) {
    const fromStatus = stageFromStatus(lead.status)
    if (fromStatus && !isTerminal(fromStatus)) {
      bestIndex = STAGE_ORDER.get(fromStatus) ?? -1
      if (bestIndex >= 0) reached.push(fromStatus)
    } else if (fromStatus && isTerminal(fromStatus)) {
      terminalStage = fromStatus
    }
  }

  reached.sort((a, b) => (STAGE_ORDER.get(a) ?? 0) - (STAGE_ORDER.get(b) ?? 0))

  if (terminalStage) {
    return { stage: terminalStage, reached, next: null, blockers: [], terminal: true }
  }

  if (bestIndex < 0) {
    return {
      stage: 'found',
      reached: [],
      next: 'signal_verified',
      blockers: blockersFor('signal_verified', lead),
      terminal: false,
    }
  }

  const current = LIFECYCLE_STAGES[bestIndex]
  const next = bestIndex + 1 < LIFECYCLE_STAGES.length ? LIFECYCLE_STAGES[bestIndex + 1] : null

  return {
    stage: current,
    reached,
    next,
    blockers: next ? blockersFor(next, lead) : [],
    terminal: false,
  }
}

/** `leads.status` → kaba aşama karşılığı. Olay akışı yoksa kullanılır. */
export function stageFromStatus(status: string | null | undefined): Stage | null {
  switch (status) {
    case 'new':
      return 'found'
    case 'contacted':
      return 'sent'
    case 'responded':
      return 'replied'
    case 'meeting':
      return 'converted'
    case 'proposal':
      return 'converted'
    case 'converted':
      return 'onboarded'
    case 'waiting':
      return 'sent'
    case 'lost':
      return 'lost'
    case 'disqualified':
      return 'disqualified'
    case 'suppressed':
      return 'suppressed'
    case 'archived':
      return 'archived'
    default:
      return null
  }
}

export interface Reconciliation {
  consistent: boolean
  /** İnsan tarafından okunabilir tutarsızlık açıklaması. */
  drift: string | null
  projectedStage: Stage
  statusStage: Stage | null
}

/**
 * Projeksiyonun `leads.status` ile çelişip çelişmediğini söyler.
 *
 * Çelişki bir istisna fırlatmaz: RPC dışından yapılmış meşru bir düzeltme de
 * olabilir. Ama SESSİZ kalmaz — UI bunu "veri tutarsız" rozetiyle gösterir ve
 * test bunu yakalar.
 */
export function reconcile(lead: LeadProjectionInput, events: LifecycleEvent[]): Reconciliation {
  const p = project(lead, events)
  const statusStage = stageFromStatus(lead.status)

  if (statusStage == null) {
    return {
      consistent: false,
      drift: `bilinmeyen leads.status: ${String(lead.status)}`,
      projectedStage: p.stage,
      statusStage: null,
    }
  }

  // Terminal durumlar birebir eşleşmeli.
  if (isTerminal(statusStage) || isTerminal(p.stage)) {
    const same = statusStage === p.stage
    return {
      consistent: same,
      drift: same ? null : `status=${statusStage} ama olay akışı=${p.stage}`,
      projectedStage: p.stage,
      statusStage,
    }
  }

  // İlerleyen aşamalarda projeksiyon status'ten GERİDE olamaz: status ancak
  // RPC ile ilerler ve RPC her ilerlemede olay yazar.
  const pi = STAGE_ORDER.get(p.stage) ?? -1
  const si = STAGE_ORDER.get(statusStage) ?? -1
  if (pi < si) {
    return {
      consistent: false,
      drift: `leads.status (${statusStage}) olay akışından (${p.stage}) ileride — RPC dışı yazma`,
      projectedStage: p.stage,
      statusStage,
    }
  }

  return { consistent: true, drift: null, projectedStage: p.stage, statusStage }
}

export const STAGE_LABELS: Record<Stage, string> = {
  found: 'Hesap bulundu',
  signal_verified: 'Sinyal doğrulandı',
  qualified: 'Nitelendirildi',
  contact_enriched: 'Kişi zenginleştirildi',
  compliance_checked: 'Uygunluk kontrol edildi',
  drafted: 'Taslak hazırlandı',
  awaiting_approval: 'İnsan onayı bekliyor',
  sent: 'Gönderildi',
  replied: 'Yanıtlandı',
  converted: 'Dönüştü',
  onboarded: 'Onboard edildi',
  case_produced: 'Vaka üretildi',
  grown: 'Büyüdü',
  disqualified: 'Elendi',
  suppressed: 'Suppression',
  lost: 'Kaybedildi',
  archived: 'Arşivlendi',
  unknown: 'Bilinmiyor',
}
