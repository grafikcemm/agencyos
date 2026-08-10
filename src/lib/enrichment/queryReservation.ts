// Ücretli dış sorgu rezervasyonu — "aynı sorgu iki kez ödenmez" garantisi.
//
// ─────────────────────────────────────────────────────────────────────────────
// NEDEN jsonb İÇİNDEKİ query_hash YETMİYORDU
//
// Eski yaklaşım: `provenance.apollo.query_hash` alanına bak, yoksa çağır, sonra
// yaz. Üç kusuru vardı:
//   1. jsonb içindeki bir alan üzerinde benzersizlik DAYATILAMAZ
//   2. oku → çağır → yaz arasında bir yarış penceresi var
//   3. eşzamanlı iki istek pencereyi BİRLİKTE geçer → iki kez ödeme
//
// Burada garanti veritabanı seviyesinde: `query_hash` UNIQUE. Satırı yazabilen
// TEK istek sağlayıcıya gider.
//
// ─────────────────────────────────────────────────────────────────────────────
// HTTP ÇAĞRISI DB KİLİDİ ALTINDA TUTULMAZ
//
// Akış üç ayrı, kısa veritabanı işlemidir:
//   reserve()  → INSERT ... ON CONFLICT DO NOTHING   (kısa)
//   [çağrı]    → sağlayıcıya HTTP                     (DB'ye dokunmaz)
//   complete() → UPDATE                                (kısa)
//
// Aradaki HTTP çağrısı saniyeler sürebilir; hiçbir satır kilidi tutulmaz.

import { supabaseAdmin } from '@/lib/supabase'
import { createHash } from 'node:crypto'

export type Provider = 'apollo' | 'serpapi' | 'tavily' | 'exa' | 'firecrawl' | 'pagespeed'
export type SubjectType = 'company' | 'person'

/** Çökmüş sayılma eşiği — DB varsayılanıyla (5 dk) aynı olmak zorunda. */
export const STALE_AFTER_MS = 5 * 60 * 1000

export interface ReservationRequest {
  provider: Provider
  subjectType: SubjectType
  /** Kanonik özne anahtarı — şirket için normalize edilmiş domain. */
  subjectKey: string
  /** Sağlayıcıya gidecek parametreler. Sıra bağımsız hash'lenir. */
  params: Record<string, unknown>
}

/**
 * Sorgunun kanonik parmak izi.
 *
 * Anahtar sırası hash'i DEĞİŞTİRMEZ: `{a:1,b:2}` ile `{b:2,a:1}` aynı sorgudur
 * ve ikinci kez ödenmemelidir. Yuvalanmış nesneler de sıralanır.
 */
export function queryHash(req: ReservationRequest): string {
  const canonical = JSON.stringify({
    provider: req.provider,
    subjectType: req.subjectType,
    subjectKey: req.subjectKey.trim().toLowerCase(),
    params: sortDeep(req.params),
  })
  return createHash('sha256').update(canonical).digest('hex')
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortDeep((value as Record<string, unknown>)[k])]),
    )
  }
  return value
}

export type ReserveOutcome =
  /** Rezervasyon bizim — sağlayıcıya GİDİLEBİLİR. */
  | { kind: 'reserved'; hash: string }
  /** Sonuç zaten var — ÜCRET ÖDENMEZ. */
  | { kind: 'cached'; hash: string; result: unknown; costUsd: number }
  /** Başka bir istek şu anda çağrıyı yapıyor — beklenmeli, ödeme yapılmamalı. */
  | { kind: 'in_progress'; hash: string; since: string }
  /** Önceki deneme başarısız; yeniden denenebilir (rezervasyon devralındı). */
  | { kind: 'retry'; hash: string; previousError: string | null }
  /** Tablo yok (mig 070 uygulanmamış) — çağrı yapılmamalı, fail-closed. */
  | { kind: 'unavailable'; hash: string; reason: string }

interface ReservationRow {
  id: string
  query_hash: string
  status: 'in_progress' | 'completed' | 'failed'
  result: unknown
  error_class: string | null
  cost_usd: number | string | null
  cache_hits: number
  reserved_at: string
  stale_after: string
  expires_at: string
}

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])

