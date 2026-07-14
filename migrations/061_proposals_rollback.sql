-- Rollback for 061_proposals (v2 — tx RPC + approvals→versions FK dahil).
drop function if exists public.request_proposal_approval_tx(uuid, text, timestamptz);
drop function if exists public.decide_proposal_approval_tx(uuid, integer, text, text, uuid, timestamptz);
drop function if exists public.create_proposal_version_tx(uuid, uuid, jsonb, text, text, text, text, uuid[], text, timestamptz);
drop table if exists public.proposal_events;
drop table if exists public.proposal_approvals;
drop table if exists public.proposal_versions;
drop table if exists public.proposals;
