-- ─────────────────────────────────────────────────────────────────────────────
-- 062_claim_evidence — App DB (Sprint-3 Faz 3)
--
-- ⚠ UYGULANMADI — kullanıcı onayı bekliyor (App DB migration pazarlıksız sınır).
--   Kod bu şema olmadan da çalışır: eşleme üretim anında outbound gate'e
--   verilir (doğrulama AUTHORITATIVE olarak gate'te); kalıcı iz yalnız bu tablo
--   canlıyken yazılır (yazılamazsa response'ta claimPersisted:false görünür).
--
-- Amaç: taslak/teklif üzerindeki HER somut iddianın hangi kanıta dayandığının
-- KALICI, denetlenebilir izi: iddia metni + evidence bağı + kanıt türü/kaynağı
-- + doğrulama zamanı. Regülasyon/itiraz durumunda "bu cümle neye dayanıyordu"
-- sorusunun cevabı DB'dedir.
--
-- Risk: DÜŞÜK — yalnız yeni tablo (additive). Rollback: 062_claim_evidence_rollback.sql
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.outreach_claim_evidence (
  id uuid primary key default gen_random_uuid(),
  -- İddianın yaşadığı yüzey: taslak (outreach_messages) ve/veya teklif versiyonu.
  outreach_message_id uuid references public.outreach_messages(id) on delete cascade,
  proposal_version_id uuid, -- FK, 061 canlı olduğunda eklenir (aşağıda koşullu)
  claim_text text not null check (char_length(claim_text) <= 500),
  evidence_id uuid not null references public.lead_evidence(id) on delete cascade,
  evidence_type text, -- lead_evidence.kind snapshot'ı (kaynak değişirse iz kalır)
  evidence_source text, -- ör. 'website_scan', 'google_reviews', 'manual'
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint claim_surface_required check (
    outreach_message_id is not null or proposal_version_id is not null
  )
);

create index if not exists outreach_claim_evidence_msg_idx
  on public.outreach_claim_evidence (outreach_message_id);
create index if not exists outreach_claim_evidence_evidence_idx
  on public.outreach_claim_evidence (evidence_id);

-- 061 (proposals) canlıysa versiyon FK'sini bağla; değilse kolon FK'siz kalır
-- (061 uygulandığında bu blok yeniden koşulabilir — idempotent).
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'proposal_versions') then
    if not exists (select 1 from information_schema.table_constraints
                   where constraint_name = 'outreach_claim_evidence_proposal_fk') then
      alter table public.outreach_claim_evidence
        add constraint outreach_claim_evidence_proposal_fk
        foreign key (proposal_version_id) references public.proposal_versions(id) on delete cascade;
    end if;
  end if;
end $$;

alter table public.outreach_claim_evidence enable row level security;
revoke all on table public.outreach_claim_evidence from anon, authenticated;
grant select, insert, delete on table public.outreach_claim_evidence to service_role;
