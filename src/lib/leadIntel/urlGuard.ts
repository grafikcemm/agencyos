// SSRF koruması — kendi sunucumuzdan yapılan TÜM lead-URL fetch'leri buradan geçer.
// Kurallar:
//  1. Yalnız http(s) + standart port (80/443/boş).
//  2. IP-literal hostname reddi (özel aralık kontrolünü baypas etmesin).
//  3. DNS çözümü → private/reserved IP reddi (10/8, 172.16/12, 192.168/16, 127/8,
//     169.254/16, 0/8, 100.64/10, ::1, fc00::/7, fe80::/10, ::ffff: eşlemeli v4).
//  4. TOCTOU / DNS-rebinding KAPALI: doğrulama ile bağlantı arasında ikinci bir DNS
//     sorgusu YOKTUR — doğrulanan public IP, socket'e pinlenmiş `lookup` ile gerçek
//     HTTP bağlantısına taşınır. Host başlığı ve TLS SNI hostname'den gelir (URL
//     değişmez), yalnız TCP hedefi pinlenir.
//  5. Redirect'ler manuel izlenir (max 3 hop); HER hop yeniden doğrulanır ve
//     yeniden pinlenir.
// PSI çağrısı Google altyapısından fetch ettiği için bu guard'a girmez; bizim
// doğrudan HTML fetch'lerimiz girer.

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import type { IncomingMessage } from 'node:http'
import type { LookupFunction } from 'node:net'

const MAX_REDIRECTS = 3
const MAX_BODY_BYTES = 512 * 1024
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
const ALLOWED_PORTS = new Set(['', '80', '443'])

export type UrlGuardResult =
  | { ok: true; url: URL; pinnedIp: string; family: 4 | 6 }
  | { ok: false; reason: string }

// IPv4 private/reserved aralıkları. Test edilebilir saf fonksiyon.
export function isPrivateIp(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) {
    const parts = ip.split('.').map(Number)
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true // şüpheli → reddet
    const [a, b] = parts
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    return false
  }
  if (version === 6) {
    const lower = ip.toLowerCase()
    if (lower === '::1' || lower === '::') return true
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true // fc00::/7
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true // fe80::/10
    // IPv4-mapped (::ffff:a.b.c.d) → gömülü v4'ü kontrol et
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateIp(mapped[1])
    return false
  }
  return true // IP değilse bu fonksiyona düşmemeli — güvenli taraf: reddet
}

// URL'in statik (DNS'siz) kontrolleri. Test edilebilir saf fonksiyon.
export function staticUrlCheck(rawUrl: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'Geçersiz URL' }
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { ok: false, reason: `İzin verilmeyen şema: ${parsed.protocol}` }
  }
  if (!ALLOWED_PORTS.has(parsed.port)) {
    return { ok: false, reason: `İzin verilmeyen port: ${parsed.port}` }
  }
  const host = parsed.hostname
  if (isIP(host.replace(/^\[|\]$/g, '')) !== 0) {
    return { ok: false, reason: 'IP-literal hostname reddedildi' }
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, reason: 'Yerel hostname reddedildi' }
  }
  return { ok: true, url: parsed }
}

// DNS çözümü dahil tam doğrulama. Dönüşte PİNLENECEK IP taşınır — çağıran taraf
// bağlantıyı BU IP'ye kurar, ikinci DNS sorgusu yapılmaz (rebinding penceresi yok).
export async function validateLeadUrl(rawUrl: string): Promise<UrlGuardResult> {
  const staticResult = staticUrlCheck(rawUrl)
  if (!staticResult.ok) return staticResult

  try {
    const addresses = await lookup(staticResult.url.hostname, { all: true, verbatim: true })
    if (addresses.length === 0) return { ok: false, reason: 'DNS çözülemedi' }
    for (const addr of addresses) {
      if (isPrivateIp(addr.address)) {
        return { ok: false, reason: `Private IP'ye çözüldü: ${addr.address}` }
      }
    }
    // IPv4 tercih (yaygın uyumluluk); yoksa ilk kayıt.
    const preferred = addresses.find((a) => a.family === 4) ?? addresses[0]
    return {
      ok: true,
      url: staticResult.url,
      pinnedIp: preferred.address,
      family: (preferred.family === 6 ? 6 : 4) as 4 | 6,
    }
  } catch {
    return { ok: false, reason: 'DNS çözülemedi' }
  }
}

