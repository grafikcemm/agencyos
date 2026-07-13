-- Rollback for 059_contacts_primary_tx.
-- Uygulama kodu RPC yokken otomatik legacy yola düşer (atomic:false işaretli).
drop function if exists public.set_primary_contact(uuid,uuid);
drop function if exists public.create_contact_tx(uuid,text,text,text,text,text,text,text,boolean);
drop index if exists public.contacts_one_primary_per_lead;
