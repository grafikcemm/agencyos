// ─────────────────────────────────────────────────────────────────────────────
// FAKE gönderim sağlayıcısı — hiçbir ağ çağrısı, hiçbir gerçek mail.
//
// Pilotun tüm akışı (kuyruk → gönderim → olay → uzlaştırma → bastırma) canlı
// bir hesap açılmadan uçtan uca koşturulabilsin diye BİRİNCİ SINIF sağlayıcı.
//
// Arızalar ENJEKTE EDİLEBİLİR (`failFor`): belirsiz sonuç ve reddedilen gönderim
// yolları da sınanabilsin. Yalnız mutlu yolu taklit eden bir fake, gerçek
// arızayı ilk kez üretimde gösterirdi.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto'
import { OutreachProviderError } from './types'
import type {
  OutreachHealth,
  OutreachMessage,
  OutreachProvider,
  OutreachRecipient,
  ProviderCapabilities,
  ProviderEvent,
  ProviderState,
  ReconcileOutcome,
  SendResult,
} from './types'

export interface FakeOutreachOptions {
  /** localId → enjekte edilecek arıza. */
  failFor?: Record<string, { code: 'timeout' | 'server_error' | 'rate_limited' | 'rejected'; ambiguous: boolean }>
  /** `reconcileUnknown` için sağlayıcıda GERÇEKTEN var olan mesajlar. */
  remoteEvidence?: Set<string>
  events?: ProviderEvent[]
}

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex')

export function createFakeOutreachProvider(opts: FakeOutreachOptions = {}): OutreachProvider {
  const states = new Map<string, { state: ProviderState; remoteId: string | null }>()
  const suppressed = new Set<string>()

  return {
    key: 'fake',

    health(): OutreachHealth {
      // `canSendReal: false` KASITLI ve sabittir: fake sağlayıcı hiçbir
      // yapılandırmayla gerçek mail gönderemez.
      return { key: 'fake', enabled: true, configured: true, canSendReal: false, reason: null }
    },

    capabilities(): ProviderCapabilities {
      return { ownsSequencing: false, hasOpenTracking: false, eventDelivery: 'none', reportsWarmup: false }
    },

    async ensureLead(recipient: OutreachRecipient) {
      const remoteId = `fake-lead-${recipient.localId}`
      states.set(recipient.localId, { state: 'synced', remoteId })
      return { remoteId, state: 'synced' as ProviderState }
    },

    async enqueue(message: OutreachMessage) {
      if (suppressed.has(message.recipient.email)) {
        throw new OutreachProviderError('not_eligible', 'fake', 'Adres bastırılmış — kuyruğa alınmaz.')
      }
      const cur = { state: 'pending' as ProviderState, remoteId: `fake-msg-${message.localId}` }
      states.set(message.localId, cur)
      return cur
    },

    async send(message: OutreachMessage): Promise<SendResult> {
      const injected = opts.failFor?.[message.localId]
      if (injected) {
        if (injected.ambiguous) {
          // BELİRSİZ: gitmiş olabilir. Otomatik tekrar YOK.
          states.set(message.localId, { state: 'provider_unknown', remoteId: null })
          return {
            provider: 'fake',
            localId: message.localId,
            state: 'provider_unknown',
            remoteId: null,
            reallySent: false,
            ambiguityReason: injected.code,
          }
        }
        states.set(message.localId, { state: 'failed', remoteId: null })
        throw new OutreachProviderError(injected.code, 'fake', 'Sağlayıcı gönderimi reddetti.', false)
      }
      const remoteId = `fake-sent-${message.localId}`
      states.set(message.localId, { state: 'sent', remoteId })
      return { provider: 'fake', localId: message.localId, state: 'sent', remoteId, reallySent: false }
    },

    async status(localId: string) {
      return states.get(localId) ?? { state: 'pending' as ProviderState, remoteId: null }
    },

    async pollEvents(): Promise<ProviderEvent[]> {
      return (opts.events ?? []).map((e) => ({ ...e, provider: 'fake' as const, payloadHash: e.payloadHash || hash(e) }))
    },

    async reconcileUnknown(localId: string): Promise<ReconcileOutcome> {
      if (opts.remoteEvidence?.has(localId)) {
        const remoteId = `fake-sent-${localId}`
        states.set(localId, { state: 'sent', remoteId })
        return { outcome: 'confirmed_sent', remoteId }
      }
      // Kanıt YOKSA "gönderilmedi" DEMEZ. Yokluk kanıt değildir; sağlayıcı
      // arama indeksi gecikmiş olabilir.
      return { outcome: 'still_unknown', reason: 'sağlayıcıda kayıt bulunamadı — yokluk kanıt sayılmaz' }
    },

    async suppress(email: string) {
      suppressed.add(email)
      return { ok: true }
    },
  }
}
