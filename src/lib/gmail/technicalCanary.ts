import 'server-only'
import { getActiveGmailAccount } from '@/lib/gmail/tokenVault'
import { createGmailRestTransport } from '@/lib/outreach/gmailRestTransport'
import { buildRawMessage } from '@/lib/outreach/gmail'
import { supabaseAdmin } from '@/lib/supabase'

export const TECHNICAL_CANARY_MESSAGE_ID = '<agencyos-technical-canary-20260715@grafikcem.com>'
export const TECHNICAL_CANARY_LEDGER_KEY = 'gmail_technical_canary_20260715'
export const TECHNICAL_CANARY_SUBJECT = '[AgencyOS] Teknik Gmail canary — yanıt testi'
export const TECHNICAL_CANARY_REPLY_SUBJECT = `Re: ${TECHNICAL_CANARY_SUBJECT}`

export type CanaryLedgerState = 'claimed' | 'unknown' | 'sent' | 'replied'

export interface TechnicalCanaryLedger {
  read(): Promise<CanaryLedgerState | null>
  /** false = eşzamanlı başka çağrı claim'i kazandı. */
  claim(): Promise<boolean>
  write(state: CanaryLedgerState): Promise<void>
}

export interface TechnicalCanaryReplyStore {
  findCandidate(opts: { rfcMessageId: string; replySubject: string }): Promise<{ fromAddress: string | null } | null>
}

const supabaseLedger: TechnicalCanaryLedger = {
  async read() {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', TECHNICAL_CANARY_LEDGER_KEY)
      .maybeSingle()
    if (error) throw new Error(`canary ledger okunamadı: ${error.message}`)
    if (!data?.value) return null
    try {
      const status = (JSON.parse(data.value) as { status?: string }).status
      return status === 'replied' || status === 'sent' || status === 'claimed' || status === 'unknown'
        ? status
        : 'unknown'
    } catch {
      return 'unknown'
    }
  },
  async claim() {
    const { error } = await supabaseAdmin.from('settings').insert({
      key: TECHNICAL_CANARY_LEDGER_KEY,
      value: JSON.stringify({ status: 'claimed' }),
      updated_at: new Date().toISOString(),
    })
    if (!error) return true
    if (error.code === '23505') return false
    throw new Error(`canary claim alınamadı: ${error.message}`)
  },
  async write(state) {
    const { error } = await supabaseAdmin
      .from('settings')
      .update({ value: JSON.stringify({ status: state }), updated_at: new Date().toISOString() })
      .eq('key', TECHNICAL_CANARY_LEDGER_KEY)
    if (error) throw new Error(`canary ledger yazılamadı: ${error.message}`)
  },
}

const supabaseReplyStore: TechnicalCanaryReplyStore = {
  async findCandidate({ replySubject }) {
    // Gmail, raw mesajdaki özel Message-ID'yi provider ID'siyle değiştirebilir;
    // gerçek reply'nin In-Reply-To alanı bu durumda provider ID'sini taşır. Tam
    // sabit konu, aşağıdaki beklenen tek gönderen doğrulamasıyla birlikte aranır.
    const { data, error } = await supabaseAdmin
      .from('gmail_inbound_quarantine')
      .select('from_address')
      .eq('reason', 'unmatched')
      .eq('subject', replySubject)
      .order('first_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`canary reply karantinası okunamadı: ${error.message}`)
    return data ? { fromAddress: (data.from_address as string | null) ?? null } : null
  },
}

export interface TechnicalCanaryResult {
  ok: true
  sent: boolean
  deduplicated: boolean
  transport: 'gmail'
  replied: boolean
}

export async function getTechnicalCanaryState(
  ledger: TechnicalCanaryLedger = supabaseLedger,
): Promise<CanaryLedgerState | null> {
  return ledger.read()
}

/**
 * Teknik mesajın gerçek Gmail reply'si normal müşteri/FSM attribution'ına
 * zorlanmaz. Ingest'in fail-closed karantina audit'i, sabit RFC id ve beklenen
 * operatör test adresi birlikte doğrulanır; hiçbir lead durumu değişmez.
 */
export async function reconcileTechnicalGmailCanaryReply(
  expectedRecipient: string,
  ledger: TechnicalCanaryLedger = supabaseLedger,
  replyStore: TechnicalCanaryReplyStore = supabaseReplyStore,
): Promise<{ replied: boolean }> {
  const normalizedRecipient = expectedRecipient.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedRecipient)) {
    throw new Error('GMAIL_CANARY_RECIPIENT geçerli bir operatör test adresi olmalı')
  }
  const reply = await replyStore.findCandidate({
    rfcMessageId: TECHNICAL_CANARY_MESSAGE_ID,
    replySubject: TECHNICAL_CANARY_REPLY_SUBJECT,
  })
  if (!reply) return { replied: false }
  const from = String(reply.fromAddress ?? '').match(/<([^>]+)>/)?.[1] ?? String(reply.fromAddress ?? '')
  if (from.trim().toLowerCase() !== normalizedRecipient) {
    throw new Error('Teknik canary reply göndereni beklenen test adresiyle uyuşmuyor')
  }
  await ledger.write('replied')
  return { replied: true }
}

