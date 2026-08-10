-- GERİ ALMA — 071_acquisition_epoch.sql
--
-- Sütunları düşürmek dönem işaretini de yok eder; bu KABUL EDİLEBİLİR çünkü
-- 071 hiçbir satırı silmemiştir — geri aldıktan sonra lead tablosu 071 öncesi
-- hâline döner. `retired_at` işaretini kaybetmek istemiyorsan önce
-- `scripts/reset-acquisition-epoch.ts --export` çalıştır.

begin;

alter table public.leads        drop constraint if exists leads_acquisition_epoch_fkey;
alter table public.person_leads drop constraint if exists person_leads_acquisition_epoch_fkey;

drop index if exists public.leads_epoch_active_idx;
drop index if exists public.person_leads_epoch_active_idx;

alter table public.leads        drop column if exists acquisition_epoch;
alter table public.leads        drop column if exists retired_at;
alter table public.leads        drop column if exists retired_reason;
alter table public.person_leads drop column if exists acquisition_epoch;
alter table public.person_leads drop column if exists retired_at;
alter table public.person_leads drop column if exists retired_reason;

drop index if exists public.acquisition_epochs_single_current;
drop table if exists public.acquisition_epochs;

commit;
