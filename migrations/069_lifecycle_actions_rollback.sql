-- 069_lifecycle_actions_rollback — App DB
--
-- ⚠️ VERİ KAYBI: `lead_lifecycle_events` içindeki tüm geçiş geçmişi ve kanıtı
-- silinir. `leads.status` ve funnel damgaları KALIR — yani lead'ler bulundukları
-- aşamada durur ama oraya NASIL geldikleri kaybolur. Bir gönderimin hangi onayla
-- yapıldığı, bir vakanın hangi izinle üretildiği bir daha gösterilemez.
--
-- Rollback öncesi: `select count(*) from lead_lifecycle_events;` — sıfır değilse
-- önce dışa aktarılmalı.
--
-- apply_lead_action() 058'deki 8 argümanlı hâline geri döner: mevcut 5 eylem
-- çalışmaya devam eder, yaşam döngüsü eylemleri REDDEDİLİR ('geçersiz aksiyon').
-- Bu bilinçli: yarım kalmış bir yaşam döngüsü, olmayan bir onayı varmış gibi
-- göstermekten iyidir.

BEGIN;

-- 1. Genişletilmiş RPC'yi düşür.
DROP FUNCTION IF EXISTS public.apply_lead_action(uuid,text,text,text,text,text,timestamptz,timestamptz,jsonb);

-- 2. 058'deki 8 argümanlı sürümü geri kur.
CREATE OR REPLACE FUNCTION public.apply_lead_action(
  p_lead_id uuid,
  p_action text,
  p_actor text,
  p_channel text,
  p_idempotency_key text default null,
  p_note text default null,
  p_later_at timestamptz default null,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead leads%rowtype;
  v_existing lead_action_audit%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_new_status text;
  v_new_follow_up timestamptz;
  v_new_notes text;
  v_stamp text;
begin
  if p_action not in ('called','no_answer','meeting','later','note') then
    return jsonb_build_object('outcome','rejected','error','geçersiz aksiyon');
  end if;
  if p_channel not in ('ui','telegram') then
    return jsonb_build_object('outcome','rejected','error','geçersiz kanal');
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from lead_action_audit where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('outcome','replayed',
        'before',v_existing.before_state,'after',v_existing.after_state);
    end if;
  end if;

  select * into v_lead from leads where id = p_lead_id for update;
  if not found then
    return jsonb_build_object('outcome','rejected','error','lead bulunamadı');
  end if;

  if (p_action = 'called'    and v_lead.status not in ('new','contacted','responded'))
  or (p_action = 'no_answer' and v_lead.status not in ('new','contacted','responded'))
  or (p_action = 'meeting'   and v_lead.status not in ('new','contacted','responded','meeting'))
  or (p_action = 'later'     and v_lead.status not in ('new','contacted','responded','meeting'))
  or (p_action = 'note'      and v_lead.status not in ('new','contacted','responded','meeting','proposal'))
  then
    return jsonb_build_object('outcome','rejected',
      'error', format('geçersiz geçiş: %s → %s', v_lead.status, p_action));
  end if;

  v_new_status := v_lead.status;
  v_new_follow_up := v_lead.next_follow_up_at;
  v_new_notes := v_lead.notes;

  if p_action = 'called' then
    if v_lead.status = 'new' then v_new_status := 'contacted'; end if;
    v_new_follow_up := p_now + interval '3 days';
  elsif p_action = 'no_answer' then
    v_new_follow_up := p_now + interval '1 day';
  elsif p_action = 'meeting' then
    v_new_status := 'meeting';
    v_new_follow_up := p_now + interval '1 day';
  elsif p_action = 'later' then
    if p_later_at is null or p_later_at <= p_now then
      return jsonb_build_object('outcome','rejected','error','laterAt gelecekte olmalı');
    end if;
    v_new_follow_up := p_later_at;
  elsif p_action = 'note' then
    if p_note is null or btrim(p_note) = '' then
      return jsonb_build_object('outcome','rejected','error','note boş olamaz');
    end if;
    v_stamp := to_char(p_now at time zone 'UTC', 'YYYY-MM-DD HH24:MI');
    v_new_notes := coalesce(v_lead.notes || E'\n', '') ||
                   format('[%s %s] %s', v_stamp, p_channel, btrim(p_note));
  end if;

  v_before := jsonb_build_object('status', v_lead.status, 'next_follow_up_at', v_lead.next_follow_up_at);
  v_after  := jsonb_build_object('status', v_new_status,  'next_follow_up_at', v_new_follow_up);

  update leads set
    status = v_new_status,
    next_follow_up_at = v_new_follow_up,
    last_contact_at = case when p_action in ('called','no_answer','meeting') then p_now else last_contact_at end,
    notes = v_new_notes,
    updated_at = p_now
  where id = p_lead_id;

  insert into lead_action_audit
      (lead_id, action, actor, channel, idempotency_key, before_state, after_state, note)
    values
      (p_lead_id, p_action, p_actor, p_channel, p_idempotency_key, v_before, v_after, p_note);

  return jsonb_build_object('outcome','applied','before',v_before,'after',v_after);
exception
  when unique_violation then
    select * into v_existing from lead_action_audit where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('outcome','replayed',
        'before',v_existing.before_state,'after',v_existing.after_state);
    end if;
    raise;
end
$$;

REVOKE ALL ON FUNCTION public.apply_lead_action(uuid,text,text,text,text,text,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_lead_action(uuid,text,text,text,text,text,timestamptz,timestamptz) TO service_role;

-- 3. CHECK'leri 057'deki dar kümeye geri al.
--    ÖNCE tabloyu temizlemek GEREKEBİLİR: yeni eylemlerle yazılmış audit
--    satırları dar CHECK'i ihlal eder ve ALTER patlar. Bilinçli olarak
--    otomatik silmiyoruz — hangi satırların gideceğini operatör görmeli.
DO $restore_checks$
DECLARE
  offending int;
BEGIN
  SELECT count(*) INTO offending
    FROM public.lead_action_audit
   WHERE action NOT IN ('called','no_answer','meeting','later','note')
      OR channel NOT IN ('ui','telegram');

  IF offending > 0 THEN
    RAISE EXCEPTION
      'lead_action_audit içinde % satır yeni eylem/kanal taşıyor. Dar CHECK geri '
      'konulamaz. Önce bu satırları dışa aktarıp silin:  '
      'select * from lead_action_audit where action not in '
      '(''called'',''no_answer'',''meeting'',''later'',''note'') '
      'or channel not in (''ui'',''telegram'');', offending;
  END IF;

  ALTER TABLE public.lead_action_audit DROP CONSTRAINT IF EXISTS lead_action_audit_action_chk;
  ALTER TABLE public.lead_action_audit DROP CONSTRAINT IF EXISTS lead_action_audit_channel_chk;

  ALTER TABLE public.lead_action_audit
    ADD CONSTRAINT lead_action_audit_action_check
    CHECK (action IN ('called','no_answer','meeting','later','note'));
  ALTER TABLE public.lead_action_audit
    ADD CONSTRAINT lead_action_audit_channel_check
    CHECK (channel IN ('ui','telegram'));
END
$restore_checks$;

-- 4. Olay tablosu EN SON — RPC artık ona yazmıyor.
DROP INDEX IF EXISTS public.lead_lifecycle_events_lead_idx;
DROP INDEX IF EXISTS public.lead_lifecycle_events_action_idx;
DROP TABLE IF EXISTS public.lead_lifecycle_events;

COMMIT;
