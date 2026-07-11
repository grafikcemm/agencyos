-- Migration 047 — Suppression + consent + leads gizlilik kolonları (Sprint 0, WS H).
-- Kaynak: 19 §1.2 + §7, 21 T8, 04-domain-model. Suppression pre-send kapısının
-- veri tabanı; consent_records APPEND-ONLY (trigger ile zorlanır — yasal iz).
-- Desen: additive + idempotent · BEGIN/COMMIT · RLS + REVOKE · NOTIFY pgrst.
-- App DB'ye SQL Editor'dan ELLE uygulanır. LIFE DB'ye DOKUNMAZ.

BEGIN;

-- ── suppression_list — gönderim yasağı (deterministik pre-send gate, T8) ─────
CREATE TABLE IF NOT EXISTS suppression_list (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address     TEXT NOT NULL,                      -- e-posta adresi veya domain (scope'a göre)
  scope       TEXT NOT NULL DEFAULT 'email'
                CHECK (scope IN ('email','domain')),
  reason      TEXT NOT NULL,                      -- ör. 'opt_out', 'bounce', 'complaint', 'manual'
  source      TEXT NOT NULL,                      -- ör. 'operator', 'reply_ingest', 'iys'
  operator    TEXT,                               -- kaydı ekleyen (audit izi)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppression_address_scope
  ON suppression_list(lower(address), scope);

-- ── consent_records — append-only rıza/itiraz kaydı (kalıcı, 19 §7) ──────────
CREATE TABLE IF NOT EXISTS consent_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID REFERENCES leads(id) ON DELETE SET NULL,
  address     TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('opt_in','opt_out','notice')),
  source      TEXT NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consent_records_address ON consent_records(lower(address));

-- Append-only zorlaması: UPDATE/DELETE yapısal olarak engellenir (service-role dahil).
CREATE OR REPLACE FUNCTION consent_records_append_only() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''  -- linter 0011: mutable search_path uyarısını kapatır
AS $$
BEGIN
  RAISE EXCEPTION 'consent_records append-only: % engellendi', TG_OP;
END $$;
DROP TRIGGER IF EXISTS trg_consent_records_append_only ON consent_records;
CREATE TRIGGER trg_consent_records_append_only
  BEFORE UPDATE OR DELETE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION consent_records_append_only();

-- ── leads additive gizlilik kolonları ────────────────────────────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS do_not_contact         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS do_not_contact_reason  TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS retention_until        TIMESTAMPTZ;

-- ── RLS + REVOKE ─────────────────────────────────────────────────────────────
ALTER TABLE suppression_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON suppression_list FROM anon, authenticated;
REVOKE ALL ON consent_records  FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Doğrulama sorgusu:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('suppression_list','consent_records');
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='leads'
--     AND column_name IN ('do_not_contact','do_not_contact_reason','retention_until');
--   -- append-only kanıtı (hata BEKLENİR):
--   -- UPDATE consent_records SET note='x' WHERE false; -- satır yoksa sessiz; satır varken exception
