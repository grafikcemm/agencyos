// ─────────────────────────────────────────────────────────────────────────────
// GERÇEK Gmail inbound transport (FINAL PILOT BLOCKERS Faz 3) — provider sınırı.
//
// Üretim ANA yolu: users.history.list (startHistoryId cursor + pagination).
// Cursor yoksa (ilk sync) VEYA 404 (startHistoryId çok eski → expired) →
// KONTROLLÜ full-sync fallback (messages.list, in:inbox, pagination) ve yeni
// cursor profil historyId'sinden alınır. Sayfa limitleri var ama pagination
// TAM (kesinti 3 günü aşsa da mesaj kaçmaz). İÇ İÇE multipart MIME çözülür.
//
// Access token tokenVault'tan; çağrı YALNIZ kullanıcı OAuth'u tamamlamış +
// GMAIL_INGEST_ENABLED=true ise route'tan tetiklenir. fetchImpl testlerde
// enjekte edilir (gerçek ağ çağrısı SIFIR).
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import type { InboundMessage, InboundBatch, InboundTransport } from './replyIngest'

const GMAIL_INBOUND_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
/** history/messages list pagination üst sınırı — kaçağı önler ama runaway'i
 *  de sınırlar (her sayfa 100 kayıt). */
export const GMAIL_INGEST_MAX_PAGES = 20
/** Full-sync fallback'te taranacak azami mesaj (ilk kurulum/expired cursor). */
export const GMAIL_FULLSYNC_MAX_MESSAGES = 200

interface GmailMessageRef {
  id: string
}
interface GmailListResponse {
  messages?: GmailMessageRef[]
  nextPageToken?: string
}
interface GmailHistoryResponse {
  history?: Array<{ messagesAdded?: Array<{ message?: { id?: string; labelIds?: string[] } }> }>
  nextPageToken?: string
  historyId?: string
}
interface GmailProfileResponse {
  historyId?: string
}
export interface GmailPart {
  mimeType?: string
  body?: { data?: string }
  parts?: GmailPart[]
}
interface GmailMessageResponse {
  id: string
  threadId?: string
  internalDate?: string
  snippet?: string
  labelIds?: string[]
  payload?: {
    headers?: Array<{ name: string; value: string }>
  } & GmailPart
}

function header(msg: GmailMessageResponse, name: string): string | null {
  const h = msg.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())
  return h?.value ?? null
}

/** İÇ İÇE multipart MIME ağacında ilk text/plain gövdesini bulur (derinlik-öncelikli).
 *  multipart/alternative → multipart/mixed → … tüm seviyeler taranır. */
export function extractTextPlain(part: GmailPart | undefined): string | null {
  if (!part) return null
  if (part.mimeType === 'text/plain' && part.body?.data) return part.body.data
  for (const child of part.parts ?? []) {
    const found = extractTextPlain(child)
    if (found) return found
  }
  return null
}

function decodeBody(msg: GmailMessageResponse): string {
  const encoded = extractTextPlain(msg.payload) ?? msg.payload?.body?.data
  if (!encoded) return msg.snippet ?? ''
  try {
    return Buffer.from(encoded, 'base64url').toString('utf8')
  } catch {
    return msg.snippet ?? ''
  }
}

export interface GmailInboundAccount {
  id: string
  lastHistoryId: string | null
}

export interface GmailInboundLimits {
  /** Test dikişi — pagination/mesaj üst sınırlarını düşürerek cap dallarını
   *  ölçülebilir kılar; üretimde varsayılan sabitler kullanılır. */
  maxPages?: number
  maxMessages?: number
}

