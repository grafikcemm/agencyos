-- ─────────────────────────────────────────────────────────────────────────────
-- 060_convert_lead_to_project — App DB (Faz 3.1)
--
-- ⚠ UYGULANMADI — kullanıcı onayı bekliyor. Onay sonrası App DB + test DB'ye
--   BİRLİKTE uygulanır (şema-parite).
--
-- Amaç: "Projeye Dönüştür" GERÇEK ve ATOMİK olsun:
--   project INSERT + leads.status='converted' + audit (revenue attribution
--   kaydı) TEK transaction. Eşzamanlı iki tık TEK proje üretir (partial
--   unique index). Proje oluşmadan "dönüştü" DENMEZ.
--
-- Not: lead_action_audit.action CHECK kümesine 'convert' eklenir (superset —
--   mevcut satırlar etkilenmez, geriye uyumlu).
-- Risk: DÜŞÜK — yeni index + constraint superset + yeni fonksiyon.
-- Rollback: 060_convert_lead_to_project_rollback.sql
-- ─────────────────────────────────────────────────────────────────────────────

create unique index if not exists projects_lead_unique
  on public.projects (lead_id) where lead_id is not null;

alter table public.lead_action_audit
  drop constraint if exists lead_action_audit_action_check;
alter table public.lead_action_audit
  add constraint lead_action_audit_action_check
  check (action in ('called','no_answer','meeting','later','note','convert'));

create or replace function public.convert_lead_to_project(
  p_lead_id uuid,
  p_actor text,
  p_channel text default 'ui',
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead leads%rowtype;
  v_project_id uuid;
  v_existing uuid;
begin
  select * into v_lead from leads where id = p_lead_id for update;
  if not found then
    return jsonb_build_object('outcome','rejected','error','lead bulunamadı');
  end if;

  select id into v_existing from projects where lead_id = p_lead_id limit 1;
  if v_existing is not null then
    return jsonb_build_object('outcome','already','project_id',v_existing);
  end if;

  if v_lead.status in ('lost','archived') then
    return jsonb_build_object('outcome','rejected',
      'error', format('geçersiz geçiş: %s → convert', v_lead.status));
  end if;

  insert into projects (lead_id, business_name, client_name, status, monthly_fee, currency, start_date, notes)
    values (
      p_lead_id,
      coalesce(v_lead.business_name, '—'),
      v_lead.business_name,
      'active',
      v_lead.expected_monthly_value_tl,
      'TRY',
      (p_now at time zone 'UTC')::date,
      'Lead dönüşümü (kokpit)'
    )
    returning id into v_project_id;

  update leads set status = 'converted', updated_at = p_now where id = p_lead_id;

  -- Revenue attribution izi: audit satırı proje kimliğini taşır.
  insert into lead_action_audit (lead_id, action, actor, channel, before_state, after_state, note)
    values (
      p_lead_id, 'convert', p_actor, p_channel,
      jsonb_build_object('status', v_lead.status),
      jsonb_build_object('status','converted','project_id',v_project_id,
                         'expected_monthly_value_tl', v_lead.expected_monthly_value_tl),
      null
    );

  return jsonb_build_object('outcome','created','project_id',v_project_id);
exception
  when unique_violation then
    select id into v_existing from projects where lead_id = p_lead_id limit 1;
    return jsonb_build_object('outcome','already','project_id',v_existing);
end
$$;

revoke all on function public.convert_lead_to_project(uuid,text,text,timestamptz) from public;
grant execute on function public.convert_lead_to_project(uuid,text,text,timestamptz) to service_role;
grant select, insert, update on public.projects to service_role;
