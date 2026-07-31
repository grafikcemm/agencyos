// ─────────────────────────────────────────────────────────────────────────────
// SourceProvider — lead KAYNAĞI kanonik sözleşmesi.
//
// Kaynaklar birbirinin YERİNE geçebilir olmalı: kokpit "hangi sağlayıcı" değil
// "kaç lead, ne maliyetle, ne kalitede" sorusunu sorar. Bu yüzden sözleşme altı
// metottan oluşur ve hepsi sağlayıcıdan bağımsız tiplerle konuşur.
//
// AYRIM (kasıtlı): `estimate` ve `start` AYRI metotlardır. Tek metot olsaydı
// bütçe kontrolü ancak para harcandıktan SONRA yapılabilirdi. Sıra kilitlidir:
//   estimate → bütçe kontrolü → start → status → fetch → normalize
//
// `start` ile `fetch` de ayrıdır: Apify koşusu asenkrondur, başlatan istek
// sonucu beklemez. Aynı koşu kimliğiyle sonradan `fetch` edilebilmesi, ağ
// koparsa ikinci kez PARA HARCAMADAN devam edebilmek demektir.
// ─────────────────────────────────────────────────────────────────────────────

import type { GrowthEnv } from '../flags'
import type { NormalizeResult } from '../normalize'

export type { GrowthEnv }

export type SourceProviderKey = 'places' | 'apollo' | 'apify' | 'fake'

/** Sağlayıcıya verilen arama. Sağlayıcıya özgü alan YOK — kasıtlı dar. */
export interface SourceQuery {
  /** Hedef niş, insan-okunur ('mimarlık ofisi', 'diş kliniği'). */
  niche: string
  /** Coğrafi hedef ('İstanbul', 'Berlin'). Boş bırakılamaz. */
  location: string
  /** Bu koşuda istenen lead sayısı. `MAX_LEADS_PER_RUN` ile kırpılır. */
  limit: number
  /** Hangi deneye ait — kokpitte maliyeti deneye bağlamak için. */
  experimentKey?: string | null
}

/** Maliyet tahmini. `unknown` maliyet SIFIR sayılmaz (fail-closed). */
export interface CostEstimate {
  provider: SourceProviderKey
  /** Tahmini USD. Sağlayıcı fiyat veremiyorsa `null` → bütçe kapısı REDDEDER. */
  estimatedCostUsd: number | null
  /** Tahminin dayanağı — kokpitte "neden bu rakam" sorusunun cevabı. */
  basis: string
  requestedCount: number
}

export interface RunHandle {
  provider: SourceProviderKey
  /** Sağlayıcı tarafındaki koşu kimliği. Fake/senkron sağlayıcılarda üretilir. */
  providerRunId: string
  startedAt: string
}

export type RunState = 'running' | 'succeeded' | 'failed' | 'timed_out' | 'unknown'

export interface RunStatus {
  provider: SourceProviderKey
  providerRunId: string
  state: RunState
  /** Sağlayıcının bildirdiği GERÇEK maliyet. Bilinmiyorsa `null`. */
  actualCostUsd: number | null
  /** Kapalı küme hata kodu; sağlayıcı mesajı ham geçirilmez. */
  errorCode?: SourceErrorCode | null
}

export type SourceErrorCode =
  | 'disabled'
  | 'not_configured'
  | 'budget_exceeded'
  | 'timeout'
  | 'rate_limited'
  | 'server_error'
  | 'bad_response'
  | 'not_found'

/** Sağlayıcıdan gelen ham kayıt. Şekli BİLİNMEZ — normalize'ın işi. */
export type RawRecord = Record<string, unknown>

export interface ProviderHealth {
  key: SourceProviderKey
  enabled: boolean
  /** Gerekli env ADLARI tanımlı mı (değer değil). */
  configured: boolean
  costed: boolean
  /** Kullanılamıyorsa NEDEN — kokpit "yeşil değil" gösterir. */
  reason: string | null
}

export interface SourceProvider {
  readonly key: SourceProviderKey
  health(env?: GrowthEnv): ProviderHealth
  estimate(query: SourceQuery): Promise<CostEstimate>
  start(query: SourceQuery): Promise<RunHandle>
  status(providerRunId: string): Promise<RunStatus>
  fetch(providerRunId: string): Promise<RawRecord[]>
  normalize(raw: RawRecord[]): NormalizeResult
}

/**
 * Sağlayıcı arızası — kapalı küme kod taşır.
 *
 * Ham sağlayıcı mesajı `message`'a KOYULMAZ: 401 gövdesi anahtar parçası,
 * 429 gövdesi hesap kimliği taşıyabiliyor. Çağıran yalnız `code` ile karar verir.
 */
export class SourceProviderError extends Error {
  constructor(
    readonly code: SourceErrorCode,
    readonly provider: SourceProviderKey,
    message: string,
  ) {
    super(message)
    this.name = 'SourceProviderError'
  }
}
