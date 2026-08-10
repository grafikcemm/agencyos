-- GERİ ALMA — 072_market_scope_compliance.sql
--
-- Sütunlar düşürülür; hiçbir lead satırı SİLİNMEZ. Uyum kanıtı
-- (`compliance_evidence`) kaybolacağı için geri almadan önce
-- `npm run epoch:reset -- --export` ile arşiv al.

begin;

drop table if exists public.outreach_campaigns;

drop index if exists public.leads_market_country_idx;
drop index if exists public.leads_campaign_idx;

alter table public.leads drop constraint if exists leads_market_scope_check;
alter table public.leads drop constraint if exists leads_country_code_check;
alter table public.leads drop constraint if exists leads_entity_type_check;
alter table public.leads drop constraint if exists leads_privacy_notice_status_check;
alter table public.leads drop constraint if exists leads_source_provider_check;

alter table public.leads drop column if exists market_scope;
alter table public.leads drop column if exists country_code;
alter table public.leads drop column if exists region_code;
alter table public.leads drop column if exists lead_timezone;
alter table public.leads drop column if exists lead_language;
alter table public.leads drop column if exists lead_currency;
alter table public.leads drop column if exists entity_type;
alter table public.leads drop column if exists profession;
alter table public.leads drop column if exists compliance_evidence;
alter table public.leads drop column if exists privacy_notice_status;
alter table public.leads drop column if exists country_verified_at;
alter table public.leads drop column if exists source_provider;
alter table public.leads drop column if exists source_provider_run_id;
alter table public.leads drop column if exists source_query;
alter table public.leads drop column if exists source_url;
alter table public.leads drop column if exists acquired_at;
alter table public.leads drop column if exists freshness_checked_at;
alter table public.leads drop column if exists dedupe_sources;
alter table public.leads drop column if exists campaign_id;

commit;