// Doğrulanmış IP'yi socket'e sabitleyen lookup — Node http(s) 'lookup' opsiyonu.
// Host başlığı ve TLS SNI, istek URL'inin hostname'inden gelmeye devam eder;
// yalnız TCP bağlantı hedefi pinlenir. Test edilebilir saf fabrika.
export function makePinnedLookup(pinnedIp: string, family: 4 | 6): LookupFunction {
  return ((hostname: string, options: unknown, callback?: unknown) => {
    const cb = (typeof options === 'function' ? options : callback) as (
      err: NodeJS.ErrnoException | null,
      address: string | Array<{ address: string; family: number }>,
      family?: number
    ) => void
    const wantsAll = typeof options === 'object' && options !== null && (options as { all?: boolean }).all
    if (wantsAll) cb(null, [{ address: pinnedIp, family }])
    else cb(null, pinnedIp, family)
  }) as LookupFunction
}

export interface GuardedResponse {
  ok: boolean
  status: number
  body: string
  finalUrl: string
}

export type GuardedFetchResult =
  | { response: GuardedResponse; finalUrl: string }
  | { response: null; finalUrl: string; blocked: string }

interface PinnedRequestOpts {
  headers?: Record<string, string>
  signal?: AbortSignal
  maxBodyBytes?: number
}

// Tek hop: doğrulanmış IP'ye pinli HTTP(S) isteği. Redirect İZLEMEZ (çağıran izler).
function pinnedRequest(
  url: URL,
  pinnedIp: string,
  family: 4 | 6,
  opts: PinnedRequestOpts
): Promise<{ status: number; location: string | null; body: string }> {
  return new Promise((resolve, reject) => {
    const requester = url.protocol === 'https:' ? httpsRequest : httpRequest
    const req = requester(
      url,
      {
        method: 'GET',
        headers: opts.headers,
        signal: opts.signal,
        // TOCTOU kapanışı: bağlantı bu lookup üzerinden doğrulanmış IP'ye gider.
        lookup: makePinnedLookup(pinnedIp, family),
        // TLS SNI açıkça hostname'de tutulur (lookup override'ı SNI'yi etkilemez,
        // yine de niyet belgesi olarak sabitlenir).
        servername: url.protocol === 'https:' ? url.hostname : undefined,
      },
      (res: IncomingMessage) => {
        const max = opts.maxBodyBytes ?? MAX_BODY_BYTES
        let size = 0
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size <= max) chunks.push(chunk)
          else res.destroy() // gövde sınırı — kalan atılır
        })
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location ?? null,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        )
        res.on('error', reject)
      }
    )
    req.on('error', reject)
    req.end()
  })
}

// Guard'lı fetch: her hop'ta doğrula + pinle; redirect'ler manuel, max 3.
export async function guardedFetch(
  rawUrl: string,
  init: PinnedRequestOpts = {},
  opts: { maxRedirects?: number } = {}
): Promise<GuardedFetchResult> {
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS
  let currentUrl = rawUrl

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = await validateLeadUrl(currentUrl)
    if (!check.ok) return { response: null, finalUrl: currentUrl, blocked: check.reason }

    let result: { status: number; location: string | null; body: string }
    try {
      result = await pinnedRequest(check.url, check.pinnedIp, check.family, init)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'bağlantı hatası'
      return { response: null, finalUrl: currentUrl, blocked: `İstek hatası: ${msg}` }
    }

    if (result.status >= 300 && result.status < 400 && result.location) {
      // Göreli redirect'i mevcut URL üstünden çöz; sonraki hop YENİDEN doğrulanır+pinlenir.
      currentUrl = new URL(result.location, check.url).toString()
      continue
    }

    return {
      response: {
        ok: result.status >= 200 && result.status < 300,
        status: result.status,
        body: result.body,
        finalUrl: currentUrl,
      },
      finalUrl: currentUrl,
    }
  }
  return { response: null, finalUrl: currentUrl, blocked: `Redirect limiti aşıldı (${maxRedirects})` }
}
