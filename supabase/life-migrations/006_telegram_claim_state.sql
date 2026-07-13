-- ─────────────────────────────────────────────────────────────────────────────
-- 006_telegram_claim_state — LIFE DB (Faz 0.3)
--
-- ⚠ UYGULANMADI — kullanıcı onayı bekliyor (LIFE DB pazarlıksız sınır).
--   Kod bu şema olmadan da çalışır: legacy 005 davranışı (insert-only claim,
--   complete/fail no-op) + production'da DB hatasında FAIL-CLOSED (503 →
--   Telegram sonra yeniden dener; mesaj kaybolmaz, iki kez işlenmez).
--
-- Amaç: crash-güvenli inbound işleme. 005'te claim, handler'dan ÖNCE kalıcı
-- yazılıyordu → handler crash olursa retry 'duplicate' sayılır, MESAJ KAYBOLUR.
-- Yeni durum makinesi: processing(lease) → completed | failed;
-- lease süresi dolan processing yeniden devralınabilir.
--
-- Risk: DÜŞÜK — additive ALTER (mevcut satırlar completed sayılır) + 1 RPC.
-- Rollback: 006_telegram_claim_state_rollback.sql
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.telegram_update_claims
  add column if not exists status text not null default 'completed'
    check (status in ('processing','completed','failed')),
  add column if not exists lease_until timestamptz,
  add column if not exists attempt_count integer not null default 1,
  add column if not exists last_error text,
  add column if not exists completed_at timestamptz;

comment on column public.telegram_update_claims.status is
  'processing: handler çalışıyor (lease_until''e kadar); completed: kesin no-op; failed: yeniden denenebilir.';

-- Atomik acquire: yeni update → processing satırı; failed veya lease''i dolmuş
-- processing → devral (attempt_count+1); completed / taze processing → kayıt dönmez.
create or replace function public.telegram_acquire_update(
  p_update_id bigint,
  p_lease_seconds integer default 90
) returns table (acquired boolean, attempt integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into telegram_update_claims as c
      (update_id, status, lease_until, attempt_count, claimed_at)
    values
      (p_update_id, 'processing', now() + make_interval(secs => p_lease_seconds), 1, now())
  on conflict (update_id) do update
    set status = 'processing',
        lease_until = now() + make_interval(secs => p_lease_seconds),
        attempt_count = c.attempt_count + 1,
        last_error = null
    where c.status = 'failed'
       or (c.status = 'processing' and c.lease_until < now())
  returning true, c.attempt_count;
  -- Satır dönmediyse: completed veya taze processing → acquired yok (boş set).
end
$$;

revoke all on function public.telegram_acquire_update(bigint, integer) from public;
grant execute on function public.telegram_acquire_update(bigint, integer) to service_role;