/**
 * Ticari olmayan, tek alıcılı transport doğrulaması. Müşteri gönderim
 * makinesini ve uyum/HITL kapılarını değiştirmez; sabit Message-ID araması
 * sayesinde aynı doğrulama ikinci kez gönderilemez.
 */
export async function runTechnicalGmailCanary(
  recipient: string,
  ledger: TechnicalCanaryLedger = supabaseLedger,
): Promise<TechnicalCanaryResult> {
  const normalizedRecipient = recipient.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedRecipient)) {
    throw new Error('GMAIL_CANARY_RECIPIENT geçerli bir operatör test adresi olmalı')
  }

  const initialState = await ledger.read()
  if (initialState === 'sent' || initialState === 'replied') {
    return { ok: true, sent: false, deduplicated: true, transport: 'gmail', replied: initialState === 'replied' }
  }

  const account = await getActiveGmailAccount()
  if (!account) throw new Error('Aktif Gmail hesabı bulunamadı')

  const transport = createGmailRestTransport(account)
  const resolveClaimedOrUnknown = async (): Promise<TechnicalCanaryResult> => {
    const existing = await transport.findByRfcMessageId(TECHNICAL_CANARY_MESSAGE_ID)
    if (existing) {
      await ledger.write('sent')
      return { ok: true, sent: false, deduplicated: true, transport: 'gmail', replied: false }
    }
    throw new Error('Teknik canary sonucu belirsiz; otomatik yeniden gönderim engellendi')
  }

  if (initialState === 'claimed' || initialState === 'unknown') {
    return resolveClaimedOrUnknown()
  }

  const claimWon = await ledger.claim()
  if (!claimWon) {
    const racedState = await ledger.read()
    if (racedState === 'sent') {
      return { ok: true, sent: false, deduplicated: true, transport: 'gmail', replied: false }
    }
    return resolveClaimedOrUnknown()
  }

  const raw = buildRawMessage({
    from: account.email_address,
    to: normalizedRecipient,
    subject: TECHNICAL_CANARY_SUBJECT,
    body: [
      'Merhaba,',
      '',
      'Bu ileti ticari bir teklif değildir. AgencyOS Gmail OAuth, Vault ve gerçek gönderim hattının tek seferlik teknik doğrulamasıdır.',
      'Reply ingest testini tamamlamak için bu mesaja yalnızca “CANARY OK” yazarak yanıt verebilirsiniz.',
      '',
      'AgencyOS teknik doğrulama',
    ].join('\n'),
    messageId: TECHNICAL_CANARY_MESSAGE_ID,
  })

  try {
    await transport.send({ raw, fromAddress: account.email_address })
  } catch (error) {
    await ledger.write('unknown').catch(() => undefined)
    throw error
  }
  await ledger.write('sent')
  return { ok: true, sent: true, deduplicated: false, transport: 'gmail', replied: false }
}
