-- ─────────────────────────────────────────────────────────────────────────────
-- 054: At-most-once Gmail gönderim state machine (Faz 2 — audit bulgu #2)
--
-- Problem: Supabase REST zinciriyle read-then-update yarışa açık; iki eşzamanlı
-- istek iki provider çağrısı yapabilir; provider-success + DB-failure sonrası
-- retry duplicate mail üretebilir.
--
-- Çözüm:
--  1. outreach_send_attempts — outreach_message_id UNIQUE: claim = atomik INSERT.
--     İkinci istek 23505 alır, provider'a ASLA ulaşamaz.
--  2. Durum geçişleri CAS (UPDATE ... WHERE state='x' AND claim_token='t') —
--     tek atomik SQL statement, yarışa kapalı.
--  3. finalize_outreach_send() — provider başarısı SONRASI tüm kalıcı kayıt
--     (outreach_messages + email_threads + email_messages + approval executed +
--     attempt finalize) TEK transaction'da. Yarıda kalırsa attempt.finalized=false
--     kalır ve idempotent tekrar-çalıştırılabilir (provider'a dokunmadan).
--  4. rfc_message_id — deterministik RFC 2822 Message-ID; belirsiz sonuç
--     (timeout/5xx) sonrası gmail.readonly aramasıyla reconciliation ankrajı.
--
-- Ortak desen: additive + idempotent · RLS + REVOKE (service-role-only) ·
-- NOTIFY pgrst. SADECE App DB (dfedeh…).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS outreach_send_attempts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE = at-most-once çekirdeği: bir outreach için tek claim satırı.
  outreach_message_id  UUID NOT NULL UNIQUE REFERENCES outreach_messages(id) ON DELETE CASCADE,
  approval_id          UUID NOT NULL REFERENCES approval_requests(id) ON DELETE RESTRICT,
  action_digest        TEXT NOT NULL,
  -- Deterministik Message-ID header'ı (reconciliation ankrajı).
  rfc_message_id       TEXT NOT NULL,
  state                TEXT NOT NULL DEFAULT 'claimed'
                       CHECK (state IN ('claimed','sending','sent','unknown','failed','reconciled')),
  claim_token          UUID NOT NULL,
  attempt_count        INTEGER NOT NULL DEFAULT 1,
  claimed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at              TIMESTAMPTZ,
  provider_message_id  TEXT,
  provider_thread_id   TEXT,
  -- finalize_outreach_send başarıyla bitti mi (kalıcı kayıt tamam mı)?
  finalized            BOOLEAN NOT NULL DEFAULT false,
  last_error           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_send_attempts_state ON outreach_send_attempts(state)
  WHERE state IN ('sending','unknown');

ALTER TABLE outreach_send_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON outreach_send_attempts FROM anon, authenticated;

-- ── Tek-transaction finalize ─────────────────────────────────────────────────
-- Provider başarısından SONRA çağrılır. Idempotent: finalized=true ise no-op.
-- approval 'approved'→'executed' geçişi başarısızsa (ve zaten executed değilse)
-- exception → tüm transaction geri alınır → attempt tekrar finalize edilebilir.
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

  -- approved → executed tek geçiş; sonucu YOKSAYILMAZ (audit bulgu #2).
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

-- Doğrulama (SQL Editor):
--   SELECT state, count(*) FROM outreach_send_attempts GROUP BY 1;
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'finalize_outreach_send';
