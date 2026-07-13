-- Rollback for 061_proposals.
drop table if exists public.proposal_events;
drop table if exists public.proposal_approvals;
drop table if exists public.proposal_versions;
drop table if exists public.proposals;
