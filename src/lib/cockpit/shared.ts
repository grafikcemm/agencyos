// ─────────────────────────────────────────────────────────────────────────────
// Kokpit paylaşılan tipler + SAF yardımcılar — CLIENT-SAFE (server-only YOK).
// today.ts (server) ve client paneller (CallListPanel, PendingSendsPanel)
// aynı sözleşmeyi buradan alır. DB erişimi BURAYA GİREMEZ.
// ─────────────────────────────────────────────────────────────────────────────

export interface PanelResult<T> {
  items: T[]
  error: string | null
}

export interface CallLead {
  id: string
  businessName: string
  phone: string | null
  status: string
  tier: string | null
  nextFollowUpAt: string | null
  expectedMonthlyTl: number
  /** 'due' = follow-up zamanı gelmiş; 'daily' = deterministik günlük seçim (NULL follow-up). */
  source: 'due' | 'daily'
  reason: string
}

/** C3: "mutlaka bugün" ilk N; kalanı backlog. */
export const MUST_TODAY_COUNT = 5
/** C3: [ASSUMPTION] arama başına ortalama süre tahmini (dk) — UI toplamı için. */
export const MINUTES_PER_CALL = 7

/** C2: aynı gün listesinde aynı telefonun ikinci görünümü (review için, otomatik merge YOK). */
export interface CallDuplicate {
  phoneKey: string
  canonicalId: string
  canonicalName: string
  duplicateId: string
  duplicateName: string
}

/** Telefonu karşılaştırma anahtarına indirger: rakam-dışı at, son 10 hane (TR yerel). */
export function normalizePhoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) return null
  return digits.slice(-10)
}

/** Draft darboğaz durumları (Faz C4) — DETERMİNİSTİK sınıflandırma, LLM yok. */
export type DraftState =
  | 'recipient_missing'
  | 'compliance_blocked'
  | 'approval_missing'
  | 'approval_pending'
  | 'approved'
  | 'sent'
  | 'unknown'
  | 'finalize_pending'
  | 'failed'

export interface PendingSendDraft {
  draftId: string
  /** Faz 2.2: inline contact ekleme bu id ile satırdan yapılır. */
  leadId: string | null
  approvalId: string | null
  approvalStatus: string | null
  businessName: string
  domain: string
  subject: string
  /** Faz 4.1: inline editörün etkin gövdesi (final_body ?? body). */
  body: string
  state: DraftState
  /** Alıcının nereden çözüldüğü (primary contact / lead.email / yok). */
  recipientSource: 'primary_contact' | 'lead_email' | 'none'
  /** Bu durum için TEK güvenli sonraki adım (operatöre gösterilir). */
  nextAction: string
}

export type GmailSendMode = 'live' | 'dry-run'

/** Operatör gerçek gönderim ile simülasyonu ASLA karıştırmasın. */
export const GMAIL_SEND_MODE_COPY: Record<
  GmailSendMode,
  { banner: string; button: string }
> = {
  live: {
    banner: 'Gönderim modu: GERÇEK Gmail — buton alıcıya e-posta yollar.',
    button: 'Gmail’den GERÇEK gönder',
  },
  'dry-run': {
    banner: 'Gönderim modu: dry-run — dışarıya e-posta gitmez.',
    button: 'Gönder (dry-run)',
  },
}

/** Durum → tek güvenli aksiyon. */
export const DRAFT_NEXT_ACTION: Record<DraftState, string> = {
  recipient_missing: 'Alıcıyı bu satırdan ekle (kişi + e-posta)',
  compliance_blocked: 'Suppression kaydını incele — bu adrese gönderim yasak',
  approval_missing: 'Onay isteği oluştur',
  approval_pending: 'Onayı bekle veya incele',
  approved: 'Kokpitten gönder — üstteki gönderim modunu doğrula',
  sent: 'Tamamlandı — aksiyon gerekmez',
  unknown: 'Reconcile çalıştır',
  finalize_pending: 'Reconcile çalıştır (provider gönderdi, finalize eksik)',
  failed: 'Hatayı incele; gerekiyorsa yeni taslak oluştur',
}

/**
 * SAF sınıflandırıcı (test edilebilir): taslak + gönderim-attempt + onay + alıcı
 * + suppression durumundan deterministik draft state üretir (Faz C4, finding #5-6).
 */
export function classifyDraftState(input: {
  attemptState: string | null
  attemptFinalized: boolean
  hasRecipient: boolean
  suppressed: boolean
  approvalStatus: string | null
  /** Faz 2.4: outreach satırının kendi statüsü — legacy 'sent' satırlar
   *  (attempt kaydı olmadan gönderilmiş) recipient_missing GÖRÜNMEZ. */
  rowStatus?: string | null
}): DraftState {
  // Gönderim makinesine girmiş taslaklar önce attempt durumuna göre sınıflanır.
  if (input.attemptState === 'sent') return input.attemptFinalized ? 'sent' : 'finalize_pending'
  if (input.attemptState === 'unknown') return 'unknown'
  if (input.attemptState === 'failed') return 'failed'
  // Legacy gönderilmiş satır (attempt izi yok) → sent; darboğaz değildir.
  if (input.rowStatus === 'sent') return 'sent'
  // Henüz gönderilmemiş: darboğaz sırası alıcı → compliance → onay.
  if (!input.hasRecipient) return 'recipient_missing'
  if (input.suppressed) return 'compliance_blocked'
  if (!input.approvalStatus) return 'approval_missing'
  if (input.approvalStatus === 'pending') return 'approval_pending'
  if (input.approvalStatus === 'approved') return 'approved'
  // rejected/expired → yeniden onay gerekir.
  return 'approval_missing'
}

export interface SendIssue {
  outreachMessageId: string
  state: string
  finalized: boolean
  attemptCount: number
  searchCount: number
  lastError: string | null
}
