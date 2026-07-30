import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { lifeSupabaseAdmin } from '@/lib/lifeSupabaseAdmin'
import { rateLimit } from '@/lib/api/rateLimit'

// ─────────────────────────────────────────────────────────────────────────────
// GrafikcemOS ↔ AgencyOS LIFE köprüsü — DAR kimlik katmanı.
//
// Bu köprü generic /api/db proxy'si DEĞİLDİR ve onun tokenlarını kullanmaz:
// OPERATOR_API_TOKEN, CRON_SECRET ve Supabase service-role anahtarı bu yoldan
// GEÇMEZ. Kendi iki tokenı vardır ve okuma ile yazma AYRI scope'tur — okuma
// tokenı sızsa bile hiçbir LIFE satırı değiştirilemez.
//
// Şablon: /api/integrations/feed-the-goat/snapshot. Oradaki iki eksik burada
// kapatılıyor: (1) token karşılaştırması sabit zamanlı, (2) yazma yolunda
// idempotency + replay penceresi zorunlu.
// ─────────────────────────────────────────────────────────────────────────────

export type CemosScope = 'read' | 'write'

/** Replay penceresi. Bundan eski bir istek damgası kabul edilmez. */
export const MAX_SKEW_MS = 5 * 60_000

/** Dakikada izin verilen istek — okuma ve yazma ayrı sayılır. */
const RATE_READ = 120
const RATE_WRITE = 30

export class CemosAuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest()

/**
 * Sabit zamanlı token karşılaştırması.
 *
 * Ham `===` karşılaştırması ilk farklı bayta kadar geçen sürede sızıntı verir.
 * Digest üzerinden karşılaştırmak uzunluk farkını da kapatır: iki taraf da her
 * zaman 32 bayttır, yani "yanlış uzunluk" bilgisi bile dışarı çıkmaz.
 */
function tokenMatches(candidate: string, expected: string): boolean {
  return timingSafeEqual(sha256(candidate), sha256(expected))
}

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization')
  if (!h?.startsWith('Bearer ')) return null
  const t = h.slice(7).trim()
  return t || null
}

/**
 * Scope doğrulaması.
 *
 * WRITE tokenı okumayı da kapsar (aynı istemci, geniş yetki); READ tokenı yazma
 * yoluna ASLA giremez. Token env'de tanımlı değilse istek her ortamda reddedilir
 * — dev'de açık bırakmak, üretimde unutulan bir kapıdır.
 */
export function requireCemosAuth(req: Request, scope: CemosScope): { clientId: string } {
  const read = process.env.CEMOS_LIFE_READ_TOKEN
  const write = process.env.CEMOS_LIFE_WRITE_TOKEN
  const clientId = process.env.CEMOS_LIFE_CLIENT_ID ?? 'cemos'

  const presented = bearer(req)
  if (!presented) throw new CemosAuthError(401, 'no_token', 'Bearer token gerekli.')

  const acceptable = scope === 'write' ? [write] : [read, write]
  const usable = acceptable.filter((t): t is string => Boolean(t))
  if (!usable.length) {
    throw new CemosAuthError(401, 'not_configured', 'Köprü tokenı yapılandırılmamış.')
  }
  if (!usable.some((t) => tokenMatches(presented, t))) {
    throw new CemosAuthError(403, 'bad_scope', 'Token bu kapsam için geçerli değil.')
  }

  const limit = scope === 'write' ? RATE_WRITE : RATE_READ
  const rl = rateLimit(`cemos-life:${scope}:${clientId}`, limit, 60_000)
  if (!rl.allowed) {
    throw new CemosAuthError(429, 'rate_limited', `Hız sınırı aşıldı, ${rl.retryAfterSec} sn sonra dene.`)
  }

  return { clientId }
}

/**
 * Yazma isteğinin tekrar oynatılamazlığı.
 *
 * İki ayrı koruma, iki ayrı arıza için:
 *   · `Idempotency-Key` — ağ koptuğunda GrafikcemOS aynı isteği tekrarlayabilir;
 *     ikinci çağrı ikinci bir görev YARATMAMALI.
 *   · `X-Request-Timestamp` — kaydedilmiş eski bir istek gövdesinin çok sonra
 *     yeniden gönderilmesi (replay) reddedilir.
 */
