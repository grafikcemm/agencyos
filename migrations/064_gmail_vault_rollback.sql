-- 064 ROLLBACK — yalnız wrapper fonksiyonları kaldırır. Vault içindeki
-- secret'lar SİLİNMEZ (veri güvenliği: rotation/revoke kod yolundan yapılır);
-- artık erişilemezler ve gerekirse Vault UI/SQL'den elle temizlenir.
drop function if exists public.gmail_vault_store(text, text);
drop function if exists public.gmail_vault_read(uuid);
drop function if exists public.gmail_vault_delete(uuid);
