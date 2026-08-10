-- 069_lifecycle_actions — App DB
--
-- ⚠️ MANUEL UYGULANIR. 068_niche_targeting'DEN SONRA.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- NE GETİRİR
--   1. lead_lifecycle_events   — append-only olay akışı (RLS + UNIQUE)
--   2. leads.status            — üç yeni terminal durum
--   3. lead_action_audit       — action CHECK'i yeni eylemlerle genişletilir
--   4. apply_lead_action()     — 15 yeni eylem, kanıt kapıları, damga yazımı
--
-- ─────────────────────────────────────────────────────────────────────────────
-- NEDEN AYRI BİR `lifecycle_stage` SÜTUNU YOK
--
-- Sistemde zaten üç şey var: `leads.status`, funnel zaman damgaları (mig 012) ve
-- `lead_action_audit` (mig 057). Yanlarına bağımsız bir `lifecycle_stage` sütunu
-- koymak DÖRDÜNCÜ bir doğruluk kaynağı yaratırdı: hangisi doğru olduğunda
-- diğerleri sessizce yalan söyler.
--
-- Bunun yerine:
--   • `leads.status` TEK yazılabilir durum alanı olarak kalır
--   • `lead_lifecycle_events` her geçişi kanıtıyla birlikte APPEND-ONLY yazar
--   • UI'daki 13 aşamalı görünüm bu akışın TEK PROJEKSİYONUdur
--     (src/lib/leads/lifecycleProjection.ts)
--
-- Damgalar (contacted_at, replied_at, …) geçişle AYNI TRANSACTION içinde yazılır;
-- "durum ilerledi ama damga yazılmadı" durumu yapısal olarak imkânsız.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- GERİ UYUM — BOZULMAYACAK OLANLAR
--
-- Mevcut 5 eylem (called / no_answer / meeting / later / note) DAVRANIŞI DEĞİŞMEZ:
-- aynı geçiş matrisi, aynı follow-up aritmetiği, aynı not damgası, aynı
-- idempotency ve replay semantiği. Yalnız yanlarına yeni eylemler eklenir ve
-- bunlar ayrıca lifecycle olayı yazar. Mevcut çağrı yerleri (UI + Telegram)
-- değişiklik gerektirmez.
--
-- `lead_action_audit.action` CHECK'i genişletilmezse yeni eylemler audit
-- yazamaz ve RPC patlar — bu yüzden CHECK burada yeniden kurulur.
--
-- Idempotent: yeniden çalıştırmak güvenlidir.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Olay akışı tablosu
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.lead_lifecycle_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_status     text,
  to_status       text NOT NULL,
  action          text NOT NULL,
  -- Geçişi haklı çıkaran kanıt: URL, onay kimliği, gmail message id…
  -- Serbest jsonb; kanıt ZORUNLULUĞU RPC içinde denetlenir (aşağıda).
  evidence        jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor           text NOT NULL,
  channel         text NOT NULL CHECK (channel IN ('ui', 'telegram', 'system', 'cron')),
  -- YAPISAL idempotency: aynı anahtarla ikinci olay INSERT edilemez.
  -- NULL'a izin verilir (anahtarsız çağrı), NULL'lar çakışmaz.
  idempotency_key text UNIQUE,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_lifecycle_events_lead_idx
  ON public.lead_lifecycle_events (lead_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS lead_lifecycle_events_action_idx
  ON public.lead_lifecycle_events (action, occurred_at DESC);

-- RLS: bu migration KENDİ tablosunu kendisi kilitler. Başka bir migration'ın
-- vaktinde çalışmış olmasına güvenmez (bkz. life-002'nin tek seferlik DO bloğu
-- sorunu — sonradan yaratılan tabloyu kapsamıyordu).
ALTER TABLE public.lead_lifecycle_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_lifecycle_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_lifecycle_events TO service_role;
-- Policy YOK + RLS açık = anon/authenticated için tam red. service_role hem
-- RLS'i baypas eder hem de Data API için gerekli açık tablo yetkisine sahiptir.

-- Uygulanmış RLS'i sessizce varsaymak yerine doğrula.
DO $verify_rls$
DECLARE
  rls_on boolean;
  pol_count int;
BEGIN
  SELECT relrowsecurity INTO rls_on
    FROM pg_class WHERE oid = 'public.lead_lifecycle_events'::regclass;
  SELECT count(*) INTO pol_count
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lead_lifecycle_events';

  IF NOT rls_on THEN
    RAISE EXCEPTION 'lead_lifecycle_events üzerinde RLS açılamadı';
  END IF;
  IF pol_count > 0 THEN
    RAISE EXCEPTION
      'lead_lifecycle_events üzerinde % policy var; permissive policy anon erişimi açar', pol_count;
  END IF;
END
$verify_rls$;

COMMENT ON TABLE public.lead_lifecycle_events IS
  'Append-only lead yaşam döngüsü olayları. UI''daki aşama görünümü bu akışın '
  'TEK projeksiyonudur; bağımsız bir lifecycle_stage sütunu YOKTUR.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. leads.status — yeni terminal durumlar
--    `status` TEXT (mig 001, CHECK'siz). Kapalı küme burada da dayatılmaz:
--    mevcut veride beklenmedik bir değer varsa migration'ı patlatmak yerine
--    projeksiyon `bilinmiyor` gösterir. Ama BEKLENEN küme belgelenir.
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN public.leads.status IS
  'Beklenen küme: new, contacted, responded, meeting, proposal, converted, '
  'lost, waiting, disqualified, suppressed, archived. TEK yazılabilir durum '
  'alanı — yalnız apply_lead_action() üzerinden değişir.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. lead_action_audit.action CHECK'i genişlet
--    Genişletilmezse yeni eylemler audit'e yazılamaz ve RPC transaction'ı
--    komple geri alınır.
-- ═══════════════════════════════════════════════════════════════════════════

DO $audit_chk$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
    FROM pg_constraint
   WHERE conrelid = 'public.lead_action_audit'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%action%'
   LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.lead_action_audit DROP CONSTRAINT %I', con_name);
  END IF;

  ALTER TABLE public.lead_action_audit
    ADD CONSTRAINT lead_action_audit_action_chk CHECK (action IN (
      -- mevcut 5 — davranışları değişmedi
      'called', 'no_answer', 'meeting', 'later', 'note',
      -- yaşam döngüsü
      'verify_signal', 'qualify', 'enrich_contact', 'compliance_check',
      'draft', 'request_approval', 'send', 'reply',
      'convert', 'onboard', 'produce_case', 'grow',
      -- olumsuz sonuçlar — modellenmesi ZORUNLU
      'disqualify', 'suppress', 'archive'
    ));
END
$audit_chk$;

-- `channel` da genişletilmeli: cron ve sistem tetiklemeleri artık olay yazıyor.
DO $audit_channel$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
    FROM pg_constraint
   WHERE conrelid = 'public.lead_action_audit'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%channel%'
   LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.lead_action_audit DROP CONSTRAINT %I', con_name);
  END IF;

  ALTER TABLE public.lead_action_audit
    ADD CONSTRAINT lead_action_audit_channel_chk
    CHECK (channel IN ('ui', 'telegram', 'system', 'cron'));
END
$audit_channel$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. apply_lead_action() — genişletilmiş
--
--    İMZA DEĞİŞMEDİ. Mevcut çağrı yerleri (UI + Telegram) aynen çalışır.
--    `p_evidence` YENİ ve VARSAYILANI '{}' — eski çağrılar bozulmaz.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.apply_lead_action(
  p_lead_id uuid,
  p_action text,
  p_actor text,
  p_channel text,
  p_idempotency_key text default null,
  p_note text default null,
  p_later_at timestamptz default null,
  p_now timestamptz default now(),
  p_evidence jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead      leads%rowtype;
  v_existing  lead_action_audit%rowtype;
  v_before    jsonb;
  v_after     jsonb;
  v_new_status text;
  v_new_follow_up timestamptz;
  v_new_notes text;
  v_stamp     text;
  v_lifecycle boolean := false;
begin
  if p_action not in (
    'called','no_answer','meeting','later','note',
    'verify_signal','qualify','enrich_contact','compliance_check',
    'draft','request_approval','send','reply',
    'convert','onboard','produce_case','grow',
    'disqualify','suppress','archive'
  ) then
    return jsonb_build_object('outcome','rejected','error','geçersiz aksiyon');
  end if;

  if p_channel not in ('ui','telegram','system','cron') then
    return jsonb_build_object('outcome','rejected','error','geçersiz kanal');
  end if;

  v_lifecycle := p_action not in ('called','no_answer','meeting','later','note');

  -- Idempotent replay (yalnız key verildiyse). DEĞİŞMEDİ.
  if p_idempotency_key is not null then
    select * into v_existing from lead_action_audit where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('outcome','replayed',
        'before',v_existing.before_state,'after',v_existing.after_state);
    end if;
  end if;

  -- Satır kilidi: eşzamanlı aksiyonlar sıralanır; geçiş kontrolü kilit ALTINDA.
  select * into v_lead from leads where id = p_lead_id for update;
  if not found then
    return jsonb_build_object('outcome','rejected','error','lead bulunamadı');
  end if;

  -- ── MEVCUT 5 EYLEMİN GEÇİŞ MATRİSİ — BİREBİR KORUNDU ────────────────────
  if (p_action = 'called'    and v_lead.status not in ('new','contacted','responded'))
  or (p_action = 'no_answer' and v_lead.status not in ('new','contacted','responded'))
  or (p_action = 'meeting'   and v_lead.status not in ('new','contacted','responded','meeting'))
  or (p_action = 'later'     and v_lead.status not in ('new','contacted','responded','meeting'))
  or (p_action = 'note'      and v_lead.status not in ('new','contacted','responded','meeting','proposal'))
  then
    return jsonb_build_object('outcome','rejected',
      'error', format('geçersiz geçiş: %s → %s', v_lead.status, p_action));
  end if;

  -- ── TERMİNAL DURUM KİLİDİ ───────────────────────────────────────────────
  -- Kapanmış bir lead ilerletilemez; yalnız arşivlenebilir.
  if v_lead.status in ('suppressed','archived')
     and p_action not in ('archive','note') then
    return jsonb_build_object('outcome','rejected',
      'error', format('terminal durum: %s — yalnız arşiv veya not', v_lead.status));
  end if;

  -- ── KANIT KAPILARI — transaction içinde, atlanamaz ──────────────────────
  if p_action = 'verify_signal' then
    if v_lead.evidence_urls is null
       or jsonb_array_length(coalesce(v_lead.evidence_urls, '[]'::jsonb)) = 0 then
      return jsonb_build_object('outcome','rejected',
        'error','kanıt kapısı: evidence_urls boş — sinyal doğrulanamaz');
    end if;
    if v_lead.verified_at is null and (p_evidence ->> 'verified_at') is null then
      return jsonb_build_object('outcome','rejected',
        'error','kanıt kapısı: verified_at yok');
    end if;

  elsif p_action = 'compliance_check' then
    if coalesce(p_evidence ->> 'lawful_basis', v_lead.lawful_basis) is null then
      return jsonb_build_object('outcome','rejected',
        'error','uyum kapısı: lawful_basis tanımsız');
    end if;
    if coalesce(p_evidence ->> 'suppression_status', v_lead.suppression_status, 'unknown')
       not in ('clear') then
      return jsonb_build_object('outcome','rejected',
        'error','uyum kapısı: suppression durumu clear değil');
    end if;

  elsif p_action = 'send' then
    -- Gönderim, onay kimliği VE gerçek mesaj kimliği olmadan kaydedilemez.
    -- Bu, "gönderdim" diyen ama kanıtı olmayan bir durumu imkânsız kılar.
    if (p_evidence ->> 'approval_id') is null then
      return jsonb_build_object('outcome','rejected',
        'error','gönderim kapısı: approval_id yok — insan onayı zorunlu');
    end if;
    if (p_evidence ->> 'gmail_message_id') is null then
      return jsonb_build_object('outcome','rejected',
        'error','gönderim kapısı: gmail_message_id yok');
    end if;

  elsif p_action = 'convert' then
    if (p_evidence ->> 'conversion_kind') is null then
      return jsonb_build_object('outcome','rejected',
        'error','dönüşüm kapısı: conversion_kind yok (meeting|paid_entry|core|retainer)');
    end if;

  elsif p_action = 'produce_case' then
    if (p_evidence ->> 'client_consent') is distinct from 'true' then
      return jsonb_build_object('outcome','rejected',
        'error','vaka kapısı: müşteri izni (client_consent) olmadan vaka üretilemez');
    end if;
  end if;

  v_new_status    := v_lead.status;
  v_new_follow_up := v_lead.next_follow_up_at;
  v_new_notes     := v_lead.notes;

  -- ── MEVCUT DAVRANIŞ — BİREBİR ───────────────────────────────────────────
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

  -- ── YENİ YAŞAM DÖNGÜSÜ EYLEMLERİ ────────────────────────────────────────
  -- Bunların çoğu `status`'ü DEĞİŞTİRMEZ; ilerlemeyi olay akışı taşır.
  -- Yalnız gerçekten huni aşaması değiştiren eylemler status'e dokunur.
  elsif p_action = 'send' then
    if v_lead.status = 'new' then v_new_status := 'contacted'; end if;
    v_new_follow_up := p_now + interval '4 days';   -- araştırma: 4. ve 10. gün
  elsif p_action = 'reply' then
    v_new_status := 'responded';
  elsif p_action = 'convert' then
    v_new_status := case p_evidence ->> 'conversion_kind'
                      when 'meeting' then 'meeting'
                      else 'converted'
                    end;
  elsif p_action = 'onboard' then
    v_new_status := 'converted';
  elsif p_action = 'disqualify' then
    v_new_status := 'disqualified';
    v_new_follow_up := null;
  elsif p_action = 'suppress' then
    v_new_status := 'suppressed';
    v_new_follow_up := null;
  elsif p_action = 'archive' then
    v_new_status := 'archived';
    v_new_follow_up := null;
  end if;

  v_before := jsonb_build_object('status', v_lead.status, 'next_follow_up_at', v_lead.next_follow_up_at);
  v_after  := jsonb_build_object('status', v_new_status,  'next_follow_up_at', v_new_follow_up);

  -- ── TEK UPDATE: durum + damgalar + uyum, AYNI TRANSACTION ───────────────
  update leads set
    status = v_new_status,
    next_follow_up_at = v_new_follow_up,
    last_contact_at = case
      when p_action in ('called','no_answer','meeting','send') then p_now
      else last_contact_at end,
    notes = v_new_notes,

    -- funnel damgaları — ilk kez oluşumda yazılır, geriye dönük ezilmez
    contacted_at = case
      when p_action in ('called','send') and contacted_at is null then p_now
      else contacted_at end,
    replied_at = case
      when p_action = 'reply' and replied_at is null then p_now
      else replied_at end,
    meeting_at = case
      when (p_action = 'meeting'
            or (p_action = 'convert' and p_evidence ->> 'conversion_kind' = 'meeting'))
           and meeting_at is null then p_now
      else meeting_at end,
    converted_at = case
      when p_action in ('convert','onboard')
           and coalesce(p_evidence ->> 'conversion_kind', 'core') <> 'meeting'
           and converted_at is null then p_now
      else converted_at end,
    lost_at = case
      when p_action in ('disqualify','suppress') and lost_at is null then p_now
      else lost_at end,
    archived_at = case
      when p_action = 'archive' and archived_at is null then p_now
      else archived_at end,

    -- kanıt kapısından geçen değerler kalıcılaşır
    verified_at = case
      when p_action = 'verify_signal'
      then coalesce((p_evidence ->> 'verified_at')::timestamptz, verified_at, p_now)
      else verified_at end,
    lawful_basis = case
      when p_action = 'compliance_check'
      then coalesce(p_evidence ->> 'lawful_basis', lawful_basis)
      else lawful_basis end,
    suppression_status = case
      when p_action = 'suppress' then 'suppressed'
      when p_action = 'compliance_check'
      then coalesce(p_evidence ->> 'suppression_status', suppression_status)
      else suppression_status end,
    contact_status = case
      when p_action = 'enrich_contact'
      then coalesce(p_evidence ->> 'contact_status', contact_status)
      else contact_status end,

    updated_at = p_now
  where id = p_lead_id;

  insert into lead_action_audit
      (lead_id, action, actor, channel, idempotency_key, before_state, after_state, note)
    values
      (p_lead_id, p_action, p_actor, p_channel, p_idempotency_key, v_before, v_after, p_note);

  -- Olay akışı yalnız yaşam döngüsü eylemleri için. Mevcut 5 eylem olay
  -- yazmaz — geriye dönük olay akışı uydurmak, olmayan bir geçmiş üretirdi.
  if v_lifecycle then
    insert into lead_lifecycle_events
        (lead_id, from_status, to_status, action, evidence, actor, channel,
         idempotency_key, occurred_at)
      values
        (p_lead_id, v_lead.status, v_new_status, p_action, coalesce(p_evidence, '{}'::jsonb),
         p_actor, p_channel,
         case when p_idempotency_key is null then null else p_idempotency_key || ':lc' end,
         p_now);
  end if;

  return jsonb_build_object('outcome','applied','before',v_before,'after',v_after,
                            'lifecycle', v_lifecycle);
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

-- Eski 8-argümanlı imza artık 9-argümanlıyla gölgelenir. İkisinin birlikte
-- yaşaması "function is not unique" hatası ÜRETMEZ (argüman sayısı farklı),
-- ancak eski sürümü bırakmak iki farklı davranışın canlıda olması demektir.
DROP FUNCTION IF EXISTS public.apply_lead_action(uuid,text,text,text,text,text,timestamptz,timestamptz);

REVOKE ALL ON FUNCTION public.apply_lead_action(uuid,text,text,text,text,text,timestamptz,timestamptz,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_lead_action(uuid,text,text,text,text,text,timestamptz,timestamptz,jsonb) TO service_role;

COMMIT;
