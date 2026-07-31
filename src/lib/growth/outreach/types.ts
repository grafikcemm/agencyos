// ─────────────────────────────────────────────────────────────────────────────
// OutreachProvider — GÖNDERİM sağlayıcısı kanonik sözleşmesi (9 metot).
//
// TEMEL DOKTRİN — "bilinmiyor" birinci sınıf bir durumdur:
//
//   Zaman aşımı, 429 ya da 5xx sonrası doğru cevap "gönderildi" DEĞİL,
//   "gönderildi mi bilmiyoruz"dur. Bunu `sent` saymak kaybolan bir maile,
//   `failed` saymak ÇİFT GÖNDERİME yol açar — ve çift soğuk mail, alıcı
//   tarafında telafisi olmayan bir hatadır.
//
//   Bu yüzden: belirsiz sonuç → `provider_unknown` + OTOMATİK RESEND YOK.
//   Çözüm yolu `reconcileUnknown`; o da kanıt bulamazsa durum `unknown` KALIR
//   ve yeniden gönderim yalnız AÇIK operatör kararıyla olur.
//
//   Bu, mevcut `sendMachine.ts` doktrininin (ambiguous → `unknown` → reconcile)
//   sağlayıcı seviyesine taşınmış hâlidir; oradaki mantık YENİDEN YAZILMADI.
//
// INSTANTLY BİR CRM DEĞİLDİR: lead'ler, kişiler ve teklifler AgencyOS'ta kalır.
// Sağlayıcıya yalnız gönderim için gereken asgari alan gider; geri yalnız OLAY
// gelir. Sağlayıcıdan kişi listesi İTHAL EDİLMEZ — iki ayrı doğruluk kaynağı,
// er ya da geç iki farklı gerçek demektir.
// ─────────────────────────────────────────────────────────────────────────────

import type { GrowthEnv } from '../flags'

export type OutreachProviderKey = 'gmail' | 'instantly' | 'fake'

/** migration 066 `outreach_provider_mappings.state` ile BİREBİR aynı küme. */
export type ProviderState =
  | 'pending'
  | 'synced'
  | 'sent'
  | 'bounced'
  | 'replied'
  | 'opted_out'
  | 'failed'
  | 'provider_unknown'

/** migration 066 `outreach_provider_events.event_type` kümesi. */
export type ProviderEventType = 'sent' | 'delivered' | 'reply' | 'bounce' | 'complaint' | 'opt_out'

export type OutreachErrorCode =
  | 'disabled'
  | 'not_configured'
  | 'not_eligible'
  | 'timeout'
  | 'rate_limited'
  | 'server_error'
  | 'bad_response'
  | 'rejected'

export class OutreachProviderError extends Error {
  constructor(
    readonly code: OutreachErrorCode,
    readonly provider: OutreachProviderKey,
    message: string,
    /**
     * Sonuç BELİRSİZ mi — yani mesaj gitmiş OLABİLİR mi.
     *
     * `sendMachine.GmailTransportError.ambiguous` ile aynı ayrım. Bu bayrak
     * `provider_unknown`'a düşülüp düşülmeyeceğini belirler; ayırt edilmezse
     * her hata ya çift gönderime ya da sessiz kayba dönüşür.
     */
    readonly ambiguous = false,
  ) {
    super(message)
    this.name = 'OutreachProviderError'
  }
}

/** Sağlayıcıya verilen asgari alıcı bilgisi. PII yüzeyi bilinçli olarak dar. */
export interface OutreachRecipient {
  /** AgencyOS tarafındaki lead kimliği — eşleşme bunun üzerinden kurulur. */
  localId: string
  email: string
  /** Yalnız kişiselleştirme için; boş olabilir. */
  firstName?: string | null
  companyName?: string | null
}

