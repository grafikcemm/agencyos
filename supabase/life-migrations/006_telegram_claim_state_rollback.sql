-- Rollback for 006_telegram_claim_state.
drop function if exists public.telegram_acquire_update(bigint, integer);
alter table public.telegram_update_claims
  drop column if exists status,
  drop column if exists lease_until,
  drop column if exists attempt_count,
  drop column if exists last_error,
  drop column if exists completed_at;
