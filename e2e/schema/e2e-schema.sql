-- E2E TEST DB şeması (proje: agencyos-e2e / luhvfbujwnlnpnoelzhg — canlı App DB DEĞİL).
-- Canlı App DB'den 2026-07-12'de DDL-çıkarımıyla üretildi (pg_attribute/pg_constraint).
-- Kapsam: Playwright suite + /bugun kokpitinin dokunduğu çekirdek tablolar.
-- Bilinçli sapmalar:
--   * approval_requests.run_id/step_id FK'ları YOK (directives/agent_tasks test DB'de yok; kolonlar duruyor).
--   * settings'teki duplicate UNIQUE (settings_key_key + settings_key_unique) TEKE indirildi.
--   * RLS eklenmedi — test DB'ye yalnız service-role erişir; anon key client'a hiç verilmez.
-- Idempotent: IF NOT EXISTS / OR REPLACE.

BEGIN;

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  sector TEXT, city TEXT, district TEXT, phone TEXT, website TEXT, email TEXT,
  google_place_id TEXT UNIQUE,
  latitude NUMERIC(10,7), longitude NUMERIC(10,7), rating NUMERIC(2,1),
  review_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'new',
  potential_score INTEGER DEFAULT 0,
  ai_analysis TEXT, pitch TEXT, notes TEXT,
  has_website BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
  priority TEXT DEFAULT 'normal',
  score INTEGER DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  score_breakdown JSONB DEFAULT '{}'::jsonb,
  location TEXT, follow_up_date DATE,
  lost_reason TEXT CHECK (lost_reason = ANY (ARRAY['fiyat','zamanlama','cevap_yok','rakip','kapsam_disi','diger'])),
  contact_instagram TEXT, contact_email TEXT, contact_phone TEXT,
  mini_audit_output TEXT, pitch_draft TEXT, city_slug TEXT,
  evidence_score INTEGER DEFAULT 0, fit_score INTEGER DEFAULT 0, urgency_score INTEGER DEFAULT 0,
  money_score INTEGER DEFAULT 0, contactability_score INTEGER DEFAULT 0,
  confidence NUMERIC(4,2) DEFAULT 0, why_now TEXT,
  pain_signals JSONB DEFAULT '[]'::jsonb, proof_points JSONB DEFAULT '[]'::jsonb,
  disqualification_reason TEXT, recommended_offer_id TEXT, recommended_offer_name TEXT,
  sales_angle TEXT, first_message TEXT, next_best_action TEXT,
  has_real_website BOOLEAN DEFAULT false, has_whatsapp BOOLEAN DEFAULT false,
  has_form BOOLEAN DEFAULT false, has_online_booking BOOLEAN DEFAULT false,
  has_ads_signal BOOLEAN DEFAULT false, instagram_as_site BOOLEAN DEFAULT false,
  enrichment_status TEXT DEFAULT 'pending', last_enriched_at TIMESTAMPTZ,
  stage_entered_at TIMESTAMPTZ, next_follow_up_at TIMESTAMPTZ, last_contact_at TIMESTAMPTZ,
  score_reasons JSONB DEFAULT '[]'::jsonb, vertical_id TEXT,
  sector_score INTEGER DEFAULT 0, firm_score INTEGER DEFAULT 0, wave INTEGER DEFAULT 0,
  quality_score INTEGER DEFAULT 0, conversion_probability INTEGER DEFAULT 0,
  money_potential_score INTEGER DEFAULT 0, pain_intensity_score INTEGER DEFAULT 0,
  agency_fit_score INTEGER DEFAULT 0, confidence_score INTEGER DEFAULT 0,
  lead_tier TEXT, quality_label TEXT, qualification_reasons JSONB DEFAULT '[]'::jsonb,
  conversion_angle TEXT, why_this_will_convert TEXT,
  expected_offer_value_tl INTEGER DEFAULT 0, expected_monthly_value_tl INTEGER DEFAULT 0,
  best_channel TEXT, first_30_seconds_pitch TEXT, objection_risks JSONB DEFAULT '[]'::jsonb,
  next_action_priority TEXT, normalized_sector TEXT, district_slug TEXT,
  last_quality_scored_at TIMESTAMPTZ, contacted_at TIMESTAMPTZ, replied_at TIMESTAMPTZ,
  meeting_at TIMESTAMPTZ, proposal_at TIMESTAMPTZ, converted_at TIMESTAMPTZ, lost_at TIMESTAMPTZ,
  base_score INTEGER, risk_score INTEGER DEFAULT 0, risk_reasons JSONB DEFAULT '[]'::jsonb,
  behavioral_flags JSONB DEFAULT '{}'::jsonb, route TEXT,
  pain_point TEXT, decision_maker TEXT, budget_band TEXT,
  has_job_signal BOOLEAN DEFAULT false, has_ecommerce BOOLEAN DEFAULT false,
  branch_count INTEGER DEFAULT 1, archived_at TIMESTAMPTZ,
  design_score INTEGER, ai_score INTEGER, primary_service_slug TEXT,
  last_assessment_id UUID, last_assessed_at TIMESTAMPTZ,
  do_not_contact BOOLEAN NOT NULL DEFAULT false, do_not_contact_reason TEXT, retention_until TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_active ON leads(status) WHERE status <> 'archived';
