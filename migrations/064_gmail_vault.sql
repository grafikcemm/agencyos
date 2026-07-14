-- ─────────────────────────────────────────────────────────────────────────────
-- 064_gmail_vault — App DB (FINALIZATION Faz 7 → FINAL PILOT BLOCKERS Faz 2 v3)
--
-- ⚠ CANLIYA UYGULANMADI — kullanıcı onayı bekliyor (paket eki). İzole E2E
--   test DB'sine KALICI uygulanır.
--
-- Amaç: Gmail refresh token'ı DÜZ METİN HİÇBİR TABLODA DURMAZ — Supabase
-- Vault'ta (supabase_vault, at-rest şifreli) yaşar; gmail_accounts yalnız
-- vault_secret_id taşır. PostgREST vault şemasını expose etmez → service_role
-- -only PUBLIC wrapper'lar.
--
-- v3 DEĞİŞİKLİĞİ (audit bulgu #6 — atomiklik):
--  • Global tek secret adı KALDIRILDI; her hesap KENDİ secret adına sahip
--    ('gmail_rt::' || lower(email)) → ikinci hesap birincinin token'ını EZMEZ.
--  • Vault yazımı + hesap aktivasyonu/deaktivasyonu TEK transaction RPC'de
--    (gmail_connect_account): DB hatasında hepsi geri alınır → orphan/yanlış
--    eşleşmiş secret KALMAZ. Tek-aktif index tx içinde önce-deaktive-et ile
--    korunur.
--  • Revoke da tek-tx + IDEMPOTENT (gmail_disconnect_account): tekrar
--    çağrılabilir, ikinci çağrı no-op.
--  • OAuth state tek-kullanımlık kaydı (gmail_oauth_states + consume RPC) →
--    replay reddi.
--
-- Güvenlik: SECURITY DEFINER + sabit search_path + yalnız service_role EXECUTE.
-- Token değeri hiçbir log/response'a yazılmaz (kod tarafı da redakte eder).
-- Rollback: 064_gmail_vault_rollback.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Düşük seviye Vault wrapper'ları (okuma + doğrudan silme için korunur) ────
create or replace function public.gmail_vault_read(p_id uuid)
returns text
language sql
security definer
set search_path = vault, public
as $$
  select decrypted_secret from vault.decrypted_secrets where id = p_id;
$$;

-- ── Tek-transaction hesap bağlama: vault rotate/create + tek-aktif upsert ─────
-- DB hatasında (ör. constraint ihlali) TÜM işlem geri alınır → vault secret de
-- yazılmamış olur (vault.secrets normal tablo; tx'e dahil). Orphan yok.
create or replace function public.gmail_connect_account(
  p_email text,
  p_refresh_token text,
  p_scopes text[]
)
returns uuid
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  v_email       text := lower(p_email);
  v_secret_name text := 'gmail_rt::' || lower(p_email);
  v_secret_id   uuid;
  v_account_id  uuid;
begin
  -- 1. Vault: bu HESABA ÖZGÜ secret adını rotate-or-create.
  select id into v_secret_id from vault.secrets where name = v_secret_name;
  if v_secret_id is not null then
    perform vault.update_secret(v_secret_id, p_refresh_token);
  else
    v_secret_id := vault.create_secret(p_refresh_token, v_secret_name);
  end if;

  -- 2. DİĞER tüm hesapları önce deaktive et (tek-aktif kısmi UNIQUE index'i
  --    tx içinde ihlal etmemek için ÖNCE). Bu hesabın kendi satırı hariç.
  update public.gmail_accounts
    set active = false, updated_at = now()
    where lower(email_address) <> v_email and active;

  -- 3. Bu hesabı aktif olarak upsert et (email_address UNIQUE — 046).
  insert into public.gmail_accounts (email_address, vault_secret_id, scopes, active, updated_at)
    values (v_email, v_secret_id, p_scopes, true, now())
  on conflict (email_address) do update
    set vault_secret_id = excluded.vault_secret_id,
        scopes          = excluded.scopes,
        active          = true,
        updated_at      = now()
  returning id into v_account_id;

  return v_account_id;
end
$$;

-- ── Tek-transaction, idempotent revoke ───────────────────────────────────────
create or replace function public.gmail_disconnect_account(p_account_id uuid)
returns boolean
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  v_secret_id uuid;
begin
  select vault_secret_id into v_secret_id
    from public.gmail_accounts where id = p_account_id;
  if not found then
    return false;  -- zaten yok — idempotent, hata değil
  end if;
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
  update public.gmail_accounts
    set active = false, vault_secret_id = null, updated_at = now()
    where id = p_account_id;
  return true;
end
$$;

-- ── OAuth tek-kullanımlık state (replay reddi) ───────────────────────────────
create table if not exists public.gmail_oauth_states (
  nonce       text primary key,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.gmail_oauth_states enable row level security;
revoke all on public.gmail_oauth_states from anon, authenticated;
grant select, insert, update, delete on public.gmail_oauth_states to service_role;

-- Atomik tüket: yalnız var + tüketilmemiş + süresi geçmemiş nonce true döner.
-- İkinci (replay) çağrı false alır — consumed_at zaten dolu.
create or replace function public.gmail_consume_oauth_state(p_nonce text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  update public.gmail_oauth_states
    set consumed_at = now()
    where nonce = p_nonce and consumed_at is null and expires_at > now()
  returning true into v_ok;
  return coalesce(v_ok, false);
end
$$;

-- Süresi geçmiş/tüketilmiş state temizliği (cron/opsiyonel).
create or replace function public.gmail_prune_oauth_states()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.gmail_oauth_states
    where expires_at < now() - interval '1 day';
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────
revoke all on function public.gmail_vault_read(uuid) from public, anon, authenticated;
revoke all on function public.gmail_connect_account(text, text, text[]) from public, anon, authenticated;
revoke all on function public.gmail_disconnect_account(uuid) from public, anon, authenticated;
revoke all on function public.gmail_consume_oauth_state(text) from public, anon, authenticated;
revoke all on function public.gmail_prune_oauth_states() from public, anon, authenticated;
grant execute on function public.gmail_vault_read(uuid) to service_role;
grant execute on function public.gmail_connect_account(text, text, text[]) to service_role;
grant execute on function public.gmail_disconnect_account(uuid) to service_role;
grant execute on function public.gmail_consume_oauth_state(text) to service_role;
grant execute on function public.gmail_prune_oauth_states() to service_role;

-- gmail_accounts explicit service_role grant (046 döneminde eksikti).
grant select, insert, update, delete on public.gmail_accounts to service_role;

-- Not: eski global gmail_vault_store/gmail_vault_delete wrapper'ları v3'te
-- KULLANILMIYOR (connect/disconnect RPC'leri vault'a doğrudan, atomik erişir).
-- Test DB'de kalmaları zararsız; canlı uygulamada da bırakılabilir.
