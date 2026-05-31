-- Agency OS — Migration 002: Playbooks enrichment
-- Run this in Supabase SQL Editor AFTER 001

ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS scope_items jsonb DEFAULT '[]';
ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS target_sectors jsonb DEFAULT '[]';
ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS delivery_days int DEFAULT 7;
ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS monthly_income_potential int DEFAULT 0;
ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS tier text DEFAULT 'Starter';
