-- 064 ROLLBACK (v3) — wrapper/RPC fonksiyonlarını ve oauth_states tablosunu
-- kaldırır. Vault içindeki secret'lar SİLİNMEZ (veri güvenliği: revoke kod
-- yolundan yapılır); artık erişilemezler ve gerekirse Vault UI/SQL'den elle
-- temizlenir.
drop function if exists public.gmail_connect_account(text, text, text[]);
drop function if exists public.gmail_disconnect_account(uuid);
drop function if exists public.gmail_consume_oauth_state(text);
drop function if exists public.gmail_prune_oauth_states();
drop function if exists public.gmail_vault_read(uuid);
drop function if exists public.gmail_quarantine_inbound(text, text, text, text, text);
-- v2'den kalan (artık kullanılmayan) wrapper'lar da düşürülür (varsa):
drop function if exists public.gmail_vault_store(text, text);
drop function if exists public.gmail_vault_delete(uuid);
drop table if exists public.gmail_oauth_states;
drop table if exists public.gmail_inbound_quarantine;
