// ─────────────────────────────────────────────────────────────────────────────
// Gmail token VAULT katmanı (FINALIZATION Faz 7) — refresh token DÜZ METİN
// HİÇBİR TABLODA/LOGDA DURMAZ.
//
// Depo: Supabase Vault (mig 064 wrapper RPC'leri: gmail_vault_store/read/delete;
// at-rest şifreli). gmail_accounts yalnız vault_secret_id + scopes taşır.
// Access token KISA ömürlüdür ve yalnız bellek içinde tutulur (satıra yazılmaz).
//
// Rotation: aynı isimli secret yeni değerle güncellenir (store idempotent).
// Revoke: Google revoke endpoint'i (gerçek çağrı — YALNIZ kullanıcı aksiyonu
// yoluyla tetiklenir) + vault delete + hesap pasifleştirme.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { checkGrantedScopes } from '@/lib/outreach/gmailScopes'

const VAULT_SECRET_NAME = 'gmail_refresh_token_primary'

/** Hata metninden olası token değerlerini söker — asla sızmasın. */
function redactSecret(text: string, secret: string | null): string {
  if (!secret) return text
  return text.split(secret).join('<redacted>')
}

export interface GmailAccountRow {
  id: string
  email_address: string
  vault_secret_id: string | null
  scopes: string[]
  active: boolean
  last_history_id: string | null
}

export async function getActiveGmailAccount(): Promise<GmailAccountRow | null> {
  const { data, error } = await supabaseAdmin
    .from('gmail_accounts')
    .select('id, email_address, vault_secret_id, scopes, active, last_history_id')
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`gmail hesabı okunamadı: ${error.message}`)
  return (data as GmailAccountRow | null) ?? null
}

/**
 * OAuth callback'ten gelen refresh token'ı Vault'a yazar ve hesabı aktive eder.
 * Scope'lar pozitif allowlist'ten geçmeden ÇAĞRILMAMALIDIR (callback zorlar);
 * yine de burada da fail-closed doğrulanır (defense-in-depth).
 */
export async function storeGmailTokens(opts: {
  emailAddress: string
  refreshToken: string
  grantedScopes: string[]
}): Promise<{ ok: true; accountId: string } | { ok: false; error: string }> {
  const scopeCheck = checkGrantedScopes(opts.grantedScopes)
  if (!scopeCheck.ok) {
    return { ok: false, error: `allowlist dışı scope: ${scopeCheck.disallowed.join(', ')} — token saklanmadı` }
  }

  const { data: secretId, error: vaultErr } = await supabaseAdmin.rpc('gmail_vault_store', {
    p_name: VAULT_SECRET_NAME,
    p_secret: opts.refreshToken,
  })
  if (vaultErr || !secretId) {
    return {
      ok: false,
      error: redactSecret(`vault yazımı başarısız: ${vaultErr?.message ?? 'boş yanıt'}`, opts.refreshToken),
    }
  }

  // Tek hesap modeli: e-posta adresine upsert; diğer satırlar pasifleşir.
  const { data: existing, error: exErr } = await supabaseAdmin
    .from('gmail_accounts')
    .select('id')
    .eq('email_address', opts.emailAddress.toLowerCase())
    .maybeSingle()
  if (exErr) return { ok: false, error: `gmail hesabı okunamadı: ${exErr.message}` }

  const patch = {
    vault_secret_id: secretId as string,
    scopes: scopeCheck.gmailScopes,
    active: true,
    updated_at: new Date().toISOString(),
  }
  let accountId: string
  if (existing) {
    const { error } = await supabaseAdmin.from('gmail_accounts').update(patch).eq('id', existing.id)
    if (error) return { ok: false, error: `gmail hesabı güncellenemedi: ${error.message}` }
    accountId = existing.id as string
  } else {
    const { data: created, error } = await supabaseAdmin
      .from('gmail_accounts')
      .insert({ email_address: opts.emailAddress.toLowerCase(), ...patch })
      .select('id')
      .single()
    if (error || !created) return { ok: false, error: `gmail hesabı yazılamadı: ${error?.message ?? '?'}` }
    accountId = created.id as string
  }
  return { ok: true, accountId }
}

