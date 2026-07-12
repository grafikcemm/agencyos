-- ─────────────────────────────────────────────────────────────────────────────
-- 057_lead_action_audit — App DB (Faz B6/C1)
--
-- ⚠ CANLI App DB'ye UYGULANMADI — kullanıcı onayı bekliyor (pazarlıksız sınır:
--   App DB migration'ları additive + SQL/risk/rollback sunulup onaylanır).
--
-- Amaç: lead satır aksiyonları (arandı / ulaşılamadı / görüşme / daha sonra /
-- not) için actor + kanal + before/after state + idempotency izli audit.
-- UNIQUE idempotency_key aynı aksiyonun (ör. Telegram update retry'ı) iki kez
-- uygulanmasını yapısal olarak engeller (kod: claim → mutate → tamamla).
--
-- Risk: DÜŞÜK — tek YENİ tablo (additive); mevcut tablo/veri değişmez.
-- Kod tablo yokken de çalışır (audit:'degraded' görünür, aksiyon uygulanır).
-- Rollback: 057_lead_action_audit_rollback.sql
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.lead_action_audit (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  action text not null check (action in ('called','no_answer','meeting','later','note')),
  actor text not null,
  channel text not null check (channel in ('ui','telegram')),
  idempotency_key text unique,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists lead_action_audit_lead_idx
  on public.lead_action_audit (lead_id, created_at desc);

alter table public.lead_action_audit enable row level security;
revoke all on public.lead_action_audit from anon, authenticated;
