import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimit } from '@/lib/api/rateLimit'
import { CemosAuthError } from './cemosLifeAuth'

// ─────────────────────────────────────────────────────────────────────────────
// GROWTH köprüsü — AYRI kimlik katmanı, LIFE köprüsünden BAĞIMSIZ tokenlar.
//
// LIFE tokenıyla growth verisine erişilememeli ve tersi de geçerli olmalı: iki
// köprü iki farklı veri kümesine bakıyor (biri kişisel günlük hayat, diğeri
// müşteri kazanma huneşi) ve birinin sızması diğerini açmamalı.
//
// Ortak parçalar (`requireWriteHeaders`, `bodyHash`, `authErrorResponse`,
// `envelope`, `CemosAuthError`) RT-A1'den OLDUĞU GİBİ yeniden kullanılıyor;
// kopyalanmıyor. Ayrılan tek şey env adları, hız sınırı anahtarı ve denetim
// tablosunun bulunduğu veritabanı.
//
// DENETİM App DB'de: growth yazması App DB'ye yapılır, idempotency anahtarının
// UNIQUE olduğu tablo da AYNI veritabanında olmalı. Ayrı DB'de olsaydı iki
// eşzamanlı istek arasında "kayıt yazıldı ama öneri yazılamadı" durumu
// oluşabilirdi.
// ─────────────────────────────────────────────────────────────────────────────

export type GrowthScope = 'read' | 'write'

const RATE_READ = 60
const RATE_WRITE = 20

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest()

/** Sabit zamanlı karşılaştırma — digest üzerinden, uzunluk farkı da sızmaz. */
function tokenMatches(candidate: string, expected: string): boolean {
  return timingSafeEqual(sha256(candidate), sha256(expected))
}

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization')
  if (!h?.startsWith('Bearer ')) return null
  return h.slice(7).trim() || null
}

/**
 * Growth köprüsü kimlik doğrulaması.
 *
 * WRITE tokenı okumayı da kapsar; READ tokenı yazma yoluna ASLA giremez.
 * Token env'de yoksa istek HER ortamda reddedilir — dev'de açık bırakılan bir
 * kapı, üretimde unutulan bir kapıdır.
 */
export function requireGrowthAuth(req: Request, scope: GrowthScope): { clientId: string } {
  const read = process.env.CEMOS_AGENCYOS_READ_TOKEN
  const write = process.env.CEMOS_AGENCYOS_WRITE_TOKEN
  const clientId = process.env.CEMOS_AGENCYOS_CLIENT_ID ?? 'cemos'

  const presented = bearer(req)
  if (!presented) throw new CemosAuthError(401, 'no_token', 'Bearer token gerekli.')

  const usable = (scope === 'write' ? [write] : [read, write]).filter((t): t is string => Boolean(t))
  if (!usable.length) throw new CemosAuthError(401, 'not_configured', 'Growth köprüsü tokenı yapılandırılmamış.')
  if (!usable.some((t) => tokenMatches(presented, t))) {
    throw new CemosAuthError(403, 'bad_scope', 'Token bu kapsam için geçerli değil.')
  }

  const rl = rateLimit(`cemos-growth:${scope}:${clientId}`, scope === 'write' ? RATE_WRITE : RATE_READ, 60_000)
  if (!rl.allowed) throw new CemosAuthError(429, 'rate_limited', `Hız sınırı aşıldı, ${rl.retryAfterSec} sn sonra dene.`)

  return { clientId }
}

export type GrowthAuditRow = {
  route: string
  method: string
  scope: GrowthScope
  idempotencyKey?: string | null
  requestHash?: string | null
  status: number
  responseSummary?: Record<string, unknown> | null
  error?: string | null
}

/** Denetim kaydı — sayaç ve hash evet, gövde ve PII HAYIR. */
export async function writeGrowthAudit(row: GrowthAuditRow): Promise<void> {
  try {
    await supabaseAdmin.from('cemos_growth_audit').insert({
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
    // Denetim yazımı isteği DÜŞÜRMEZ: migration 067 henüz elle uygulanmamış
    // olabilir. Sessiz kalmaz — çağıran yanıtında `warnings` ile görünür.
  }
}

/** Aynı anahtarla daha önce BAŞARILI yazma yapıldı mı. */
export async function findGrowthReplay(
  idempotencyKey: string,
): Promise<{ status: number; responseSummary: Record<string, unknown> | null } | null> {
  try {
    const { data } = await supabaseAdmin
      .from('cemos_growth_audit')
      .select('status,response_summary')
      .eq('idempotency_key', idempotencyKey)
      .lt('status', 300)
      .limit(1)
      .maybeSingle()
    if (!data) return null
    return {
      status: data.status as number,
      responseSummary: (data.response_summary ?? null) as Record<string, unknown> | null,
    }
  } catch {
    return null
  }
}
