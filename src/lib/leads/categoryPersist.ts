// Migration 031 (customer_category vb.) henüz uygulanmamış bir app DB'de lead
// yazımının PGRST204 ("column not found in schema cache") ile ÇÖKMESİNİ önler.
// Kolon yoksa kategori alanları payload'dan çıkarılıp yazım tekrar denenir.
// Kategoriler zaten enrichLead'de read-time hesaplandığından UI etkilenmez;
// migration uygulanınca tam DB persistansı kendiliğinden devreye girer.

export const CATEGORY_PERSIST_KEYS = [
  'customer_category',
  'website_quality_band',
  'category_reasons',
  'has_social_link',
  // Migration 071 — edinim dönemi
  'acquisition_epoch',
  // Migration 072 — pazar kapsamı ve kaynak izlenebilirliği
  'market_scope',
  'country_code',
  'lead_timezone',
  'entity_type',
  'source_provider',
  'source_provider_run_id',
  'source_url',
  'acquired_at',
  'lead_language',
  'lead_currency',
] as const

interface SupabaseErrorLike {
  code?: string | null
  message?: string | null
}

// PostgREST yeni kolonu bulamazsa code='PGRST204' döner; mesaj-temelli kontrol fallback.
export function isMissingCategoryColumnError(error: SupabaseErrorLike | null | undefined): boolean {
  if (!error) return false
  if (error.code === 'PGRST204') return true
  const msg = error.message ?? ''
  return CATEGORY_PERSIST_KEYS.some((k) => msg.includes(`'${k}'`))
}

// Kategori kolonlarını payload'dan çıkarır (migration-öncesi retry için).
export function stripCategoryKeys<T extends Record<string, unknown>>(payload: T): T {
  const copy = { ...payload }
  for (const k of CATEGORY_PERSIST_KEYS) delete copy[k]
  return copy
}
