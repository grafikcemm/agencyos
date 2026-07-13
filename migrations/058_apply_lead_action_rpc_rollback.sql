-- Rollback for 058_apply_lead_action_rpc — fonksiyonu kaldırır.
-- Uygulama kodu RPC yokken otomatik olarak eski (atomik-olmayan, 'degraded'
-- işaretli) yola düşer; davranış kaybı yok.
drop function if exists public.apply_lead_action(uuid,text,text,text,text,text,timestamptz,timestamptz);
