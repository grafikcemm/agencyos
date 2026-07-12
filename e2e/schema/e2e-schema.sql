-- ============================================================================
-- AgencyOS E2E TEST DB ŞEMASI (agencyos-e2e / luhvfbujwnlnpnoelzhg) — TAM PARITY
-- ============================================================================
-- KAYNAK: Canlı App DB (dfedeh…) pg_catalog'undan deterministik çıkarım
--         (2026-07-12, PG 17.6). Tam 60 tablo + tüm constraint/index/fonksiyon/
--         trigger + RLS bayrakları. Yeniden üretim prosedürü: e2e/schema/README.md
-- UYGULAMA: YALNIZ test projesine, Supabase MCP apply_migration ile.
--           Bu dosya supabase/migrations/ ALTINDA DEĞİLDİR ve App DB'ye
--           asla uygulanmaz.
-- DRIFT:    e2e/schema-drift.spec.ts, e2e_schema_fingerprint() çıktısını
--           expected-fingerprint.json (App DB'den alınmış referans) ile
--           karşılaştırır.
-- BİLİNÇLİ SAPMALAR (fingerprint dışında tutulur, bkz. README):
--   1. RLS policy'leri: App DB'de policy yok (service-role-only). Test DB'de
--      anon anahtar service yerine kullanıldığı için her tabloya permissive
--      e2e_open policy eklenir. RLS 'enabled' BAYRAĞI her iki tarafta true.
--   2. GRANT'lar ve event trigger (ensure_rls) klonlanmaz.
--   3. e2e_% önekli yardımcı fonksiyonlar fingerprint dışıdır.
-- ============================================================================

-- ---- RESET (idempotent; test DB atılabilir) ----
DROP TABLE IF EXISTS
  public.agent_memory, public.agent_messages, public.agent_skill_grants,
  public.agent_tasks, public.agents, public.ai_cost_logs,
  public.apollo_enrichments, public.approval_requests, public.autoresearch_runs,
  public.consent_records, public.council_debates, public.decisions,
  public.directives, public.email_messages, public.email_threads,
  public.eval_cases, public.eval_datasets, public.eval_results, public.eval_runs,
  public.follow_up_sequences, public.follow_ups, public.gmail_accounts,
  public.hypotheses, public.job_application_drafts, public.job_listings,
  public.knowledge_docs, public.lead_assessments, public.lead_evidence,
  public.lead_intel_runs, public.lead_match_feedback, public.lead_service_matches,
  public.leads, public.memories, public.memory_embeddings,
  public.opportunity_intel_reports, public.opportunity_jarvis_memory,
  public.opportunity_products, public.opportunity_trend_signals,
  public.opportunity_trend_sources, public.opportunity_watch_topics,
  public.outreach_messages, public.outreach_send_attempts, public.person_leads,
  public.person_scan_runs, public.playbooks, public.projects, public.run_spans,
  public.run_step_dependencies, public.scan_runs, public.service_catalog,
  public.sessions, public.settings, public.skill_embeddings, public.skill_versions,
  public.skills, public.strategy, public.suppression_list, public.tool_cost_logs,
  public.tool_embeddings, public.tool_registry
CASCADE;

DROP FUNCTION IF EXISTS public.finalize_outreach_send(uuid, uuid, uuid, text, text, text, text, text, text, timestamptz, text);
DROP FUNCTION IF EXISTS public.consent_records_append_only();
DROP FUNCTION IF EXISTS public.update_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.rls_auto_enable() CASCADE;
DROP FUNCTION IF EXISTS public.e2e_schema_fingerprint();
DROP FUNCTION IF EXISTS public.e2e_admin_exec(text);

-- ---- EXTENSIONS (App DB paritesi: hepsi extensions şemasında) ----
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector SCHEMA extensions;

-- ---- TABLOLAR (60, alfabetik; kolon sırası App DB attnum sırası) ----
CREATE TABLE public.agent_memory (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  memory_key text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'quarantine'::text,
  confidence numeric(4,3) NOT NULL DEFAULT 0.500,
  occurrences integer NOT NULL DEFAULT 1,
  source_run_id uuid,
  source_step_id uuid,
  source_tool text,
  retention_until timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.agent_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agent_key text NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.agent_skill_grants (
  agent_key text NOT NULL,
  skill_slug text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.agent_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  directive_id uuid,
  agent_key text NOT NULL,
  title text NOT NULL,
  input jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued'::text,
  result jsonb,
  tokens_in integer DEFAULT 0,
  tokens_out integer DEFAULT 0,
  error text,
  created_at timestamp with time zone DEFAULT now(),
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  parent_step_id uuid,
  skill_slug text,
  permission_scopes text[],
  risk_level text,
  data_sensitivity text,
  lease_owner text,
  lease_expires_at timestamp with time zone,
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 3,
  next_run_at timestamp with time zone,
  last_error text
);

CREATE TABLE public.agents (
  key text NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  description text,
  model text NOT NULL,
  system_prompt text NOT NULL DEFAULT ''::text,
  tools text[] DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'idle'::text,
  sort_order integer NOT NULL DEFAULT 99,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  archetype text,
  team text,
  model_tier text,
  input_contract jsonb,
  output_contract jsonb,
  permission_scopes text[],
  risk_level text,
  data_sensitivity text,
  budget_usd_max numeric(10,6),
  timeout_ms integer,
  eval_slug text
);

CREATE TABLE public.ai_cost_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  operation text NOT NULL,
  model_used text NOT NULL,
  model_tier text,
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  cost_usd numeric(10,6) DEFAULT 0,
  cost_tl numeric(10,4) DEFAULT 0,
  related_lead_id uuid,
  related_project_id uuid,
  agent_key text,
  generation_id text,
  actual_cost_usd numeric(12,8),
  cost_source text DEFAULT 'estimated'::text,
  preset_key text,
  fallback_used boolean NOT NULL DEFAULT false,
  retry_count integer NOT NULL DEFAULT 0
);

CREATE TABLE public.apollo_enrichments (
  lead_id uuid NOT NULL,
  domain text,
  org_name text,
  org_industry text,
  org_employee_count integer,
  org_linkedin text,
  raw_org jsonb,
  confidence double precision DEFAULT 1.0,
  enriched_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.approval_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  run_id uuid,
  step_id uuid,
  permission_scopes text[] NOT NULL DEFAULT '{}'::text[],
  risk_level text NOT NULL DEFAULT 'medium'::text,
  data_sensitivity text NOT NULL DEFAULT 'internal'::text,
  action text NOT NULL,
  action_digest text NOT NULL,
  redacted_preview text NOT NULL,
  idempotency_key text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  approved_digest text,
  decided_at timestamp with time zone,
  decided_by text,
  executed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.autoresearch_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  proposals jsonb DEFAULT '[]'::jsonb,
  accepted jsonb DEFAULT '[]'::jsonb,
  quality_score numeric DEFAULT 0,
  ran_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.consent_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid,
  address text NOT NULL,
  kind text NOT NULL,
  source text NOT NULL,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.council_debates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  context text DEFAULT ''::text,
  strategy_opinion text,
  risk_opinion text,
  operations_opinion text,
  growth_opinion text,
  president_synthesis text,
  status text DEFAULT 'open'::text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.decisions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  decision text NOT NULL,
  why text,
  made_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.directives (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  operator_input text NOT NULL,
  status text NOT NULL DEFAULT 'queued'::text,
  plan jsonb,
  debrief text,
  error text,
  created_at timestamp with time zone DEFAULT now(),
  finished_at timestamp with time zone,
  intent text,
  success_criteria jsonb,
  channel text,
  mode text NOT NULL DEFAULT 'active'::text,
  budget_usd_max numeric(10,6),
  cost_usd numeric(12,6) DEFAULT 0
);

CREATE TABLE public.email_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  thread_id uuid,
  outreach_message_id uuid,
  gmail_message_id text,
  direction text NOT NULL DEFAULT 'outbound'::text,
  from_address text,
  to_address text,
  subject text,
  in_reply_to text,
  references_header text,
  body text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.email_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid,
  gmail_thread_id text,
  subject text,
  last_history_id text,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.eval_cases (
  slug text NOT NULL,
  suite text NOT NULL,
  description text,
  input jsonb NOT NULL,
  expected jsonb NOT NULL,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.eval_datasets (
  slug text NOT NULL,
  suite text NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.eval_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  eval_run_id uuid,
  case_slug text,
  passed boolean,
  expected jsonb,
  actual jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.eval_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  suite text NOT NULL,
  total integer DEFAULT 0,
  passed integer DEFAULT 0,
  failed integer DEFAULT 0,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.follow_up_sequences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid,
  outreach_message_id uuid,
  step integer NOT NULL,
  channel text NOT NULL DEFAULT 'email'::text,
  due_at timestamp with time zone NOT NULL,
  done boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.follow_ups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  lead_id uuid,
  project_id uuid,
  follow_up_date date NOT NULL,
  note text,
  priority text DEFAULT 'orta'::text,
  is_done boolean DEFAULT false,
  done_at timestamp with time zone,
  title text,
  due_date timestamp with time zone
);

CREATE TABLE public.gmail_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email_address text NOT NULL,
  vault_secret_id uuid,
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  watch_expires_at timestamp with time zone,
  last_history_id text,
  active boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.hypotheses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  claim text NOT NULL,
  status text DEFAULT 'open'::text,
  evidence jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.job_application_drafts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  lang text NOT NULL DEFAULT 'tr'::text,
  subject text,
  body text NOT NULL,
  model_used text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.job_listings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source text NOT NULL,
  source_job_id text,
  url text NOT NULL,
  title text NOT NULL,
  company text,
  location text,
  description text,
  employment_type text,
  remote boolean DEFAULT false,
  posted_at timestamp with time zone,
  status text NOT NULL DEFAULT 'new'::text,
  legitimacy text,
  fit_score integer,
  fit_reasons jsonb DEFAULT '[]'::jsonb,
  scam_flags jsonb DEFAULT '[]'::jsonb,
  scanned_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.knowledge_docs (
  key text NOT NULL,
  label text,
  content text NOT NULL DEFAULT ''::text,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.lead_assessments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid,
  candidate jsonb,
  run_date date NOT NULL,
  mode text NOT NULL,
  shadow boolean NOT NULL DEFAULT false,
  selected boolean NOT NULL DEFAULT false,
  design_score integer,
  ai_score integer,
  evidence_count integer NOT NULL DEFAULT 0,
  verified_evidence_count integer NOT NULL DEFAULT 0,
  council jsonb,
  chair_verdict jsonb,
  cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  pipeline_version text NOT NULL DEFAULT 'v2'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.lead_evidence (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid,
  kind text NOT NULL,
  source text NOT NULL,
  url text,
  storage_path text,
  summary text,
  payload jsonb,
  confidence numeric(3,2) NOT NULL DEFAULT 0.5,
  verified boolean NOT NULL DEFAULT false,
  collected_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.lead_intel_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  run_date date NOT NULL,
  mode text NOT NULL DEFAULT 'shadow'::text,
  stage text NOT NULL DEFAULT 'discovered'::text,
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_count integer NOT NULL DEFAULT 0,
  cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  error text,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone
);

CREATE TABLE public.lead_match_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid,
  assessment_id uuid,
  match_id uuid,
  verdict text NOT NULL,
  reason_code text,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.lead_service_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  assessment_id uuid,
  lead_id uuid,
  service_slug text NOT NULL,
  rank integer NOT NULL DEFAULT 1,
  score integer NOT NULL,
  evidence_refs uuid[] NOT NULL DEFAULT '{}'::uuid[],
  reasons text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.leads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  sector text,
  city text,
  district text,
  phone text,
  website text,
  email text,
  google_place_id text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  rating numeric(2,1),
  review_count integer DEFAULT 0,
  status text DEFAULT 'new'::text,
  potential_score integer DEFAULT 0,
  ai_analysis text,
  pitch text,
  notes text,
  has_website boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  priority text DEFAULT 'normal'::text,
  score integer DEFAULT 0,
  score_breakdown jsonb DEFAULT '{}'::jsonb,
  location text,
  follow_up_date date,
  lost_reason text,
  contact_instagram text,
  contact_email text,
  contact_phone text,
  mini_audit_output text,
  pitch_draft text,
  city_slug text,
  evidence_score integer DEFAULT 0,
  fit_score integer DEFAULT 0,
  urgency_score integer DEFAULT 0,
  money_score integer DEFAULT 0,
  contactability_score integer DEFAULT 0,
  confidence numeric(4,2) DEFAULT 0,
  why_now text,
  pain_signals jsonb DEFAULT '[]'::jsonb,
  proof_points jsonb DEFAULT '[]'::jsonb,
  disqualification_reason text,
  recommended_offer_id text,
  recommended_offer_name text,
  sales_angle text,
  first_message text,
  next_best_action text,
  has_real_website boolean DEFAULT false,
  has_whatsapp boolean DEFAULT false,
  has_form boolean DEFAULT false,
  has_online_booking boolean DEFAULT false,
  has_ads_signal boolean DEFAULT false,
  instagram_as_site boolean DEFAULT false,
  enrichment_status text DEFAULT 'pending'::text,
  last_enriched_at timestamp with time zone,
  stage_entered_at timestamp with time zone,
  next_follow_up_at timestamp with time zone,
  last_contact_at timestamp with time zone,
  score_reasons jsonb DEFAULT '[]'::jsonb,
  vertical_id text,
  sector_score integer DEFAULT 0,
  firm_score integer DEFAULT 0,
  wave integer DEFAULT 0,
  quality_score integer DEFAULT 0,
  conversion_probability integer DEFAULT 0,
  money_potential_score integer DEFAULT 0,
  pain_intensity_score integer DEFAULT 0,
  agency_fit_score integer DEFAULT 0,
  confidence_score integer DEFAULT 0,
  lead_tier text,
  quality_label text,
  qualification_reasons jsonb DEFAULT '[]'::jsonb,
  conversion_angle text,
  why_this_will_convert text,
  expected_offer_value_tl integer DEFAULT 0,
  expected_monthly_value_tl integer DEFAULT 0,
  best_channel text,
  first_30_seconds_pitch text,
  objection_risks jsonb DEFAULT '[]'::jsonb,
  next_action_priority text,
  normalized_sector text,
  district_slug text,
  last_quality_scored_at timestamp with time zone,
  contacted_at timestamp with time zone,
  replied_at timestamp with time zone,
  meeting_at timestamp with time zone,
  proposal_at timestamp with time zone,
  converted_at timestamp with time zone,
  lost_at timestamp with time zone,
  base_score integer,
  risk_score integer DEFAULT 0,
  risk_reasons jsonb DEFAULT '[]'::jsonb,
  behavioral_flags jsonb DEFAULT '{}'::jsonb,
  route text,
  pain_point text,
  decision_maker text,
  budget_band text,
  has_job_signal boolean DEFAULT false,
  has_ecommerce boolean DEFAULT false,
  branch_count integer DEFAULT 1,
  archived_at timestamp with time zone,
  design_score integer,
  ai_score integer,
  primary_service_slug text,
  last_assessment_id uuid,
  last_assessed_at timestamp with time zone,
  do_not_contact boolean NOT NULL DEFAULT false,
  do_not_contact_reason text,
  retention_until timestamp with time zone
);

CREATE TABLE public.memories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  fact text NOT NULL,
  source_session_id uuid,
  importance_score integer DEFAULT 5,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.memory_embeddings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  memory_key text NOT NULL,
  embedding vector(768),
  embedding_model text NOT NULL DEFAULT 'gemini-embedding-001'::text,
  dimension integer NOT NULL DEFAULT 768,
  source_hash text NOT NULL,
  indexed_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.opportunity_intel_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  report_type text NOT NULL DEFAULT 'weekly'::text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_signals integer DEFAULT 0,
  actionable_signals integer DEFAULT 0,
  parked_signals integer DEFAULT 0,
  top_products jsonb DEFAULT '[]'::jsonb,
  summary text,
  recommendations jsonb DEFAULT '[]'::jsonb,
  sources_status jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.opportunity_jarvis_memory (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id text,
  message_type text NOT NULL DEFAULT 'insight'::text,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.opportunity_products (
  id text NOT NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'digital_product'::text,
  action_tier text NOT NULL DEFAULT 'park'::text,
  priority_order integer NOT NULL DEFAULT 99,
  status text NOT NULL DEFAULT 'idea_stage'::text,
  description text,
  target_audience text,
  price_range text,
  score_total integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.opportunity_trend_signals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source text NOT NULL,
  source_url text,
  title text NOT NULL,
  summary text,
  relevance_score integer DEFAULT 0,
  confidence_score integer DEFAULT 0,
  linked_product_id text,
  matched_topic_id uuid,
  status text NOT NULL DEFAULT 'raw'::text,
  raw_data jsonb DEFAULT '{}'::jsonb,
  collected_at timestamp with time zone DEFAULT now(),
  reviewed_at timestamp with time zone,
  signal_hash text
);

CREATE TABLE public.opportunity_trend_sources (
  id text NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  url text,
  is_active boolean DEFAULT true,
  trust_score integer DEFAULT 0,
  last_status text,
  last_checked_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.opportunity_watch_topics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  keywords text[] DEFAULT '{}'::text[],
  linked_product_id text,
  source_filter text[] DEFAULT '{}'::text[],
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.outreach_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text,
  subject text,
  body text NOT NULL,
  sequence_step integer NOT NULL DEFAULT 0,
  scheduled_at timestamp with time zone,
  sent_at timestamp with time zone,
  error text,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  original_body text,
  final_body text,
  gmail_message_id text,
  gmail_thread_id text
);

CREATE TABLE public.outreach_send_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  outreach_message_id uuid NOT NULL,
  approval_id uuid NOT NULL,
  action_digest text NOT NULL,
  rfc_message_id text NOT NULL,
  state text NOT NULL DEFAULT 'claimed'::text,
  claim_token uuid NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1,
  claimed_at timestamp with time zone NOT NULL DEFAULT now(),
  sent_at timestamp with time zone,
  provider_message_id text,
  provider_thread_id text,
  finalized boolean NOT NULL DEFAULT false,
  last_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  reconcile_search_count integer NOT NULL DEFAULT 0,
  last_searched_at timestamp with time zone
);

CREATE TABLE public.person_leads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'apollo'::text,
  purpose text NOT NULL DEFAULT 'b2b_sell'::text,
  preset_id text,
  b2b_filter_label text,
  apollo_person_id text,
  full_name text NOT NULL,
  title text,
  seniority text,
  linkedin_url text,
  email text,
  email_status text,
  phone text,
  company_name text,
  company_domain text,
  company_industry text,
  company_size text,
  city text,
  country text,
  difficulty_score integer,
  market_score integer,
  earning_score integer,
  person_score integer,
  person_tier text,
  expected_monthly_value_tl integer,
  why_now text,
  next_action text,
  status text NOT NULL DEFAULT 'new'::text,
  notes text,
  raw jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.person_scan_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  preset_id text,
  purpose text,
  fetched_count integer DEFAULT 0,
  inserted_count integer DEFAULT 0,
  duplicate_count integer DEFAULT 0,
  rejected_count integer DEFAULT 0,
  source text DEFAULT 'cron'::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.playbooks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  description text,
  setup_fee numeric(10,2) DEFAULT 0,
  monthly_fee numeric(10,2) DEFAULT 0,
  pitch_template text,
  steps text[],
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  price_min_tl integer,
  price_max_tl integer,
  price_unit text DEFAULT 'proje'::text,
  delivery_days_min integer,
  delivery_days_max integer,
  pitch_template_dm text,
  pitch_template_email text,
  pitch_template_linkedin text,
  updated_at timestamp with time zone DEFAULT now(),
  scope_items jsonb DEFAULT '[]'::jsonb,
  target_sectors jsonb DEFAULT '[]'::jsonb,
  delivery_days integer DEFAULT 7,
  monthly_income_potential integer DEFAULT 0,
  tier text DEFAULT 'Starter'::text
);

CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid,
  business_name text NOT NULL,
  status text DEFAULT 'active'::text,
  services text[],
  setup_fee numeric(10,2) DEFAULT 0,
  monthly_fee numeric(10,2) DEFAULT 0,
  currency text DEFAULT 'TRY'::text,
  start_date date,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  revenue_tl integer DEFAULT 0,
  revenue_collected boolean DEFAULT false,
  deadline date,
  service_type text,
  client_name text
);

CREATE TABLE public.run_spans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  run_id uuid,
  step_id uuid,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'internal'::text,
  status text NOT NULL DEFAULT 'ok'::text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  tokens_in integer,
  tokens_out integer,
  cost_usd numeric(12,8),
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  duration_ms integer,
  retention_until timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.run_step_dependencies (
  step_id uuid NOT NULL,
  depends_on_step_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.scan_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  sector text NOT NULL,
  city text NOT NULL,
  district text,
  source text NOT NULL DEFAULT 'manual'::text,
  inserted_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0
);

CREATE TABLE public.service_catalog (
  slug text NOT NULL,
  domain text NOT NULL,
  family text NOT NULL,
  name text NOT NULL,
  setup_price_override_tl integer,
  monthly_price_override_tl integer,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  summary text NOT NULL,
  key_facts jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL,
  value text,
  updated_at timestamp with time zone DEFAULT now(),
  agency_name text DEFAULT 'Grafikcem Agency'::text,
  monthly_revenue_target_tl integer DEFAULT 120000,
  ai_model_light text DEFAULT 'deepseek/deepseek-v4-flash'::text,
  ai_model_medium text DEFAULT 'anthropic/claude-haiku-4-5'::text,
  ai_model_heavy text DEFAULT 'deepseek/deepseek-v4-pro'::text,
  ai_monthly_budget_tl integer DEFAULT 80,
  openrouter_api_key text
);

CREATE TABLE public.skill_embeddings (
  skill_slug text NOT NULL,
  embedding vector(768),
  embedding_model text NOT NULL DEFAULT 'gemini-embedding-001'::text,
  dimension integer NOT NULL DEFAULT 768,
  source_hash text NOT NULL,
  text_indexed text,
  indexed_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.skill_versions (
  skill_slug text NOT NULL,
  version integer NOT NULL,
  manifest_md text,
  changelog text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.skills (
  slug text NOT NULL,
  team text NOT NULL,
  name text NOT NULL,
  summary text NOT NULL,
  kind text NOT NULL,
  permission_scopes text[] NOT NULL DEFAULT '{}'::text[],
  risk_level text NOT NULL,
  data_sensitivity text NOT NULL,
  input_schema jsonb NOT NULL,
  output_schema jsonb NOT NULL,
  default_model_tier text NOT NULL,
  budget_usd_max numeric(10,6) NOT NULL DEFAULT 0,
  timeout_ms integer NOT NULL DEFAULT 15000,
  eval_slug text NOT NULL,
  handler_key text,
  active boolean NOT NULL DEFAULT false,
  latest_version integer NOT NULL DEFAULT 1,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.strategy (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  field text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.suppression_list (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  address text NOT NULL,
  scope text NOT NULL DEFAULT 'email'::text,
  reason text NOT NULL,
  source text NOT NULL,
  operator text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.tool_cost_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tool text NOT NULL,
  operation text NOT NULL,
  units integer NOT NULL DEFAULT 1,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  run_id uuid,
  related_lead_id uuid,
  meta jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.tool_embeddings (
  tool_key text NOT NULL,
  embedding vector(768),
  embedding_model text NOT NULL DEFAULT 'gemini-embedding-001'::text,
  dimension integer NOT NULL DEFAULT 768,
  source_hash text NOT NULL,
  text_indexed text,
  indexed_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.tool_registry (
  key text NOT NULL,
  name text NOT NULL,
  description text,
  permission_scopes text[] NOT NULL DEFAULT '{}'::text[],
  risk_level text NOT NULL DEFAULT 'low'::text,
  data_sensitivity text NOT NULL DEFAULT 'internal'::text,
  input_schema jsonb,
  handler_key text,
  mcp_server text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- ---- CONSTRAINTLER (PK/UNIQUE/CHECK sonra FK; pg_get_constraintdef) ----
ALTER TABLE public.agent_memory ADD CONSTRAINT agent_memory_pkey PRIMARY KEY (id);
ALTER TABLE public.agent_memory ADD CONSTRAINT agent_memory_status_check CHECK ((status = ANY (ARRAY['quarantine'::text, 'active'::text, 'archived'::text, 'rejected'::text])));
ALTER TABLE public.agent_messages ADD CONSTRAINT agent_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.agent_messages ADD CONSTRAINT agent_messages_role_check CHECK ((role = ANY (ARRAY['operator'::text, 'agent'::text, 'system'::text])));
ALTER TABLE public.agent_skill_grants ADD CONSTRAINT agent_skill_grants_pkey PRIMARY KEY (agent_key, skill_slug);
ALTER TABLE public.agent_tasks ADD CONSTRAINT agent_tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.agent_tasks ADD CONSTRAINT agent_tasks_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'working'::text, 'done'::text, 'error'::text, 'blocked_on_approval'::text])));
ALTER TABLE public.agents ADD CONSTRAINT agents_archetype_chk CHECK (((archetype IS NULL) OR (archetype = ANY (ARRAY['orchestrator'::text, 'router'::text, 'executor'::text, 'specialist'::text, 'critic'::text, 'judge'::text, 'researcher'::text]))));
ALTER TABLE public.agents ADD CONSTRAINT agents_pkey PRIMARY KEY (key);
ALTER TABLE public.agents ADD CONSTRAINT agents_status_check CHECK ((status = ANY (ARRAY['idle'::text, 'waiting'::text, 'working'::text, 'error'::text])));
ALTER TABLE public.ai_cost_logs ADD CONSTRAINT ai_cost_logs_model_tier_check CHECK ((model_tier = ANY (ARRAY['light'::text, 'medium'::text, 'heavy'::text])));
ALTER TABLE public.ai_cost_logs ADD CONSTRAINT ai_cost_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.apollo_enrichments ADD CONSTRAINT apollo_enrichments_pkey PRIMARY KEY (lead_id);
ALTER TABLE public.approval_requests ADD CONSTRAINT approval_requests_data_sensitivity_check CHECK ((data_sensitivity = ANY (ARRAY['public'::text, 'internal'::text, 'confidential'::text, 'secret'::text])));
ALTER TABLE public.approval_requests ADD CONSTRAINT approval_requests_idempotency_key_key UNIQUE (idempotency_key);
ALTER TABLE public.approval_requests ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.approval_requests ADD CONSTRAINT approval_requests_risk_level_check CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));
ALTER TABLE public.approval_requests ADD CONSTRAINT approval_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text, 'executed'::text])));
ALTER TABLE public.autoresearch_runs ADD CONSTRAINT autoresearch_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.consent_records ADD CONSTRAINT consent_records_kind_check CHECK ((kind = ANY (ARRAY['opt_in'::text, 'opt_out'::text, 'notice'::text])));
ALTER TABLE public.consent_records ADD CONSTRAINT consent_records_pkey PRIMARY KEY (id);
ALTER TABLE public.council_debates ADD CONSTRAINT council_debates_pkey PRIMARY KEY (id);
ALTER TABLE public.decisions ADD CONSTRAINT decisions_pkey PRIMARY KEY (id);
ALTER TABLE public.directives ADD CONSTRAINT directives_mode_chk CHECK ((mode = ANY (ARRAY['shadow'::text, 'active'::text])));
ALTER TABLE public.directives ADD CONSTRAINT directives_pkey PRIMARY KEY (id);
ALTER TABLE public.directives ADD CONSTRAINT directives_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'planning'::text, 'running'::text, 'done'::text, 'error'::text])));
ALTER TABLE public.email_messages ADD CONSTRAINT email_messages_direction_check CHECK ((direction = ANY (ARRAY['outbound'::text, 'inbound'::text])));
ALTER TABLE public.email_messages ADD CONSTRAINT email_messages_gmail_message_id_key UNIQUE (gmail_message_id);
ALTER TABLE public.email_messages ADD CONSTRAINT email_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.email_threads ADD CONSTRAINT email_threads_gmail_thread_id_key UNIQUE (gmail_thread_id);
ALTER TABLE public.email_threads ADD CONSTRAINT email_threads_pkey PRIMARY KEY (id);
ALTER TABLE public.eval_cases ADD CONSTRAINT eval_cases_pkey PRIMARY KEY (slug);
ALTER TABLE public.eval_datasets ADD CONSTRAINT eval_datasets_pkey PRIMARY KEY (slug);
ALTER TABLE public.eval_results ADD CONSTRAINT eval_results_pkey PRIMARY KEY (id);
ALTER TABLE public.eval_runs ADD CONSTRAINT eval_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.follow_up_sequences ADD CONSTRAINT follow_up_sequences_pkey PRIMARY KEY (id);
ALTER TABLE public.follow_ups ADD CONSTRAINT follow_ups_pkey PRIMARY KEY (id);
ALTER TABLE public.follow_ups ADD CONSTRAINT follow_ups_priority_check CHECK ((priority = ANY (ARRAY['yuksek'::text, 'orta'::text, 'dusuk'::text])));
ALTER TABLE public.gmail_accounts ADD CONSTRAINT gmail_accounts_active_requires_vault CHECK (((NOT active) OR (vault_secret_id IS NOT NULL)));
ALTER TABLE public.gmail_accounts ADD CONSTRAINT gmail_accounts_email_address_key UNIQUE (email_address);
ALTER TABLE public.gmail_accounts ADD CONSTRAINT gmail_accounts_pkey PRIMARY KEY (id);
ALTER TABLE public.gmail_accounts ADD CONSTRAINT gmail_accounts_scope_allowlist CHECK ((scopes <@ ARRAY['https://www.googleapis.com/auth/gmail.send'::text, 'https://www.googleapis.com/auth/gmail.readonly'::text]));
ALTER TABLE public.hypotheses ADD CONSTRAINT hypotheses_pkey PRIMARY KEY (id);
ALTER TABLE public.job_application_drafts ADD CONSTRAINT job_application_drafts_lang_check CHECK ((lang = ANY (ARRAY['tr'::text, 'en'::text])));
ALTER TABLE public.job_application_drafts ADD CONSTRAINT job_application_drafts_pkey PRIMARY KEY (id);
ALTER TABLE public.job_listings ADD CONSTRAINT job_listings_legitimacy_check CHECK ((legitimacy = ANY (ARRAY['high'::text, 'caution'::text, 'suspicious'::text])));
ALTER TABLE public.job_listings ADD CONSTRAINT job_listings_pkey PRIMARY KEY (id);
ALTER TABLE public.job_listings ADD CONSTRAINT job_listings_status_check CHECK ((status = ANY (ARRAY['new'::text, 'evaluating'::text, 'scored'::text, 'drafted'::text, 'dismissed'::text, 'rejected'::text])));
ALTER TABLE public.job_listings ADD CONSTRAINT job_listings_url_key UNIQUE (url);
ALTER TABLE public.knowledge_docs ADD CONSTRAINT knowledge_docs_pkey PRIMARY KEY (key);
ALTER TABLE public.lead_assessments ADD CONSTRAINT lead_assessments_mode_check CHECK ((mode = ANY (ARRAY['council'::text, 'deterministic'::text])));
ALTER TABLE public.lead_assessments ADD CONSTRAINT lead_assessments_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_evidence ADD CONSTRAINT lead_evidence_kind_check CHECK ((kind = ANY (ARRAY['pagespeed'::text, 'screenshot'::text, 'html_signal'::text, 'cta_analysis'::text, 'form_analysis'::text, 'tech_stack'::text, 'review_signal'::text, 'places_data'::text])));
ALTER TABLE public.lead_evidence ADD CONSTRAINT lead_evidence_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_intel_runs ADD CONSTRAINT lead_intel_runs_mode_check CHECK ((mode = ANY (ARRAY['off'::text, 'shadow'::text, 'active'::text])));
ALTER TABLE public.lead_intel_runs ADD CONSTRAINT lead_intel_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_intel_runs ADD CONSTRAINT lead_intel_runs_run_date_key UNIQUE (run_date);
ALTER TABLE public.lead_intel_runs ADD CONSTRAINT lead_intel_runs_stage_check CHECK ((stage = ANY (ARRAY['discovered'::text, 'audited'::text, 'assessed'::text, 'done'::text, 'error'::text])));
ALTER TABLE public.lead_match_feedback ADD CONSTRAINT lead_match_feedback_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_match_feedback ADD CONSTRAINT lead_match_feedback_reason_code_check CHECK ((reason_code = ANY (ARRAY['yanlis_sektor'::text, 'zayif_kanit'::text, 'hizmet_uyumsuz'::text, 'fiyat_uyumsuz'::text, 'zaten_cozulmus'::text, 'dusuk_potansiyel'::text, 'diger'::text])));
ALTER TABLE public.lead_match_feedback ADD CONSTRAINT lead_match_feedback_verdict_check CHECK ((verdict = ANY (ARRAY['uygun'::text, 'uygun_degil'::text])));
ALTER TABLE public.lead_service_matches ADD CONSTRAINT lead_service_matches_pkey PRIMARY KEY (id);
ALTER TABLE public.leads ADD CONSTRAINT leads_google_place_id_key UNIQUE (google_place_id);
ALTER TABLE public.leads ADD CONSTRAINT leads_lost_reason_check CHECK ((lost_reason = ANY (ARRAY['fiyat'::text, 'zamanlama'::text, 'cevap_yok'::text, 'rakip'::text, 'kapsam_disi'::text, 'diger'::text])));
ALTER TABLE public.leads ADD CONSTRAINT leads_pkey PRIMARY KEY (id);
ALTER TABLE public.leads ADD CONSTRAINT leads_score_check CHECK (((score >= 0) AND (score <= 100)));
ALTER TABLE public.memories ADD CONSTRAINT memories_pkey PRIMARY KEY (id);
ALTER TABLE public.memory_embeddings ADD CONSTRAINT memory_embeddings_pkey PRIMARY KEY (id);
ALTER TABLE public.opportunity_intel_reports ADD CONSTRAINT opportunity_intel_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.opportunity_intel_reports ADD CONSTRAINT opportunity_intel_reports_report_type_check CHECK ((report_type = ANY (ARRAY['weekly'::text, 'monthly'::text, 'adhoc'::text])));
ALTER TABLE public.opportunity_jarvis_memory ADD CONSTRAINT opportunity_jarvis_memory_message_type_check CHECK ((message_type = ANY (ARRAY['insight'::text, 'question'::text, 'decision'::text, 'action'::text, 'park'::text])));
ALTER TABLE public.opportunity_jarvis_memory ADD CONSTRAINT opportunity_jarvis_memory_pkey PRIMARY KEY (id);
ALTER TABLE public.opportunity_products ADD CONSTRAINT opportunity_products_pkey PRIMARY KEY (id);
ALTER TABLE public.opportunity_trend_signals ADD CONSTRAINT opportunity_trend_signals_confidence_score_check CHECK (((confidence_score >= 0) AND (confidence_score <= 100)));
ALTER TABLE public.opportunity_trend_signals ADD CONSTRAINT opportunity_trend_signals_pkey PRIMARY KEY (id);
ALTER TABLE public.opportunity_trend_signals ADD CONSTRAINT opportunity_trend_signals_relevance_score_check CHECK (((relevance_score >= 0) AND (relevance_score <= 100)));
ALTER TABLE public.opportunity_trend_signals ADD CONSTRAINT opportunity_trend_signals_signal_hash_key UNIQUE (signal_hash);
ALTER TABLE public.opportunity_trend_signals ADD CONSTRAINT opportunity_trend_signals_status_check CHECK ((status = ANY (ARRAY['raw'::text, 'reviewed'::text, 'actionable'::text, 'parked'::text, 'dismissed'::text])));
ALTER TABLE public.opportunity_trend_sources ADD CONSTRAINT opportunity_trend_sources_pkey PRIMARY KEY (id);
ALTER TABLE public.opportunity_trend_sources ADD CONSTRAINT opportunity_trend_sources_trust_score_check CHECK (((trust_score >= 0) AND (trust_score <= 100)));
ALTER TABLE public.opportunity_watch_topics ADD CONSTRAINT opportunity_watch_topics_pkey PRIMARY KEY (id);
ALTER TABLE public.outreach_messages ADD CONSTRAINT outreach_messages_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'whatsapp'::text, 'instagram'::text, 'linkedin'::text, 'phone'::text, 'x'::text])));
ALTER TABLE public.outreach_messages ADD CONSTRAINT outreach_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.outreach_messages ADD CONSTRAINT outreach_messages_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'sent'::text, 'replied'::text, 'failed'::text])));
ALTER TABLE public.outreach_send_attempts ADD CONSTRAINT outreach_send_attempts_outreach_message_id_key UNIQUE (outreach_message_id);
ALTER TABLE public.outreach_send_attempts ADD CONSTRAINT outreach_send_attempts_pkey PRIMARY KEY (id);
ALTER TABLE public.outreach_send_attempts ADD CONSTRAINT outreach_send_attempts_state_check CHECK ((state = ANY (ARRAY['claimed'::text, 'sending'::text, 'sent'::text, 'unknown'::text, 'failed'::text, 'reconciled'::text])));
ALTER TABLE public.person_leads ADD CONSTRAINT person_leads_apollo_person_id_key UNIQUE (apollo_person_id);
ALTER TABLE public.person_leads ADD CONSTRAINT person_leads_pkey PRIMARY KEY (id);
ALTER TABLE public.person_leads ADD CONSTRAINT person_leads_purpose_check CHECK ((purpose = ANY (ARRAY['b2b_sell'::text, 'job_application'::text])));
ALTER TABLE public.person_scan_runs ADD CONSTRAINT person_scan_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.person_scan_runs ADD CONSTRAINT person_scan_runs_source_check CHECK ((source = ANY (ARRAY['cron'::text, 'manual'::text])));
ALTER TABLE public.playbooks ADD CONSTRAINT playbooks_name_key UNIQUE (name);
ALTER TABLE public.playbooks ADD CONSTRAINT playbooks_pkey PRIMARY KEY (id);
ALTER TABLE public.playbooks ADD CONSTRAINT playbooks_price_unit_check CHECK ((price_unit = ANY (ARRAY['proje'::text, 'ay'::text, 'saat'::text])));
ALTER TABLE public.projects ADD CONSTRAINT projects_pkey PRIMARY KEY (id);
ALTER TABLE public.run_spans ADD CONSTRAINT run_spans_kind_check CHECK ((kind = ANY (ARRAY['llm'::text, 'tool'::text, 'retrieval'::text, 'internal'::text, 'approval'::text])));
ALTER TABLE public.run_spans ADD CONSTRAINT run_spans_pkey PRIMARY KEY (id);
ALTER TABLE public.run_spans ADD CONSTRAINT run_spans_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'error'::text])));
ALTER TABLE public.run_step_dependencies ADD CONSTRAINT run_step_dep_no_self CHECK ((step_id <> depends_on_step_id));
ALTER TABLE public.run_step_dependencies ADD CONSTRAINT run_step_dependencies_pkey PRIMARY KEY (step_id, depends_on_step_id);
ALTER TABLE public.scan_runs ADD CONSTRAINT scan_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.scan_runs ADD CONSTRAINT scan_runs_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'jarvis'::text, 'cron'::text])));
ALTER TABLE public.service_catalog ADD CONSTRAINT service_catalog_domain_check CHECK ((domain = ANY (ARRAY['tasarim'::text, 'ai_otomasyon'::text, 'hibrit'::text])));
ALTER TABLE public.service_catalog ADD CONSTRAINT service_catalog_pkey PRIMARY KEY (slug);
ALTER TABLE public.sessions ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.settings ADD CONSTRAINT settings_key_key UNIQUE (key);
ALTER TABLE public.settings ADD CONSTRAINT settings_key_unique UNIQUE (key);
ALTER TABLE public.settings ADD CONSTRAINT settings_pkey PRIMARY KEY (id);
ALTER TABLE public.skill_embeddings ADD CONSTRAINT skill_embeddings_pkey PRIMARY KEY (skill_slug);
ALTER TABLE public.skill_versions ADD CONSTRAINT skill_versions_pkey PRIMARY KEY (skill_slug, version);
ALTER TABLE public.skills ADD CONSTRAINT skills_data_sensitivity_check CHECK ((data_sensitivity = ANY (ARRAY['public'::text, 'internal'::text, 'confidential'::text, 'secret'::text])));
ALTER TABLE public.skills ADD CONSTRAINT skills_default_model_tier_check CHECK ((default_model_tier = ANY (ARRAY['light'::text, 'medium'::text, 'heavy'::text])));
ALTER TABLE public.skills ADD CONSTRAINT skills_kind_check CHECK ((kind = ANY (ARRAY['deterministic'::text, 'llm'::text, 'composite'::text])));
ALTER TABLE public.skills ADD CONSTRAINT skills_pkey PRIMARY KEY (slug);
ALTER TABLE public.skills ADD CONSTRAINT skills_risk_level_check CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));
ALTER TABLE public.strategy ADD CONSTRAINT strategy_field_key UNIQUE (field);
ALTER TABLE public.strategy ADD CONSTRAINT strategy_pkey PRIMARY KEY (id);
ALTER TABLE public.suppression_list ADD CONSTRAINT suppression_list_pkey PRIMARY KEY (id);
ALTER TABLE public.suppression_list ADD CONSTRAINT suppression_list_scope_check CHECK ((scope = ANY (ARRAY['email'::text, 'domain'::text])));
ALTER TABLE public.tool_cost_logs ADD CONSTRAINT tool_cost_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.tool_embeddings ADD CONSTRAINT tool_embeddings_pkey PRIMARY KEY (tool_key);
ALTER TABLE public.tool_registry ADD CONSTRAINT tool_registry_data_sensitivity_check CHECK ((data_sensitivity = ANY (ARRAY['public'::text, 'internal'::text, 'confidential'::text, 'secret'::text])));
ALTER TABLE public.tool_registry ADD CONSTRAINT tool_registry_pkey PRIMARY KEY (key);
ALTER TABLE public.tool_registry ADD CONSTRAINT tool_registry_risk_level_check CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));
ALTER TABLE public.agent_memory ADD CONSTRAINT agent_memory_source_run_id_fkey FOREIGN KEY (source_run_id) REFERENCES directives(id) ON DELETE SET NULL;
ALTER TABLE public.agent_memory ADD CONSTRAINT agent_memory_source_step_id_fkey FOREIGN KEY (source_step_id) REFERENCES agent_tasks(id) ON DELETE SET NULL;
ALTER TABLE public.agent_messages ADD CONSTRAINT agent_messages_agent_key_fkey FOREIGN KEY (agent_key) REFERENCES agents(key) ON DELETE CASCADE;
ALTER TABLE public.agent_skill_grants ADD CONSTRAINT agent_skill_grants_agent_key_fkey FOREIGN KEY (agent_key) REFERENCES agents(key) ON DELETE CASCADE;
ALTER TABLE public.agent_skill_grants ADD CONSTRAINT agent_skill_grants_skill_slug_fkey FOREIGN KEY (skill_slug) REFERENCES skills(slug) ON DELETE CASCADE;
ALTER TABLE public.agent_tasks ADD CONSTRAINT agent_tasks_agent_key_fkey FOREIGN KEY (agent_key) REFERENCES agents(key) ON DELETE CASCADE;
ALTER TABLE public.agent_tasks ADD CONSTRAINT agent_tasks_directive_id_fkey FOREIGN KEY (directive_id) REFERENCES directives(id) ON DELETE CASCADE;
ALTER TABLE public.agent_tasks ADD CONSTRAINT agent_tasks_parent_step_id_fkey FOREIGN KEY (parent_step_id) REFERENCES agent_tasks(id);
ALTER TABLE public.ai_cost_logs ADD CONSTRAINT ai_cost_logs_related_lead_id_fkey FOREIGN KEY (related_lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public.ai_cost_logs ADD CONSTRAINT ai_cost_logs_related_project_id_fkey FOREIGN KEY (related_project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.apollo_enrichments ADD CONSTRAINT apollo_enrichments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public.approval_requests ADD CONSTRAINT approval_requests_run_id_fkey FOREIGN KEY (run_id) REFERENCES directives(id) ON DELETE CASCADE;
ALTER TABLE public.approval_requests ADD CONSTRAINT approval_requests_step_id_fkey FOREIGN KEY (step_id) REFERENCES agent_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.consent_records ADD CONSTRAINT consent_records_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public.email_messages ADD CONSTRAINT email_messages_outreach_message_id_fkey FOREIGN KEY (outreach_message_id) REFERENCES outreach_messages(id) ON DELETE SET NULL;
ALTER TABLE public.email_messages ADD CONSTRAINT email_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES email_threads(id) ON DELETE CASCADE;
ALTER TABLE public.email_threads ADD CONSTRAINT email_threads_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public.eval_results ADD CONSTRAINT eval_results_eval_run_id_fkey FOREIGN KEY (eval_run_id) REFERENCES eval_runs(id) ON DELETE CASCADE;
ALTER TABLE public.follow_up_sequences ADD CONSTRAINT follow_up_sequences_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public.follow_up_sequences ADD CONSTRAINT follow_up_sequences_outreach_message_id_fkey FOREIGN KEY (outreach_message_id) REFERENCES outreach_messages(id) ON DELETE SET NULL;
ALTER TABLE public.follow_ups ADD CONSTRAINT follow_ups_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public.follow_ups ADD CONSTRAINT follow_ups_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.job_application_drafts ADD CONSTRAINT job_application_drafts_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES job_listings(id) ON DELETE CASCADE;
ALTER TABLE public.lead_assessments ADD CONSTRAINT lead_assessments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public.lead_evidence ADD CONSTRAINT lead_evidence_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public.lead_match_feedback ADD CONSTRAINT lead_match_feedback_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public.lead_service_matches ADD CONSTRAINT lead_service_matches_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES lead_assessments(id) ON DELETE CASCADE;
ALTER TABLE public.memories ADD CONSTRAINT memories_source_session_id_fkey FOREIGN KEY (source_session_id) REFERENCES sessions(id);
ALTER TABLE public.opportunity_jarvis_memory ADD CONSTRAINT opportunity_jarvis_memory_product_id_fkey FOREIGN KEY (product_id) REFERENCES opportunity_products(id) ON DELETE SET NULL;
ALTER TABLE public.opportunity_trend_signals ADD CONSTRAINT opportunity_trend_signals_linked_product_id_fkey FOREIGN KEY (linked_product_id) REFERENCES opportunity_products(id) ON DELETE SET NULL;
ALTER TABLE public.opportunity_trend_signals ADD CONSTRAINT opportunity_trend_signals_matched_topic_id_fkey FOREIGN KEY (matched_topic_id) REFERENCES opportunity_watch_topics(id) ON DELETE SET NULL;
ALTER TABLE public.opportunity_watch_topics ADD CONSTRAINT opportunity_watch_topics_linked_product_id_fkey FOREIGN KEY (linked_product_id) REFERENCES opportunity_products(id) ON DELETE SET NULL;
ALTER TABLE public.outreach_messages ADD CONSTRAINT outreach_messages_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public.outreach_send_attempts ADD CONSTRAINT outreach_send_attempts_approval_id_fkey FOREIGN KEY (approval_id) REFERENCES approval_requests(id) ON DELETE RESTRICT;
ALTER TABLE public.outreach_send_attempts ADD CONSTRAINT outreach_send_attempts_outreach_message_id_fkey FOREIGN KEY (outreach_message_id) REFERENCES outreach_messages(id) ON DELETE CASCADE;
ALTER TABLE public.projects ADD CONSTRAINT projects_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id);
ALTER TABLE public.run_spans ADD CONSTRAINT run_spans_run_id_fkey FOREIGN KEY (run_id) REFERENCES directives(id) ON DELETE CASCADE;
ALTER TABLE public.run_spans ADD CONSTRAINT run_spans_step_id_fkey FOREIGN KEY (step_id) REFERENCES agent_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.run_step_dependencies ADD CONSTRAINT run_step_dependencies_depends_on_step_id_fkey FOREIGN KEY (depends_on_step_id) REFERENCES agent_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.run_step_dependencies ADD CONSTRAINT run_step_dependencies_step_id_fkey FOREIGN KEY (step_id) REFERENCES agent_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.skill_embeddings ADD CONSTRAINT skill_embeddings_skill_slug_fkey FOREIGN KEY (skill_slug) REFERENCES skills(slug) ON DELETE CASCADE;
ALTER TABLE public.skill_versions ADD CONSTRAINT skill_versions_skill_slug_fkey FOREIGN KEY (skill_slug) REFERENCES skills(slug) ON DELETE CASCADE;
ALTER TABLE public.tool_embeddings ADD CONSTRAINT tool_embeddings_tool_key_fkey FOREIGN KEY (tool_key) REFERENCES tool_registry(key) ON DELETE CASCADE;

-- ---- INDEXLER (constraint-dışı; pg_indexes.indexdef) ----
CREATE INDEX ai_cost_logs_agent_created_idx ON public.ai_cost_logs USING btree (agent_key, created_at DESC) WHERE (agent_key IS NOT NULL);
CREATE INDEX ai_cost_logs_created_at_idx ON public.ai_cost_logs USING btree (created_at);
CREATE INDEX ai_cost_logs_generation_idx ON public.ai_cost_logs USING btree (generation_id) WHERE (generation_id IS NOT NULL);
CREATE INDEX ai_cost_logs_related_lead_idx ON public.ai_cost_logs USING btree (related_lead_id, created_at DESC) WHERE (related_lead_id IS NOT NULL);
CREATE INDEX eval_results_run_idx ON public.eval_results USING btree (eval_run_id);
CREATE INDEX follow_ups_due_idx ON public.follow_ups USING btree (is_done, due_date);
CREATE INDEX idx_agent_memory_key ON public.agent_memory USING btree (memory_key);
CREATE INDEX idx_agent_memory_source_run ON public.agent_memory USING btree (source_run_id);
CREATE INDEX idx_agent_memory_source_step ON public.agent_memory USING btree (source_step_id);
CREATE INDEX idx_agent_memory_status ON public.agent_memory USING btree (status);
CREATE INDEX idx_agent_messages_agent ON public.agent_messages USING btree (agent_key, created_at DESC);
CREATE INDEX idx_agent_skill_grants_skill ON public.agent_skill_grants USING btree (skill_slug);
CREATE INDEX idx_agent_tasks_agent ON public.agent_tasks USING btree (agent_key);
CREATE INDEX idx_agent_tasks_directive ON public.agent_tasks USING btree (directive_id);
CREATE INDEX idx_agent_tasks_lease ON public.agent_tasks USING btree (status, next_run_at);
CREATE INDEX idx_agent_tasks_parent_step ON public.agent_tasks USING btree (parent_step_id);
CREATE INDEX idx_agent_tasks_status ON public.agent_tasks USING btree (status);
CREATE INDEX idx_apollo_enrichments_lead_id ON public.apollo_enrichments USING btree (lead_id);
CREATE INDEX idx_approval_requests_run ON public.approval_requests USING btree (run_id);
CREATE INDEX idx_approval_requests_status ON public.approval_requests USING btree (status, expires_at);
CREATE INDEX idx_approval_requests_step ON public.approval_requests USING btree (step_id);
CREATE INDEX idx_consent_records_address ON public.consent_records USING btree (lower(address));
CREATE INDEX idx_directives_created ON public.directives USING btree (created_at DESC);
CREATE INDEX idx_directives_status ON public.directives USING btree (status);
CREATE INDEX idx_email_messages_outreach ON public.email_messages USING btree (outreach_message_id);
CREATE INDEX idx_email_messages_thread ON public.email_messages USING btree (thread_id);
CREATE INDEX idx_email_threads_lead ON public.email_threads USING btree (lead_id);
CREATE INDEX idx_followup_due ON public.follow_up_sequences USING btree (due_at) WHERE (done = false);
CREATE INDEX idx_followup_lead ON public.follow_up_sequences USING btree (lead_id);
CREATE INDEX idx_intel_reports_period ON public.opportunity_intel_reports USING btree (period_end DESC);
CREATE INDEX idx_jarvis_memory_product ON public.opportunity_jarvis_memory USING btree (product_id);
CREATE INDEX idx_jarvis_memory_type ON public.opportunity_jarvis_memory USING btree (message_type);
CREATE INDEX idx_job_drafts_listing ON public.job_application_drafts USING btree (listing_id);
CREATE INDEX idx_job_listings_fit ON public.job_listings USING btree (fit_score DESC);
CREATE INDEX idx_job_listings_scanned ON public.job_listings USING btree (scanned_at DESC);
CREATE INDEX idx_job_listings_status ON public.job_listings USING btree (status);
CREATE INDEX idx_lead_assessments_date ON public.lead_assessments USING btree (run_date);
CREATE INDEX idx_lead_assessments_lead ON public.lead_assessments USING btree (lead_id);
CREATE INDEX idx_lead_evidence_lead ON public.lead_evidence USING btree (lead_id);
CREATE INDEX idx_lead_match_feedback_lead ON public.lead_match_feedback USING btree (lead_id);
CREATE INDEX idx_lead_service_matches_assessment ON public.lead_service_matches USING btree (assessment_id);
CREATE INDEX idx_leads_active ON public.leads USING btree (status) WHERE (status <> 'archived'::text);
CREATE INDEX idx_leads_ai_score ON public.leads USING btree (ai_score);
CREATE INDEX idx_leads_city ON public.leads USING btree (city);
CREATE INDEX idx_leads_city_slug ON public.leads USING btree (city_slug);
CREATE INDEX idx_leads_conversion_prob ON public.leads USING btree (conversion_probability DESC NULLS LAST);
CREATE INDEX idx_leads_design_score ON public.leads USING btree (design_score);
CREATE INDEX idx_leads_disqualified ON public.leads USING btree (disqualification_reason) WHERE (disqualification_reason IS NOT NULL);
CREATE INDEX idx_leads_enrichment_status ON public.leads USING btree (enrichment_status);
CREATE INDEX idx_leads_evidence_score ON public.leads USING btree (evidence_score DESC NULLS LAST);
CREATE INDEX idx_leads_google_place_id ON public.leads USING btree (google_place_id);
CREATE INDEX idx_leads_lead_tier ON public.leads USING btree (lead_tier);
CREATE INDEX idx_leads_next_action ON public.leads USING btree (next_action_priority);
CREATE INDEX idx_leads_primary_service ON public.leads USING btree (primary_service_slug);
CREATE INDEX idx_leads_quality_score ON public.leads USING btree (quality_score DESC NULLS LAST);
CREATE INDEX idx_leads_route ON public.leads USING btree (route);
CREATE INDEX idx_leads_sector ON public.leads USING btree (sector);
CREATE INDEX idx_leads_status ON public.leads USING btree (status);
CREATE INDEX idx_memory_embeddings_key ON public.memory_embeddings USING btree (memory_key);
CREATE INDEX idx_outreach_messages_lead ON public.outreach_messages USING btree (lead_id);
CREATE INDEX idx_outreach_messages_status ON public.outreach_messages USING btree (status);
CREATE INDEX idx_person_leads_company_domain ON public.person_leads USING btree (company_domain);
CREATE INDEX idx_person_leads_purpose_tier ON public.person_leads USING btree (purpose, person_tier);
CREATE INDEX idx_person_leads_score ON public.person_leads USING btree (person_score DESC);
CREATE INDEX idx_person_leads_status ON public.person_leads USING btree (status);
CREATE INDEX idx_person_scan_runs_created ON public.person_scan_runs USING btree (created_at DESC);
CREATE INDEX idx_projects_lead_id ON public.projects USING btree (lead_id);
CREATE INDEX idx_projects_status ON public.projects USING btree (status);
CREATE INDEX idx_run_spans_run ON public.run_spans USING btree (run_id);
CREATE INDEX idx_run_spans_step ON public.run_spans USING btree (step_id);
CREATE INDEX idx_run_step_deps_dependson ON public.run_step_dependencies USING btree (depends_on_step_id);
CREATE INDEX idx_scan_runs_created_at ON public.scan_runs USING btree (created_at DESC);
CREATE INDEX idx_send_attempts_state ON public.outreach_send_attempts USING btree (state) WHERE (state = ANY (ARRAY['sending'::text, 'unknown'::text]));
CREATE INDEX idx_settings_key ON public.settings USING btree (key);
CREATE INDEX idx_tool_cost_logs_tool_time ON public.tool_cost_logs USING btree (tool, created_at DESC);
CREATE INDEX idx_trend_signals_collected ON public.opportunity_trend_signals USING btree (collected_at DESC);
CREATE INDEX idx_trend_signals_confidence ON public.opportunity_trend_signals USING btree (confidence_score DESC);
CREATE INDEX idx_trend_signals_hash ON public.opportunity_trend_signals USING btree (signal_hash);
CREATE INDEX idx_trend_signals_product ON public.opportunity_trend_signals USING btree (linked_product_id);
CREATE INDEX idx_trend_signals_status ON public.opportunity_trend_signals USING btree (status);
CREATE INDEX idx_watch_topics_active ON public.opportunity_watch_topics USING btree (is_active);
CREATE UNIQUE INDEX uq_gmail_accounts_single_active ON public.gmail_accounts USING btree (active) WHERE (active = true);
CREATE UNIQUE INDEX uq_outreach_messages_gmail_message_id ON public.outreach_messages USING btree (gmail_message_id) WHERE (gmail_message_id IS NOT NULL);
CREATE UNIQUE INDEX uq_suppression_address_scope ON public.suppression_list USING btree (lower(address), scope);

-- ---- FONKSİYONLAR (App DB pg_get_functiondef çıktısı; \r normalize edilmiş) ----
CREATE OR REPLACE FUNCTION public.consent_records_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'consent_records append-only: % engellendi', TG_OP;
END $function$
;

CREATE OR REPLACE FUNCTION public.finalize_outreach_send(p_outreach_message_id uuid, p_approval_id uuid, p_claim_token uuid, p_gmail_message_id text, p_gmail_thread_id text, p_from_address text, p_to_address text, p_subject text, p_body text, p_sent_at timestamp with time zone, p_final_state text DEFAULT 'sent'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_attempt   public.outreach_send_attempts%ROWTYPE;
  v_lead_id   UUID;
  v_thread_id UUID;
  v_rows      INTEGER;
BEGIN
  IF p_final_state NOT IN ('sent','reconciled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'gecersiz_final_state');
  END IF;

  SELECT * INTO v_attempt
    FROM public.outreach_send_attempts
   WHERE outreach_message_id = p_outreach_message_id
     AND claim_token = p_claim_token
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'attempt_veya_claim_token_uyusmuyor');
  END IF;
  IF v_attempt.approval_id <> p_approval_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'approval_id_attempt_ile_uyusmuyor');
  END IF;
  IF v_attempt.finalized THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF v_attempt.state NOT IN ('sending','sent','unknown') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'finalize_gecersiz_state_' || v_attempt.state);
  END IF;

  SELECT lead_id INTO v_lead_id FROM public.outreach_messages WHERE id = p_outreach_message_id;

  UPDATE public.outreach_messages
     SET gmail_message_id = p_gmail_message_id,
         gmail_thread_id  = p_gmail_thread_id,
         final_body       = p_body,
         status           = 'sent',
         sent_at          = COALESCE(sent_at, p_sent_at),
         error            = NULL,
         updated_at       = p_sent_at
   WHERE id = p_outreach_message_id;

  INSERT INTO public.email_threads (lead_id, gmail_thread_id, subject, updated_at)
  VALUES (v_lead_id, p_gmail_thread_id, NULLIF(p_subject, ''), p_sent_at)
  ON CONFLICT (gmail_thread_id)
    DO UPDATE SET updated_at = EXCLUDED.updated_at
  RETURNING id INTO v_thread_id;

  INSERT INTO public.email_messages
    (thread_id, outreach_message_id, gmail_message_id, direction,
     from_address, to_address, subject, body, sent_at)
  VALUES
    (v_thread_id, p_outreach_message_id, p_gmail_message_id, 'outbound',
     p_from_address, p_to_address, NULLIF(p_subject, ''), p_body, p_sent_at)
  ON CONFLICT (gmail_message_id) DO NOTHING;

  UPDATE public.approval_requests
     SET status = 'executed', executed_at = p_sent_at
   WHERE id = p_approval_id AND status = 'approved';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 AND NOT EXISTS (
    SELECT 1 FROM public.approval_requests WHERE id = p_approval_id AND status = 'executed'
  ) THEN
    RAISE EXCEPTION 'approval_executed_gecisi_basarisiz (id=%)', p_approval_id;
  END IF;

  UPDATE public.outreach_send_attempts
     SET state = p_final_state,
         finalized = true,
         sent_at = COALESCE(sent_at, p_sent_at),
         provider_message_id = p_gmail_message_id,
         provider_thread_id  = p_gmail_thread_id,
         last_error = NULL,
         updated_at = now()
   WHERE id = v_attempt.id;

  RETURN jsonb_build_object('ok', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

-- ---- TRIGGERLAR ----
CREATE TRIGGER trg_consent_records_append_only BEFORE DELETE OR UPDATE ON public.consent_records FOR EACH ROW EXECUTE FUNCTION consent_records_append_only();
CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_playbooks_updated_at BEFORE UPDATE ON public.playbooks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---- VIEW'LAR (App DB pg_get_viewdef; SECURITY INVOKER — alttaki tabloların
--       e2e_open policy'si geçerli). /api/runs, run_steps, sektör analitiği okur. ----
CREATE OR REPLACE VIEW public.leads_with_status AS
 SELECT id, business_name, sector, city, district, phone, website, email,
    google_place_id, latitude, longitude, rating, review_count, status,
    potential_score, ai_analysis, pitch, notes, has_website, created_at,
    updated_at, priority, score, score_breakdown, location, follow_up_date,
    lost_reason, contact_instagram, contact_email, contact_phone,
    mini_audit_output, pitch_draft,
        CASE
            WHEN score >= 80 THEN 'yuksek'::text
            WHEN score >= 60 THEN 'iyi'::text
            WHEN score >= 40 THEN 'orta'::text
            ELSE 'dusuk'::text
        END AS score_status
   FROM leads;

CREATE OR REPLACE VIEW public.run_steps AS
 SELECT id, directive_id AS run_id, parent_step_id, agent_key, skill_slug, title,
    input, status, result, permission_scopes, risk_level, data_sensitivity,
    tokens_in, tokens_out, attempts, max_attempts, lease_owner, lease_expires_at,
    next_run_at, error, last_error, created_at, started_at, finished_at
   FROM agent_tasks;

CREATE OR REPLACE VIEW public.runs AS
 SELECT id, operator_input, intent, success_criteria, channel, mode, status,
    plan, debrief, error, budget_usd_max, cost_usd, created_at, finished_at
   FROM directives;

CREATE OR REPLACE VIEW public.sector_city_engagement_stats AS
 SELECT COALESCE(NULLIF(normalized_sector, ''::text), sector, 'bilinmeyen'::text) AS sector_key,
    COALESCE(NULLIF(city_slug, ''::text), lower(city), 'bilinmeyen'::text) AS city_key,
    count(*)::integer AS total_leads,
    count(*) FILTER (WHERE status = ANY (ARRAY['contacted'::text, 'responded'::text, 'meeting'::text, 'proposal'::text, 'converted'::text]))::integer AS engaged_leads,
    count(*) FILTER (WHERE status = 'converted'::text)::integer AS converted_leads,
    count(*) FILTER (WHERE status = 'lost'::text)::integer AS lost_leads,
    max(created_at) AS last_lead_at
   FROM leads
  GROUP BY (COALESCE(NULLIF(normalized_sector, ''::text), sector, 'bilinmeyen'::text)), (COALESCE(NULLIF(city_slug, ''::text), lower(city), 'bilinmeyen'::text));

CREATE OR REPLACE VIEW public.sector_city_engagement_stats_v2 AS
 SELECT COALESCE(NULLIF(normalized_sector, ''::text), sector, 'bilinmeyen'::text) AS sector_key,
    COALESCE(NULLIF(city_slug, ''::text), lower(city), 'bilinmeyen'::text) AS city_key,
    count(*)::integer AS total_leads,
    count(*) FILTER (WHERE status = ANY (ARRAY['responded'::text, 'meeting'::text, 'proposal'::text, 'converted'::text]))::integer AS engaged_leads,
    (count(*) FILTER (WHERE status = 'responded'::text) * 1 + count(*) FILTER (WHERE status = 'meeting'::text) * 2 + count(*) FILTER (WHERE status = 'proposal'::text) * 3 + count(*) FILTER (WHERE status = 'converted'::text) * 4)::integer AS weighted_engagement,
    count(*) FILTER (WHERE status = 'converted'::text)::integer AS converted_leads,
    count(*) FILTER (WHERE status = 'lost'::text)::integer AS lost_leads,
    max(created_at) AS last_lead_at
   FROM leads
  GROUP BY (COALESCE(NULLIF(normalized_sector, ''::text), sector, 'bilinmeyen'::text)), (COALESCE(NULLIF(city_slug, ''::text), lower(city), 'bilinmeyen'::text));

CREATE OR REPLACE VIEW public.sector_engagement_stats AS
 SELECT COALESCE(NULLIF(normalized_sector, ''::text), sector, 'bilinmeyen'::text) AS sector_key,
    count(*)::integer AS total_leads,
    count(*) FILTER (WHERE status = ANY (ARRAY['contacted'::text, 'responded'::text, 'meeting'::text, 'proposal'::text, 'converted'::text]))::integer AS engaged_leads,
    count(*) FILTER (WHERE status = 'converted'::text)::integer AS converted_leads,
    count(*) FILTER (WHERE status = 'lost'::text)::integer AS lost_leads,
    max(created_at) AS last_lead_at
   FROM leads
  GROUP BY (COALESCE(NULLIF(normalized_sector, ''::text), sector, 'bilinmeyen'::text));

CREATE OR REPLACE VIEW public.sector_engagement_stats_v2 AS
 WITH base AS (
         SELECT COALESCE(NULLIF(leads.normalized_sector, ''::text), leads.sector, 'bilinmeyen'::text) AS sector_key,
            count(*)::integer AS total_leads,
            count(*) FILTER (WHERE leads.status = ANY (ARRAY['responded'::text, 'meeting'::text, 'proposal'::text, 'converted'::text]))::integer AS engaged_leads,
            (count(*) FILTER (WHERE leads.status = 'responded'::text) * 1 + count(*) FILTER (WHERE leads.status = 'meeting'::text) * 2 + count(*) FILTER (WHERE leads.status = 'proposal'::text) * 3 + count(*) FILTER (WHERE leads.status = 'converted'::text) * 4)::integer AS weighted_engagement,
            count(*) FILTER (WHERE leads.status = 'converted'::text)::integer AS converted_leads,
            count(*) FILTER (WHERE leads.status = 'lost'::text)::integer AS lost_leads,
            max(leads.created_at) AS last_lead_at
           FROM leads
          GROUP BY (COALESCE(NULLIF(leads.normalized_sector, ''::text), leads.sector, 'bilinmeyen'::text))
        ), fb AS (
         SELECT COALESCE(NULLIF(fl.normalized_sector, ''::text), fl.sector, 'bilinmeyen'::text) AS sector_key,
            round(count(*) FILTER (WHERE f.verdict = 'uygun'::text)::numeric / count(*)::numeric, 3) AS feedback_accept_rate
           FROM lead_match_feedback f
             JOIN leads fl ON fl.id = f.lead_id
          GROUP BY (COALESCE(NULLIF(fl.normalized_sector, ''::text), fl.sector, 'bilinmeyen'::text))
        ), yields AS (
         SELECT COALESCE(NULLIF(al.normalized_sector, ''::text), al.sector, 'bilinmeyen'::text) AS sector_key,
            count(*) FILTER (WHERE COALESCE(a.design_score, 0) >= COALESCE(a.ai_score, 0))::integer AS design_yield,
            count(*) FILTER (WHERE COALESCE(a.ai_score, 0) > COALESCE(a.design_score, 0))::integer AS ai_yield
           FROM lead_assessments a
             JOIN leads al ON al.id = a.lead_id
          WHERE a.selected
          GROUP BY (COALESCE(NULLIF(al.normalized_sector, ''::text), al.sector, 'bilinmeyen'::text))
        )
 SELECT base.sector_key, base.total_leads, base.engaged_leads, base.weighted_engagement,
    base.converted_leads, base.lost_leads, base.last_lead_at, fb.feedback_accept_rate,
    COALESCE(yields.design_yield, 0) AS design_yield,
    COALESCE(yields.ai_yield, 0) AS ai_yield
   FROM base
     LEFT JOIN fb USING (sector_key)
     LEFT JOIN yields USING (sector_key);

GRANT SELECT ON public.leads_with_status, public.run_steps, public.runs,
  public.sector_city_engagement_stats, public.sector_city_engagement_stats_v2,
  public.sector_engagement_stats, public.sector_engagement_stats_v2
  TO anon, authenticated, service_role;

-- ---- RLS (parity: enabled=true) + TEST-ONLY permissive policy ----
DO $rls$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS e2e_open ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY e2e_open ON public.%I FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true)', t);
  END LOOP;
