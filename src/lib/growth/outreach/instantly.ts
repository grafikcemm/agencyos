// ─────────────────────────────────────────────────────────────────────────────
// INSTANTLY gönderim sağlayıcısı — v2 API, default KAPALI.
//
// NE OLDUĞU: bir gönderim/ısınma altyapısı. NE OLMADIĞI: bir CRM. Lead'ler,
// kişiler, teklifler ve karar geçmişi AgencyOS'ta kalır. Buraya yalnız gönderim
// için gereken asgari alan gider (adres + kişiselleştirme), geri yalnız OLAY
// gelir. Sağlayıcıdan kişi listesi İTHAL EDİLMEZ.
//
// GÖNDERİM SAHİPLİĞİ: diziyi Instantly yürütür. Bu yüzden `send` çağrısı
// "şimdi gönder" değil, "kampanyaya al" demektir ve `sent` durumunu DÖNMEZ —
// gerçek gönderim Instantly'nin takviminde olur ve bize `pollEvents` ile
// gelir. Çağrı anında `sent` dönmek, olmayan bir gönderimi var göstermek olurdu.
//
// BELİRSİZLİK: zaman aşımı / 429 / 5xx sonrası lead'in eklenip eklenmediğini
// BİLMİYORUZ. Otomatik tekrar YOK — tekrar, aynı kişiyi iki kampanyaya sokup
// çift mail atabilir. Durum `provider_unknown` olur ve `reconcileUnknown`
// kanıt arar; kanıt yoksa durum bilinmez KALIR ve karar operatöre geçer.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto'
import { isInstantlyEnabled } from '../flags'
import type { GrowthEnv } from '../flags'
import { OutreachProviderError } from './types'
import type {
  OutreachHealth,
  OutreachMessage,
  OutreachProvider,
  OutreachRecipient,
  ProviderCapabilities,
  ProviderEvent,
  ProviderEventType,
  ProviderState,
  ReconcileOutcome,
  SendResult,
} from './types'

const BASE = 'https://api.instantly.ai/api/v2'
const TIMEOUT_MS = 15_000
const MAX_BYTES = 1_000_000

export interface InstantlyDeps {
  env?: GrowthEnv
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex')

interface InstantlyConfig {
  apiKey: string
  campaignId: string
}

function readConfig(env: GrowthEnv): InstantlyConfig {
  const apiKey = env.INSTANTLY_API_KEY?.trim()
  const campaignId = env.INSTANTLY_CAMPAIGN_ID?.trim()
  if (!apiKey || !campaignId) {
    throw new OutreachProviderError('not_configured', 'instantly', 'INSTANTLY_API_KEY / INSTANTLY_CAMPAIGN_ID tanımlı değil.')
  }
  return { apiKey, campaignId }
}

function requireEnabled(env: GrowthEnv): void {
  if (!isInstantlyEnabled(env)) {
    throw new OutreachProviderError('disabled', 'instantly', 'INSTANTLY_ENABLED kapalı — sağlayıcıya hiçbir istek gitmedi.')
  }
}

/**
 * HTTP → kapalı küme kod + BELİRSİZLİK sınıflandırması.
 *
 * `ambiguous` ayrımı bu dosyanın en önemli satırıdır: 4xx "sağlayıcı kesin
 * reddetti" (güvenle failed), timeout/429/5xx ise "istek işlenmiş OLABİLİR"
 * demektir ve `provider_unknown`'a düşer.
 */
async function call(
  url: string,
  init: RequestInit,
  cfg: InstantlyConfig,
  net: { fetchImpl: typeof fetch; timeoutMs: number },
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), net.timeoutMs)
  let res: Response
  try {
    res = await net.fetchImpl(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      redirect: 'manual',
    })
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    throw new OutreachProviderError(
      aborted ? 'timeout' : 'server_error',
      'instantly',
      aborted ? `Instantly zaman aşımı (${net.timeoutMs} ms).` : 'Instantly bağlantısı kurulamadı.',
      true, // ikisi de BELİRSİZ
    )
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 429) throw new OutreachProviderError('rate_limited', 'instantly', 'Instantly hız sınırı.', true)
  if (res.status >= 500) throw new OutreachProviderError('server_error', 'instantly', `Instantly sunucu hatası (${res.status}).`, true)
  // 4xx KESİN ret: istek işlenmedi. Belirsiz değil.
  if (res.status >= 400) throw new OutreachProviderError('rejected', 'instantly', `Instantly isteği reddetti (${res.status}).`, false)
  if (res.status >= 300) throw new OutreachProviderError('bad_response', 'instantly', `Instantly beklenmeyen durum (${res.status}).`, false)

  const text = await res.text()
  if (text.length > MAX_BYTES) throw new OutreachProviderError('bad_response', 'instantly', 'Instantly yanıtı boyut sınırını aştı.', false)
  if (!text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new OutreachProviderError('bad_response', 'instantly', 'Instantly yanıtı JSON değil.', false)
  }
}

