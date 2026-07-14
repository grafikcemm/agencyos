-- ─────────────────────────────────────────────────────────────────────────────
-- 061_proposals v3 — App DB (Faz 3.2 → FINALIZATION Faz 4)
--
-- ⚠ UYGULANMADI — kullanıcı onayı bekliyor. Onay sonrası App + test DB birlikte.
--
-- Amaç: teklif client memory'de YAŞAMAZ — durable, versiyonlu, onay-kapılı:
--   proposals (kimlik + durum) → proposal_versions (içerik snapshot'ları,
--   kalite dijestiyle) → proposal_approvals (HITL; gönderim ancak onayla) →
--   proposal_events (accepted/rejected/expired/viewed izi — attribution).
-- Kullanıcı onayı olmadan gönderim YOK: send yolu approval satırı ister
-- (uygulama katmanı + bu şema birlikte zorlar).
--
-- Risk: DÜŞÜK — yalnız YENİ tablolar (additive). Rollback: 061_proposals_rollback.sql
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','review','approved','sent','accepted','rejected','expired')),
  current_version integer not null default 1,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  version integer not null,
  offer_summary jsonb not null default '{}'::jsonb, -- hizmetler + kapsam + timeline + fiyat
  whatsapp_text text,
  email_subject text,
  email_body text,
  quality_digest text, -- outbound gate dijesti (Faz 1.3 formülü)
  evidence_ids uuid[] not null default '{}',
  rationale text,
  created_at timestamptz not null default now(),
  unique (proposal_id, version)
);

create table if not exists public.proposal_approvals (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  version integer not null,
  decision text not null default 'pending' check (decision in ('pending','approved','rejected')),
  decided_at timestamptz,
  action_digest text not null, -- içerik+kalite+alıcı bağlı digest (değişirse geçersiz)
  created_at timestamptz not null default now(),
  unique (proposal_id, version),
  -- Sprint-3 Faz 5.6: onay yalnız GERÇEKTEN VAR OLAN versiyona bağlanabilir.
  foreign key (proposal_id, version)
    references public.proposal_versions (proposal_id, version) on delete cascade
);

