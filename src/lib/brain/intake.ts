// Brain v2 — INTAKE: hedef + başarı kriteri çıkarımı (§4 adım 1). Deterministik,
// mevcut saf sınıflandırıcıları (intent + persona router) strateji olarak sarar.

import { classifyMessageIntent } from '../assistant/intent'
import { routeMessageToAgent } from '../assistant/agents'
import type { Goal } from './types'

const SYSTEM_RE = /(deploy|migration|cron|sistem|server|build|pipeline)/i

function deriveSuccessCriteria(intent: string): string[] {
  switch (intent) {
    case 'question':
      return ['net, dayanaklı yanıt üretildi']
    case 'commitment_candidate':
      return ['eylem tanımlandı ve takip edilebilir']
    case 'meta':
      return ['yetenekler açıklandı']
    default:
      return ['hedef karşılandı']
  }
}

export function deriveGoal(rawInput: string, channel: string): Goal {
  const text = (rawInput ?? '').trim()
  const intent = classifyMessageIntent(text)
  const persona = routeMessageToAgent(text)

  const route: Goal['route'] =
    persona === 'business' ? 'business' : SYSTEM_RE.test(text) ? 'system' : 'life'

  const trivial =
    text.length === 0 ||
    intent === 'greeting' ||
    intent === 'smalltalk' ||
    intent === 'meta'

  return {
    rawInput: text,
    channel,
    intent,
    route,
    successCriteria: deriveSuccessCriteria(intent),
    constraints: [],
    budgetUsdMax: null,
    trivial,
  }
}
