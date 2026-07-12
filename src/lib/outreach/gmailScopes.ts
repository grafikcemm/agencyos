// Gmail scope politikası (Faz 4 — 21 T4 en-dar-scope, plan §3 ruling).
// DB katmanındaki pozitif allowlist'in (mig 055) kod aynası: OAuth callback
// token değişiminden ÖNCE burada da doğrulanır (defense-in-depth) — Google'ın
// döndürdüğü scope listesi allowlist dışına taşarsa akış FAIL-CLOSED durur.

export const ALLOWED_GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
] as const

/** Gmail yetkisi olmayan kimlik scope'ları — allowlist dışıdır ama Gmail
 *  yetki envanterine de GİRMEZ; consent akışında görünebilirler ve
 *  gmail_accounts.scopes'a yazılmadan önce ayıklanırlar. */
export const IDENTITY_SCOPES = ['openid', 'email', 'profile'] as const

export interface ScopeCheck {
  ok: boolean
  /** Allowlist dışı Gmail/diğer scope'lar (kimlik scope'ları hariç). */
  disallowed: string[]
  /** gmail_accounts.scopes'a yazılacak temiz küme. */
  gmailScopes: string[]
}

/** OAuth grant'ındaki scope listesini pozitif allowlist'e göre değerlendirir.
 *  Kimlik scope'ları tolere edilir (envantere girmez); onun dışındaki her
 *  bilinmeyen scope reddi gerektirir (ok:false → token DEĞİŞTİRİLMEZ). */
export function checkGrantedScopes(granted: string[]): ScopeCheck {
  const allowed = new Set<string>(ALLOWED_GMAIL_SCOPES)
  const identity = new Set<string>(IDENTITY_SCOPES)
  const gmailScopes: string[] = []
  const disallowed: string[] = []
  for (const scope of granted) {
    if (allowed.has(scope)) {
      if (!gmailScopes.includes(scope)) gmailScopes.push(scope)
    } else if (!identity.has(scope)) {
      disallowed.push(scope)
    }
  }
  return { ok: disallowed.length === 0, disallowed, gmailScopes }
}
