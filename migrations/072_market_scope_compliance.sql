-- ═══════════════════════════════════════════════════════════════════════════
-- 072 — PAZAR KAPSAMI, KAYNAK İZLENEBİLİRLİĞİ VE ÜLKE UYUM OLGULARI
--
-- Lead Radar iki çalışma alanına ayrılıyor (Türkiye / Global) ama İKİNCİ BİR
-- TABLO AÇILMIYOR. Tek kanonik `leads` tablosu pazar, ülke, dil, para birimi,
-- saat dilimi, alıcı tipi, kaynak sağlayıcı ve uyum kanıtı taşır.
--
-- ÖNEMLİ — TEK DOĞRULUK KAYNAĞI:
--   `send_allowed` / `draft_allowed` / `research_only` SÜTUN DEĞİLDİR.
--   Bu tablo yalnız OLGULARI tutar. Karar `src/lib/compliance/countryPolicy.ts`
--   içinde türetilir. Aksi hâlde mevzuat kuralı değiştiğinde binlerce satır
--   bayat bir "izinli" işaretiyle kalırdı ve kimse fark etmezdi.
--
-- ÖNKOŞUL: yok (068/069/070/071'den bağımsız). Sıra tercihi: 071 → 072.
-- GERİ ALMA: 072_market_scope_compliance_rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Pazar ve coğrafya
-- ───────────────────────────────────────────────────────────────────────────
alter table public.leads add column if not exists market_scope   text;
alter table public.leads add column if not exists country_code   text;
alter table public.leads add column if not exists region_code    text;
alter table public.leads add column if not exists lead_timezone  text;
alter table public.leads add column if not exists lead_language  text;
alter table public.leads add column if not exists lead_currency  text;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Alıcı tipi ve uyum OLGULARI (karar değil)
-- ───────────────────────────────────────────────────────────────────────────
alter table public.leads add column if not exists entity_type            text default 'unknown';
alter table public.leads add column if not exists profession             text;
-- Kanıtlanmış gereklilikler: {"merchant_status_verified": true, ...}
-- Anahtar YOKSA kanıtlanmamış sayılır — fail-closed.
alter table public.leads add column if not exists compliance_evidence    jsonb not null default '{}'::jsonb;
alter table public.leads add column if not exists privacy_notice_status  text default 'not_sent';
alter table public.leads add column if not exists country_verified_at    timestamptz;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Kaynak izlenebilirliği ve tazelik
-- ───────────────────────────────────────────────────────────────────────────
alter table public.leads add column if not exists source_provider        text;
alter table public.leads add column if not exists source_provider_run_id text;
alter table public.leads add column if not exists source_query           text;
alter table public.leads add column if not exists source_url             text;
alter table public.leads add column if not exists acquired_at            timestamptz;
alter table public.leads add column if not exists freshness_checked_at   timestamptz;
-- Aynı şirket birden çok provider'dan geldiğinde SESSİZ OVERWRITE OLMAZ:
-- her katkı kendi provenance'ıyla bu dizide birikir.
alter table public.leads add column if not exists dedupe_sources         jsonb not null default '[]'::jsonb;
alter table public.leads add column if not exists campaign_id            text;

comment on column public.leads.dedupe_sources is
  'Bu hesaba katkı veren her kaynağın kaydı: [{provider, run_id, acquired_at, fields}]. Sessiz overwrite yerine birleşme.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Backfill — kısıt KONMADAN önce (068''in dersi)
-- ───────────────────────────────────────────────────────────────────────────
-- Mevcut kayıtların hepsi TR yerel taramasından geldi.
update public.leads
   set market_scope  = coalesce(market_scope, 'tr'),
       country_code  = coalesce(country_code, 'TR'),
       lead_language = coalesce(lead_language, 'tr'),
       lead_currency = coalesce(lead_currency, 'TRY'),
       lead_timezone = coalesce(lead_timezone, 'Europe/Istanbul'),
       entity_type   = coalesce(entity_type, 'unknown')
 where market_scope is null
    or country_code is null
    or entity_type is null;

-- Kaynak sağlayıcı: google_place_id doluysa Places, değilse bilinmiyor.
update public.leads
   set source_provider = case when google_place_id is not null then 'google_places' else 'unknown' end
 where source_provider is null;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Kısıtlar — backfill sonrası, idempotent
-- ───────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_market_scope_check') then
    alter table public.leads add constraint leads_market_scope_check
      check (market_scope is null or market_scope in ('tr', 'global')) not valid;
    alter table public.leads validate constraint leads_market_scope_check;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leads_country_code_check') then
    -- ISO-3166-1 alpha-2, büyük harf. Serbest metin ülke adı KABUL EDİLMEZ.
    alter table public.leads add constraint leads_country_code_check
      check (country_code is null or country_code ~ '^[A-Z]{2}$') not valid;
    alter table public.leads validate constraint leads_country_code_check;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leads_entity_type_check') then
    alter table public.leads add constraint leads_entity_type_check
      check (entity_type is null or entity_type in ('legal_entity', 'sole_trader', 'individual', 'unknown')) not valid;
    alter table public.leads validate constraint leads_entity_type_check;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leads_privacy_notice_status_check') then
    alter table public.leads add constraint leads_privacy_notice_status_check
      check (privacy_notice_status is null or privacy_notice_status in ('not_sent', 'sent', 'not_required')) not valid;
    alter table public.leads validate constraint leads_privacy_notice_status_check;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leads_source_provider_check') then
    alter table public.leads add constraint leads_source_provider_check
      check (source_provider is null or source_provider in
        ('google_places', 'apollo', 'apify', 'research_seed', 'manual', 'import', 'unknown')) not valid;
    alter table public.leads validate constraint leads_source_provider_check;
  end if;
end $$;

alter table public.leads alter column market_scope  set default 'tr';
alter table public.leads alter column entity_type   set default 'unknown';

create index if not exists leads_market_country_idx on public.leads (market_scope, country_code);
create index if not exists leads_campaign_idx       on public.leads (campaign_id) where campaign_id is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Kampanya havuzu — funnel paydalarının stabil kimliği
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.outreach_campaigns (
  id             text primary key,
  market_scope   text not null check (market_scope in ('tr', 'global')),
  niche_id       text not null,
  country_code   text not null check (country_code ~ '^[A-Z]{2}$'),
  language       text not null,
  currency       text not null,
  offer_version  text,
  monthly_email_quota int not null default 0 check (monthly_email_quota >= 0),
  status         text not null default 'draft' check (status in ('draft', 'active', 'paused', 'closed')),
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz,
  note           text
);

alter table public.outreach_campaigns enable row level security;
revoke all on public.outreach_campaigns from anon, authenticated;
-- Politika YOK → service_role dışında tam red.

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Doğrulama kapısı
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_rls      boolean;
  v_policies int;
  v_grants   int;
  v_bad      int;
begin
  select relrowsecurity into v_rls
    from pg_class where oid = 'public.outreach_campaigns'::regclass;
  if not coalesce(v_rls, false) then
    raise exception '072 DOĞRULAMA: outreach_campaigns üzerinde RLS açık değil';
  end if;

  select count(*) into v_policies
    from pg_policies where schemaname = 'public' and tablename = 'outreach_campaigns';
  if v_policies <> 0 then
    raise exception '072 DOĞRULAMA: outreach_campaigns % politika taşıyor (0 bekleniyordu)', v_policies;
  end if;

  select count(*) into v_grants
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'outreach_campaigns'
     and grantee in ('anon', 'authenticated');
  if v_grants <> 0 then
    raise exception '072 DOĞRULAMA: outreach_campaigns anon/authenticated grant taşıyor (%)', v_grants;
  end if;

  select count(*) into v_bad from public.leads
   where market_scope is null or country_code is null or source_provider is null;
  if v_bad <> 0 then
    raise exception '072 DOĞRULAMA: % lead pazar/ülke/kaynak işareti almadı', v_bad;
  end if;

  -- `send_allowed` gibi türetilmiş bir karar sütunu EKLENMEMİŞ olmalı.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'leads'
       and column_name in ('send_allowed', 'draft_allowed', 'send_policy')
  ) then
    raise exception '072 DOĞRULAMA: türetilmiş karar sütunu bulundu — karar countryPolicy.ts''de yaşar, DB''de değil';
  end if;
end $$;

commit;
