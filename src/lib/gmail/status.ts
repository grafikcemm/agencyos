// ─────────────────────────────────────────────────────────────────────────────
// Gmail bağlantı durumu (FINAL PILOT BLOCKERS Faz 2) — Settings UI + health
// kartı için tek kaynak. SADECE boolean/adres/scope döner; HİÇBİR secret,
// token veya vault_secret_id dışa verilmez.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { REQUIRED_GMAIL_SCOPES } from '@/lib/outreach/gmailScopes'
import { isGmailSendEnabled } from '@/lib/outreach/flags'
import { getTechnicalCanaryState, type CanaryLedgerState } from '@/lib/gmail/technicalCanary'

export interface GmailStatus {
  /** Aktif, vault referanslı hesap var mı. */
  connected: boolean
  /** Doğrulanmış hesap e-postası (getProfile ile alınmıştı) — yoksa null. */
  verifiedEmail: string | null
  /** gmail_accounts.scopes — envanterdeki temiz küme. */
  grantedScopes: string[]
  /** Zorunlu iki scope da mevcut mu (send + readonly). */
  requiredScopesOk: boolean
  /** OAuth env (client id/secret/redirect) yapılandırıldı mı → GERÇEK transport
   *  yapısal olarak hazır mı. */
  oauthConfigured: boolean
  /** GERÇEK gönderim transport'u kullanılabilir mi (bağlı + scope + oauth env). */
  realSendTransportReady: boolean
  /** GMAIL_SEND_ENABLED bayrağı (pilot açılışında AÇIK olur). */
  sendEnabled: boolean
  /** GMAIL_INGEST_ENABLED bayrağı. */
  ingestEnabled: boolean
  /** last_history_id set edilmiş mi (ilk sync sonrası dolar). */
  hasHistoryCursor: boolean
  /** Tek seferlik gerçek provider canary durumu; secret/PII içermez. */
  technicalCanaryState: CanaryLedgerState | null
}

/** OAuth env üçlüsü tam mı — GERÇEK Google çağrıları yapısal koşulu. */
export function isOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim() &&
      process.env.GMAIL_OAUTH_REDIRECT_URI?.trim(),
  )
}

function isIngestEnabled(): boolean {
  return process.env.GMAIL_INGEST_ENABLED === 'true'
}

export async function getGmailStatus(): Promise<GmailStatus> {
  const [{ data }, technicalCanaryState] = await Promise.all([
    supabaseAdmin
      .from('gmail_accounts')
      .select('email_address, scopes, active, vault_secret_id, last_history_id')
      .eq('active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    getTechnicalCanaryState().catch(() => null),
  ])

  const account = (data as {
    email_address?: string
    scopes?: string[]
    vault_secret_id?: string | null
    last_history_id?: string | null
  } | null) ?? null

  const connected = Boolean(account?.vault_secret_id)
  const grantedScopes = account?.scopes ?? []
  const requiredScopesOk = REQUIRED_GMAIL_SCOPES.every((s) => grantedScopes.includes(s))
  const oauthConfigured = isOAuthConfigured()

  return {
    connected,
    verifiedEmail: account?.email_address ?? null,
    grantedScopes,
    requiredScopesOk,
    oauthConfigured,
    realSendTransportReady: connected && requiredScopesOk && oauthConfigured,
    sendEnabled: isGmailSendEnabled(),
    ingestEnabled: isIngestEnabled(),
    hasHistoryCursor: Boolean(account?.last_history_id),
    technicalCanaryState,
  }
}