CREATE INDEX IF NOT EXISTS idx_leads_next_action ON leads(next_action_priority);

CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  agency_name TEXT DEFAULT 'Grafikcem Agency',
  monthly_revenue_target_tl INTEGER DEFAULT 120000,
  ai_model_light TEXT, ai_model_medium TEXT, ai_model_heavy TEXT,
  ai_monthly_budget_tl INTEGER DEFAULT 80,
  openrouter_api_key TEXT
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID, step_id UUID,
  permission_scopes TEXT[] NOT NULL DEFAULT '{}',
  risk_level TEXT NOT NULL DEFAULT 'medium' CHECK (risk_level = ANY (ARRAY['low','medium','high','critical'])),
  data_sensitivity TEXT NOT NULL DEFAULT 'internal' CHECK (data_sensitivity = ANY (ARRAY['public','internal','confidential','secret'])),
  action TEXT NOT NULL,
  action_digest TEXT NOT NULL,
  redacted_preview TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending','approved','rejected','expired','executed'])),
  approved_digest TEXT, decided_at TIMESTAMPTZ, decided_by TEXT, executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status, expires_at);

CREATE TABLE IF NOT EXISTS outreach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel = ANY (ARRAY['email','whatsapp','instagram','linkedin','phone','x'])),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status = ANY (ARRAY['draft','approved','sent','replied','failed'])),
  subject TEXT,
  body TEXT NOT NULL,
  sequence_step INTEGER NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ, sent_at TIMESTAMPTZ, error TEXT, created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
  original_body TEXT, final_body TEXT, gmail_message_id TEXT, gmail_thread_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_status ON outreach_messages(status);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_lead ON outreach_messages(lead_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_outreach_messages_gmail_message_id
  ON outreach_messages(gmail_message_id) WHERE gmail_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  gmail_thread_id TEXT UNIQUE,
  subject TEXT, last_history_id TEXT, last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_threads_lead ON email_threads(lead_id);

CREATE TABLE IF NOT EXISTS email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES email_threads(id) ON DELETE CASCADE,
  outreach_message_id UUID REFERENCES outreach_messages(id) ON DELETE SET NULL,
  gmail_message_id TEXT UNIQUE,
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction = ANY (ARRAY['outbound','inbound'])),
  from_address TEXT, to_address TEXT, subject TEXT,
  in_reply_to TEXT, references_header TEXT, body TEXT, sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_messages_thread ON email_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_outreach ON email_messages(outreach_message_id);

CREATE TABLE IF NOT EXISTS outreach_send_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_message_id UUID NOT NULL UNIQUE REFERENCES outreach_messages(id) ON DELETE CASCADE,
  approval_id UUID NOT NULL REFERENCES approval_requests(id) ON DELETE RESTRICT,
  action_digest TEXT NOT NULL,
  rfc_message_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'claimed' CHECK (state = ANY (ARRAY['claimed','sending','sent','unknown','failed','reconciled'])),
  claim_token UUID NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ, provider_message_id TEXT, provider_thread_id TEXT,
  finalized BOOLEAN NOT NULL DEFAULT false,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reconcile_search_count INTEGER NOT NULL DEFAULT 0,
  last_searched_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_send_attempts_state ON outreach_send_attempts(state)
  WHERE state IN ('sending','unknown');

CREATE TABLE IF NOT EXISTS suppression_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'email' CHECK (scope = ANY (ARRAY['email','domain'])),
  reason TEXT NOT NULL,
  source TEXT NOT NULL,
  operator TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppression_address_scope ON suppression_list(lower(address), scope);

CREATE TABLE IF NOT EXISTS gmail_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_address TEXT NOT NULL UNIQUE,
  vault_secret_id UUID,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  watch_expires_at TIMESTAMPTZ, last_history_id TEXT,
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gmail_accounts_scope_allowlist CHECK (
    scopes <@ ARRAY['https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.readonly']::text[]
  ),
  CONSTRAINT gmail_accounts_active_requires_vault CHECK (NOT active OR vault_secret_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gmail_accounts_single_active ON gmail_accounts(active) WHERE active = true;

CREATE TABLE IF NOT EXISTS follow_up_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  outreach_message_id UUID REFERENCES outreach_messages(id) ON DELETE SET NULL,
  step INTEGER NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  due_at TIMESTAMPTZ NOT NULL,
  done BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_followup_due ON follow_up_sequences(due_at) WHERE done = false;
CREATE INDEX IF NOT EXISTS idx_followup_lead ON follow_up_sequences(lead_id);

-- finalize_outreach_send — mig 054+056 birleşik güncel gövde.
CREATE OR REPLACE FUNCTION finalize_outreach_send(
  p_outreach_message_id UUID,
  p_approval_id         UUID,
  p_claim_token         UUID,
  p_gmail_message_id    TEXT,
  p_gmail_thread_id     TEXT,
  p_from_address        TEXT,
  p_to_address          TEXT,
  p_subject             TEXT,
  p_body                TEXT,
  p_sent_at             TIMESTAMPTZ,
  p_final_state         TEXT DEFAULT 'sent'
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = ''
AS $$
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
$$;

COMMIT;
