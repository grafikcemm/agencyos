// Migration 034 (design_score vb.) henüz uygulanmamış bir app DB'de lead yazımının
// PGRST204 ("column not found in schema cache") ile ÇÖKMESİNİ önler.
// categoryPersist.ts'in genelleştirilmiş hali — categoryPersist OLDUĞU GİBİ kalır
// (kendi testleri var); v2 kolonları için bu modül kullanılır.
// Kolon yoksa v2 alanları payload'dan çıkarılıp yazım tekrar denenir; migration
// uygulanınca tam persistans kendiliğinden devreye girer.

export const V2_LEAD_KEYS = [
  'design_score',
  'ai_score',
  'primary_service_slug',
  'last_assessment_id',
  'last_assessed_at',
] as const

interface SupabaseErrorLike {
  code?: string | null
  message?: string | null
}

// PostgREST yeni kolonu bulamazsa code='PGRST204' döner; mesaj-temelli kontrol fallback.
export function isMissingColumnError(
  error: SupabaseErrorLike | null | undefined,
  keys: readonly string[] = V2_LEAD_KEYS
): boolean {
  if (!error) return false
  if (error.code === 'PGRST204') return true
  const msg = error.message ?? ''
  return keys.some((k) => msg.includes(`'${k}'`))
}

// Verilen anahtarları payload'dan çıkarır (migration-öncesi retry için).
export function stripKeys<T extends Record<string, unknown>>(
  payload: T,
  keys: readonly string[] = V2_LEAD_KEYS
): T {
  const copy = { ...payload }
  for (const k of keys) delete copy[k]
  return copy
}
