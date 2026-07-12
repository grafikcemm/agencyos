-- ─────────────────────────────────────────────────────────────────────────────
-- 045_contacts — App DB (Faz D / doc 33 §1B — kanonik rezervasyon)
--
-- ⚠ CANLI App DB'ye UYGULANMADI — kullanıcı onayı bekliyor.
--
-- Amaç: lead (işletme) → contact (kişi/rol) zinciri. Rol-aware kişiselleştirme
-- (owner/cto/cfo/marketing) ve reply eşleştirme bu tabloya dayanır.
--
-- Risk: DÜŞÜK — tek YENİ tablo (additive). Mevcut leads.email alanı bozulmaz;
-- contacts, leads.email'in kişi-bazlı üst kümesidir (geri uyumlu).
-- Rollback: 045_contacts_rollback.sql
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  full_name text not null,
  role text not null default 'owner'
    check (role in ('owner','cto','cfo','marketing','operations','other')),
  email text,
  phone text,
  linkedin_url text,
  source text not null default 'manual'
    check (source in ('manual','apollo','website','instagram','referral')),
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_lead_idx on public.contacts (lead_id);
create unique index if not exists contacts_lead_email_unique
  on public.contacts (lead_id, lower(email)) where email is not null;

alter table public.contacts enable row level security;
revoke all on public.contacts from anon, authenticated;