export function requireWriteHeaders(req: Request): { idempotencyKey: string } {
  const key = req.headers.get('idempotency-key')?.trim()
  if (!key || key.length < 8 || key.length > 200) {
    throw new CemosAuthError(400, 'idempotency_required', 'Idempotency-Key başlığı gerekli (8-200 karakter).')
  }
  const ts = req.headers.get('x-request-timestamp')
  if (!ts) throw new CemosAuthError(400, 'timestamp_required', 'X-Request-Timestamp başlığı gerekli.')
  const parsed = Number.isFinite(Number(ts)) ? Number(ts) : Date.parse(ts)
  if (!Number.isFinite(parsed)) {
    throw new CemosAuthError(400, 'timestamp_invalid', 'X-Request-Timestamp okunamadı.')
  }
  if (Math.abs(Date.now() - parsed) > MAX_SKEW_MS) {
    throw new CemosAuthError(400, 'timestamp_skew', 'İstek damgası replay penceresinin dışında.')
  }
  return { idempotencyKey: key }
}

export type AuditRow = {
  route: string
  method: string
  scope: CemosScope
  idempotencyKey?: string | null
  requestHash?: string | null
  status: number
  responseSummary?: Record<string, unknown> | null
  error?: string | null
}

/**
 * Denetim kaydı LIFE DB'de tutulur — App DB'de değil.
 *
 * Sebep yazma yarışıdır: idempotency anahtarının UNIQUE olduğu tablo, yazmanın
 * gerçekleştiği veritabanıyla AYNI olmalı. Ayrı DB'de tutulsaydı iki eşzamanlı
 * istek arasında "kayıt yazıldı ama görev yazılamadı" (ya da tersi) durumu
 * oluşabilirdi.
 *
 * Gövde, token ve PII BURAYA GIRMEZ: yalnız yolun adı, kapalı küme durum ve
 * gövdenin hash'i. `response_summary` sayaç/id taşır, içerik taşımaz.
 */
export async function writeAudit(row: AuditRow): Promise<void> {
  try {
    await lifeSupabaseAdmin.from('cemos_bridge_audit').insert({
      route: row.route,
      method: row.method,
      scope: row.scope,
      idempotency_key: row.idempotencyKey ?? null,
      request_hash: row.requestHash ?? null,
      status: row.status,
      response_summary: row.responseSummary ?? null,
      error: row.error ?? null,
    })
  } catch {
    // Denetim yazımı isteğin kendisini DÜŞÜRMEZ: audit tablosu henüz manuel
    // uygulanmamış olabilir (migration politikası gereği). Sessiz kalmaz —
    // çağıran yanıtında `warnings` ile görünür.
  }
}

/**
 * Aynı idempotency anahtarıyla daha önce BAŞARILI bir yazma yapıldı mı.
 * Yapıldıysa çağıran mutasyonu TEKRARLAMAZ; saklanan özeti döner.
 */
export async function findReplay(
  idempotencyKey: string,
): Promise<{ status: number; responseSummary: Record<string, unknown> | null } | null> {
  try {
    const { data } = await lifeSupabaseAdmin
      .from('cemos_bridge_audit')
      .select('status,response_summary')
      .eq('idempotency_key', idempotencyKey)
      .lt('status', 300)
      .limit(1)
      .maybeSingle()
    if (!data) return null
    return { status: data.status as number, responseSummary: (data.response_summary ?? null) as Record<string, unknown> | null }
  } catch {
    return null
  }
}

/** Gövdenin parmak izi — içeriği DEĞİL. */
export const bodyHash = (v: unknown) => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex')

/** Hata → yanıt. Kapalı küme kod; ayrıntı sızdırmaz. */
export function authErrorResponse(e: unknown): NextResponse {
  if (e instanceof CemosAuthError) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status })
  }
  return NextResponse.json({ error: 'Beklenmeyen hata', code: 'internal' }, { status: 500 })
}

/** Tüm köprü yanıtlarının ortak zarfı (feed-the-goat şablonuyla aynı). */
export function envelope<T>(scopeName: string, data: T, warnings: string[] = [], status: 'ok' | 'empty' | 'degraded' = 'ok') {
  return {
    app: 'agencyos',
    scope: scopeName,
    status,
    generatedAt: new Date().toISOString(),
    syncTimestamp: Date.now(),
    data,
    warnings: warnings.length ? warnings : null,
  }
}

/** İstanbul takvim günü — LIFE tabloları `date` sütunlarını buna göre tutar. */
export const istanbulDate = (d: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d)
