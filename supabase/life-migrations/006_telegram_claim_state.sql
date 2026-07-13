-- ─────────────────────────────────────────────────────────────────────────────
-- 006_telegram_claim_state — LIFE DB (Faz 0.1, revize v3: fencing token +
-- delivery ledger durum makinesi [pending/sending/sent/failed/unknown] +
-- attempt_count/claimed_at lease alanları)
--
-- ⚠ UYGULANMADI — kullanıcı onayı bekliyor (LIFE DB pazarlıksız sınır).
--   Kod bu şema olmadan da çalışır: legacy 005 davranışı (insert-only claim,
--   complete/fail no-op) + production'da DB hatasında FAIL-CLOSED (503 →
--   Telegram sonra yeniden dener; mesaj kaybolmaz).
--
-- Amaç: crash-güvenli inbound işleme + FENCING.
--   005'te claim, handler'dan ÖNCE kalıcı yazılıyordu → handler crash olursa
--   retry 'duplicate' sayılır, MESAJ KAYBOLUR.
--   Durum makinesi: processing(lease, claim_token) → completed | failed.
--   Lease süresi dolan processing yeni token'la devralınır; ESKİ worker'ın
--   finalize'ı (eski claim_token + attempt_count) 0 satır etkiler → başarısız
--   sayılır (fencing). completed kesin no-op.
--
-- Ek: telegram_outbound_deliveries — webhook cevaplarının durable delivery
--   ledger'ı. delivery_key deterministik (update:<id>:reply:<seq>) →
--   aynı update'in retry'ında provider'a İKİNCİ mesaj gitmez (insert 23505).
--   provider-success/DB-finalize-fail → satır 'sending' kalır ve OTOMATİK
--   yeniden gönderilmez (unknown; manuel reconcile).
--
-- Risk: DÜŞÜK — additive ALTER (mevcut satırlar completed sayılır) + 1 RPC + 1 yeni tablo.
-- Rollback: 006_telegram_claim_state_rollback.sql
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.telegram_update_claims
  add column if not exists status text not null default 'completed'
    check (status in ('processing','completed','failed')),
  add column if not exists lease_until timestamptz,
  add column if not exists attempt_count integer not null default 1,
  add column if not exists claim_token uuid,
  add column if not exists last_error text,
  add column if not exists completed_at timestamptz;

comment on column public.telegram_update_claims.status is
  'processing: handler çalışıyor (lease_until''e kadar); completed: kesin no-op; failed: yeniden denenebilir.';
comment on column public.telegram_update_claims.claim_token is
  'Fencing token: her acquire/devralmada yenilenir; finalize yalnız güncel token+attempt ile geçer.';

-- Atomik acquire: yeni update → processing satırı (yeni token); failed veya
-- lease'i dolmuş processing → devral (attempt_count+1, YENİ token);
-- completed / taze processing → kayıt dönmez (boş set).
create or replace function public.telegram_acquire_update(
  p_update_id bigint,
  p_lease_seconds integer default 90
) returns table (acquired boolean, attempt integer, claim_token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  return query
  insert into telegram_update_claims as c
      (update_id, status, lease_until, attempt_count, claim_token, claimed_at)
    values
      (p_update_id, 'processing', now() + make_interval(secs => p_lease_seconds), 1, v_token, now())
  on conflict (update_id) do update
    set status = 'processing',
        lease_until = now() + make_interval(secs => p_lease_seconds),
        attempt_count = c.attempt_count + 1,
        claim_token = v_token,
        last_error = null
    where c.status = 'failed'
       or (c.status = 'processing' and c.lease_until < now())
  returning true, c.attempt_count, c.claim_token;
  -- Satır dönmediyse: completed veya taze processing → acquired yok (boş set).
end
$$;

revoke all on function public.telegram_acquire_update(bigint, integer) from public;
grant execute on function public.telegram_acquire_update(bigint, integer) to service_role;

-- Outbound delivery ledger (webhook cevapları) — at-most-once provider çağrısı.
create table if not exists public.telegram_outbound_deliveries (
  id bigint generated always as identity primary key,
  delivery_key text not null unique,
  update_id bigint,
  purpose text not null default 'webhook_reply',
  status text not null default 'sending'
    check (status in ('pending','sending','sent','failed','unknown')),
  message_id bigint,
  attempt_count integer not null default 1,
  claimed_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.telegram_outbound_deliveries is
  'Telegram cevap delivery ledger (v3 durum makinesi): delivery_key unique → aynı update retry''ında ikinci provider çağrısı yapısal olarak engellenir. sent=gerçek dedupe; failed=kontrollü retry (attempt_count+1, claimed_at lease); unknown=belirsiz provider sonucu — OTOMATİK resend ASLA (manuel reconcile); sending+taze lease=in-progress.';
comment on column public.telegram_outbound_deliveries.attempt_count is
  'Kaçıncı provider denemesi (yalnız failed→sending devralmasında artar).';
comment on column public.telegram_outbound_deliveries.claimed_at is
  'Aktif sending denemesinin lease zaman damgası — bayat sending unknown''a düşürülür.';

alter table public.telegram_outbound_deliveries enable row level security;
revoke all on table public.telegram_outbound_deliveries from anon, authenticated;
grant select, insert, update on table public.telegram_outbound_deliveries to service_role;
