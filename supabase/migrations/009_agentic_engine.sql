-- Migration 009: Agentic Engine
-- Multi-agent orchestration layer: a CEO/Orchestrator routes operator directives
-- into tasks executed by specialist agents. Tables: agents (registry), directives
-- (operator commands), agent_tasks (work queue), agent_messages (chat history).

-- 1. Agents registry — one row per specialist. model + system_prompt are editable
--    here so the operator can re-tune or upgrade a model without a code change.
CREATE TABLE IF NOT EXISTS agents (
  key TEXT PRIMARY KEY,                 -- 'ceo', 'researcher', 'cmo', 'sales_rep', 'dev', 'data_analyst'
  name TEXT NOT NULL,
  role TEXT NOT NULL,                   -- short label: 'Command Layer', 'Revenue Ops', ...
  description TEXT,
  model TEXT NOT NULL,                  -- OpenRouter model id
  system_prompt TEXT NOT NULL DEFAULT '',
  tools TEXT[] DEFAULT '{}',            -- tool names this agent may call
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'waiting', 'working', 'error')),
  sort_order INTEGER NOT NULL DEFAULT 99,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Directives — high-level commands given to the CEO/Orchestrator.
CREATE TABLE IF NOT EXISTS directives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_input TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'planning', 'running', 'done', 'error')),
  plan JSONB,                           -- CEO decomposition: [{agent_key, title, input}]
  debrief TEXT,                         -- final operator-facing summary
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_directives_status ON directives(status);
CREATE INDEX IF NOT EXISTS idx_directives_created ON directives(created_at DESC);

-- 3. Agent tasks — the work queue. A tick worker (cron or persistent) processes
--    'queued' tasks and records telemetry (tokens) and result.
CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  directive_id UUID REFERENCES directives(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL REFERENCES agents(key) ON DELETE CASCADE,
  title TEXT NOT NULL,
  input JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'working', 'done', 'error')),
  result JSONB,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent ON agent_tasks(agent_key);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_directive ON agent_tasks(directive_id);

-- 4. Agent messages — operator <-> agent chat history (Sureflow "chat with an agent").
CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key TEXT NOT NULL REFERENCES agents(key) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('operator', 'agent', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_agent ON agent_messages(agent_key, created_at DESC);

-- 5. Per-agent_key column on the existing AI cost log for telemetry attribution.
ALTER TABLE ai_cost_logs ADD COLUMN IF NOT EXISTS agent_key TEXT;

-- 6. Seed the 6 agents. Models are intentionally cost-conscious (monthly cap $20);
--    upgrade any agent's model from the DB without touching code. System prompts
--    are concise here; the runtime injects knowledge files (context, pricing,
--    sales framework) at call time.
INSERT INTO agents (key, name, role, description, model, tools, sort_order) VALUES
  ('ceo', 'CEO', 'Command Layer',
   'Operatör direktifini alt görevlere böler, uzman ajanlara dağıtır ve operatöre özet (debrief) döner.',
   'deepseek/deepseek-v4-pro',
   ARRAY['get_quality_leads','daily_call_list','get_opportunity_status'], 1),

  ('researcher', 'Researcher', 'Intel Gatherer',
   'Pazar sinyalleri, sektör fırsatları ve lead keşfi yapar; araştırma brifingleri üretir.',
   'google/gemini-2.5-flash-lite',
   ARRAY['scan_leads','get_sector_opportunities','get_trend_signals','get_turkey_gaps','find_lead_by_name'], 2),

  ('cmo', 'CMO', 'Market Voice',
   'Stratejiyi içerik açılarına, kampanyalara ve yayına hazır taslaklara dönüştürür.',
   'anthropic/claude-haiku-4-5',
   ARRAY['build_carousel_brief','build_visual_prompt'], 3),

  ('sales_rep', 'Sales Rep', 'Revenue Ops',
   'Lead niteler, outreach ve görüşme scripti yazar (danışmanlık satış çerçevesi), takip fırsatlarını izler.',
   'anthropic/claude-haiku-4-5',
   ARRAY['get_quality_leads','generate_call_pitch_by_name','explain_conversion_by_name','draft_email','draft_proposal','update_lead_stage'], 4),

  ('dev', 'Dev', 'Build System',
   'Dashboard, entegrasyon ve scriptleri kurar; teknik değişiklikleri doğrular.',
   'deepseek/deepseek-v4-pro',
   ARRAY[]::TEXT[], 5),

  ('data_analyst', 'Data Analyst', 'Signal Layer',
   'Performans, trend ve operasyonel sinyal kalitesini analiz eder; funnel ve niş raporları çıkarır.',
   'google/gemini-2.5-flash-lite',
   ARRAY['get_opportunity_status','get_trend_signals'], 6)
ON CONFLICT (key) DO NOTHING;
