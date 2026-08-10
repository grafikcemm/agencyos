// ─────────────────────────────────────────────────────────────────────────────
// EDİNİM DÖNEMİ (acquisition epoch) — eski lead dönemini kapatma politikası.
//
// Sorun: eski/test/seed/yerel-sektör araştırma leadleri operasyonu kirletiyor,
// ama silmek hem veri kaybı hem mevzuat riski (gönderim geçmişi, opt-out kanıtı,
// gerçek müşteri bağlantısı).
//
// Çözüm: SİLME YOK. Her lead bir DÖNEME aittir. Eski dönem kapatılır, yeni dönem
// açılır, varsayılan operasyon görünümü yalnız güncel dönemi gösterir. Emeklilik
// (`retired_at`) bir işarettir; satır yerinde, denetlenebilir ve geri alınabilir.
//
// Kanonik dönem anahtarları migrations/071_acquisition_epoch.sql ile AYNI olmak
// zorundadır — `epoch.test.ts` bu pariteyi migration dosyasını okuyarak sabitler.
// ─────────────────────────────────────────────────────────────────────────────

export const CURRENT_ACQUISITION_EPOCH = 'epoch-2026-08' as const
export const LEGACY_ACQUISITION_EPOCH = 'legacy-pre-2026-08' as const

/**
 * Ortam bir dönem dayatabilir (ör. taşımadan sonra farklı bir dönem açılırsa).
 * Tanımsız veya boşsa kanonik sabite düşer — sessiz "hiç dönem yok" durumu OLMAZ.
 */
export function currentEpoch(env: Record<string, string | undefined> = process.env): string {
  const raw = (env.ACQUISITION_EPOCH ?? '').trim()
  return raw === '' ? CURRENT_ACQUISITION_EPOCH : raw
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset aracının ASLA yazamayacağı tablolar.
//
// Bunlar uyum ve denetim kayıtlarıdır: gönderim yapılmış bir kişinin opt-out'u,
// şikâyeti, bounce'ı, provider olayı, onayı veya audit izi kaybolursa aynı kişiye
// yeniden gönderim yapılabilir hâle gelir. Bu bir veri temizliği değil, ihlaldir.
// ─────────────────────────────────────────────────────────────────────────────
export const NEVER_TOUCHED_TABLES = [
  'suppression_list',
  'consent_records',
  'approval_requests',
  'outreach_send_attempts',
  'outreach_provider_events',
  'outreach_provider_mappings',
  'lead_action_audit',
  'lead_lifecycle_events',
  'email_threads',
  'email_messages',
  'projects',
  'proposals',
  'proposal_versions',
  'proposal_approvals',
  'proposal_events',
  'tool_cost_logs',
  'ai_cost_logs',
] as const

export type NeverTouchedTable = (typeof NEVER_TOUCHED_TABLES)[number]

/** Emekliye ayrılmayan lead durumları — bunlar gerçek müşteri yolundadır. */
export const RETIREMENT_PROTECTED_STATUSES = ['converted'] as const

export type RetirementReason =
  | 'legacy-epoch'          // eski dönemde, operasyonel bağı yok
export type PreservationReason =
  | 'converted'             // kazanılmış müşteri
  | 'has-project'           // projeye dönüşmüş
  | 'has-proposal'          // teklif verilmiş
  | 'already-retired'       // önceki koşuda emekliye ayrılmış (idempotency)
  | 'current-epoch'         // zaten yeni dönemde

export interface EpochCandidate {
  id: string
  status: string | null
  acquisitionEpoch: string | null
  retiredAt: string | null
  /** İlişkili gerçek müşteri kaydı var mı — çağıran DB'den doldurur. */
  hasProject: boolean
  hasProposal: boolean
}

export interface RetirementDecision {
  id: string
  action: 'retire' | 'preserve'
  reason: RetirementReason | PreservationReason
}

export interface RetirementPlan {
  retire: RetirementDecision[]
  preserve: RetirementDecision[]
  /** Neden sayacı — rapor bu kırılımı gösterir, tek bir toplam değil. */
  byReason: Record<string, number>
}

/**
 * SAF karar fonksiyonu. DB'ye dokunmaz, IO yapmaz, tekrar çalıştırılabilir.
 *
 * Idempotency: `retiredAt` dolu bir kayıt bir daha emekliye ayrılmaz; ikinci
 * koşuda `preserve/already-retired` olur. Böylece `--apply` iki kez koşulduğunda
 * ikinci koşu 0 değişiklik üretir.
 */
export function planRetirement(
  candidates: readonly EpochCandidate[],
  epoch: string = CURRENT_ACQUISITION_EPOCH,
): RetirementPlan {
  const retire: RetirementDecision[] = []
  const preserve: RetirementDecision[] = []

  for (const c of candidates) {
    const decide = (): RetirementDecision => {
      if (c.retiredAt) return { id: c.id, action: 'preserve', reason: 'already-retired' }
      if (c.acquisitionEpoch === epoch) return { id: c.id, action: 'preserve', reason: 'current-epoch' }
      if (c.status && (RETIREMENT_PROTECTED_STATUSES as readonly string[]).includes(c.status)) {
        return { id: c.id, action: 'preserve', reason: 'converted' }
      }
      if (c.hasProject) return { id: c.id, action: 'preserve', reason: 'has-project' }
      if (c.hasProposal) return { id: c.id, action: 'preserve', reason: 'has-proposal' }
      return { id: c.id, action: 'retire', reason: 'legacy-epoch' }
    }
    const d = decide()
    ;(d.action === 'retire' ? retire : preserve).push(d)
  }

  const byReason: Record<string, number> = {}
  for (const d of [...retire, ...preserve]) {
    byReason[`${d.action}:${d.reason}`] = (byReason[`${d.action}:${d.reason}`] ?? 0) + 1
  }
  return { retire, preserve, byReason }
}

/**
 * Varsayılan operasyon görünümü filtresi — HER lead sorgusu bunu kullanır.
 * Tek yerde tanımlı olması, "bir ekran eski dönemi göstermeye devam ediyor"
 * hatasının tekrarlanamamasını sağlar.
 */
export interface EpochScope {
  epoch: string
  includeRetired: boolean
}

export const DEFAULT_EPOCH_SCOPE: EpochScope = {
  epoch: CURRENT_ACQUISITION_EPOCH,
  includeRetired: false,
}

/** Supabase `PostgrestFilterBuilder` benzeri minimal arayüz — test edilebilir. */
export interface EpochFilterable {
  eq(column: string, value: unknown): EpochFilterable
  is(column: string, value: unknown): EpochFilterable
}

export function applyEpochScope<T extends EpochFilterable>(query: T, scope: EpochScope = DEFAULT_EPOCH_SCOPE): T {
  let q = query.eq('acquisition_epoch', scope.epoch)
  if (!scope.includeRetired) q = q.is('retired_at', null)
  return q as T
}
