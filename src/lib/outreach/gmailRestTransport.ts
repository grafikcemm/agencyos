// ─────────────────────────────────────────────────────────────────────────────
// GERÇEK Gmail REST transport'u (FINAL PILOT BLOCKERS Faz 1).
//
// Sözleşme (sendMachine.GmailTransport):
//  • send(): users.messages.send — başarıda {id, threadId}; hatada
//    GmailTransportError(ambiguous):
//      - token alınamadı        → ambiguous=false (provider'a HİÇ çıkılmadı)
//      - HTTP 4xx               → ambiguous=false (provider kesin reddetti)
//      - timeout / ağ / 5xx     → ambiguous=true  (mail gitmiş OLABİLİR)
//      - 2xx ama gövde bozuk    → ambiguous=true  (gönderim belirsiz)
//    Belirsiz sonuçta otomatik resend YOK — çözüm reconciliation (sendMachine).
//  • findByRfcMessageId(): `rfc822msgid:` araması, TAM pagination; provider
//    hatası ASLA null'a (not-found'a) çevrilmez — throw edilir; eksik kalan
//    pagination da throw'dur (yarım arama not-found kararına dönüşemez).
//
// Güvenlik: access/refresh token, raw gövde ve alıcı adresi HİÇBİR hata
// mesajına/log'a yazılmaz; Gmail hata detayı e-posta adreslerinden arındırılıp
// kırpılır.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { GmailTransportError, type GmailTransport } from './sendMachine'
import { getAccessToken } from '@/lib/gmail/tokenVault'

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

/** Tek HTTP çağrısı üst sınırı — Vercel fonksiyon bütçesinin güvenli altında. */
export const GMAIL_HTTP_TIMEOUT_MS = 15_000

/** Arama pagination üst sınırı: rfc822msgid tekil mesajı hedefler; 5 sayfa ×
 *  100 sonuç zaten anomali — aşılırsa arama SONUÇSUZ sayılır (throw). */
export const GMAIL_SEARCH_MAX_PAGES = 5

export interface GmailRestDeps {
  fetchImpl?: typeof fetch
  /** Test dikişi — varsayılan gerçek Vault→refresh→access akışı. */
  getAccessTokenImpl?: () => Promise<{ ok: true; accessToken: string } | { ok: false; error: string }>
  timeoutMs?: number
}

/** E-posta adreslerini hata metninden söker (PII sızmasın) ve kırpar. */
export function sanitizeProviderDetail(text: string, maxLen = 160): string {
  const scrubbed = text.replace(/[^\s"<>@]+@[^\s"<>@]+/g, '<redacted-email>')
  return scrubbed.length > maxLen ? `${scrubbed.slice(0, maxLen)}…` : scrubbed
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  ambiguousOnNetworkFail: boolean,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    // err.message URL/gövde içerebilir — yalnız hata SINIFI raporlanır.
    throw new GmailTransportError(
      isAbort ? `gmail http timeout (${timeoutMs}ms)` : `gmail http ağ hatası (${err instanceof Error ? err.name : 'network'})`,
      ambiguousOnNetworkFail,
    )
  } finally {
    clearTimeout(timer)
  }
}

/** Gmail hata gövdesinden güvenli, kısa teşhis üretir (token/PII'siz). */
async function safeErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { status?: string; message?: string } } | null
    const status = body?.error?.status ?? ''
    const message = body?.error?.message ?? ''
    return sanitizeProviderDetail([status, message].filter(Boolean).join(' — ') || 'detay yok')
  } catch {
    return 'detay ayrıştırılamadı'
  }
}

interface GmailListResponse {
  messages?: Array<{ id?: string; threadId?: string }>
  nextPageToken?: string
}

/**
 * Gerçek Gmail REST transport'u. Access token her çağrıda taze alınır
 * (refresh→access, Vault üzerinden); token değeri closure dışına sızmaz.
 * `account` imzada kalır (çağıran aktif hesabı zaten çözmüştür) ama token
 * akışı hesabı Vault katmanından bağımsız doğrular.
 */
