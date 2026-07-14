// Gmail scope politikası (Faz 4 — 21 T4 en-dar-scope, plan §3 ruling).
// DB katmanındaki pozitif allowlist'in (mig 055) kod aynası: OAuth callback
// token değişiminden ÖNCE burada da doğrulanır (defense-in-depth) — Google'ın
// döndürdüğü scope listesi allowlist dışına taşarsa akış FAIL-CLOSED durur.

export const ALLOWED_GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
] as const

/** İkisi de ZORUNLU: gönderim (send) VE reconciliation/inbound (readonly).
 *  Yalnız biriyle gelen grant EKSİK sayılır (fail-closed) — çünkü at-most-once
 *  garantisi readonly araması olmadan, inbound cevap algılama send olmadan
 *  çalışmaz. Boş küme de eksiktir. */
export const REQUIRED_GMAIL_SCOPES = [
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
  /** Zorunlu olup grant'ta EKSİK olan scope'lar (ikisi de gerekli). */
  missing: string[]
  /** gmail_accounts.scopes'a yazılacak temiz küme. */
  gmailScopes: string[]
}

/** OAuth grant'ındaki scope listesini POZİTİF allowlist + ZORUNLU-küme'ye göre
 *  değerlendirir. İki bağımsız fail-closed koşul:
 *   1. allowlist dışı bir scope varsa → reddet (izinsiz yetki alınmasın),
 *   2. gmail.send VEYA gmail.readonly eksikse → reddet (yarım yetki iş yapamaz).
 *  Kimlik scope'ları (openid/email/profile) tolere edilir, envantere girmez.
 *  ok yalnız her iki koşul da sağlanınca true olur (token DEĞİŞTİRİLMEZ). */
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
  const grantedSet = new Set(gmailScopes)
  const missing = REQUIRED_GMAIL_SCOPES.filter((s) => !grantedSet.has(s))
  return { ok: disallowed.length === 0 && missing.length === 0, disallowed, missing, gmailScopes }
}
