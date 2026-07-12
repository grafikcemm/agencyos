-- Rollback for 057_lead_action_audit — audit tablosunu kaldırır.
-- Uygulama kodu tablo olmadan da çalışır (audit 'degraded' moda düşer).
drop table if exists public.lead_action_audit;