/** Vault'tan refresh token okur — YALNIZ transport katmanı çağırır; değer
 *  asla loglanmaz/response'a yazılmaz. */
export async function readRefreshToken(): Promise<
  { ok: true; refreshToken: string; account: GmailAccountRow } | { ok: false; error: string }
> {
  const account = await getActiveGmailAccount()
  if (!account) return { ok: false, error: 'aktif gmail hesabı yok — önce OAuth bağlantısı (kullanıcı aksiyonu)' }
  if (!account.vault_secret_id) return { ok: false, error: 'hesapta vault_secret_id yok — OAuth yeniden bağlanmalı' }
  const { data, error } = await supabaseAdmin.rpc('gmail_vault_read', { p_id: account.vault_secret_id })
  if (error) return { ok: false, error: `vault okunamadı: ${error.message}` }
  if (!data) return { ok: false, error: 'vault secret bulunamadı — OAuth yeniden bağlanmalı (revoke edilmiş olabilir)' }
  return { ok: true, refreshToken: data as string, account }
}

/**
 * Refresh token'dan KISA ömürlü access token üretir (Google token endpoint).
 * GERÇEK ağ çağrısı — yalnız kullanıcı OAuth'u tamamladıysa anlamlıdır;
 * fetchImpl testlerde enjekte edilir (gerçek çağrı sıfır).
 */
export async function getAccessToken(
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; accessToken: string; account: GmailAccountRow } | { ok: false; error: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return { ok: false, error: 'GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET eksik — OAuth yapılandırması kullanıcı aksiyonu' }
  }
  const tokenRead = await readRefreshToken()
  if (!tokenRead.ok) return tokenRead

  let res: Response
  try {
    res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokenRead.refreshToken,
        grant_type: 'refresh_token',
      }),
    })
  } catch (err) {
    return { ok: false, error: redactSecret(`token endpoint erişilemedi: ${err instanceof Error ? err.message : 'network'}`, tokenRead.refreshToken) }
  }
  const body = (await res.json().catch(() => null)) as { access_token?: string; error?: string } | null
  if (!res.ok || !body?.access_token) {
    return {
      ok: false,
      error: redactSecret(`token yenileme başarısız (${res.status}): ${body?.error ?? 'bilinmeyen'}`, tokenRead.refreshToken),
    }
  }
  return { ok: true, accessToken: body.access_token, account: tokenRead.account }
}

/** Revoke: Google tarafında iptal + vault silme + hesap pasifleştirme.
 *  YALNIZ açık kullanıcı aksiyonuyla çağrılır (route guard'lı). */
export async function revokeGmailTokens(
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string }> {
  const tokenRead = await readRefreshToken()
  if (!tokenRead.ok) return { ok: false, error: tokenRead.error }

  try {
    // Google revoke: başarısız olsa bile yerel temizlik yapılır (token zaten
    // kullanıcı tarafından console'dan da iptal edilebilir) — sonuç raporlanır.
    const res = await fetchImpl('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: tokenRead.refreshToken }),
    })
    if (!res.ok) console.warn(`[gmail] Google revoke ${res.status} döndü — yerel temizlik yine yapılıyor`)
  } catch (err) {
    console.warn('[gmail] Google revoke erişilemedi — yerel temizlik yine yapılıyor:', err instanceof Error ? err.name : 'network')
  }

  const { error: delErr } = await supabaseAdmin.rpc('gmail_vault_delete', {
    p_id: tokenRead.account.vault_secret_id,
  })
  if (delErr) return { ok: false, error: `vault silinemedi: ${delErr.message}` }
  const { error: updErr } = await supabaseAdmin
    .from('gmail_accounts')
    .update({ active: false, vault_secret_id: null, updated_at: new Date().toISOString() })
    .eq('id', tokenRead.account.id)
  if (updErr) return { ok: false, error: `hesap pasifleştirilemedi: ${updErr.message}` }
  return { ok: true }
}