/**
 * Ücretli çağrıdan ÖNCE çağrılır.
 *
 * `reserved` dönerse çağrı yapılabilir ve ardından `complete()` / `fail()`
 * ÇAĞRILMAK ZORUNDADIR — aksi halde satır `stale_after`'a kadar diğer
 * istekleri bekletir (süresiz değil, ama gereksiz).
 */
export async function reserve(req: ReservationRequest, nowMs = Date.now()): Promise<ReserveOutcome> {
  const hash = queryHash(req)
  const nowIso = new Date(nowMs).toISOString()

  const { error: insertError } = await supabaseAdmin
    .from('enrichment_query_reservations')
    .insert({
      query_hash: hash,
      provider: req.provider,
      subject_type: req.subjectType,
      subject_key: req.subjectKey.trim().toLowerCase(),
      status: 'in_progress',
      reserved_at: nowIso,
      stale_after: new Date(nowMs + STALE_AFTER_MS).toISOString(),
    })

  if (!insertError) return { kind: 'reserved', hash }

  if (MISSING_TABLE_CODES.has(insertError.code ?? '')) {
    // Fail-closed: rezervasyon tablosu yoksa çift ödeme koruması YOK demektir.
    // Sessizce çağrı yapmak, koruması olmayan bir sisteme para harcatır.
    return {
      kind: 'unavailable',
      hash,
      reason: 'enrichment_query_reservations yok — migration 070 uygulanmamış',
    }
  }

  // 23505 = UNIQUE ihlali → satır zaten var. Yarışı kaybettik veya cache var.
  if (insertError.code !== '23505') {
    return { kind: 'unavailable', hash, reason: insertError.message }
  }

  const { data, error: readError } = await supabaseAdmin
    .from('enrichment_query_reservations')
    .select('id,query_hash,status,result,error_class,cost_usd,cache_hits,reserved_at,stale_after,expires_at')
    .eq('query_hash', hash)
    .maybeSingle()

  if (readError || !data) {
    return { kind: 'unavailable', hash, reason: readError?.message ?? 'rezervasyon okunamadı' }
  }

  const row = data as unknown as ReservationRow

  if (row.status === 'completed') {
    if (Date.parse(row.expires_at) <= nowMs) {
      // Süresi dolmuş sonuç: yeni ücretli sorgu MEŞRU. Satırı devral.
      const claimed = await claimStale(hash, nowMs)
      return claimed
        ? { kind: 'reserved', hash }
        : { kind: 'in_progress', hash, since: row.reserved_at }
    }
    // Cache isabeti sayacı — "sonuç başına maliyet" bunu kullanır.
    await supabaseAdmin
      .from('enrichment_query_reservations')
      .update({ cache_hits: (row.cache_hits ?? 0) + 1 })
      .eq('query_hash', hash)

    return { kind: 'cached', hash, result: row.result, costUsd: Number(row.cost_usd ?? 0) }
  }

  if (row.status === 'in_progress') {
    if (Date.parse(row.stale_after) <= nowMs) {
      const claimed = await claimStale(hash, nowMs)
      return claimed
        ? { kind: 'retry', hash, previousError: 'önceki deneme yarıda kaldı' }
        : { kind: 'in_progress', hash, since: row.reserved_at }
    }
    return { kind: 'in_progress', hash, since: row.reserved_at }
  }

  // status === 'failed' → devralınabilir.
  const claimed = await claimStale(hash, nowMs)
  return claimed
    ? { kind: 'retry', hash, previousError: row.error_class }
    : { kind: 'in_progress', hash, since: row.reserved_at }
}

/**
 * Çökmüş/başarısız/süresi dolmuş bir rezervasyonu koşullu UPDATE ile devralır.
 * `eq('status', …)` + `lte('stale_after', …)` koşulu, iki isteğin aynı anda
 * devralmasını engeller: yalnız birinin UPDATE'i satırı etkiler.
 */
async function claimStale(hash: string, nowMs: number): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('enrichment_query_reservations')
    .update({
      status: 'in_progress',
      reserved_at: new Date(nowMs).toISOString(),
      stale_after: new Date(nowMs + STALE_AFTER_MS).toISOString(),
      error_class: null,
    })
    .eq('query_hash', hash)
    .lte('stale_after', new Date(nowMs).toISOString())
    .select('id')

  return Array.isArray(data) && data.length > 0
}

