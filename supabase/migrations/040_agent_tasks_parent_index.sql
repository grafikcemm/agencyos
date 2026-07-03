-- Migration 040 — agent_tasks.parent_step_id covering index (performance advisor).
-- Supabase performance advisor'ın 038 sonrası bildirdiği eksik FK indeksi. Prod'da
-- parent_step_id henüz kullanılmıyor → deploy blokörü DEĞİL; sonraki additive batch
-- ile uygulanır. Idempotent + additive; tek atomik işlem.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_agent_tasks_parent_step
  ON public.agent_tasks(parent_step_id);

COMMIT;
