-- ─────────────────────────────────────────────────────────────────────────────
-- 005_telegram_reliability — LIFE DB (Faz B4/B5)
--
-- ✔ CANLIDA (2026-07-13, kullanıcı onayıyla MCP apply_migration; LIFE xcqrk…).
--   Aşağıdaki metin tarihsel kayıttır.
--
-- Amaç:
--   1) telegram_update_claims  — Telegram update_id cross-instance idempotency
--      (in-memory Map yalnız optimizasyon; doğruluk bu PK claim'inden gelir).
--   2) telegram_pending_actions — "görev ekle → 1/2" gibi çok-adımlı akışların
--      TTL'li, tek-kullanımlık bekleyen aksiyonu (digest'li).
--
-- Risk: DÜŞÜK — yalnız İKİ YENİ tablo (additive); mevcut tablo/veri değişmez.
-- Uygulama kodu tablolar yokken de çalışır (in-memory fallback, mode='memory').
-- Rollback: 005_telegram_reliability_rollback.sql (iki tabloyu düşürür).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.telegram_update_claims (
  update_id bigint primary key,
  claimed_at timestamptz not null default now()
);

comment on table public.telegram_update_claims is
  'Telegram webhook update_id claim — INSERT çakışması = duplicate (at-most-once işleme).';

-- Eski claim''ler değersiz — periyodik temizlik sorgusu (cron''a eklenebilir):
--   delete from telegram_update_claims where claimed_at < now() - interval '2 days';

create table if not exists public.telegram_pending_actions (
  chat_key text primary key,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  digest text not null,
  created_at timestamptz not null default now()
);

comment on table public.telegram_pending_actions is
  'Chat başına TEK bekleyen aksiyon (TTL kod tarafında; tüketim DELETE ile tek-kullanımlık).';

-- RLS: service-role dışında erişim yok (politika YOK = anon/authenticated reddedilir).
alter table public.telegram_update_claims enable row level security;
alter table public.telegram_pending_actions enable row level security;
revoke all on public.telegram_update_claims from anon, authenticated;
revoke all on public.telegram_pending_actions from anon, authenticated;
