-- ─────────────────────────────────────────────────────────────────────────────
-- 055: gmail_accounts pozitif scope allowlist + Vault zorunluluğu (Faz 4 —
-- audit bulgu #5)
--
-- Problem (mig 046'daki negatif guard): yalnız gmail.modify ve mail.google.com
-- yasaklıydı — gmail.send + gmail.readonly DIŞINDAKİ Gmail scope'ları
-- (compose, insert, labels, settings.*) yapısal olarak engellenmiyordu; ayrıca
-- active=true iken vault_secret_id zorunlu değildi.
--
-- Çözüm:
--  1. POZİTİF allowlist: scopes yalnız {gmail.send, gmail.readonly} alt-kümesi
--     olabilir (<@). Yeni bir scope eklemek bilinçli migration gerektirir.
--  2. active=true ⇒ vault_secret_id IS NOT NULL (düz-metin/token'sız aktif
--     hesap imkânsız).
--  3. Deterministik tek-aktif-hesap: partial UNIQUE index — aynı anda en fazla
--     BİR satır active=true olabilir; "hangi hesap?" belirsizliği yapısal olarak
--     ortadan kalkar.
--
-- NOT (Google identity scope'ları): OAuth consent akışı 'openid'/'email' gibi
-- kimlik scope'ları isteyebilir — bunlar Gmail YETKİSİ değildir ve bu tabloda
-- SAKLANMAZ (scopes kolonu yalnız Gmail yetki envanteridir). İhtiyaç doğarsa
-- ayrı kolonda, ayrı değerlendirmeyle eklenir (21 T4 en-dar-scope ilkesi).
--
-- Ortak desen: additive + idempotent · SADECE App DB (dfedeh…).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Eski negatif guard kalksın (pozitif allowlist onu kapsar ve aşar).
ALTER TABLE gmail_accounts DROP CONSTRAINT IF EXISTS gmail_accounts_scope_guard;

-- 1. Pozitif allowlist: scopes ⊆ {gmail.send, gmail.readonly}.
ALTER TABLE gmail_accounts DROP CONSTRAINT IF EXISTS gmail_accounts_scope_allowlist;
ALTER TABLE gmail_accounts ADD CONSTRAINT gmail_accounts_scope_allowlist CHECK (
  scopes <@ ARRAY[
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly'
  ]::text[]
);

-- 2. Aktif hesap Vault referansı olmadan var olamaz.
ALTER TABLE gmail_accounts DROP CONSTRAINT IF EXISTS gmail_accounts_active_requires_vault;
ALTER TABLE gmail_accounts ADD CONSTRAINT gmail_accounts_active_requires_vault CHECK (
  NOT active OR vault_secret_id IS NOT NULL
);

-- 3. Aynı anda en fazla bir aktif hesap (deterministik seçim).
CREATE UNIQUE INDEX IF NOT EXISTS uq_gmail_accounts_single_active
  ON gmail_accounts (active) WHERE active = true;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Doğrulama (SQL Editor):
--   INSERT INTO gmail_accounts (email_address, scopes, active)
--     VALUES ('x@y.z', ARRAY['https://www.googleapis.com/auth/gmail.modify'], false);
--   -- beklenen: check constraint "gmail_accounts_scope_allowlist" ihlali
--   INSERT INTO gmail_accounts (email_address, scopes, active, vault_secret_id)
--     VALUES ('x@y.z', ARRAY['https://www.googleapis.com/auth/gmail.send'], true, NULL);
--   -- beklenen: check constraint "gmail_accounts_active_requires_vault" ihlali
