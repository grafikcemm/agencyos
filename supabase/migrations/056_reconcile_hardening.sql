-- ─────────────────────────────────────────────────────────────────────────────
-- 056: Reconciliation sertleştirme (Faz 7.1 — residual audit)
--
-- 1. outreach_send_attempts: reconcile_search_count + last_searched_at —
--    tek bir "not found" araması attempt'i failed yapamaz; en az
--    MIN_RECONCILE_SEARCHES arama + grace period + operatör onayı gerekir
--    (Gmail eventual-consistency: yeni gönderilen mail aramada gecikebilir).
-- 2. finalize_outreach_send: p_approval_id, attempt.approval_id ile DB
--    seviyesinde doğrulanır — yanlış onay id'siyle finalize YAPISAL imkânsız.
--
-- Additive + idempotent. SADECE App DB.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE outreach_send_attempts
  ADD COLUMN IF NOT EXISTS reconcile_search_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_searched_at TIMESTAMPTZ;

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
  -- 056: onay kimliği attempt'e bağlanan onayla birebir eşleşmeli.
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

REVOKE ALL ON FUNCTION finalize_outreach_send(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT)
  FROM anon, authenticated, public;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Doğrulama:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='outreach_send_attempts' AND column_name IN ('reconcile_search_count','last_searched_at');
