// ─────────────────────────────────────────────────────────────────────────────
// GÖNDERİM SAĞLAYICI KAYDI + seçim kuralı.
//
// SEÇİM SIRASI (ilk uygun kazanır): instantly → gmail → fake.
// Fake en sondadır ve DAİMA vardır: hiçbir sağlayıcı açık değilken akış
// durmaz, ama tek bir gerçek mail de çıkmaz.
//
// `resolveOutreachProvider` sessizce düşmez — hangi sağlayıcıya, NEDEN
// düşüldüğünü döner. "Neden mail gitmedi" sorusunun cevabı log'da değil,
// dönen değerde olmalı.
// ─────────────────────────────────────────────────────────────────────────────

import type { GrowthEnv } from '../flags'
import { createFakeOutreachProvider } from './fake'
import { createGmailDirectProvider } from './gmailDirect'
import { createInstantlyProvider } from './instantly'
import { OutreachProviderError } from './types'
import type { OutreachHealth, OutreachProvider, OutreachProviderKey, SendResult } from './types'

export * from './types'
export { createFakeOutreachProvider } from './fake'
export { createGmailDirectProvider, mapAttemptState } from './gmailDirect'
export { createInstantlyProvider, mapEventType } from './instantly'

export interface OutreachFactoryDeps {
  env?: GrowthEnv
  fetchImpl?: typeof fetch
}

export const ALL_OUTREACH_KEYS: readonly OutreachProviderKey[] = ['gmail', 'instantly', 'fake']

export function getOutreachProvider(key: OutreachProviderKey, deps: OutreachFactoryDeps = {}): OutreachProvider {
  switch (key) {
    case 'instantly':
      return createInstantlyProvider(deps)
    case 'gmail':
      return createGmailDirectProvider({ env: deps.env })
    case 'fake':
      return createFakeOutreachProvider()
    default: {
      const bad: never = key
      throw new OutreachProviderError('not_configured', 'fake', `Bilinmeyen gönderim sağlayıcısı: ${String(bad)}`)
    }
  }
}

export function listOutreachHealth(deps: OutreachFactoryDeps = {}): OutreachHealth[] {
  const env = deps.env ?? process.env
  return ALL_OUTREACH_KEYS.map((k) => getOutreachProvider(k, deps).health(env))
}

export interface ProviderChoice {
  provider: OutreachProvider
  key: OutreachProviderKey
  /** Neden bu sağlayıcı — kokpit bunu olduğu gibi gösterir. */
  reason: string
  /** Bu seçimle GERÇEK mail çıkar mı. */
  canSendReal: boolean
}

export function resolveOutreachProvider(deps: OutreachFactoryDeps = {}): ProviderChoice {
  const env = deps.env ?? process.env
  const instantly = createInstantlyProvider(deps)
  const iHealth = instantly.health(env)
  if (iHealth.canSendReal) {
    return { provider: instantly, key: 'instantly', reason: 'INSTANTLY_ENABLED açık ve yapılandırılmış', canSendReal: true }
  }
  const gmail = createGmailDirectProvider({ env })
  const gHealth = gmail.health(env)
  if (gHealth.canSendReal) {
    return { provider: gmail, key: 'gmail', reason: 'GMAIL_SEND_ENABLED açık', canSendReal: true }
  }
  return {
    provider: createFakeOutreachProvider(),
    key: 'fake',
    reason: `gerçek gönderim kapalı (instantly: ${iHealth.reason ?? '—'}; gmail: ${gHealth.reason ?? '—'})`,
    canSendReal: false,
  }
}

export interface GuardedSendInput {
  provider: OutreachProvider
  message: import('./types').OutreachMessage
  /** Lead normalize katmanının verdiği yetki. `false` ise gönderim YAPILMAZ. */
  outreachEligible: boolean
  /** `provider_unknown` bir mesajın YENİDEN gönderilmesi — yalnız açık karar. */
  operatorResendApproved?: boolean
  /** Mesajın bilinen mevcut durumu (DB'den). */
  currentState?: import('./types').ProviderState
}

/**
 * Gönderimin tek güvenli kapısı.
 *
 * `provider_unknown` durumundaki bir mesaj OTOMATİK tekrar gönderilmez. Bu
 * kural kodda burada yaşar; sağlayıcıların içine dağıtılsaydı bir sağlayıcı
 * unutulduğunda sessizce çift gönderim olurdu.
 */
export async function guardedSend(input: GuardedSendInput): Promise<SendResult> {
  if (!input.outreachEligible) {
    throw new OutreachProviderError(
      'not_eligible',
      input.provider.key,
      'Alıcı otomatik gönderime uygun değil (kişisel adres ya da adres yok).',
    )
  }
  if (input.currentState === 'provider_unknown' && !input.operatorResendApproved) {
    throw new OutreachProviderError(
      'not_eligible',
      input.provider.key,
      'Durum belirsiz (provider_unknown). Yeniden gönderim yalnız açık operatör kararıyla yapılır.',
    )
  }
  if (input.currentState === 'opted_out' || input.currentState === 'bounced') {
    throw new OutreachProviderError('not_eligible', input.provider.key, `Adres ${input.currentState} — gönderim yapılmaz.`)
  }
  return input.provider.send(input.message)
}
