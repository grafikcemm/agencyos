import { NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// API güvenlik yardımcıları — state-değiştiren route handler'lar için.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Same-origin guard (CSRF savunması). State-değiştiren isteklerde Origin/Referer
 * host'unun istek host'uyla eşleştiğini doğrular. Tarayıcı dışı/çapraz-site POST
 * (örn. başka bir sitenin oturum çerezini kullanarak yaptığı çağrı) reddedilir.
 *
 * Origin başlığı yoksa (bazı server-to-server / aynı-origin fetch'ler) Referer'a
 * düşer; ikisi de yoksa same-origin kabul edilir (örn. cron/iç çağrı). Çapraz-site
 * tarayıcı istekleri her zaman Origin gönderdiği için asıl saldırı yüzeyi kapanır.
 */
export function enforceSameOrigin(req: Request): NextResponse | null {
  const host = req.headers.get('host')
  const origin = req.headers.get('origin') ?? req.headers.get('referer')
  if (!host || !origin) return null
  try {
    if (new URL(origin).host !== host) {
      return NextResponse.json({ error: 'Cross-origin isteği reddedildi.' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Geçersiz origin.' }, { status: 403 })
  }
  return null
}

const POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const MAX_BODY_KEYS = 60

export class BadRequestError extends Error {}

/**
 * Write body hijyeni. Düz nesne olmasını zorunlu kılar, prototype-pollution
 * anahtarlarını (`__proto__`/`constructor`/`prototype`) atar ve aşırı büyük
 * payload'ları reddeder. service-role mutasyonlarına giden gövdeyi güvenli kılar.
 *
 * NOT: Bu, tablo-başına alan allowlist'inin yerini TUTMAZ — yalnızca yapısal
 * güvenliği sağlar. İleride her writable tablo için zod şeması/alan allowlist'i
 * eklenmeli (bkz. /api/db/[table] follow-up).
 */
export function sanitizeWriteBody(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestError('Gövde tek bir JSON nesnesi olmalı.')
  }
  const entries = Object.entries(body as Record<string, unknown>).filter(
    ([k]) => !POLLUTION_KEYS.has(k),
  )
  if (entries.length === 0) throw new BadRequestError('Boş gövde.')
  if (entries.length > MAX_BODY_KEYS) throw new BadRequestError('Gövde çok fazla alan içeriyor.')
  return Object.fromEntries(entries)
}
