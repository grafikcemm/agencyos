-- ─────────────────────────────────────────────────────────────────────────────
-- 062_claim_evidence v2 — App DB (FINALIZATION Faz 1: canonical outbound artifact)
--
-- ⚠ CANLIYA UYGULANMADI — kullanıcı onayı bekliyor (App DB migration pazarlıksız
--   sınır). İzole E2E test DB'sine KALICI uygulanır (Faz 6 paketi).
--
-- v2 değişikliği (v1'e göre): iddia→kanıt bağı artık MESAJA değil, mesajın
-- IMMUTABLE VERSİYONUNA bağlanır. Yeni tablo outreach_message_versions her
-- üretim/düzenlemede alıcı + içerik + content digest + Voice DNA snapshot
-- dijesti + gate sonucunu dondurur. İçerik değişince YENİ versiyon doğar;
-- eski versiyonun kanıt bağları ve (digest'e bağlı) onaylar otomatik geçersiz
-- kalır — kod tarafı yalnız EN SON versiyonun bağlarını okur ve güncel gövdeye
-- deterministik remap eder (src/lib/outreach/claimEvidence.ts).
--
-- Risk: DÜŞÜK — yalnız yeni tablolar (additive). Rollback: 062_claim_evidence_rollback.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Canonical immutable mesaj versiyonu.
create table if not exists public.outreach_message_versions (
  id uuid primary key default gen_random_uuid(),
  outreach_message_id uuid not null references public.outreach_messages(id) on delete cascade,
  version integer not null check (version >= 1),
  channel text not null,
  -- Normalize alıcı snapshot'ı: kaynak türü + contact bağı + lower/trim e-posta.
  recipient_kind text not null default 'lead_email'
    check (recipient_kind in ('primary_contact', 'lead_email', 'none')),
  recipient_contact_id uuid references public.contacts(id) on delete set null,
  recipient_email text,
  subject text,
  body text not null,
  -- İçerik dijesti: kanal + normalize alıcı + konu + gövde (claimEvidence.ts).
  content_digest text not null,
  -- Üretim anındaki Voice DNA kural setinin dijesti (onaylı kurallar snapshot'ı).
  voice_rules_digest text,
  -- Kapı (outbound gate) sonucu — bloke edilen düzenlemenin de izi kalır.
  gate_ok boolean not null,
  gate_digest text not null,
  gate_violations jsonb not null default '[]'::jsonb,
  -- Kaynak/üretici izi: 'generator:cold_email' | 'editor' | 'generator:followup' | 'telegram' | ...
  source text not null,
  created_by text,
  created_at timestamptz not null default now(),
  constraint outreach_message_versions_msg_ver_uniq unique (outreach_message_id, version)
);

create index if not exists outreach_message_versions_msg_idx
  on public.outreach_message_versions (outreach_message_id, version desc);

-- İddia→kanıt bağı — VERSİYONA bağlı (canonical) + mesaj-düzeyi kolon
-- (sorgu kolaylığı / legacy okuma). Teklif versiyonu FK'si koşullu (061).
create table if not exists public.outreach_claim_evidence (
  id uuid primary key default gen_random_uuid(),
  message_version_id uuid references public.outreach_message_versions(id) on delete cascade,
  outreach_message_id uuid references public.outreach_messages(id) on delete cascade,
  proposal_version_id uuid, -- FK, 061 canlı olduğunda eklenir (aşağıda koşullu)
  -- Stabil iddia anahtarı: fold+normalize edilmiş iddia metninin sha256 kısaltması
  -- (claimEvidence.ts:claimKey) — edit sonrası güvenli remap'in temelidir.
  claim_key text not null,
  claim_text text not null check (char_length(claim_text) <= 500),
  -- Taksonomi kategorisi: quantified | outcome | behavioral | observation.
  claim_category text,
  evidence_id uuid not null references public.lead_evidence(id) on delete cascade,
  evidence_type text, -- lead_evidence.kind snapshot'ı (kaynak değişirse iz kalır)
  evidence_source text, -- ör. 'website_scan', 'google_reviews', 'manual'
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint claim_surface_required check (
    message_version_id is not null
    or outreach_message_id is not null
    or proposal_version_id is not null
  )
);

create index if not exists outreach_claim_evidence_version_idx
  on public.outreach_claim_evidence (message_version_id);
create index if not exists outreach_claim_evidence_msg_idx
  on public.outreach_claim_evidence (outreach_message_id);
create index if not exists outreach_claim_evidence_evidence_idx
  on public.outreach_claim_evidence (evidence_id);
create index if not exists outreach_claim_evidence_key_idx
  on public.outreach_claim_evidence (claim_key);

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

-- RLS + explicit grant/revoke: Supabase'in güncel "tablolar otomatik expose
-- edilmez" davranışına uygun — yalnız service_role erişir; anon/authenticated
-- için hiçbir yol yok (PostgREST exposure = grant'e bağlı).
alter table public.outreach_message_versions enable row level security;
revoke all on table public.outreach_message_versions from anon, authenticated;
grant select, insert, delete on table public.outreach_message_versions to service_role;

alter table public.outreach_claim_evidence enable row level security;
revoke all on table public.outreach_claim_evidence from anon, authenticated;
grant select, insert, delete on table public.outreach_claim_evidence to service_role;
