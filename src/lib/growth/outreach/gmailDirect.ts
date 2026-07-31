// ─────────────────────────────────────────────────────────────────────────────
// GMAIL DIRECT — mevcut gönderim çekirdeğinin sözleşmeye BAĞLANMASI.
//
// Burada gönderim mantığı YENİDEN YAZILMADI. `sendGmailMessage` zaten şunları
// yapıyor ve testlerle korunuyor: ön koşul doğrulaması, bastırma listesi,
// claim/idempotency, dry-run düşüşü, belirsiz sonucun `unknown`'a yazılması ve
// takip planı. Bu dosya yalnız o sonuçları kanonik `ProviderState`'e çevirir.
//
// İKİ SERT KURAL:
//
//   1. ONAYSIZ GÖNDERİM YOK. `approvalId` verilmeden `send` çağrılırsa istek
//      sağlayıcıya HİÇ ulaşmaz. Gmail yolunda onay mesaj başınadır.
//
//   2. `needsReconciliation` → `provider_unknown`. Çekirdek "sonuç belirsiz"
//      dediğinde bu katman ASLA kör tekrar yapmaz; karar `reconcileUnknown`e
//      ve gerekirse operatöre gider.
//
// GERÇEK GÖNDERİM: `GMAIL_SEND_ENABLED` kapalıyken çekirdek dry-run transport'a
// düşer — akışın tamamı çalışır, tek bir mail çıkmaz. `canSendReal` bunu
// dürüstçe bildirir.
// ─────────────────────────────────────────────────────────────────────────────

import { isGmailSendEnabled } from '../../outreach/flags'
import { reconcileOutreachSend, sendGmailMessage } from '../../outreach/gmail'
import { getSendAttempt } from '../../outreach/sendMachine'
import type { GmailTransport } from '../../outreach/sendMachine'
import type { GrowthEnv } from '../flags'
import { OutreachProviderError } from './types'
import type {
  OutreachHealth,
  OutreachMessage,
  OutreachProvider,
  ProviderCapabilities,
  ProviderEvent,
  ProviderState,
  ReconcileOutcome,
  SendResult,
} from './types'

export interface GmailDirectDeps {
  env?: GrowthEnv
  /** Test dikişi — çekirdeğe olduğu gibi geçirilir. */
  transport?: GmailTransport
  sendImpl?: typeof sendGmailMessage
  reconcileImpl?: typeof reconcileOutreachSend
  getAttemptImpl?: typeof getSendAttempt
}

/** `send_attempts.state` → kanonik sağlayıcı durumu. */
export function mapAttemptState(state: string | null | undefined): ProviderState {
  switch (state) {
    case 'sent':
    case 'reconciled':
      return 'sent'
    case 'unknown':
      return 'provider_unknown'
    case 'failed':
      return 'failed'
    case 'claimed':
    case 'sending':
      return 'pending'
    default:
      return 'pending'
  }
}

