// ─────────────────────────────────────────────────────────────────────────────
// Basit in-memory sliding-window rate limiter.
//
// NOT: Serverless'te bellek instance-başına geçicidir → mükemmel değil ama tek-
// operatör login brute-force'unu pratikte durdurur. Dağıtık kesinlik gerekirse
// Upstash/Redis tabanlı limiter'a geçilmeli.
// ─────────────────────────────────────────────────────────────────────────────

type Hit = { count: number; resetAt: number }
const buckets = new Map<string, Hit>()

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

/**
 * @param key      Benzersiz tanımlayıcı (örn. `login:<ip>`).
 * @param limit    Pencere başına izin verilen istek sayısı.
 * @param windowMs Pencere uzunluğu (ms).
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const hit = buckets.get(key)

  if (!hit || now >= hit.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 }
  }

  hit.count += 1
  if (hit.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((hit.resetAt - now) / 1000) }
  }
  return { allowed: true, remaining: limit - hit.count, retryAfterSec: 0 }
}

/** İstekten istemci IP'sini çıkar (Vercel/proxy başlıkları). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}
