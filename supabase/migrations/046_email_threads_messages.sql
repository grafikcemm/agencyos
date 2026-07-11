-- Migration 046 — Email thread/message altyapısı + Gmail hesabı (Sprint 0, WS E/H).
-- Kaynak: 19-data-and-worker-architecture.md §1.2 + §5, 04-domain-model, 12-gmail.
-- Desen: additive + idempotent · BEGIN/COMMIT · politikasız RLS + REVOKE
-- (service-role only) · NOTIFY pgrst. App DB'ye SQL Editor'dan ELLE uygulanır.
-- LIFE DB'ye DOKUNMAZ.

BEGIN;

-- ── email_threads — Gmail konuşma zinciri (lead başına 1+) ──────────────────
CREATE TABLE IF NOT EXISTS email_threads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID REFERENCES leads(id) ON DELETE SET NULL,
  gmail_thread_id  TEXT UNIQUE,                  -- Gmail API threadId (dry-run'da NULL kalabilir)
  subject          TEXT,
  last_history_id  TEXT,                          -- incremental sync imleci (Sprint 2 reply ingest)
  last_synced_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_threads_lead ON email_threads(lead_id);

-- ── email_messages — tekil mesaj kaydı (outbound bu sprintte; inbound Sprint 2) ──
CREATE TABLE IF NOT EXISTS email_messages (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id            UUID REFERENCES email_threads(id) ON DELETE CASCADE,
  outreach_message_id  UUID REFERENCES outreach_messages(id) ON DELETE SET NULL,
  gmail_message_id     TEXT UNIQUE,               -- Gmail API messageId; UNIQUE = çift-gönderim yapısal engeli (T6)
  direction            TEXT NOT NULL DEFAULT 'outbound'
                         CHECK (direction IN ('outbound','inbound')),
  from_address         TEXT,
  to_address           TEXT,
  subject              TEXT,
  in_reply_to          TEXT,                      -- RFC 2822 In-Reply-To
  references_header    TEXT,                      -- RFC 2822 References
  body                 TEXT,                      -- retention: 24 ay sonra özete indirgenir (19 §7)
  sent_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_messages_thread   ON email_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_outreach ON email_messages(outreach_message_id);

-- ── outreach_messages additive kolonlar (11-outreach §gövde ayrımı) ──────────
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS original_body   TEXT;  -- LLM ham taslağı
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS final_body      TEXT;  -- operatör düzenlemesi sonrası gönderilen
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS gmail_message_id TEXT;
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS gmail_thread_id  TEXT;
-- Çift-gönderim yapısal engeli: aynı Gmail mesajı iki outreach satırına bağlanamaz.
CREATE UNIQUE INDEX IF NOT EXISTS uq_outreach_messages_gmail_message_id
  ON outreach_messages(gmail_message_id) WHERE gmail_message_id IS NOT NULL;

-- ── gmail_accounts — OAuth hesabı; token DÜZ METİN DEĞİL (19 §5) ─────────────
-- Token Supabase Vault'ta (vault.secrets) yaşar; bu tablo yalnız UUID referans
-- tutar. Okuma yalnız service-role. Bağımsız güvenlik incelemesi olmadan canlı
-- token yazılmaz; scope send+readonly dışına çıkamaz (CHECK aşağıda).
CREATE TABLE IF NOT EXISTS gmail_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_address     TEXT NOT NULL UNIQUE,
  vault_secret_id   UUID,                         -- vault.secrets referansı (refresh token); düz token kolonu YOK
  scopes            TEXT[] NOT NULL DEFAULT '{}',
  watch_expires_at  TIMESTAMPTZ,                  -- users.watch yenileme imleci (Sprint 2)
  last_history_id   TEXT,
  active            BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- gmail.modify / mail.google.com scope'ları YAPISAL YASAK (plan §3, 21 T4)
  CONSTRAINT gmail_accounts_scope_guard CHECK (
    NOT ('https://www.googleapis.com/auth/gmail.modify' = ANY(scopes))
    AND NOT ('https://mail.google.com/' = ANY(scopes))
  )
);

-- ── RLS + REVOKE (politikasız = yalnız service-role) ─────────────────────────
ALTER TABLE email_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON email_threads  FROM anon, authenticated;
REVOKE ALL ON email_messages FROM anon, authenticated;
REVOKE ALL ON gmail_accounts FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Doğrulama sorgusu (uygulandıktan sonra çalıştır):
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('email_threads','email_messages','gmail_accounts');
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='outreach_messages'
--     AND column_name IN ('original_body','final_body','gmail_message_id','gmail_thread_id');