export interface OutreachMessage {
  /** `outreach_messages.id` — idempotency ve denetim anahtarı. */
  localId: string
  recipient: OutreachRecipient
  subject: string
  /** Düz metin. HTML/pixel/link takibi bu hatta YOK (RT-A6 sözleşmesi). */
  body: string
  /** Kaçıncı temas (0 = ilk). */
  sequenceStep: number
  experimentKey?: string | null
  variantKey?: string | null
  /**
   * AÇIK operatör onayının kimliği.
   *
   * Sözleşmede opsiyonel çünkü sağlayıcıya göre değişir: Instantly kampanya
   * seviyesinde onaylanır, GmailDirect ise HER mesaj için ayrı onay ister ve
   * bu alan olmadan `not_eligible` ile reddeder. Onayı sağlayıcıdan bağımsız
   * zorunlu kılmak, kampanya modelini yanlış temsil ederdi.
   */
  approvalId?: string | null
}

export interface SendResult {
  provider: OutreachProviderKey
  localId: string
  state: ProviderState
  /** Sağlayıcıdaki kimlik; belirsiz sonuçta `null`. */
  remoteId: string | null
  /** Gerçek gönderim yapıldı mı — dry-run/fake modda `false`. */
  reallySent: boolean
  /** `provider_unknown` durumunda NEDEN belirsiz. */
  ambiguityReason?: string | null
}

export interface ProviderEvent {
  provider: OutreachProviderKey
  /** Sağlayıcıdaki olay kimliği — idempotensi ANAHTARI (UNIQUE). */
  remoteEventId: string
  eventType: ProviderEventType
  localId: string | null
  occurredAt: string | null
  /** Ham gövde DEĞİL, parmak izi. */
  payloadHash: string
}

export type ReconcileOutcome =
  | { outcome: 'confirmed_sent'; remoteId: string }
  | { outcome: 'confirmed_not_sent' }
  /** Kanıt yetersiz — durum `provider_unknown` KALIR, otomatik karar YOK. */
  | { outcome: 'still_unknown'; reason: string }

export interface ProviderCapabilities {
  /** Sağlayıcı çok adımlı diziyi kendi mi yürütür (Instantly) yoksa biz mi (Gmail). */
  ownsSequencing: boolean
  /** Açılma/tıklama takibi var mı — pilotta KULLANILMIYOR, yalnız bildiriliyor. */
  hasOpenTracking: boolean
  /** Olaylar polling ile mi geliyor, webhook ile mi. */
  eventDelivery: 'poll' | 'webhook' | 'none'
  /** Isınma (warmup) durumu sağlayıcıdan okunabiliyor mu. */
  reportsWarmup: boolean
}

export interface OutreachHealth {
  key: OutreachProviderKey
  enabled: boolean
  configured: boolean
  /** GERÇEK gönderim yapabilir mi (bayrak + yapılandırma + ısınma). */
  canSendReal: boolean
  reason: string | null
}

/**
 * Dokuz metot. Her biri ayrı bir arızayı ele aldığı için ayrı:
 * sağlık, yetenek, eşleme, kuyruk, gönderim, durum, olay, uzlaştırma, bastırma.
 */
export interface OutreachProvider {
  readonly key: OutreachProviderKey
  health(env?: GrowthEnv): OutreachHealth
  capabilities(): ProviderCapabilities
  /** Lead'i sağlayıcıya tanıtır; `outreach_provider_mappings` satırını üretir. */
  ensureLead(recipient: OutreachRecipient): Promise<{ remoteId: string | null; state: ProviderState }>
  /** Gönderim sırasına alır. Gerçek gönderim YAPMAZ. */
  enqueue(message: OutreachMessage): Promise<{ state: ProviderState; remoteId: string | null }>
  /** Gönderir. Belirsiz sonuçta `provider_unknown` döner, ASLA kendiliğinden tekrar denemez. */
  send(message: OutreachMessage): Promise<SendResult>
  status(localId: string): Promise<{ state: ProviderState; remoteId: string | null }>
  /** Olayları çeker. `remoteEventId` ile idempotent — aynı olay iki kez işlenmez. */
  pollEvents(since: Date): Promise<ProviderEvent[]>
  /** `provider_unknown`'ı kanıtla çözer; kanıt yoksa `still_unknown` bırakır. */
  reconcileUnknown(localId: string): Promise<ReconcileOutcome>
  /** Adresi sağlayıcı tarafında da bastırır (opt-out/bounce/şikâyet). */
  suppress(email: string, reason: 'opt_out' | 'bounce' | 'complaint'): Promise<{ ok: boolean }>
}