/** Sağlayıcı çağrısı başarılıysa. Maliyet BURADA kaydedilir. */
export async function complete(
  hash: string,
  result: unknown,
  cost: { usd?: number; credits?: number } = {},
  ttlDays = 90,
  nowMs = Date.now(),
): Promise<void> {
  await supabaseAdmin
    .from('enrichment_query_reservations')
    .update({
      status: 'completed',
      result: result ?? null,
      cost_usd: cost.usd ?? 0,
      credits_used: cost.credits ?? 0,
      completed_at: new Date(nowMs).toISOString(),
      expires_at: new Date(nowMs + ttlDays * 86_400_000).toISOString(),
    })
    .eq('query_hash', hash)
}

/**
 * Sağlayıcı çağrısı başarısızsa. Satır SİLİNMEZ: silmek, hatanın hiç olmamış
 * gibi görünmesine ve sınırsız yeniden denemeye yol açardı. `failed` durumu
 * `stale_after` sonrası devralınabilir.
 */
export async function fail(hash: string, errorClass: string, nowMs = Date.now()): Promise<void> {
  await supabaseAdmin
    .from('enrichment_query_reservations')
    .update({
      status: 'failed',
      error_class: errorClass.slice(0, 120),
      stale_after: new Date(nowMs + STALE_AFTER_MS).toISOString(),
    })
    .eq('query_hash', hash)
}

export interface ProviderCostSummary {
  provider: Provider
  paidQueries: number
  cacheHits: number
  totalUsd: number
  totalCredits: number
  /** Ödenen sorgu başına maliyet. Sıfır sorguda `null` — 0 göstermek yanıltır. */
  costPerResultUsd: number | null
}

/** Kredi bütçesi ve sonuç başına maliyet görünürlüğü. */
export async function costSummary(provider: Provider): Promise<ProviderCostSummary | null> {
  const { data, error } = await supabaseAdmin
    .from('enrichment_query_reservations')
    .select('cost_usd,credits_used,cache_hits,status')
    .eq('provider', provider)

  if (error || !data) return null

  const rows = data as unknown as { cost_usd: number | string | null; credits_used: number; cache_hits: number; status: string }[]
  const paid = rows.filter((r) => r.status === 'completed')
  const totalUsd = paid.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0)
  const totalCredits = paid.reduce((s, r) => s + (r.credits_used ?? 0), 0)
  const cacheHits = rows.reduce((s, r) => s + (r.cache_hits ?? 0), 0)

  return {
    provider,
    paidQueries: paid.length,
    cacheHits,
    totalUsd,
    totalCredits,
    costPerResultUsd: paid.length > 0 ? totalUsd / paid.length : null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tahmin edilmiş e-posta kapısı
// ─────────────────────────────────────────────────────────────────────────────

export type EmailConfidence = 'guessed' | 'probable' | 'verified'

/**
 * Taslak hazırlamak SERBEST — ücretsiz ve geri alınabilir.
 * Gönderim/onay YASAK — yanlış adrese giden mesaj geri alınamaz ve
 * suppression kaydını kirletir.
 */
/**
 * Taslak hazırlama, e-posta güven seviyesinin FONKSİYONU DEĞİLDİR — her zaman
 * serbesttir. Sabit olarak yazılıyor ki "acaba hangi durumda engelleniyor?"
 * diye okunacak bir dallanma bulunmasın.
 */
export const DRAFTING_ALWAYS_ALLOWED = true as const

export function canSendWith(confidence: EmailConfidence | null | undefined): boolean {
  return confidence === 'verified'
}

export function sendBlockReason(confidence: EmailConfidence | null | undefined): string | null {
  if (confidence === 'verified') return null
  if (confidence === 'guessed') return 'e-posta sağlayıcı tahmini — doğrulanmadan gönderilemez'
  if (confidence === 'probable') return 'e-posta pattern eşleşmesi — doğrulanmadan gönderilemez'
  return 'e-posta güven seviyesi bilinmiyor — doğrulanmadan gönderilemez'
}
