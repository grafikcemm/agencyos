-- ═══════════════════════════════════════════════════════════════════════════
-- 071 — EDİNİM DÖNEMİ (acquisition epoch)
--
-- AMAÇ: eski/test/seed/araştırma lead dönemini VERİ KAYBETMEDEN kapatmak ve
-- temiz bir edinim dönemi açmak.
--
-- BU MIGRATION HİÇBİR SATIRI SİLMEZ. `delete`, `truncate`, `drop table` YOKTUR.
-- Emeklilik (retire) bir SÜTUN İŞARETİDİR; satır yerinde kalır, denetlenebilir
-- kalır, geri alınabilir. Fiziksel silme ayrı ve sonraki bir karardır.
--
-- ÖNKOŞUL: yok. 068/069/070'ten bağımsız uygulanabilir.
-- GERİ ALMA: 071_acquisition_epoch_rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Dönem kaydı
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.acquisition_epochs (
  epoch_key   text primary key,
  label       text        not null,
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz,
  is_current  boolean     not null default false,
  note        text,
  created_at  timestamptz not null default now()
);

comment on table public.acquisition_epochs is
  'Lead edinim dönemleri. Aynı anda yalnız BİR dönem güncel olabilir (kısmi unique index).';

-- Aynı anda yalnız bir güncel dönem. Kısmi unique index: is_current=false
-- satırları kısıtlamaz.
create unique index if not exists acquisition_epochs_single_current
  on public.acquisition_epochs (is_current)
  where is_current;

-- Kanonik iki dönem. `on conflict do nothing` → migration idempotent.
insert into public.acquisition_epochs (epoch_key, label, opened_at, closed_at, is_current, note)
values
  ('legacy-pre-2026-08',
   'Eski dönem (test/seed/yerel sektör araştırması)',
   '2025-01-01T00:00:00Z', now(), false,
   'Kapatıldı: veri korunur, varsayılan operasyon görünümünde gösterilmez.'),
  ('epoch-2026-08',
   'Temiz edinim dönemi — üç niş, TR + Global',
   now(), null, true,
   'Varsayılan tüm ekranlar yalnız bu dönemi gösterir.')
on conflict (epoch_key) do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Lead tarafı sütunlar
-- ───────────────────────────────────────────────────────────────────────────
alter table public.leads          add column if not exists acquisition_epoch text;
alter table public.leads          add column if not exists retired_at        timestamptz;
alter table public.leads          add column if not exists retired_reason    text;
alter table public.person_leads   add column if not exists acquisition_epoch text;
alter table public.person_leads   add column if not exists retired_at        timestamptz;
alter table public.person_leads   add column if not exists retired_reason    text;

comment on column public.leads.retired_at is
  'Dolu ise kayıt operasyon görünümünden çıkarılmıştır. SİLİNMİŞ DEĞİLDİR.';

-- Sütun DOLDURULMADAN önce kısıt konmaz (068''in dersi). Önce backfill:
-- mevcut her satır eski döneme aittir.
update public.leads
   set acquisition_epoch = 'legacy-pre-2026-08'
 where acquisition_epoch is null;

update public.person_leads
   set acquisition_epoch = 'legacy-pre-2026-08'
 where acquisition_epoch is null;

-- Backfill tamamlandı → artık FK güvenle eklenebilir. `pg_constraint` kontrolü
-- migration''ı idempotent yapar (ikinci koşuda "already exists" hatası vermez).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_acquisition_epoch_fkey'
  ) then
    alter table public.leads
      add constraint leads_acquisition_epoch_fkey
      foreign key (acquisition_epoch) references public.acquisition_epochs(epoch_key)
      not valid;
    alter table public.leads validate constraint leads_acquisition_epoch_fkey;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'person_leads_acquisition_epoch_fkey'
  ) then
    alter table public.person_leads
      add constraint person_leads_acquisition_epoch_fkey
      foreign key (acquisition_epoch) references public.acquisition_epochs(epoch_key)
      not valid;
    alter table public.person_leads validate constraint person_leads_acquisition_epoch_fkey;
  end if;
end $$;

-- Yeni kayıtlar dönem işareti olmadan giremesin.
alter table public.leads        alter column acquisition_epoch set default 'epoch-2026-08';
alter table public.person_leads alter column acquisition_epoch set default 'epoch-2026-08';

-- Varsayılan operasyon sorgusu: `acquisition_epoch = <current> and retired_at is null`.
create index if not exists leads_epoch_active_idx
  on public.leads (acquisition_epoch)
  where retired_at is null;

create index if not exists person_leads_epoch_active_idx
  on public.person_leads (acquisition_epoch)
  where retired_at is null;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RLS — yeni tablo servis-rolü dışında tamamen kapalı
-- ───────────────────────────────────────────────────────────────────────────
alter table public.acquisition_epochs enable row level security;
revoke all on public.acquisition_epochs from anon, authenticated;
-- Politika YOK → service_role dışında her erişim reddedilir.

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Doğrulama kapısı — sessiz yarım uygulama olmasın
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_rls       boolean;
  v_policies  int;
  v_grants    int;
  v_current   int;
  v_orphan    int;
begin
  select relrowsecurity into v_rls
    from pg_class where oid = 'public.acquisition_epochs'::regclass;
  if not coalesce(v_rls, false) then
    raise exception '071 DOĞRULAMA: acquisition_epochs üzerinde RLS açık değil';
  end if;

  select count(*) into v_policies
    from pg_policies where schemaname = 'public' and tablename = 'acquisition_epochs';
  if v_policies <> 0 then
    raise exception '071 DOĞRULAMA: acquisition_epochs % politika taşıyor (0 bekleniyordu)', v_policies;
  end if;

  select count(*) into v_grants
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'acquisition_epochs'
     and grantee in ('anon', 'authenticated');
  if v_grants <> 0 then
    raise exception '071 DOĞRULAMA: acquisition_epochs anon/authenticated grant taşıyor (%)', v_grants;
  end if;

  select count(*) into v_current from public.acquisition_epochs where is_current;
  if v_current <> 1 then
    raise exception '071 DOĞRULAMA: güncel dönem sayısı % (1 bekleniyordu)', v_current;
  end if;

  select count(*) into v_orphan from public.leads where acquisition_epoch is null;
  if v_orphan <> 0 then
    raise exception '071 DOĞRULAMA: % lead dönem işareti almadı', v_orphan;
  end if;
end $$;

commit;
