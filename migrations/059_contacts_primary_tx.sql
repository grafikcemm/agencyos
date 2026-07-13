-- ─────────────────────────────────────────────────────────────────────────────
-- 059_contacts_primary_tx — App DB (Faz 2.1)
--
-- ⚠ UYGULANMADI — kullanıcı onayı bekliyor. Onay sonrası App DB + test DB'ye
--   BİRLİKTE uygulanır (e2e şema-parite parmak izi bozulmasın).
--
-- Amaç:
--   1) Bir lead için EN FAZLA BİR primary contact — partial unique index ile
--      veritabanı garantisi (uygulama-katmanı demote yarışları kapanır).
--   2) Primary create/switch TEK TRANSACTION (RPC): insert başarısızsa eski
--      primary KAYBOLMAZ (rollback).
--   3) Explicit service_role grant'leri (Supabase Data API explicit-grant
--      davranışı): revoke anon/authenticated + RLS korunur.
--
-- Risk: DÜŞÜK-ORTA — index CREATE'i mevcut Nx primary satırı varsa BAŞARISIZ
--   olur; ön-temizlik adımı içerir (en yeni primary kalır, deterministik).
-- Rollback: 059_contacts_primary_tx_rollback.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Ön-temizlik (Sprint-3 Faz 6.1 — DETERMİNİSTİK): aynı lead'de birden çok
-- primary kaldıysa (created_at DESC, id DESC) sırasında İLK satır kalır.
-- Eski sürüm yalnız created_at karşılaştırıyordu → EŞİT timestamp'lerde
-- (toplu import) İKİ satır da hayatta kalır ve unique index CREATE'i düşerdi.
-- id tie-break'i bunu kapatır (test: eşit created_at senaryosu, aşağıda).
with ranked as (
  select id,
         row_number() over (
           partition by lead_id
           order by created_at desc, id desc
         ) as rn
  from public.contacts
  where is_primary
)
update public.contacts c
set is_primary = false
from ranked r
where c.id = r.id and r.rn > 1;

create unique index if not exists contacts_one_primary_per_lead
  on public.contacts (lead_id) where is_primary;

-- Tek-transaction contact oluşturma (+opsiyonel primary devri).
create or replace function public.create_contact_tx(
  p_lead_id uuid,
  p_full_name text,
  p_role text,
  p_email text default null,
  p_phone text default null,
  p_linkedin text default null,
  p_source text default 'manual',
  p_notes text default null,
  p_is_primary boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Lead satırını kilitle: eşzamanlı iki primary işlemi sıralanır.
  perform 1 from leads where id = p_lead_id for update;
  if not found then
    return jsonb_build_object('outcome','rejected','error','lead bulunamadı');
  end if;

  if p_is_primary then
    update contacts set is_primary = false, updated_at = now()
      where lead_id = p_lead_id and is_primary;
  end if;

  insert into contacts (lead_id, full_name, role, email, phone, linkedin_url, source, notes, is_primary)
    values (p_lead_id, p_full_name, p_role, p_email, p_phone, p_linkedin, p_source, p_notes, p_is_primary)
    returning id into v_id;

  return jsonb_build_object('outcome','created','id',v_id);
exception
  when unique_violation then
    -- lead+email duplicate VEYA primary yarışı → tx rollback: eski primary korunur.
    return jsonb_build_object('outcome','duplicate','error','bu lead için aynı e-posta veya primary zaten var');
end
$$;

-- Tek-transaction primary devri.
create or replace function public.set_primary_contact(
  p_lead_id uuid,
  p_contact_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from leads where id = p_lead_id for update;
  if not found then
    return jsonb_build_object('outcome','rejected','error','lead bulunamadı');
  end if;
  perform 1 from contacts where id = p_contact_id and lead_id = p_lead_id;
  if not found then
    return jsonb_build_object('outcome','rejected','error','contact bu lead''e ait değil');
  end if;

  update contacts set is_primary = false, updated_at = now()
    where lead_id = p_lead_id and is_primary and id <> p_contact_id;
  update contacts set is_primary = true, updated_at = now()
    where id = p_contact_id;

  return jsonb_build_object('outcome','ok');
end
$$;

revoke all on function public.create_contact_tx(uuid,text,text,text,text,text,text,text,boolean) from public;
grant execute on function public.create_contact_tx(uuid,text,text,text,text,text,text,text,boolean) to service_role;
revoke all on function public.set_primary_contact(uuid,uuid) from public;
grant execute on function public.set_primary_contact(uuid,uuid) to service_role;

-- Explicit Data API grant'leri (045'te eksikti — service_role explicit yetki).
grant select, insert, update, delete on public.contacts to service_role;