END
$rls$;

-- ---- DRIFT FINGERPRINT (read-only; App DB'de AYNI SELECT referans üretiminde kullanılır) ----
CREATE OR REPLACE FUNCTION public.e2e_schema_fingerprint()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'extensions', 'pg_catalog'
AS $e2e$
WITH cols AS (
  SELECT c.relname AS tbl,
         string_agg(
           a.attname || '|' || pg_catalog.format_type(a.atttypid, a.atttypmod) || '|' ||
           a.attnotnull::text || '|' || coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '') || '|' || a.attidentity::text,
           E'\n' ORDER BY a.attnum) AS txt
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
  WHERE c.relkind = 'r'
  GROUP BY c.relname
),
cons AS (
  SELECT rel.relname AS tbl,
         string_agg(con.conname || ' ' || pg_catalog.pg_get_constraintdef(con.oid), E'\n' ORDER BY con.conname) AS txt
  FROM pg_catalog.pg_constraint con
  JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace AND n.nspname = 'public'
  WHERE con.contype IN ('p','u','c','f')
  GROUP BY rel.relname
),
idx AS (
  SELECT i.tablename AS tbl,
         string_agg(i.indexdef, E'\n' ORDER BY i.indexname) AS txt
  FROM pg_catalog.pg_indexes i
  WHERE i.schemaname = 'public'
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c2
                    WHERE c2.conname = i.indexname AND c2.connamespace = 'public'::regnamespace)
  GROUP BY i.tablename
),
rls AS (
  SELECT c.relname AS tbl, c.relrowsecurity AS enabled
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r'
),
tables AS (
  SELECT r.tbl,
         md5(coalesce(c.txt,'') || '#' || coalesce(k.txt,'') || '#' || coalesce(x.txt,'') || '#' || r.enabled::text) AS h
  FROM rls r
  LEFT JOIN cols c ON c.tbl = r.tbl
  LEFT JOIN cons k ON k.tbl = r.tbl
  LEFT JOIN idx x ON x.tbl = r.tbl
),
views AS (
  SELECT c.relname AS vw, md5(pg_catalog.pg_get_viewdef(c.oid, true)) AS h
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind IN ('v','m')
),
fns AS (
  SELECT md5(coalesce(string_agg(replace(pg_catalog.pg_get_functiondef(p.oid), E'\r', ''), E'\n' ORDER BY p.proname), '')) AS h
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.proname NOT LIKE 'e2e\_%'
),
trg AS (
  SELECT md5(coalesce(string_agg(pg_catalog.pg_get_triggerdef(t.oid), E'\n' ORDER BY t.tgname), '')) AS h
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE NOT t.tgisinternal
)
SELECT jsonb_build_object(
  'tables', (SELECT jsonb_object_agg(tbl, h) FROM tables),
  'views', (SELECT jsonb_object_agg(vw, h) FROM views),
  'functions_md5', (SELECT h FROM fns),
  'triggers_md5', (SELECT h FROM trg)
);
$e2e$;

REVOKE ALL ON FUNCTION public.e2e_schema_fingerprint() FROM public;
GRANT EXECUTE ON FUNCTION public.e2e_schema_fingerprint() TO anon, authenticated, service_role;
