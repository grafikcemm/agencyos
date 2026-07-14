-- ─────────────────────────────────────────────────────────────────────────────
-- 064_gmail_vault — App DB (FINALIZATION Faz 7)
--
-- ⚠ CANLIYA UYGULANMADI — kullanıcı onayı bekliyor (paket v2 eki). İzole E2E
--   test DB'sine KALICI uygulanır.
--
-- Amaç: Gmail refresh token'ı DÜZ METİN HİÇBİR TABLODA DURMAZ — Supabase
-- Vault'ta (supabase_vault, at-rest şifreli) yaşar; gmail_accounts yalnız
-- vault_secret_id taşır (046'daki kolon şimdi gerçek sahibine kavuşuyor).
-- PostgREST vault şemasını expose etmez → service_role-only PUBLIC wrapper'lar.
--
-- Güvenlik: SECURITY DEFINER + sabit search_path + yalnız service_role EXECUTE.
-- Token değeri hiçbir log/response'a yazılmaz (kod tarafı da redakte eder).
-- Rollback: 064_gmail_vault_rollback.sql
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.gmail_vault_store(p_name text, p_secret text)
returns uuid
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = p_name;
  if v_id is not null then
    -- Rotation: aynı isim → yeni değerle güncelle (eski değer vault tarafından ezilir).
    perform vault.update_secret(v_id, p_secret);
    return v_id;
  end if;
  return vault.create_secret(p_secret, p_name);
end
$$;

create or replace function public.gmail_vault_read(p_id uuid)
returns text
language sql
security definer
set search_path = vault, public
as $$
  select decrypted_secret from vault.decrypted_secrets where id = p_id;
$$;

create or replace function public.gmail_vault_delete(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = vault, public
as $$
begin
  delete from vault.secrets where id = p_id;
  return found;
end
$$;

revoke all on function public.gmail_vault_store(text, text) from public, anon, authenticated;
revoke all on function public.gmail_vault_read(uuid) from public, anon, authenticated;
revoke all on function public.gmail_vault_delete(uuid) from public, anon, authenticated;
grant execute on function public.gmail_vault_store(text, text) to service_role;
grant execute on function public.gmail_vault_read(uuid) to service_role;
grant execute on function public.gmail_vault_delete(uuid) to service_role;

-- gmail_accounts explicit service_role grant (046 döneminde eksikti).
grant select, insert, update, delete on public.gmail_accounts to service_role;
