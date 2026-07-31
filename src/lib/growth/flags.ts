// ─────────────────────────────────────────────────────────────────────────────
// GROWTH MOTORU — bayraklar. Hepsi default KAPALI.
//
// `outreach/flags.ts` idiomu: env string'i, yalnız tam `'true'` açar. Bir yazım
// hatası ("TRUE", "1", "yes") KAPALI sayılır — para harcayan bir sağlayıcının
// bir typo yüzünden açılması kabul edilemez.
//
// Bu dosya yalnız DURUM üretir; hiçbir yerde anahtar DEĞERİ okunmaz/döndürülmez.
// `configured` alanı "anahtar tanımlı mı" sorusunun cevabıdır, anahtarın kendisi
// değil.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Growth katmanının env görüşü.
 *
 * `NodeJS.ProcessEnv` DEĞİL, kasıtlı olarak daha dar: bu katman yalnız "adı
 * olan string" okur. Dar tip aynı zamanda testin düz nesne geçirebilmesini
 * sağlar — `as NodeJS.ProcessEnv` cast'i Next'in genişletilmiş tipinde
 * reddediliyor ve cast'le susturulan bir tip hatası, testin gerçekten neyi
 * sınadığını belirsizleştirirdi.
 */
export type GrowthEnv = Record<string, string | undefined>

export type GrowthFlagKey =
  | 'APIFY_ENABLED'
  | 'INSTANTLY_ENABLED'
  | 'EMAIL_PILOT_ENABLED'
  | 'TRUSTMRR_ENABLED'

const on = (env: GrowthEnv, key: string) => env[key] === 'true'

export const isApifyEnabled = (env: GrowthEnv = process.env) => on(env, 'APIFY_ENABLED')
export const isInstantlyEnabled = (env: GrowthEnv = process.env) => on(env, 'INSTANTLY_ENABLED')
export const isEmailPilotEnabled = (env: GrowthEnv = process.env) => on(env, 'EMAIL_PILOT_ENABLED')

export interface GrowthFlagStatus {
  key: GrowthFlagKey
  enabled: boolean
  /** Bayrak açılsa bile çalışabilmesi için gereken env ADLARI tanımlı mı. */
  configured: boolean
  /** Açıkken para harcayabilir mi — kokpitte uyarı rozeti bunu kullanır. */
  costed: boolean
  description: string
}

/**
 * Panel/kokpit için okunur bayrak listesi.
 *
 * `configured` DEĞER göstermez: yalnız "ilgili env adı boş değil mi". Bir
 * anahtarın varlığı bile kokpitte metin olarak sızmaz.
 */
export function describeGrowthFlags(env: GrowthEnv = process.env): GrowthFlagStatus[] {
  const has = (name: string) => Boolean(env[name]?.trim())
  return [
    {
      key: 'APIFY_ENABLED',
      enabled: on(env, 'APIFY_ENABLED'),
      configured: has('APIFY_TOKEN') && has('APIFY_ACTOR_ID'),
      costed: true,
      description: 'Apify lead kaynağı (kapalı = hiçbir Actor koşusu başlatılmaz)',
    },
    {
      key: 'INSTANTLY_ENABLED',
      enabled: on(env, 'INSTANTLY_ENABLED'),
      configured: has('INSTANTLY_API_KEY'),
      costed: true,
      description: 'Instantly gönderim sağlayıcısı (kapalı = GmailDirect/Fake)',
    },
    {
      key: 'EMAIL_PILOT_ENABLED',
      enabled: on(env, 'EMAIL_PILOT_ENABLED'),
      configured: true,
      description: 'email_pilot_v1 dizisi (kapalı = enqueue reddedilir)',
      costed: false,
    },
    {
      key: 'TRUSTMRR_ENABLED',
      enabled: on(env, 'TRUSTMRR_ENABLED'),
      configured: false,
      costed: false,
      description: 'TrustMRR keşif kaynağı — bu trende iskelet yok, hep kapalı',
    },
  ]
}
