-- Migration 020: Pipeline disiplini — discovery alanları (gatekeeper için).
-- NOT: 012+ gibi Supabase SQL Editor üzerinden manuel uygulanır. Tamamen idempotent.
--
-- Bir lead "proposal" (teklif) aşamasına geçmeden önce bu üç alan dolu olmalı:
-- pain_point (acı noktası), decision_maker (karar verici), budget_band (bütçe bandı).
-- Doğrulama uygulama katmanında (db/[table] PATCH) yapılır.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS pain_point TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS decision_maker TEXT;
-- budget_band: '<20k' | '20-40k' | '40-80k' | '80k+'
ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_band TEXT;
