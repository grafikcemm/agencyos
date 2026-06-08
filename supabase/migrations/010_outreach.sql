-- Migration 010: Outreach engine — email delivery (Resend) + follow-up sequences.
-- Email = real send (operator-approved only). WhatsApp/Instagram = draft + manual send.

-- 1. Outreach messages — one row per drafted/sent message across channels. Email
--    is the only channel sent automatically (and only after operator approval);
--    whatsapp/instagram rows are drafted here and dispatched manually.
CREATE TABLE IF NOT EXISTS outreach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'instagram')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent', 'replied', 'failed')),
  subject TEXT,
  body TEXT NOT NULL,
  sequence_step INTEGER NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_by TEXT,                       -- agent_key or 'operator'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outreach_messages_status ON outreach_messages(status);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_lead ON outreach_messages(lead_id);

-- 2. Follow-up sequences — scheduled next steps for a lead. A cron worker promotes
--    rows whose due_at has passed into queued agent_tasks, then marks them done.
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

-- Partial index: the cron worker only ever scans pending (not done) rows by due_at.
CREATE INDEX IF NOT EXISTS idx_followup_due ON follow_up_sequences(due_at) WHERE done = false;
CREATE INDEX IF NOT EXISTS idx_followup_lead ON follow_up_sequences(lead_id);
