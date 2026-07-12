---
Doküman: 32-gmail-oauth-vault-design
Tarih: 2026-07-12
Durum: TASARIM (görev 11 — kod bu dokümanla DEĞİL, bağımsız güvenlik incelemesi
geçtikten sonra ayrı oturumda yazılır). GMAIL_SEND_ENABLED bu iş bitmeden
true YAPILMAZ.
Bağımlılık: 12-gmail-and-followup-engine.md §A.6 · 21-security-and-compliance.md
T4/T5 · mig 046/055 · 19 §5 (Vault)
---

# Gmail OAuth + Vault Token Saklama — Tasarım (Faz 4 hazırlığı)

## 0. Önkoşullar (kullanıcı yapar — fabrike edilemez)
1. Google Cloud Console'da OAuth istemcisi (Web application).
2. Scope'lar: YALNIZ `gmail.send` + `gmail.readonly` (mig 055 pozitif
   allowlist; `checkGrantedScopes` kod aynası). `gmail.modify` / tam erişim
   consent ekranında bile İSTENMEZ.
3. Env (yalnız AD): `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`,
   `GMAIL_OAUTH_REDIRECT_URI`.

## 1. Authorization Code + PKCE akışı
- `GET /api/gmail/oauth/start` (auth + same-origin):
  - `state` = 32B rastgele, HMAC-imzalı (APP_SESSION_SECRET), 10 dk TTL,
    httpOnly cookie'ye de yazılır (double-submit).
  - PKCE: `code_verifier` (43-128 kr rastgele) cookie'de (httpOnly, 10 dk);
    `code_challenge=S256`.
  - `access_type=offline` + `prompt=consent` (refresh token garantisi).
- `GET /api/gmail/oauth/callback`:
  - CSRF: query `state` == cookie `state` (HMAC doğrulamalı) değilse 403;
    cookie'ler her sonuçta silinir.
  - Token değişimi ÖNCE scope kontrolü: Google'ın döndürdüğü `scope` listesi
    `checkGrantedScopes` ile doğrulanır; allowlist dışı varsa token değişimi
    YAPILMAZ (fail-closed) + operatöre açık hata.
  - Refresh token HİÇBİR ZAMAN: log, response body, düz DB kolonu, trace.
    (redact.ts `ya29.`/`1//` desenleri son savunma hattı.)

## 2. Vault saklama (19 §5)
- `vault.create_secret(refresh_token)` → dönen `secret_id` UUID →
  `gmail_accounts.vault_secret_id`. Düz token kolonu YOK (mig 046'dan beri);
  mig 055: `active=true ⇒ vault_secret_id NOT NULL` + tek-aktif-hesap.
- Okuma yalnız server-side `vault.decrypted_secrets` görünümünden, yalnız
  send/sync anında; access token bellekte tutulur, DB'ye YAZILMAZ.

## 3. Refresh / expiry / revoke davranışı (fail-closed — 12 §A.1)
| Durum | Davranış |
|---|---|
| Access token süresi doldu | refresh → yeni access (bellek-içi) |
| Refresh `invalid_grant` | hesap `active=false` + operatör uyarısı; gönderim DURUR; SMTP/başka fallback ASLA |
| Google scope daralttı | `checkGrantedScopes` fail → `active=false` |
| Refresh-token rotation (Google yeni refresh döndürdü) | Vault secret UPDATE (eski değer üzerine); eski token Google'da zaten geçersiz |
| Disconnect (operatör) | `POST /api/gmail/oauth/revoke`: Google `revoke` endpoint'i → Vault secret sil → satır `active=false, vault_secret_id=NULL` |

## 4. Test planı (görev 11 implementasyonunda zorunlu)
- state uyuşmazlığı → 403, token değişimi çağrılmaz.
- PKCE verifier eksik/yanlış → akış durur.
- Allowlist-dışı scope dönen grant → token exchange YOK (mock Google).
- `invalid_grant` refresh → active=false + görünür uyarı; sendGmailMessage
  açıklayıcı hata (sessiz düşüş yok).
- Revoke akışı → Vault secret silindi + satır pasif.
- redact: response/log fixture'larında `ya29.`/`1//` maskesi.

## 5. Kapılar
- Bağımsız güvenlik incelemesi (rules/os/40 yüksek-risk) GEÇMEDEN kod merge
  edilmez; `GMAIL_SEND_ENABLED=true` yapılmaz.
- İnceleme kapsamı: bu doküman + mig 046/054/055 + sendMachine/gmail.ts.
