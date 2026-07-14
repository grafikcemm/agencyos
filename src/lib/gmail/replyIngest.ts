// ─────────────────────────────────────────────────────────────────────────────
// Inbound cevap INGEST'i (FINALIZATION Faz 7) — provider sınırına kadar GERÇEK.
//
// Transport arayüzü: gerçek Gmail REST (users.messages.list/get, access token
// tokenVault'tan) VEYA fake (E2E/cron testleri — dış çağrı sıfır). Akış:
//   mesaj → dedupe (gmail_message_id) → thread attribution
//   (In-Reply-To/References ↔ outreach_send_attempts.rfc_message_id) →
//   email_messages(inbound) INSERT → FSM sınıfı → yan etkiler:
//   opt_out: suppression_list + do_not_contact + follow-up iptal (İYS/KVKK)
//   insan cevabı: lead 'responded' + follow-up iptal (otomatik takip DURUR)
//   auto_reply: mutasyon YOK.
//
// Hata disiplini: satır-bazlı hata GÖRÜNÜR sayaçta; attribution edilemeyen
// mesaj 'unmatched' (sessizce lead'e yapıştırılmaz). Suppression yazımı
// başarısızsa lead mutasyonu YAPILMAZ (fail-closed: opt-out kaydedilmeden
// 'responded' işaretlemek yeni gönderim riskini artırır).
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { stopSequencesForLead } from '@/lib/outreach/sequences'
import { classifyReply, replyEffects, type ReplyClass } from './replyFsm'

export interface InboundMessage {
  gmailMessageId: string
  threadId: string | null
  fromAddress: string | null
  subject: string | null
  bodyText: string
  inReplyTo: string | null
  references: string | null
  internalDateMs: number | null
}

export interface InboundTransport {
  kind: 'gmail' | 'fake'
  /** Son ingest'ten beri gelen inbound adayları (provider-sayfalı). */
  listInbound(): Promise<InboundMessage[]>
}

export interface IngestCounters {
  scanned: number
  ingested: number
  deduped: number
  unmatched: number
  optOuts: number
  responded: number
  autoReplies: number
  failed: number
  classes: Partial<Record<ReplyClass, number>>
}

/** RFC id'lerinden outreach mesajını çöz: In-Reply-To + References taranır. */
function extractRfcIds(msg: InboundMessage): string[] {
  const raw = `${msg.inReplyTo ?? ''} ${msg.references ?? ''}`
  return [...raw.matchAll(/<[^>]+>/g)].map((m) => m[0])
}

async function resolveAttribution(msg: InboundMessage): Promise<
  | { matched: true; outreachMessageId: string; leadId: string | null; threadRowId: string | null }
  | { matched: false }
> {
  const rfcIds = extractRfcIds(msg)
  if (rfcIds.length === 0) return { matched: false }
  const { data: attempt, error } = await supabaseAdmin
    .from('outreach_send_attempts')
    .select('outreach_message_id, rfc_message_id')
    .in('rfc_message_id', rfcIds)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`attribution sorgusu başarısız: ${error.message}`)
  if (!attempt) return { matched: false }

  const { data: om, error: omErr } = await supabaseAdmin
    .from('outreach_messages')
    .select('id, lead_id, gmail_thread_id')
    .eq('id', attempt.outreach_message_id)
    .maybeSingle()
  if (omErr) throw new Error(`outreach mesajı okunamadı: ${omErr.message}`)

  let threadRowId: string | null = null
  if (om?.gmail_thread_id) {
    const { data: thread, error: thErr } = await supabaseAdmin
      .from('email_threads')
      .select('id')
      .eq('gmail_thread_id', om.gmail_thread_id)
      .maybeSingle()
    if (thErr) throw new Error(`thread okunamadı: ${thErr.message}`)
    threadRowId = (thread?.id as string) ?? null
  }
  return {
    matched: true,
    outreachMessageId: attempt.outreach_message_id as string,
    leadId: (om?.lead_id as string) ?? null,
    threadRowId,
  }
}

async function applyOptOut(leadId: string | null, fromAddress: string | null): Promise<void> {
  if (fromAddress) {
    const { error } = await supabaseAdmin.from('suppression_list').insert({
      address: fromAddress.toLowerCase(),
      scope: 'email',
      reason: 'inbound opt-out (İYS/KVKK — "ret")',
      source: 'gmail_ingest',
    })
    // duplicate suppression zararsız (23505) — diğer hatalar fail-closed.
    if (error && error.code !== '23505') {
      throw new Error(`suppression yazılamadı: ${error.message}`)
    }
  }
  if (leadId) {
    const { error } = await supabaseAdmin
      .from('leads')
      .update({ do_not_contact: true, updated_at: new Date().toISOString() })
      .eq('id', leadId)
    if (error) throw new Error(`do_not_contact yazılamadı: ${error.message}`)
  }
}

