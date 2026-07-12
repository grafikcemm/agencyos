import { NextResponse } from 'next/server'
import type { z } from 'zod'

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
/** Varsayılan gövde üst sınırı (byte, UTF-16 kod birimi yaklaşıklığı). */
export const MAX_JSON_BODY_BYTES = 100_000

/**
 * Boyut-sınırlı + Zod-doğrulamalı JSON gövde okuyucu. State-değiştiren route
 * handler'larda `await req.json()` yerine kullanılır: (1) ham metin uzunluğu
 * sınırı aşarsa reddeder, (2) JSON parse hatasında reddeder, (3) şema
 * doğrulamasında ilk hataları özetleyen BadRequestError fırlatır.
 */
export async function parseJsonBody<Schema extends z.ZodTypeAny>(
  req: Request,
  schema: Schema,
  maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<z.infer<Schema>> {
  const text = await req.text()
  if (text.length > maxBytes) {
    throw new BadRequestError(`Gövde çok büyük (üst sınır ${maxBytes} bayt).`)
  }
  let raw: unknown
  try {
    raw = text.length === 0 ? {} : JSON.parse(text)
  } catch {
    throw new BadRequestError('Gövde geçerli JSON değil.')
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    throw new BadRequestError(`Geçersiz gövde — ${issues}`)
  }
  return parsed.data
}

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
