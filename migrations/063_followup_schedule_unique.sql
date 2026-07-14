-- ─────────────────────────────────────────────────────────────────────────────
-- 063_followup_schedule_unique — App DB (FINALIZATION Faz 3)
--
-- ⚠ CANLIYA UYGULANMADI — kullanıcı onayı bekliyor. İzole E2E test DB'sine
--   KALICI uygulanır.
--
-- Amaç: eşzamanlı iki schedule çağrısının AYNI lead'e iki açık sekans yazması
-- (check-then-insert yarışı) DB seviyesinde imkânsız olsun. Kısmi UNIQUE:
-- (lead_id, step) WHERE done = false. Kod tarafı 23505'i idempotent
-- "alreadyScheduled" olarak işler (sequences.ts).
--
-- Deterministik ön-temizlik (059 kalıbı): mevcut çift açık (lead_id, step)
-- satırlarından yalnız EN YENİSİ açık kalır — eşit created_at için id tie-break
-- (yeniden koşumda aynı sonuç).
--
-- Risk: DÜŞÜK (index + temizlik yalnız duplicate açık adımları kapatır).
-- Rollback: 063_followup_schedule_unique_rollback.sql
-- ─────────────────────────────────────────────────────────────────────────────

with ranked as (
  select id,
         row_number() over (
           partition by lead_id, step
           order by created_at desc nulls last, id desc
         ) as rn
  from public.follow_up_sequences
  where done = false
)
update public.follow_up_sequences f
set done = true
from ranked r
where f.id = r.id and r.rn > 1;

create unique index if not exists follow_up_sequences_open_step_uniq
  on public.follow_up_sequences (lead_id, step)
  where done = false;
