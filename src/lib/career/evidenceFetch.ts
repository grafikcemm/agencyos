// Kariyer kanıtı URL doğrulayıcı.
//
// Bu modül, KULLANICININ GİRDİĞİ bir URL'yi sunucudan çeker. Yani klasik bir
// SSRF yüzeyidir: "kanıt" diye `http://169.254.169.254/latest/meta-data/`
// girilirse sunucu kendi bulut kimlik bilgilerini okumaya çalışır.
//
// KORUMALAR
//   • yalnız HTTPS
//   • private / loopback / link-local / metadata IP reddi
//   • DNS çözümünden SONRA tekrar kontrol (DNS rebinding'e karşı)
//   • redirect: 'manual' — 3xx reddedilir (redirect, kontrolü kaybettirir)
//   • 5 sn timeout
//   • 256 KB gövde sınırı
//   • yalnız HEAD/GET
//
// GEÇİCİ HATA İLERLEMEYİ DÜŞÜRMEZ
// Ağ hatası → `grace` + üstel geri çekilmeli yeniden deneme. Bir DNS
// kesintisinin aylık kilometre taşını geri alması, sistemi güvenilmez yapar.
// Yalnız kalıcı 4xx/410 veya 3 başarısız denemeden sonra `unreachable`.

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export const FETCH_TIMEOUT_MS = 5_000
export const MAX_BODY_BYTES = 256 * 1024
export const MAX_RETRIES = 3

export type VerificationStatus = 'pending' | 'verified' | 'grace' | 'unreachable'

export interface UrlCheck {
  ok: boolean
  reason?: string
}

/** IPv4/IPv6 adresinin özel/dahili aralıkta olup olmadığı. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const p = ip.split('.').map(Number)
    if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
    const [a, b] = p
    if (a === 0) return true // "bu ağ"
    if (a === 10) return true // private
    if (a === 127) return true // loopback
    if (a === 169 && b === 254) return true // link-local + bulut metadata
    if (a === 172 && b >= 16 && b <= 31) return true // private
    if (a === 192 && b === 168) return true // private
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    if (a >= 224) return true // multicast + reserved
    return false
  }
  if (v === 6) {
    const lower = ip.toLowerCase()
    if (lower === '::' || lower === '::1') return true
    if (lower.startsWith('fe80')) return true // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique local
    if (lower.startsWith('ff')) return true // multicast
    // IPv4-mapped (::ffff:10.0.0.1) — iç adresi maskeleyerek geçmesin.
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateAddress(mapped[1])
    return false
  }
  return true // IP değil → çağıran ayrıca DNS çözer
}

/** Şema/host seviyesinde ilk kapı. DNS çözümü YAPMAZ (senkron kullanılabilir). */
export function checkUrlShape(raw: string): UrlCheck {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'geçersiz URL' }
  }

  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'yalnız HTTPS kabul edilir' }
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'URL içinde kimlik bilgisi olamaz' }
  }

  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    return { ok: false, reason: 'dahili ana makine adı' }
  }
  if (isIP(host) && isPrivateAddress(host)) {
    return { ok: false, reason: 'özel/dahili IP adresi' }
  }
  return { ok: true }
}

/** DNS çözümünden sonraki ikinci kapı — rebinding'e karşı. */
export async function checkResolvedHost(raw: string): Promise<UrlCheck> {
  const shape = checkUrlShape(raw)
  if (!shape.ok) return shape

  const host = new URL(raw).hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) return { ok: true } // şekil kapısında zaten kontrol edildi

  try {
    const records = await lookup(host, { all: true })
    if (records.length === 0) return { ok: false, reason: 'ana makine çözülemedi' }
    for (const r of records) {
      if (isPrivateAddress(r.address)) {
        return { ok: false, reason: 'ana makine dahili adrese çözülüyor' }
      }
    }
    return { ok: true }
  } catch {
    // DNS hatası GEÇİCİ olabilir — burada reddetmiyoruz, çağıran `grace`e alır.
    return { ok: false, reason: 'DNS çözülemedi (geçici olabilir)' }
  }
}