export function createGmailInboundTransport(
  account: GmailInboundAccount,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
  limits: GmailInboundLimits = {},
): InboundTransport {
  const auth = { Authorization: `Bearer ${accessToken}` }
  const maxPages = limits.maxPages ?? GMAIL_INGEST_MAX_PAGES
  const maxMessages = limits.maxMessages ?? GMAIL_FULLSYNC_MAX_MESSAGES

  async function getJson<T>(url: string): Promise<{ ok: true; body: T } | { ok: false; status: number }> {
    const res = await fetchImpl(url, { headers: auth })
    if (!res.ok) return { ok: false, status: res.status }
    return { ok: true, body: (await res.json()) as T }
  }

  async function fetchMessage(id: string): Promise<InboundMessage> {
    const r = await getJson<GmailMessageResponse>(`${GMAIL_INBOUND_BASE}/messages/${id}?format=full`)
    if (!r.ok) throw new Error(`gmail get ${r.status}`)
    const full = r.body
    return {
      gmailMessageId: full.id,
      threadId: full.threadId ?? null,
      fromAddress: header(full, 'From'),
      subject: header(full, 'Subject'),
      bodyText: decodeBody(full),
      inReplyTo: header(full, 'In-Reply-To'),
      references: header(full, 'References'),
      internalDateMs: full.internalDate ? Number(full.internalDate) : null,
    }
  }

  /** Full-sync fallback: in:inbox mesaj id'lerini TAM pagination ile topla,
   *  yeni cursor'ı profil historyId'sinden al. */
  async function fullSync(): Promise<InboundBatch> {
    const ids = new Set<string>()
    let pageToken: string | undefined
    let pages = 0
    do {
      if (pages >= maxPages) break
      pages += 1
      const q = encodeURIComponent('in:inbox')
      const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
      const r = await getJson<GmailListResponse>(`${GMAIL_INBOUND_BASE}/messages?q=${q}&maxResults=100${pageParam}`)
      if (!r.ok) throw new Error(`gmail full-sync list ${r.status}`)
      for (const m of r.body.messages ?? []) {
        if (m.id) ids.add(m.id)
        if (ids.size >= maxMessages) break
      }
      pageToken = ids.size >= maxMessages ? undefined : r.body.nextPageToken
    } while (pageToken)

    const messages: InboundMessage[] = []
    for (const id of ids) messages.push(await fetchMessage(id))

    // Yeni cursor: mevcut profil historyId (bundan sonrası history ile izlenir).
    const prof = await getJson<GmailProfileResponse>(`${GMAIL_INBOUND_BASE}/profile`)
    const nextHistoryId = prof.ok ? prof.body.historyId ?? null : null
    return { messages, nextHistoryId }
  }

  /** Incremental: history.list(startHistoryId) + pagination. 404 → full-sync. */
  async function incrementalSync(startHistoryId: string): Promise<InboundBatch> {
    const ids = new Set<string>()
    let pageToken: string | undefined
    let pages = 0
    let latestHistoryId: string | null = startHistoryId
    do {
      if (pages >= maxPages) break
      pages += 1
      const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
      const url =
        `${GMAIL_INBOUND_BASE}/history?startHistoryId=${encodeURIComponent(startHistoryId)}` +
        `&historyTypes=messageAdded&maxResults=100${pageParam}`
      const r = await getJson<GmailHistoryResponse>(url)
      if (!r.ok) {
        // 404: startHistoryId çok eski (expired) → KONTROLLÜ full-sync recovery.
        if (r.status === 404) {
          console.warn('[gmail-ingest] history cursor expired (404) → full-sync recovery')
          return fullSync()
        }
        throw new Error(`gmail history ${r.status}`)
      }
      for (const h of r.body.history ?? []) {
        for (const added of h.messagesAdded ?? []) {
          const m = added.message
          // Yalnız INBOX etiketli eklenenler (gönderilenler/taslaklar hariç).
          if (m?.id && (m.labelIds?.includes('INBOX') ?? true)) ids.add(m.id)
        }
      }
      if (r.body.historyId) latestHistoryId = r.body.historyId
      pageToken = r.body.nextPageToken
    } while (pageToken)

    const messages: InboundMessage[] = []
    for (const id of ids) messages.push(await fetchMessage(id))
    return { messages, nextHistoryId: latestHistoryId }
  }

  return {
    kind: 'gmail',
    async listInbound() {
      return account.lastHistoryId ? incrementalSync(account.lastHistoryId) : fullSync()
    },
    async advanceCursor(nextHistoryId: string) {
      const { error } = await supabaseAdmin
        .from('gmail_accounts')
        .update({ last_history_id: nextHistoryId, updated_at: new Date().toISOString() })
        .eq('id', account.id)
      if (error) throw new Error(`history cursor yazılamadı: ${error.message}`)
    },
  }
}