create table if not exists public.proposal_events (
  id bigint generated always as identity primary key,
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  version integer,
  event text not null check (event in ('created','revised','approved','sent','viewed','accepted','rejected','expired','followup_scheduled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Sprint-3 Faz 5.2: teklif + versiyon + event TEK transaction — version insert
-- düşerse current_version İLERLEMEZ (atomiklik DB'de).
create or replace function public.create_proposal_version_tx(
  p_lead_id uuid,
  p_contact_id uuid,
  p_offer_summary jsonb,
  p_whatsapp_text text,
  p_email_subject text,
  p_email_body text,
  p_quality_digest text,
  p_evidence_ids uuid[],
  p_rationale text,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal_id uuid;
  v_version integer;
begin
  select id, current_version + 1 into v_proposal_id, v_version
    from proposals
   where lead_id = p_lead_id and status in ('draft','review','approved')
   order by created_at desc limit 1
   for update;

  if v_proposal_id is null then
    insert into proposals (lead_id, contact_id, status, current_version, updated_at)
      values (p_lead_id, p_contact_id, 'draft', 1, p_now)
      returning id into v_proposal_id;
    v_version := 1;
  end if;

  insert into proposal_versions
      (proposal_id, version, offer_summary, whatsapp_text, email_subject,
       email_body, quality_digest, evidence_ids, rationale)
    values
      (v_proposal_id, v_version, coalesce(p_offer_summary, '{}'::jsonb), p_whatsapp_text,
       p_email_subject, p_email_body, p_quality_digest, coalesce(p_evidence_ids, '{}'), p_rationale);

  update proposals
     set current_version = v_version, status = 'draft', contact_id = p_contact_id, updated_at = p_now
   where id = v_proposal_id;

  insert into proposal_events (proposal_id, version, event, metadata)
    values (v_proposal_id, v_version,
            case when v_version = 1 then 'created' else 'revised' end,
            jsonb_build_object('atomic', true));

  return jsonb_build_object('ok', true, 'proposal_id', v_proposal_id, 'version', v_version);
end
$$;

revoke all on function public.create_proposal_version_tx(uuid, uuid, jsonb, text, text, text, text, uuid[], text, timestamptz) from public;
grant execute on function public.create_proposal_version_tx(uuid, uuid, jsonb, text, text, text, text, uuid[], text, timestamptz) to service_role;


-- FINALIZATION Faz 4: onay İSTEĞİ tek transaction — approval insert (idempotent)
-- + draft→review geçişi + event. Digest TS tarafında hesaplanıp verilir.
create or replace function public.request_proposal_approval_tx(
  p_proposal_id uuid,
  p_action_digest text,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_version integer;
begin
  select status, current_version into v_status, v_version
    from proposals where id = p_proposal_id for update;
  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'teklif bulunamadı');
  end if;
  if v_status not in ('draft','review') then
    return jsonb_build_object('ok', false, 'error', 'bu durumda onay istenemez: ' || v_status);
  end if;
  if not exists (select 1 from proposal_versions where proposal_id = p_proposal_id and version = v_version) then
    return jsonb_build_object('ok', false, 'error', 'versiyon bulunamadı — onay bağlanamaz');
  end if;

  insert into proposal_approvals (proposal_id, version, decision, action_digest)
    values (p_proposal_id, v_version, 'pending', p_action_digest)
    on conflict (proposal_id, version) do nothing;
  if not found then
    -- Aynı versiyona ikinci istek: idempotent (yeni satır/geçiş yok).
    return jsonb_build_object('ok', true, 'version', v_version, 'idempotent', true);
  end if;

  if v_status = 'draft' then
    update proposals set status = 'review', updated_at = p_now where id = p_proposal_id;
  end if;

  insert into proposal_events (proposal_id, version, event, metadata)
    values (p_proposal_id, v_version, 'revised',
            jsonb_build_object('approval_requested', true, 'atomic', true));
  return jsonb_build_object('ok', true, 'version', v_version);
end
$$;

revoke all on function public.request_proposal_approval_tx(uuid, text, timestamptz) from public;
grant execute on function public.request_proposal_approval_tx(uuid, text, timestamptz) to service_role;

-- FINALIZATION Faz 4: onay KARARI tek transaction — 'approved' YALNIZ buradan:
-- pending onay satırı + versiyon hâlâ current + digest birebir + alıcı snapshot
-- eşleşmesi; karar + durum + event atomik.
create or replace function public.decide_proposal_approval_tx(
  p_proposal_id uuid,
  p_version integer,
  p_decision text,
  p_expected_digest text,
  p_contact_id uuid,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_current integer;
  v_contact uuid;
  v_approval_id uuid;
  v_decision text;
  v_digest text;
begin
  if p_decision not in ('approved','rejected') then
    return jsonb_build_object('ok', false, 'error', 'geçersiz karar: ' || coalesce(p_decision, 'null'));
  end if;

  select status, current_version, contact_id into v_status, v_current, v_contact
    from proposals where id = p_proposal_id for update;
  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'teklif bulunamadı');
  end if;

  select id, decision, action_digest into v_approval_id, v_decision, v_digest
    from proposal_approvals
   where proposal_id = p_proposal_id and version = p_version
   for update;
  if v_approval_id is null then
    return jsonb_build_object('ok', false, 'error', 'onay kaydı yok — onaysız approved geçişi yapılamaz');
  end if;
  if v_decision <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'onay zaten karara bağlı: ' || v_decision);
  end if;
  if v_current <> p_version then
    return jsonb_build_object('ok', false, 'error',
      'onay ' || p_version || '. versiyona ait; teklif ' || v_current || '. versiyonda — YENİDEN onay gerekir');
  end if;
  if v_digest <> p_expected_digest then
    return jsonb_build_object('ok', false, 'error',
      'içerik/alıcı onaydan sonra değişti (digest uyuşmazlığı) — YENİDEN onay gerekir');
  end if;
  if v_contact is distinct from p_contact_id then
    return jsonb_build_object('ok', false, 'error', 'alıcı onaydan sonra değişti — YENİDEN onay gerekir');
  end if;

  update proposal_approvals set decision = p_decision, decided_at = p_now where id = v_approval_id;
  update proposals
     set status = case when p_decision = 'approved' then 'approved' else 'rejected' end,
         updated_at = p_now
   where id = p_proposal_id;
  insert into proposal_events (proposal_id, version, event, metadata)
    values (p_proposal_id, p_version, p_decision, jsonb_build_object('via', 'proposal_approval_tx'));
  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.decide_proposal_approval_tx(uuid, integer, text, text, uuid, timestamptz) from public;
grant execute on function public.decide_proposal_approval_tx(uuid, integer, text, text, uuid, timestamptz) to service_role;

create index if not exists proposals_lead_idx on public.proposals (lead_id, created_at desc);
create index if not exists proposal_events_idx on public.proposal_events (proposal_id, created_at desc);

alter table public.proposals enable row level security;
alter table public.proposal_versions enable row level security;
alter table public.proposal_approvals enable row level security;
alter table public.proposal_events enable row level security;
revoke all on public.proposals, public.proposal_versions, public.proposal_approvals, public.proposal_events
  from anon, authenticated;
grant select, insert, update on public.proposals, public.proposal_versions, public.proposal_approvals to service_role;
-- Legacy telafi yolu (yeni teklif + versiyon yazılamadı → satır geri alınır):
grant delete on public.proposals to service_role;
grant select, insert on public.proposal_events to service_role;
