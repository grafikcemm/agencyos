-- Migration 023: Kariyer Radarı karma eleme — 'rejected' statüsü.
-- NOT: 012+ gibi Supabase SQL Editor üzerinden manuel uygulanır. Tamamen idempotent.
--
-- Karma eleme: pipeline (job_legitimacy aşaması) net çöpü (suspicious / çok düşük fit /
-- bayat ilan) otomatik 'rejected' yapar. Kullanıcının elle düşürdüğü 'dismissed'tan
-- AYRI tutulur → denetlenebilir arşiv + geri dönülebilirlik. Satır silinmez.

DO $$ BEGIN
  ALTER TABLE job_listings DROP CONSTRAINT IF EXISTS job_listings_status_check;
  ALTER TABLE job_listings ADD CONSTRAINT job_listings_status_check
    CHECK (status IN ('new', 'evaluating', 'scored', 'drafted', 'dismissed', 'rejected'));
EXCEPTION WHEN undefined_table THEN NULL; END $$;
