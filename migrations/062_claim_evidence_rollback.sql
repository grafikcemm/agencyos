-- 062_claim_evidence v2 ROLLBACK — yalnız 062'nin yarattığı nesneleri kaldırır.
-- Sıra: bağımlı tablo önce (claim_evidence → versions).
drop table if exists public.outreach_claim_evidence;
drop table if exists public.outreach_message_versions;
