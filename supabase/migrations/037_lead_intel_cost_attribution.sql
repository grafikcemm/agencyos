-- Migration 037: Lead Intelligence cost attribution.
-- Keep the specialist identity stable in agent_key and store the concrete lead
-- relation separately. This makes per-agent telemetry aggregatable while still
-- allowing per-lead cost investigations.

ALTER TABLE public.ai_cost_logs
  ADD COLUMN IF NOT EXISTS related_lead_id uuid;

CREATE INDEX IF NOT EXISTS ai_cost_logs_related_lead_idx
  ON public.ai_cost_logs (related_lead_id, created_at DESC)
  WHERE related_lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_cost_logs_agent_created_idx
  ON public.ai_cost_logs (agent_key, created_at DESC)
  WHERE agent_key IS NOT NULL;

INSERT INTO public.agents
  (key, name, role, description, model, system_prompt, tools, sort_order)
VALUES
  (
    'lead_intel_design_critic',
    'Design Critic',
    'Lead Intelligence',
    'Web sitesi ve marka varlıklarındaki doğrulanabilir tasarım fırsatlarını değerlendirir.',
    'google/gemini-2.5-flash-lite',
    '',
    ARRAY[]::text[],
    20
  ),
  (
    'lead_intel_automation_analyst',
    'Automation Analyst',
    'Lead Intelligence',
    'Lead yanıtı, randevu, takip ve operasyon süreçlerindeki otomasyon fırsatlarını değerlendirir.',
    'google/gemini-2.5-flash-lite',
    '',
    ARRAY[]::text[],
    21
  ),
  (
    'lead_intel_skeptic',
    'Skeptic',
    'Lead Intelligence',
    'Tasarım ve otomasyon iddialarını kanıta karşı doğrular; abartılı çıkarımları eler.',
    'google/gemini-2.5-flash-lite',
    '',
    ARRAY[]::text[],
    22
  ),
  (
    'lead_intel_chair',
    'Council Chair',
    'Lead Intelligence',
    'Uzman çıktıları ile hizmet eşleşmelerinden nihai, kanıta bağlı fırsat kararını üretir.',
    'anthropic/claude-haiku-4-5',
    '',
    ARRAY[]::text[],
    23
  )
ON CONFLICT (key) DO NOTHING;