export function createGmailDirectProvider(deps: GmailDirectDeps = {}): OutreachProvider {
  const env = deps.env ?? process.env
  const send = deps.sendImpl ?? sendGmailMessage
  const reconcile = deps.reconcileImpl ?? reconcileOutreachSend
  const readAttempt = deps.getAttemptImpl ?? getSendAttempt

  return {
    key: 'gmail',

    health(overrideEnv: GrowthEnv = env): OutreachHealth {
      const sendEnabled = overrideEnv === process.env ? isGmailSendEnabled() : overrideEnv.GMAIL_SEND_ENABLED === 'true'
      return {
        key: 'gmail',
        enabled: true, // taslak/onay akışı bayraktan bağımsız çalışır
        configured: true,
        canSendReal: sendEnabled,
        reason: sendEnabled ? null : 'GMAIL_SEND_ENABLED kapalı — dry-run (gerçek mail çıkmaz)',
      }
    },

    capabilities(): ProviderCapabilities {
      // Diziyi BİZ yürütüyoruz (follow-up planı AgencyOS'ta), açılma takibi YOK
      // ve olaylar ayrı bir inbound ingest hattından geliyor — bu sağlayıcı
      // yüzeyinden poll edilmez.
      return { ownsSequencing: false, hasOpenTracking: false, eventDelivery: 'none', reportsWarmup: false }
    },

    async ensureLead() {
      // Gmail'de "lead kaydı" yoktur; adres doğrudan kullanılır. Uydurma bir
      // uzak kimlik üretmek, olmayan bir eşleşmeyi var göstermek olurdu.
      return { remoteId: null, state: 'synced' as ProviderState }
    },

    async enqueue() {
      // Kuyruk AgencyOS tarafındadır (`outreach_messages` + onay akışı).
      // Sağlayıcıya bu aşamada hiçbir şey gitmez; durum her hâlde `pending`.
      return { state: 'pending' as ProviderState, remoteId: null }
    },

    async send(message: OutreachMessage): Promise<SendResult> {
      if (!message.approvalId) {
        throw new OutreachProviderError('not_eligible', 'gmail', 'Açık operatör onayı olmadan Gmail gönderimi yapılmaz.')
      }
      const out = await send({
        outreachMessageId: message.localId,
        approvalId: message.approvalId,
        transport: deps.transport,
      })

      if (out.blockedReasons?.length) {
        throw new OutreachProviderError('not_eligible', 'gmail', `Gönderim kapısı reddetti (${out.blockedReasons.length} sebep).`)
      }
      // BELİRSİZ: mail gitmiş olabilir. Kör tekrar YASAK.
      if (out.needsReconciliation) {
        return {
          provider: 'gmail',
          localId: message.localId,
          state: 'provider_unknown',
          remoteId: out.gmailMessageId ?? null,
          reallySent: false,
          ambiguityReason: 'çekirdek uzlaştırma istedi (timeout/5xx/bayat claim)',
        }
      }
      // Başka bir istek claim tutuyor — sağlayıcıya DOKUNULMADI.
      if (out.inProgress) {
        return { provider: 'gmail', localId: message.localId, state: 'pending', remoteId: null, reallySent: false }
      }
      if (!out.ok) {
        throw new OutreachProviderError('rejected', 'gmail', out.error ?? 'Gmail gönderimi başarısız.')
      }
      return {
        provider: 'gmail',
        localId: message.localId,
        state: 'sent',
        remoteId: out.gmailMessageId ?? null,
        // Dry-run ya da "zaten gönderilmişti" GERÇEK yeni gönderim DEĞİLDİR.
        reallySent: Boolean(out.ok && !out.dryRun && !out.alreadySent),
      }
    },

    async status(localId: string) {
      const attempt = await readAttempt(localId)
      return {
        state: mapAttemptState(attempt?.state),
        remoteId: attempt?.provider_message_id ?? null,
      }
    },

    async pollEvents(): Promise<ProviderEvent[]> {
      // Gmail cevapları AYRI bir hattan (`gmail/replyIngest`) geliyor. Buradan
      // boş dönmek, o hattı ikinci kez ve eksik uygulamamak demek.
      return []
    },

    async reconcileUnknown(localId: string): Promise<ReconcileOutcome> {
      const r = await reconcile(localId)
      if (!r.ok) return { outcome: 'still_unknown', reason: r.error ?? 'uzlaştırma tamamlanamadı' }
      if (r.outcome === 'reconciled_sent') {
        const attempt = await readAttempt(localId)
        return { outcome: 'confirmed_sent', remoteId: attempt?.provider_message_id ?? localId }
      }
      if (r.outcome === 'not_found_marked_failed') return { outcome: 'confirmed_not_sent' }
      // `not_found_unconfirmed` / `not_found_needs_confirmation`: çekirdek
      // bilerek karar VERMEDİ (yeterli arama yok ya da açık onay bekliyor).
      // Burada karar üretmek, o kademeli güvenceyi baypas etmek olurdu.
      return { outcome: 'still_unknown', reason: r.outcome ?? 'kanıt yetersiz' }
    },

    async suppress() {
      // Bastırma listesi AgencyOS tarafındadır (`outboundGate`); Gmail'de
      // itilecek bir sağlayıcı listesi yok.
      return { ok: true }
    },
  }
}