/** Instantly olay adı → kanonik olay tipi. Bilinmeyen tip ATILIR, uydurulmaz. */
export function mapEventType(v: unknown): ProviderEventType | null {
  switch (v) {
    case 'email_sent':
    case 'sent':
      return 'sent'
    case 'email_delivered':
      return 'delivered'
    case 'reply_received':
    case 'email_reply':
      return 'reply'
    case 'email_bounced':
    case 'bounce':
      return 'bounce'
    case 'complaint':
    case 'spam_complaint':
      return 'complaint'
    case 'unsubscribe':
    case 'lead_unsubscribed':
      return 'opt_out'
    default:
      return null
  }
}

export function createInstantlyProvider(deps: InstantlyDeps = {}): OutreachProvider {
  const env = deps.env ?? process.env
  const net = { fetchImpl: deps.fetchImpl ?? globalThis.fetch, timeoutMs: deps.timeoutMs ?? TIMEOUT_MS }

  /** Aynı mesaj için hep aynı anahtar — sağlayıcı tarafı çiftlemeyi engeller. */
  const idemKey = (localId: string) => `agencyos-${localId}`

  return {
    key: 'instantly',

    health(overrideEnv: GrowthEnv = env): OutreachHealth {
      const enabled = isInstantlyEnabled(overrideEnv)
      const configured = Boolean(overrideEnv.INSTANTLY_API_KEY?.trim() && overrideEnv.INSTANTLY_CAMPAIGN_ID?.trim())
      return {
        key: 'instantly',
        enabled,
        configured,
        canSendReal: enabled && configured,
        reason: !enabled ? 'INSTANTLY_ENABLED kapalı' : !configured ? 'INSTANTLY_API_KEY / INSTANTLY_CAMPAIGN_ID eksik' : null,
      }
    },

    capabilities(): ProviderCapabilities {
      return { ownsSequencing: true, hasOpenTracking: true, eventDelivery: 'poll', reportsWarmup: true }
    },

    async ensureLead(recipient: OutreachRecipient) {
      requireEnabled(env)
      const cfg = readConfig(env)
      const body = await call(
        `${BASE}/leads`,
        {
          method: 'POST',
          body: JSON.stringify({
            campaign: cfg.campaignId,
            email: recipient.email,
            first_name: recipient.firstName ?? undefined,
            company_name: recipient.companyName ?? undefined,
            // AgencyOS kimliği: geri gelen olayı yerel satıra bağlamanın tek yolu.
            custom_variables: { agencyos_local_id: recipient.localId },
          }),
        },
        cfg,
        net,
      )
      const id = (body as { id?: unknown })?.id
      return { remoteId: typeof id === 'string' ? id : null, state: 'synced' as ProviderState }
    },

    async enqueue(message: OutreachMessage) {
      const { remoteId } = await this.ensureLead(message.recipient)
      return { state: 'synced' as ProviderState, remoteId }
    },

    /**
     * "Gönder" = kampanyaya al. `sent` DÖNMEZ.
     *
     * Instantly diziyi kendi yürütür; gerçek gönderim onun takvimindedir ve
     * bize `pollEvents` ile gelir. Burada `sent` dönmek, henüz yapılmamış bir
     * gönderimi yapılmış göstermek olurdu.
     */
    async send(message: OutreachMessage): Promise<SendResult> {
      requireEnabled(env)
      const cfg = readConfig(env)
      try {
        const body = await call(
          `${BASE}/leads`,
          {
            method: 'POST',
            headers: { 'Idempotency-Key': idemKey(message.localId) },
            body: JSON.stringify({
              campaign: cfg.campaignId,
              email: message.recipient.email,
              first_name: message.recipient.firstName ?? undefined,
              company_name: message.recipient.companyName ?? undefined,
              personalization: message.body,
              custom_variables: { agencyos_local_id: message.localId, agencyos_subject: message.subject },
            }),
          },
          cfg,
          net,
        )
        const id = (body as { id?: unknown })?.id
        return {
          provider: 'instantly',
          localId: message.localId,
          state: 'synced',
          remoteId: typeof id === 'string' ? id : null,
          reallySent: false,
        }
      } catch (err) {
        // BELİRSİZ hata → provider_unknown. OTOMATİK TEKRAR YOK.
        if (err instanceof OutreachProviderError && err.ambiguous) {
          return {
            provider: 'instantly',
            localId: message.localId,
            state: 'provider_unknown',
            remoteId: null,
            reallySent: false,
            ambiguityReason: err.code,
          }
        }
        throw err
      }
    },

    async status(localId: string) {
      requireEnabled(env)
      const cfg = readConfig(env)
      const body = await call(
        `${BASE}/leads?search=${encodeURIComponent(localId)}&limit=1`,
        { method: 'GET' },
        cfg,
        net,
      )
      const items = (body as { items?: unknown })?.items
      const first = Array.isArray(items) ? (items[0] as Record<string, unknown> | undefined) : undefined
      if (!first) return { state: 'pending' as ProviderState, remoteId: null }
      return {
        state: 'synced' as ProviderState,
        remoteId: typeof first.id === 'string' ? first.id : null,
      }
    },

    /**
     * Olayları çeker. İdempotensi `remoteEventId` üzerinden SAĞLAYICI KİMLİĞİYLE
     * kurulur; aynı olay ikinci kez gelirse DB'deki UNIQUE(provider,
     * remote_event_id) onu düşürür. Kimliği olmayan olay ATILIR — üretilmiş bir
     * kimlik, aynı olayı iki farklı satır yapardı.
     */
    async pollEvents(since: Date): Promise<ProviderEvent[]> {
      requireEnabled(env)
      const cfg = readConfig(env)
      const body = await call(
        `${BASE}/emails?campaign_id=${encodeURIComponent(cfg.campaignId)}&start_date=${encodeURIComponent(since.toISOString())}`,
        { method: 'GET' },
        cfg,
        net,
      )
      const items = (body as { items?: unknown })?.items
      if (!Array.isArray(items)) {
        throw new OutreachProviderError('bad_response', 'instantly', 'Instantly olay listesi dizi değil.', false)
      }
      const out: ProviderEvent[] = []
      for (const it of items) {
        if (!it || typeof it !== 'object') continue
        const rec = it as Record<string, unknown>
        const remoteEventId = typeof rec.id === 'string' ? rec.id : null
        const eventType = mapEventType(rec.event_type ?? rec.type)
        if (!remoteEventId || !eventType) continue
        const vars = (rec.custom_variables ?? {}) as Record<string, unknown>
        out.push({
          provider: 'instantly',
          remoteEventId,
          eventType,
          localId: typeof vars.agencyos_local_id === 'string' ? vars.agencyos_local_id : null,
          occurredAt: typeof rec.timestamp === 'string' ? rec.timestamp : null,
          // HAM gövde SAKLANMAZ — yalnız parmak izi.
          payloadHash: hash(rec),
        })
      }
      return out
    },

    async reconcileUnknown(localId: string): Promise<ReconcileOutcome> {
      requireEnabled(env)
      const cfg = readConfig(env)
      let body: unknown
      try {
        body = await call(`${BASE}/leads?search=${encodeURIComponent(localId)}&limit=1`, { method: 'GET' }, cfg, net)
      } catch {
        // Uzlaştırma çağrısının kendisi düştü → hâlâ bilmiyoruz. Bunu
        // "gönderilmedi" saymak yeniden gönderime yol açardı.
        return { outcome: 'still_unknown', reason: 'uzlaştırma sorgusu başarısız' }
      }
      const items = (body as { items?: unknown })?.items
      const first = Array.isArray(items) ? (items[0] as Record<string, unknown> | undefined) : undefined
      if (first && typeof first.id === 'string') return { outcome: 'confirmed_sent', remoteId: first.id }
      // Kayıt YOK — ama bu "kesin eklenmedi" demek değil; indeks gecikmiş
      // olabilir. Karar operatöre bırakılır.
      return { outcome: 'still_unknown', reason: 'sağlayıcıda kayıt görünmüyor — yokluk kanıt sayılmaz' }
    },

    async suppress(email: string) {
      requireEnabled(env)
      const cfg = readConfig(env)
      await call(`${BASE}/blocklist-entries`, { method: 'POST', body: JSON.stringify({ entry: email }) }, cfg, net)
      return { ok: true }
    },
  }
}
