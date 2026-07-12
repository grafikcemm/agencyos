-- Rollback for 005_telegram_reliability — iki tabloyu kaldırır (veri kaybı yalnız
-- claim/pending kayıtları; uygulama in-memory fallback ile çalışmaya devam eder).
drop table if exists public.telegram_pending_actions;
drop table if exists public.telegram_update_claims;
