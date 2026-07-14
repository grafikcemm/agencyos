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

export interface InboundBatch {
  messages: InboundMessage[]
  /** İşlem güvenli tamamlanınca ilerletilecek history cursor (null → ilerleme
   *  yok; ör. full-sync fallback ya da fake transport). */
  nextHistoryId: string | null
}

export interface InboundTransport {
  kind: 'gmail' | 'fake'
  /** Son ingest'ten beri gelen inbound adayları + yeni cursor. */
  listInbound(): Promise<InboundBatch>
  /** Cursor'ı kalıcılaştır (yalnız tüm batch güvenli işlenince çağrılır). */
  advanceCursor?(nextHistoryId: string): Promise<void>
}

export interface IngestCounters {
  scanned: number
  ingested: number
  deduped: number
  unmatched: number
  /** Gönderen ↔ alıcı uyuşmazlığı: lead'e DOKUNULMAZ, karantinaya alınır. */
  senderMismatch: number
  quarantined: number
  optOuts: number
  responded: number
  autoReplies: number
  failed: number
  cursorAdvanced: boolean
  classes: Partial<Record<ReplyClass, number>>
}

/** E-posta adresini karşılaştırma için normalize eder (köşeli parantez/boşluk/
 *  büyük-küçük harf). */
export function normalizeEmail(addr: string | null): string {
  if (!addr) return ''
  const angle = addr.match(/<([^>]+)>/)?.[1] ?? addr
  return angle.trim().toLowerCase()
}

/** RFC id'lerinden outreach mesajını çöz: In-Reply-To + References taranır. */
function extractRfcIds(msg: InboundMessage): string[] {
  const raw = `${msg.inReplyTo ?? ''} ${msg.references ?? ''}`
  return [...raw.matchAll(/<[^>]+>/g)].map((m) => m[0])
}

async function resolveAttribution(msg: InboundMessage): Promise<
  | { matched: true; outreachMessageId: string; leadId: string | null; recipientEmail: string | null; threadRowId: string | null }
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

  // Göndereni lead.email ile değil, GERÇEKTEN gönderilen outbound kaydının
  // alıcı snapshot'ıyla doğrula. Canonical recipient primary contact olabilir
  // ve lead.email null/farklı kalabilir. Contact sonradan değişse bile bu
  // tarihsel snapshot değişmez.
  const { data: outbound, error: outboundErr } = await supabaseAdmin
    .from('email_messages')
    .select('to_address')
    .eq('outreach_message_id', attempt.outreach_message_id)
    .eq('direction', 'outbound')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (outboundErr) throw new Error(`gönderilen alıcı snapshot'ı okunamadı: ${outboundErr.message}`)
  const recipientEmail = (outbound?.to_address as string) ?? null

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
    recipientEmail,
    threadRowId,
  }
}

/** Karantina: attribution edilemeyen VEYA gönderen-alıcı uyuşmayan mesaj —
 *  görünür audit + tekrar-tarama engeli (full-sync fallback'te yeniden
 *  işlenmez). Upsert: aynı mesaj yeniden görülürse seen_count artar. */
async function quarantine(
  msg: InboundMessage,
  reason: 'unmatched' | 'sender_mismatch',
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('gmail_quarantine_inbound', {
    p_gmail_message_id: msg.gmailMessageId,
    p_reason: reason,
    p_from_address: msg.fromAddress,
    p_subject: msg.subject,
    p_rfc_refs: `${msg.inReplyTo ?? ''} ${msg.references ?? ''}`.trim() || null,
  })
  if (error) throw new Error(`karantina yazılamadı: ${error.message}`)
}

/** Bu gmail mesajı daha önce işlendi mi (email_messages) YA DA karantinada mı?
 *  Full-sync fallback'te yeniden-işlemeyi engeller. */
async function alreadySeen(gmailMessageId: string): Promise<boolean> {
  const { data: existing, error: exErr } = await supabaseAdmin
    .from('email_messages')
    .select('id')
    .eq('gmail_message_id', gmailMessageId)
    .maybeSingle()
  if (exErr) throw new Error(`dedupe sorgusu başarısız: ${exErr.message}`)
  if (existing) return true
  const { data: quar, error: qErr } = await supabaseAdmin
    .from('gmail_inbound_quarantine')
    .select('gmail_message_id')
    .eq('gmail_message_id', gmailMessageId)
    .maybeSingle()
  if (qErr) throw new Error(`karantina sorgusu başarısız: ${qErr.message}`)
  return Boolean(quar)
}

