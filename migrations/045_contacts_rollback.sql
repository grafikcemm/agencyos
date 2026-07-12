-- Rollback for 045_contacts — contacts tablosunu kaldırır (lead verisi etkilenmez).
drop table if exists public.contacts;
