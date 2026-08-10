// ─────────────────────────────────────────────────────────────────────────────
// KAYNAK ÇALIŞTIRICI — sıranın zorunlu tutulduğu tek yer.
//
//   bayrak/sağlık → estimate → BÜTÇE KAPISI → limit kırpma → start
//
// Bu sıra bir stil tercihi değil: her adım bir sonrakinin ön koşuludur ve
// atlanması para harcar. Sağlayıcıları doğrudan çağırmak MÜMKÜNDÜR (test/teşhis
// için), ama üretim yolu buradan geçer — kokpit ve cron yalnız bu fonksiyonu
// çağırır.
// ─────────────────────────────────────────────────────────────────────────────

import { assertWithinBudget, clampLimit } from '../budget'
import type { BudgetDecision, SpendReader } from '../budget'
import type { GrowthEnv } from '../flags'
import type { NormalizeResult } from '../normalize'
import { createApifyProvider } from './apify'
import { createApolloProvider, createPlacesProvider } from './existing'
import { createFakeProvider } from './fake'
import { SourceProviderError } from './types'
import type { ProviderHealth, RunHandle, SourceProvider, SourceProviderKey, SourceQuery } from './types'

export * from './types'
export { createApifyProvider, mapRunState, parseActorPricing } from './apify'
export { createApolloProvider, createPlacesProvider } from './existing'
export { createFakeProvider, FAKE_DATASET } from './fake'

export interface ProviderFactoryDeps {
  env?: GrowthEnv
  fetchImpl?: typeof fetch
}

/** Kayıtlı sağlayıcılar. Yeni sağlayıcı yalnız buraya eklenerek görünür olur. */
export function getSourceProvider(key: SourceProviderKey, deps: ProviderFactoryDeps = {}): SourceProvider {
  switch (key) {
    case 'apify':
      return createApifyProvider(deps)
    case 'places':
      return createPlacesProvider(deps)
    case 'apollo':
      return createApolloProvider(deps)
    case 'fake':
      return createFakeProvider()
    default: {
      // Bilinmeyen anahtar sessizce fake'e düşmez: yanlış yazılmış bir sağlayıcı
      // adının "çalışıyor gibi" görünmesi, kokpitte olmayan bir kaynağı var
      // sanmak demektir.
      const bad: never = key
      throw new SourceProviderError('not_found', 'fake', `Bilinmeyen kaynak sağlayıcı: ${String(bad)}`)
    }
  }
}

export const ALL_PROVIDER_KEYS: readonly SourceProviderKey[] = ['places', 'apollo', 'apify', 'fake']

/** Kokpit sağlık tablosu — değer değil DURUM. */
export function listProviderHealth(deps: ProviderFactoryDeps = {}): ProviderHealth[] {
  const env = deps.env ?? process.env
  return ALL_PROVIDER_KEYS.map((k) => getSourceProvider(k, deps).health(env))
}

export interface StartRunInput {
  providerKey: SourceProviderKey
  query: SourceQuery
  /** Aylık harcamayı okuyan fonksiyon — bütçe kapısı bunsuz çalışmaz. */
  readSpend: SpendReader
  deps?: ProviderFactoryDeps
  now?: Date
}

export interface StartRunOutput {
  handle: RunHandle
  budget: BudgetDecision
  /** İstenen sayı kırpıldıysa gerçekten kullanılan sorgu. */
  effectiveQuery: SourceQuery
  limitClamped: boolean
}

/**
 * Koşuyu güvenli sırayla başlatır.
 *
 * Hata TİPİ korunur: `BudgetExceededError` ve `SourceProviderError` yukarı
 * olduğu gibi çıkar. Tek bir generic Error'a sarılsaydı, çağıran "bütçe mi
 * bitti, sağlayıcı mı kapalı" ayrımını yapamaz ve kokpit yanlış düğmeyi
 * gösterirdi.
 */
export async function startSourceRun(input: StartRunInput): Promise<StartRunOutput> {
  const provider = getSourceProvider(input.providerKey, input.deps)

  const health = provider.health(input.deps?.env ?? process.env)
  if (!health.enabled) {
    throw new SourceProviderError('disabled', provider.key, health.reason ?? 'Sağlayıcı kapalı.')
  }

  const { limit, clamped } = clampLimit(input.query.limit)
  const effectiveQuery: SourceQuery = { ...input.query, limit }

  const estimate = await provider.estimate(effectiveQuery)
  // Kapı BURADA. `start` bundan sonra çağrılır; ters sırada para harcanırdı.
  const budget = await assertWithinBudget(estimate, input.readSpend, input.now)

  const handle = await provider.start(effectiveQuery)
  return { handle, budget, effectiveQuery, limitClamped: clamped }
}

export interface CollectedLeads extends NormalizeResult {
  provider: SourceProviderKey
  providerRunId: string
}

/**
 * Koşu sonucunu çeker ve normalize eder.
 *
 * `start`'tan AYRI: ağ koparsa aynı `providerRunId` ile ikinci kez PARA
 * HARCAMADAN çağrılabilir. Boş veri kümesi hata değildir — `acceptedCount: 0`
 * geçerli bir sonuçtur ve öyle raporlanır.
 */
export async function collectLeads(
  providerKey: SourceProviderKey,
  providerRunId: string,
  deps: ProviderFactoryDeps = {},
): Promise<CollectedLeads> {
  const provider = getSourceProvider(providerKey, deps)
  const raw = await provider.fetch(providerRunId)
  return { provider: providerKey, providerRunId, ...provider.normalize(raw) }
}