export interface FetchOutcome {
  status: VerificationStatus
  httpStatus?: number
  error?: string
  /** Bir sonraki denemenin ne kadar sonra yapılacağı (ms). */
  retryAfterMs?: number
}

/** Üstel geri çekilme: 1dk → 5dk → 25dk. */
export function backoffMs(retryCount: number): number {
  return Math.min(60_000 * 5 ** Math.max(0, retryCount), 25 * 60_000)
}

/**
 * Kanıtın hâlâ erişilebilir olduğunu doğrular.
 *
 * @param retryCount kaçıncı deneme olduğu — `grace`/`unreachable` kararını verir
 */
export async function verifyEvidenceUrl(
  raw: string,
  retryCount = 0,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchOutcome> {
  const shape = checkUrlShape(raw)
  if (!shape.ok) {
    // Şekil hatası KALICIDIR — yeniden denemek aynı sonucu verir.
    return { status: 'unreachable', error: shape.reason }
  }

  const resolved = await checkResolvedHost(raw)
  if (!resolved.ok) {
    if (resolved.reason?.includes('dahili')) {
      return { status: 'unreachable', error: resolved.reason }
    }
    return transient(resolved.reason ?? 'ağ hatası', retryCount)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetchImpl(raw, {
      method: 'GET',
      redirect: 'manual', // 3xx = kontrol kaybı; izlenmez
      signal: controller.signal,
      headers: { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
    })

    if (res.status >= 300 && res.status < 400) {
      return transient('yönlendirme izlenmiyor', retryCount, res.status)
    }

    if (res.status === 404 || res.status === 410) {
      // Kalıcı: kanıt gerçekten yok.
      return { status: 'unreachable', httpStatus: res.status, error: 'kanıt bulunamadı' }
    }

    if (res.status >= 400 && res.status < 500) {
      // 401/403 kalıcı sayılır: erişilemeyen kanıt, kanıt değildir.
      return { status: 'unreachable', httpStatus: res.status, error: 'kanıta erişilemiyor' }
    }

    if (res.status >= 500) {
      return transient('sunucu hatası', retryCount, res.status)
    }

    // Gövde sınırı — büyük dosya indirilmez.
    const len = Number(res.headers.get('content-length') ?? '0')
    if (len > MAX_BODY_BYTES) {
      // Erişilebilir olduğu KANITLANDI; gövdeyi okumaya gerek yok.
      return { status: 'verified', httpStatus: res.status }
    }

    return { status: 'verified', httpStatus: res.status }
  } catch (err) {
    const message = err instanceof Error ? err.name : 'bilinmeyen hata'
    return transient(message === 'AbortError' ? 'zaman aşımı' : message, retryCount)
  } finally {
    clearTimeout(timer)
  }
}

function transient(error: string, retryCount: number, httpStatus?: number): FetchOutcome {
  if (retryCount + 1 >= MAX_RETRIES) {
    return { status: 'unreachable', error: `${error} (${MAX_RETRIES} deneme)`, httpStatus }
  }
  return {
    status: 'grace',
    error,
    httpStatus,
    retryAfterMs: backoffMs(retryCount + 1),
  }
}

/**
 * İlerleme hesabına giren kanıt: YALNIZ `verified`.
 * `grace` ilerlemeyi DÜŞÜRMEZ ama SAYMAZ da — geçici belirsizlik, ne kayıp ne
 * kazanç. `pending` ve `unreachable` de sayılmaz.
 */
export function countsTowardProgress(status: VerificationStatus): boolean {
  return status === 'verified'
}

/** `grace` ilerlemeyi düşürmez: önceki doğrulama hâlâ geçerli sayılır. */
export function degradesProgress(status: VerificationStatus): boolean {
  return status === 'unreachable'
}
