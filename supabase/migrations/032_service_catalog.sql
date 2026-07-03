-- 032: Kanonik hizmet kataloğu (v2 read model) — panel yalnız fiyat + aktiflik düzenler.
-- Yapı (domain/aile/paket, slug'lar, satış metni) KODDA yaşar: src/lib/services/catalog.ts.
-- Bu tablo yalnız override alanlarını taşır; name/domain/family seed ile senkronlanan
-- denormalize görünürlük kolonlarıdır (yapıda kod kazanır).
-- Idempotent — 031'den sonra. SQL Editor'da elle uygulanır (app DB).

CREATE TABLE IF NOT EXISTS service_catalog (
  slug TEXT PRIMARY KEY,
  domain TEXT NOT NULL CHECK (domain IN ('tasarim', 'ai_otomasyon', 'hibrit')),
  family TEXT NOT NULL,
  name TEXT NOT NULL,
  setup_price_override_tl INTEGER,      -- NULL = kod default'u geçerli
  monthly_price_override_tl INTEGER,    -- NULL = kod default'u geçerli
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: politikasız RLS = anon/authenticated tam red; service-role bypass eder (029 deseni).
ALTER TABLE service_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON service_catalog FROM anon, authenticated;

-- Kanıt görselleri için PRIVATE Storage bucket (public erişim yok; yalnız signed URL).
INSERT INTO storage.buckets (id, name, public)
VALUES ('lead-evidence', 'lead-evidence', false)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