// leadId + fromAddress GARANTİ non-null (senderOk kapısı: eşleşen alıcı e-postası
// hem leadId hem gönderen adresinin varlığını zorunlu kılar).
async function applyOptOut(leadId: string, fromAddress: string): Promise<void> {
  const { error: supErr } = await supabaseAdmin.from('suppression_list').insert({
    address: fromAddress.toLowerCase(),
    scope: 'email',
    reason: 'inbound opt-out (İYS/KVKK — "ret")',
    source: 'gmail_ingest',
  })
  // duplicate suppression zararsız (23505) — diğer hatalar fail-closed.
  if (supErr && supErr.code !== '23505') {
    throw new Error(`suppression yazılamadı: ${supErr.message}`)
  }
  const { error: leadErr } = await supabaseAdmin
    .from('leads')
    .update({ do_not_contact: true, updated_at: new Date().toISOString() })
    .eq('id', leadId)
  if (leadErr) throw new Error(`do_not_contact yazılamadı: ${leadErr.message}`)
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
 *  transport'u parametre alır; testlerde fake, üretimde gerçek Gmail).
 *
 *  Cursor disiplini: transport bir sonraki history cursor'ını verir; cursor
 *  YALNIZ tüm batch güvenli (failed=0) işlendiğinde ilerletilir → hata anında
 *  aynı pencere sonraki turda yeniden taranır (dedupe/karantina tekrarı engeller). */
export async function ingestInboundReplies(transport: InboundTransport): Promise<IngestCounters> {
  const counters: IngestCounters = {
    scanned: 0,
    ingested: 0,
    deduped: 0,
    unmatched: 0,
    senderMismatch: 0,
    quarantined: 0,
    optOuts: 0,
    responded: 0,
    autoReplies: 0,
    failed: 0,
    cursorAdvanced: false,
    classes: {},
  }

  const batch = await transport.listInbound()
  for (const msg of batch.messages) {
    counters.scanned += 1
    try {
      // Dedupe: işlenmiş (email_messages) YA DA karantinadaki mesaj atlanır.
      if (await alreadySeen(msg.gmailMessageId)) {
        counters.deduped += 1
        continue
      }

      const attribution = await resolveAttribution(msg)
      if (!attribution.matched) {
        // Sessizce bir lead'e YAPIŞTIRILMAZ — görünür karantina + audit.
        await quarantine(msg, 'unmatched')
        counters.unmatched += 1
        counters.quarantined += 1
        continue
      }

      // GÖNDEREN DOĞRULAMASI: inbound 'From', gönderdiğimiz alıcıyla eşleşmeli.
      // Alakasız/forward edilmiş bir mesaj bilinen In-Reply-To taşısa bile
      // lead'i responded/suppressed YAPAMAZ (audit bulgu #7). leadId/recipientEmail/
      // fromAddress ÜÇÜ de non-null olmalı (lead'siz outreach → uyuşmazlık).
      const senderOk =
        attribution.leadId != null &&
        attribution.recipientEmail != null &&
        msg.fromAddress != null &&
        normalizeEmail(msg.fromAddress) === normalizeEmail(attribution.recipientEmail)
      if (!senderOk) {
        await quarantine(msg, 'sender_mismatch')
        counters.senderMismatch += 1
        counters.quarantined += 1
        console.warn('[gmail-ingest] gönderen alıcıyla uyuşmuyor — karantina:', msg.gmailMessageId)
        continue
      }
      const leadId = attribution.leadId as string
      const fromAddress = msg.fromAddress as string

      const cls = classifyReply(msg.bodyText)
      counters.classes[cls] = (counters.classes[cls] ?? 0) + 1
      const effects = replyEffects(cls)

      // Yan etkiler ÖNCE (fail-closed): suppression/lead yazılamadıysa mesaj
      // kaydedilmez → sonraki tur aynı mesajı yeniden dener (dedupe henüz yok).
      if (effects.suppress) {
        await applyOptOut(leadId, fromAddress)
        counters.optOuts += 1
      }
      if (effects.markResponded) {
        await markResponded(leadId)
        counters.responded += 1
      }
      if (effects.cancelFollowups) {
        await stopSequencesForLead(leadId)
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

  // Cursor YALNIZ tüm batch hatasız işlendiyse ilerler. Bir mesaj bile
  // failed ise cursor SABİT kalır → sonraki tur pencereyi yeniden tarar.
  if (batch.nextHistoryId && counters.failed === 0 && transport.advanceCursor) {
    await transport.advanceCursor(batch.nextHistoryId)
    counters.cursorAdvanced = true
  }
  return counters
}
