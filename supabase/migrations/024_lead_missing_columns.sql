-- 024_lead_missing_columns.sql
-- AgencyOS ana DB (ref dfedeh…). Supabase SQL Editor'da MANUEL uygula.
--
-- Lead tipinde (src/lib/types.ts) tanımlı olup leads tablosunda KARŞILIĞI olmayan
-- iki veri-taşıyan kolon. Kod bunları okuyor/yazıyor ama migration setinde yoktu:
--   • has_ecommerce  → src/app/api/leads/[id]/sequence/route.ts BUNU SELECT ediyor.
--     Kolon yoksa o route Supabase'de "column does not exist" ile patlıyor.
--     Diğer evidence sinyalleri (has_form, has_whatsapp, instagram_as_site, …)
--     004_evidence_engine.sql'de var; bu kardeş kolon eksik kalmış.
--   • branch_count   → src/app/api/leads/backfill/route.ts yazıyor,
--     src/lib/highQualityLeadEngine.ts skorlamada okuyor (>=3 şube → +money).
--
-- Not: Lead tipindeki whatsapp / instagram / source / scores alanları leads
-- tablosuna YAZILMIYOR (cosmetic/computed) — tip tarafında yorumla işaretlendi,
-- burada kolon AÇILMIYOR (YAGNI).

alter table leads add column if not exists has_ecommerce boolean default false;
alter table leads add column if not exists branch_count integer default 1;