export function createGmailRestTransport(
  _account: { email_address: string },
  deps: GmailRestDeps = {},
): GmailTransport {
  const fetchImpl = deps.fetchImpl ?? fetch
  const getToken = deps.getAccessTokenImpl ?? getAccessToken
  const timeoutMs = deps.timeoutMs ?? GMAIL_HTTP_TIMEOUT_MS

  async function requireAccessToken(context: 'send' | 'search'): Promise<string> {
    const token = await getToken()
    if (!token.ok) {
      // Provider'a hiç çıkılmadı → kesin hata; güvenle yeniden denenebilir.
      throw new GmailTransportError(`gmail ${context}: access token alınamadı — ${token.error}`, false)
    }
    return token.accessToken
  }

  return {
    async send({ raw }) {
      const accessToken = await requireAccessToken('send')
      const res = await fetchWithTimeout(
        fetchImpl,
        `${GMAIL_API_BASE}/messages/send`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw }),
        },
        timeoutMs,
        /* gönderim isteği yola çıktı → ağ/timeout belirsizdir */ true,
      )
      if (!res.ok) {
        const detail = await safeErrorDetail(res)
        // 4xx: provider kesin reddetti (gönderilmedi). 5xx: gitmiş olabilir.
        throw new GmailTransportError(`gmail send ${res.status}: ${detail}`, res.status >= 500)
      }
      const body = (await res.json().catch(() => null)) as { id?: string; threadId?: string } | null
      if (!body?.id || !body?.threadId) {
        // 2xx döndü ama kimlikler okunamadı — gönderim GERÇEKLEŞMİŞ olabilir.
        throw new GmailTransportError('gmail send: 2xx ama yanıt gövdesi ayrıştırılamadı (id/threadId yok) — sonuç belirsiz', true)
      }
      return { id: body.id, threadId: body.threadId }
    },

    async findByRfcMessageId(rfcMessageId) {
      const accessToken = await requireAccessToken('search')
      const auth = { Authorization: `Bearer ${accessToken}` }
      const q = encodeURIComponent(`rfc822msgid:${rfcMessageId}`)
      const found: Array<{ id: string; threadId: string }> = []
      let pageToken: string | undefined
      let pages = 0
      do {
        if (pages >= GMAIL_SEARCH_MAX_PAGES) {
          // Yarım arama not-found kararına dönüşemez → throw (reconcile 'error').
          throw new GmailTransportError(
            `gmail search: ${GMAIL_SEARCH_MAX_PAGES} sayfada tamamlanamadı — sonuç belirsiz, not-found sayılamaz`,
            true,
          )
        }
        pages += 1
        const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
        const res = await fetchWithTimeout(
          fetchImpl,
          `${GMAIL_API_BASE}/messages?q=${q}&maxResults=100${pageParam}`,
          { headers: auth },
          timeoutMs,
          true,
        )
        if (!res.ok) {
          const detail = await safeErrorDetail(res)
          // Provider hatası ≠ not-found — reconcile makinesi 'error' üretir.
          throw new GmailTransportError(`gmail search ${res.status}: ${detail}`, true)
        }
        const body = (await res.json().catch(() => null)) as GmailListResponse | null
        if (!body) {
          throw new GmailTransportError('gmail search: yanıt gövdesi ayrıştırılamadı — sonuç belirsiz', true)
        }
        for (const m of body.messages ?? []) {
          if (m.id && m.threadId) found.push({ id: m.id, threadId: m.threadId })
        }
        pageToken = body.nextPageToken
      } while (pageToken)

      if (found.length === 0) return null
      // Deterministik seçim: id'ye göre sıralı ilk sonuç (aynı rfc id'ye
      // birden çok kopya düşerse — ör. kendine CC — her koşuda aynı karar).
      found.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      return found[0]
    },
  }
}