async function markResponded(leadId: string): Promise<void> {
  // Yalnız aktif satış durumları 'responded'a çekilir (converted/lost bozulmaz).
  const { error } = await supabaseAdmin
    .from('leads')
    .update({ status: 'responded', updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .in('status', ['new', 'contacted'])
  if (error) throw new Error(`lead responded yazılamadı: ${error.message}`)
}

/** Tek ingest turu — cron çağırır. Shadow/enable kararı ROUTE'ta (bu fonksiyon
 *  transport'u parametre alır; testlerde fake, üretimde gerçek Gmail). */
export async function ingestInboundReplies(transport: InboundTransport): Promise<IngestCounters> {
  const counters: IngestCounters = {
    scanned: 0,
    ingested: 0,
    deduped: 0,
    unmatched: 0,
    optOuts: 0,
    responded: 0,
    autoReplies: 0,
    failed: 0,
    classes: {},
  }

  const messages = await transport.listInbound()
  for (const msg of messages) {
    counters.scanned += 1
    try {
      // Dedupe: aynı gmail mesajı iki kez işlenmez (retry/overlap güvenli).
      const { data: existing, error: exErr } = await supabaseAdmin
        .from('email_messages')
        .select('id')
        .eq('gmail_message_id', msg.gmailMessageId)
        .maybeSingle()
      if (exErr) throw new Error(`dedupe sorgusu başarısız: ${exErr.message}`)
      if (existing) {
        counters.deduped += 1
        continue
      }

      const attribution = await resolveAttribution(msg)
      if (!attribution.matched) {
        // Sessizce bir lead'e YAPIŞTIRILMAZ — görünür sayaç + log.
        counters.unmatched += 1
        console.warn('[gmail-ingest] attribution edilemedi (rfc id eşleşmedi):', msg.gmailMessageId)
        continue
      }

      const cls = classifyReply(msg.bodyText)
      counters.classes[cls] = (counters.classes[cls] ?? 0) + 1
      const effects = replyEffects(cls)

      // Yan etkiler ÖNCE (fail-closed): suppression/lead yazılamadıysa mesaj
      // kaydedilmez → sonraki tur aynı mesajı yeniden dener (dedupe henüz yok).
      if (effects.suppress) {
        await applyOptOut(attribution.leadId, msg.fromAddress)
        counters.optOuts += 1
      }
      if (effects.markResponded && attribution.leadId) {
        await markResponded(attribution.leadId)
        counters.responded += 1
      }
      if (effects.cancelFollowups && attribution.leadId) {
        await stopSequencesForLead(attribution.leadId)
      }
      if (cls === 'auto_reply') counters.autoReplies += 1

      const { error: insErr } = await supabaseAdmin.from('email_messages').insert({
        thread_id: attribution.threadRowId,
        outreach_message_id: attribution.outreachMessageId,
        gmail_message_id: msg.gmailMessageId,
        direction: 'inbound',
        from_address: msg.fromAddress,
        subject: msg.subject,
        in_reply_to: msg.inReplyTo,
        references_header: msg.references,
        body: msg.bodyText.slice(0, 20_000),
        sent_at: msg.internalDateMs ? new Date(msg.internalDateMs).toISOString() : null,
      })
      if (insErr) {
        if (insErr.code === '23505') {
          counters.deduped += 1 // yarış: paralel tur yazdı — güvenli.
          continue
        }
        throw new Error(`inbound mesaj yazılamadı: ${insErr.message}`)
      }
      counters.ingested += 1
    } catch (err) {
      counters.failed += 1
      console.error('[gmail-ingest] mesaj işlenemedi:', msg.gmailMessageId, err instanceof Error ? err.message : 'unknown')
    }
  }
  return counters
}

// ── Gerçek Gmail transport (provider sınırı) ─────────────────────────────────
// Access token tokenVault'tan; çağrı YALNIZ kullanıcı OAuth'u tamamlamış +
// GMAIL_INGEST_ENABLED=true ise route'tan tetiklenir. Test/CI'da kullanılmaz.

interface GmailListResponse {
  messages?: Array<{ id: string }>
}
interface GmailMessageResponse {
  id: string
  threadId?: string
  internalDate?: string
  snippet?: string
  payload?: {
    headers?: Array<{ name: string; value: string }>
    parts?: Array<{ mimeType?: string; body?: { data?: string } }>
    body?: { data?: string }
  }
}

function header(msg: GmailMessageResponse, name: string): string | null {
  const h = msg.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())
  return h?.value ?? null
}

function decodeBody(msg: GmailMessageResponse): string {
  const direct = msg.payload?.body?.data
  const part = msg.payload?.parts?.find((p) => p.mimeType === 'text/plain')?.body?.data
  const data = part ?? direct
  if (!data) return msg.snippet ?? ''
  try {
    return Buffer.from(data, 'base64url').toString('utf8')
  } catch {
    return msg.snippet ?? ''
  }
}

export function createGmailInboundTransport(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): InboundTransport {
  const base = 'https://gmail.googleapis.com/gmail/v1/users/me'
  const auth = { Authorization: `Bearer ${accessToken}` }
  return {
    kind: 'gmail',
    async listInbound() {
      // Güvenli polling: son 3 günün inbox cevapları (watch/history pilotta).
      const q = encodeURIComponent('in:inbox newer_than:3d')
      const listRes = await fetchImpl(`${base}/messages?q=${q}&maxResults=25`, { headers: auth })
      if (!listRes.ok) throw new Error(`gmail list ${listRes.status}`)
      const list = (await listRes.json()) as GmailListResponse
      const out: InboundMessage[] = []
      for (const m of list.messages ?? []) {
        const msgRes = await fetchImpl(`${base}/messages/${m.id}?format=full`, { headers: auth })
        if (!msgRes.ok) throw new Error(`gmail get ${msgRes.status}`)
        const full = (await msgRes.json()) as GmailMessageResponse
        out.push({
          gmailMessageId: full.id,
          threadId: full.threadId ?? null,
          fromAddress: (header(full, 'From') ?? '').match(/<([^>]+)>/)?.[1] ?? header(full, 'From'),
          subject: header(full, 'Subject'),
          bodyText: decodeBody(full),
          inReplyTo: header(full, 'In-Reply-To'),
          references: header(full, 'References'),
          internalDateMs: full.internalDate ? Number(full.internalDate) : null,
        })
      }
      return out
    },
  }
}
