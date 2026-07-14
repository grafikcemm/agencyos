-- 063 ROLLBACK — yalnız index'i kaldırır (temizlikte kapatılan duplicate
-- adımlar veri düzeltmesidir; geri açılmaz).
drop index if exists public.follow_up_sequences_open_step_uniq;
