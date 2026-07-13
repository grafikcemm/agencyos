-- ─────────────────────────────────────────────────────────────────────────────
-- 061_proposals — App DB (Faz 3.2)
--
-- ⚠ UYGULANMADI — kullanıcı onayı bekliyor. Onay sonrası App + test DB birlikte.
--
-- Amaç: teklif client memory'de YAŞAMAZ — durable, versiyonlu, onay-kapılı:
--   proposals (kimlik + durum) → proposal_versions (içerik snapshot'ları,
--   kalite dijestiyle) → proposal_approvals (HITL; gönderim ancak onayla) →
--   proposal_events (accepted/rejected/expired/viewed izi — attribution).
-- Kullanıcı onayı olmadan gönderim YOK: send yolu approval satırı ister
-- (uygulama katmanı + bu şema birlikte zorlar).
--
-- Risk: DÜŞÜK — yalnız YENİ tablolar (additive). Rollback: 061_proposals_rollback.sql
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','review','approved','sent','accepted','rejected','expired')),
  current_version integer not null default 1,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  version integer not null,
  offer_summary jsonb not null default '{}'::jsonb, -- hizmetler + kapsam + timeline + fiyat
  whatsapp_text text,
  email_subject text,
  email_body text,
  quality_digest text, -- outbound gate dijesti (Faz 1.3 formülü)
  evidence_ids uuid[] not null default '{}',
  rationale text,
  created_at timestamptz not null default now(),
  unique (proposal_id, version)
);

create table if not exists public.proposal_approvals (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  version integer not null,
  decision text not null default 'pending' check (decision in ('pending','approved','rejected')),
  decided_at timestamptz,
  action_digest text not null, -- içerik+kalite+alıcı bağlı digest (değişirse geçersiz)
  created_at timestamptz not null default now(),
  unique (proposal_id, version)
);

create table if not exists public.proposal_events (
  id bigint generated always as identity primary key,
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  version integer,
  event text not null check (event in ('created','revised','approved','sent','viewed','accepted','rejected','expired','followup_scheduled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists proposals_lead_idx on public.proposals (lead_id, created_at desc);
create index if not exists proposal_events_idx on public.proposal_events (proposal_id, created_at desc);

alter table public.proposals enable row level security;
alter table public.proposal_versions enable row level security;
alter table public.proposal_approvals enable row level security;
alter table public.proposal_events enable row level security;
revoke all on public.proposals, public.proposal_versions, public.proposal_approvals, public.proposal_events
  from anon, authenticated;
grant select, insert, update on public.proposals, public.proposal_versions, public.proposal_approvals to service_role;
grant select, insert on public.proposal_events to service_role;
