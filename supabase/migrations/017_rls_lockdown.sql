-- Migration 017 — RLS default-deny (savunma derinliği).
--
-- Neden: NEXT_PUBLIC_SUPABASE_ANON_KEY public'tir; tablolarda RLS yoksa bu anahtarla
-- Supabase REST'e DİREKT erişip uygulamayı baypas ederek veri okunup yazılabilir.
-- Denetlendi: uygulamada anon `supabase` client'ı hiçbir tabloyu sorgulamıyor — tüm
-- DB erişimi server'da `supabaseAdmin` (service-role) üzerinden. Service-role RLS'i
-- BYPASS ettiği için RLS açmak uygulamayı KIRMAZ; sadece anon/authenticated reddedilir.
--
-- Politika eklenmediğinden RLS açık + politikasız = anon/authenticated için tam red.
-- Idempotent: ENABLE ROW LEVEL SECURITY tekrar çalıştırılabilir; olmayan tablo atlanır.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'leads','projects','playbooks','settings',
    'apollo_enrichments','scan_runs',
    'opportunity_products','opportunity_watch_topics','opportunity_trend_sources',
    'opportunity_trend_signals','opportunity_intel_reports','opportunity_jarvis_memory',
    'agents','directives','agent_tasks','agent_messages',
    'ai_cost_logs','follow_ups',
    'outreach_messages','follow_up_sequences',
    'job_listings','job_application_drafts',
    'sessions','memories','strategy','hypotheses','decisions','autoresearch_runs',
    'council_debates','knowledge_docs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    END IF;
  END LOOP;
END $$;
