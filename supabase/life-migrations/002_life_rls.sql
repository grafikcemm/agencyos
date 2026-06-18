-- Migration 002 — Life (Feed The Goat) DB için RLS kilidi (savunma derinliği).
--
-- ⚠️ UYGULAMA SIRASI KRİTİK: Bu migration YALNIZCA yeni service-role kodu canlıya
-- DEPLOY EDİLDİKTEN SONRA uygulanmalı. Eski kod anon key (NEXT_PUBLIC) ile yazıyordu;
-- bu migration anon erişimini kilitlerse ve eski kod hâlâ çalışıyorsa Life sayfaları
-- kırılır. Doğru sıra:
--   1) `createServerSupabase` / `@/lib/supabase/server` → service-role'e geçen kodu deploy et.
--   2) Bu migration'ı Supabase SQL Editor'da (xcqrk… projesi) elle uygula.
--
-- NEDEN: Canlı durumda Life tablolarının çoğunda RLS açıktı AMA policy
-- `FOR ALL TO public USING (true) WITH CHECK (true)` idi → NEXT_PUBLIC anon anahtarı
-- (tarayıcı bundle'ında) ile REST üzerinden TÜM tablolar okunup YAZILABİLİYORDU.
-- Ek olarak `habits` / `habit_logs` tablolarında RLS tamamen kapalıydı.
--
-- ÇÖZÜM: Her public tabloda RLS aç + tüm permissive policy'leri kaldır. service_role
-- (lifeSupabaseAdmin) RLS'i baypas ettiği için uygulama çalışmaya devam eder; anon/
-- authenticated için tam red olur. Idempotent.

DO $$
DECLARE
  r record;
BEGIN
  -- 1) Her base tabloda RLS'i aç (habits/habit_logs dahil).
  FOR r IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;

  -- 2) Mevcut tüm policy'leri kaldır (allow-all-to-public dahil). Policy'siz + RLS açık
  --    = anon/authenticated için tam red; service_role baypas eder.
  FOR r IN
    SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', r.policyname, r.tablename);
  END LOOP;
END $$;
