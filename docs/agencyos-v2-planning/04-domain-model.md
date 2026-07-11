# 04 — Domain Model (Varlık Modeli)

> Dalga 1 · load-bearing. Tüm entity'ler: mevcut (EXISTING) + net-new (NEW) + türetilmiş (DERIVED) + LIFE-DB-dokunulmaz. Her entity için: Purpose · Kaynak/Migration · Key fields · Relations · Unique/Index · Sensitive · Provenance · Retention · Versioning · RLS · Audit.
>
> **Kilit kısıtlar (plan §2/§4/§5, doğrulanmış):**
> - `leads` = **birleşik firma+lead** (bugün ayrı `companies` tablosu YOK) — `mig 001:7-30`, `types.ts:73-201`.
> - `person_leads` = Apollo kişileri, `leads`'ten AYRI (`mig 027`).
> - `contacts`+rol = **NET-NEW** (`mig 045`); `leads`↔`person_leads`↔`contact` köprüsü.
> - Tüm yeni tablolar **App DB only**; LIFE/FTG DB (`active_tasks`/`habits`/`daily_v2`) **dokunulmaz**.
> - `agent_memory` bugün **scope'suz** (`mig 044:34-48`); scope `mig 050` ekler.
> - Migration numaraları **plan §5 kanonik** (045-053); bu doküman yeni numara İCAT ETMEZ.
> - Yeni tablo deseni: politikasız-RLS + `REVOKE ALL FROM anon, authenticated` + additive/idempotent + `NOTIFY pgrst` (`mig 043/044/033`).

## Migration ownership (plan §5 özet — referans)

| No | Kapsam | Bu dokümandaki entity'ler |
|----|--------|----------------------------|
| 045 | `contacts` + rol/unvan; leads↔person_leads↔contact | Contact, Role |
| 046 | `email_threads` + `email_messages`; `outreach_messages` additive (`original_body`,`final_body`,`gmail_message_id`,`gmail_thread_id`) | EmailThread, EmailMessage, MessageDraft(ext) |
| 047 | `suppression_list` + `consent_records`; `leads` `do_not_contact`,`do_not_contact_reason`,`retention_until` | SuppressionEntry, ConsentRecord |
| 048 | `portfolio_items` + `portfolio_claims` | PortfolioItem |
| 049 | `proposals` (version chain) + `proposal_outcomes` | Proposal |
| 050 | `agent_memory` scope (`scope_type`/`scope_id`/`layer`/`sensitivity`/`supersedes_id`/`last_verified_at`/`human_approved`) + decay; `voice_pattern` type | MemoryItem |
| 051 | `inbound_messages` + `reply_classifications` | ReplyAnalysis |
| 052 | `tool_cost_logs` + model preset/gateway config | ModelUsage(ext), ToolCost |
| 053 | (opsiyonel) `lead_events` append-only + `signals` (B2B-tech) | Signal, PipelineActivity, AuditLog(kısmi), LeadDossier(kısmi) |

---

# A. Mevcut çekirdek (EXISTING — koru + genişlet)

## Company (= `leads`) — EXISTING `mig 001`
- **Purpose:** Firma/işletme kaydı. Bu repoda firma ve lead **aynı satır**; ayrı `companies` tablosu yok.
- **Key fields:** `id`, `business_name`, `sector`, `city`, `district`, `phone`, `website`, `email`, `google_place_id`, `latitude/longitude`, `rating`, `review_count` (`mig 001:7-30`).
- **Relations:** 1—N `contacts` (NEW), `projects` (`mig 001:33`), `lead_evidence`, `outreach_messages`, `email_threads`, `proposals`.
- **Unique/Index:** `UNIQUE(google_place_id)`; idx status/city/sector/place_id (`mig 001:95-98`).
- **Sensitive:** `email`, `phone` (PII, C9). **Provenance:** `scan_runs.source` (leads.source kolonu yok — `types.ts:194`). **Retention:** kalıcı; opt-out `retention_until` (`mig 047`). **Versioning:** yok (mutable). **RLS:** default-deny + REVOKE (`mig 017`). **Audit:** `stage_entered_at`/`last_contact_at` timestamp'leri; stage geçişi PipelineActivity.

## Lead (= `leads` skorlama/pipeline yüzü) — EXISTING `mig 001/004/006/019/020`
- **Purpose:** `Company` satırının satış-yaşam-döngüsü boyutu (status, skor, discovery, kalite). Ayrı entity DEĞİL — aynı `leads` satırının alanları.
- **Key fields:** `status` (`new→contacted→responded→meeting→proposal→converted/lost`+`waiting`/`archived`, `types.ts:5-14`), `potential_score`, `base_score`/`risk_score`/`route` (`mig 019`), `pain_point`/`decision_maker`/`budget_band` (proposal gate, `mig 020`), `lead_tier` A-D (`mig 006`), `customer_category` (`mig 031`).
- **Relations:** = Company. **Unique/Index:** idx status (`mig 001:95`). **Sensitive:** discovery alanları internal. **Provenance:** evidenceEngine + scoring (`leadScoringV3.ts`, deterministik). **Retention:** Company ile aynı. **Versioning:** tek-değerli mutable (geçmiş yok → Company Memory bu boşluğu doldurur, bkz. MemoryItem). **RLS:** default-deny. **Audit:** her aşama outcome timestamp'i.

## LeadScore — DERIVED (leads kolonları + `lead_assessments`)
- **Purpose:** Açıklanabilir skor kartı; ayrı tablo değil, `leads` üstünde türetilmiş alt-skorlar + council skorları.
- **Key fields:** `evidence_score`/`fit_score`/`urgency_score`/`money_score`/`contactability_score` (`leadScoringV3.ts:248-254`), `quality_score`/`conversion_probability` (`mig 006`), `design_score`/`ai_score` (`lead_assessments`, `mig 033:50-51`).
- **Relations:** N—1 Lead; council skoru `lead_assessments`. **Versioning:** `lead_assessments` koşu-başına satır (append; run_date ile). **RLS:** default-deny. **Audit:** `last_quality_scored_at` (`types.ts:188`). **Not:** MVP'de yeni `lead_scores` tablosu AÇILMAZ — açıklanabilirlik `score_reasons[]` ile taşınır (`leadScoringV3.ts:52`).

## Service (= `service_catalog` + kod katalog) — EXISTING `mig 032`
- **Purpose:** Ali Cem'in sunduğu hizmet paketleri (kanonik). Yapı kodda (`src/lib/services/catalog.ts`, `types.ts:242-263`); DB yalnız fiyat/aktiflik override.
- **Key fields:** `slug` (PK, kebab-case), `setup_price_override_tl`, `monthly_price_override_tl`, `active` (`types.ts:296-301`); kod: `familyId`, `requiredEvidenceKinds[]`, `targetSectors[]`, `legacyOfferIds[]`.
- **Relations:** 1—N `lead_service_matches`, `portfolio_items.service_slugs[]`. **Unique/Index:** `slug` PK. **Sensitive:** yok (public). **Provenance:** kod + panel override. **Retention:** kalıcı. **Versioning:** kod (git). **RLS:** default-deny. **Audit:** panel `updated_at`. **Kilit:** offerMatcher yalnız katalog `slug`'ından seçer → halüsinasyon-servis imkânsız (`mig 033:67` kanıt).

## ServiceMatch (= `lead_service_matches`) — EXISTING `mig 033`
- **Purpose:** Kanıta bağlı hizmet önerisi (lead × service).
- **Key fields:** `assessment_id`, `lead_id` (FK-siz, `mig 033:67`), `service_slug`, `rank`, `score`, `evidence_refs UUID[]`, `reasons[]`.
- **Relations:** N—1 `lead_assessments`, → Service (slug), → SourceEvidence (`evidence_refs`). **Index:** `idx_...assessment` (`mig 033:74`). **Sensitive:** yok. **Provenance:** council/offerMatcher; `evidence_refs` grounding zorunlu. **Retention:** assessment ile. **Versioning:** assessment koşu-başına. **RLS:** default-deny. **Audit:** `created_at`.

## SourceEvidence (= `lead_evidence`) — EXISTING `mig 033`
- **Purpose:** Doğrulanmış kanıt parçası (PSI/HTML/Places/screenshot). Her iddia buna bağlanır (evidence_id grounding).
- **Key fields:** `lead_id`, `kind` (8 enum, `mig 033:27-30`), `source` (`psi_v5`/`html_fetch`/`google_places`), `url`, `storage_path` (yalnız screenshot, private bucket), `summary`, `payload jsonb`, `confidence`, `verified`.
- **Relations:** N—1 Lead; ref: ServiceMatch/MemoryItem. **Index:** `idx_lead_evidence_lead` (`mig 033:40`). **Sensitive:** screenshot private bucket (`lead-evidence`, `mig 032`). **Provenance:** kaynak + `collected_at`. **Retention:** screenshot retention cron; payload 12 ay `assumption:`. **Versioning:** append. **RLS:** default-deny. **Audit:** `collected_at`+`verified`.

## Opportunity — EXISTING (`leads.status` + `projects`), yeni tablo YOK
- **Purpose:** Satış anlaşması durumu. Report 21 kararı: MVP'de yeni deal tablosu açma; pipeline = `leads.status`, kazanılan iş = `projects`.
- **Key fields:** `leads.status` (pipeline), `projects` (`id`,`lead_id`,`setup_fee`,`monthly_fee`,`mig 001:33-47`). **DİKKAT:** `mig 008 opportunity_*` = PAZAR/ürün fırsatı, satış anlaşması DEĞİL — karıştırma.
- **Relations:** `projects.lead_id` → Lead. **Unique/Index:** idx status/lead_id (`mig 001:99-100`). **Sensitive:** MRR internal. **Provenance:** manuel/pipeline promote. **Retention:** kalıcı. **Versioning:** yok. **RLS:** default-deny. **Audit:** stage timestamp'leri; proposal gate (`pipelineGate.ts`: pain+decision_maker+budget zorunlu).

## AgentRun (= `directives`=run + `agent_tasks`=step) — EXISTING `mig 009/038`
- **Purpose:** Kanonik run/step modeli (ADR-001 lease/retry). Yeni kuyruk KURULMAZ (`21-data-worker` [CERTAIN]).
- **Key fields:** `directives`(run) + `agent_tasks`(step: `status` `queued/working/done/error/blocked_on_approval` (`mig 043:16`), `lease_owner`, `lease_expires_at`, `attempts`, `next_run_at`, `mig 038`). Views `runs`/`run_steps`.
- **Relations:** run 1—N step; step → approval_requests/run_spans. **Index:** `idx_agent_tasks_lease` (`mig 038`), parent (`mig 040`). **Sensitive:** args redacted. **Provenance:** trigger (cron/agent). **Retention:** run_spans 30g. **Versioning:** append. **RLS:** default-deny. **Audit:** run_spans (aşağı).

## AgentRun.Trace (= `run_spans`) — EXISTING `mig 044`
- **Purpose:** OTel GenAI span — her adım izi; redacted attributes (ham prompt/secret YOK, `mig 044:18`).
- **Key fields:** `run_id`, `step_id`, `name`, `kind` (`llm/tool/retrieval/internal/approval`), `status`, `attributes jsonb` (REDACTED), `tokens_in/out`, `cost_usd`, `duration_ms`, `retention_until` (`mig 044:10-27`).
- **Relations:** N—1 run/step. **Index:** run/step (`mig 044:28-29`). **Sensitive:** REDACTED zorunlu (`redactAttributes`). **Retention:** `retention_until` sonrası özetlenip düşürülür (data-expiry worker). **RLS:** default-deny+REVOKE. **Audit:** kendisi audit katmanı.

## ModelUsage (= `ai_cost_logs`) — EXISTING `mig 014/039` (+ext `mig 052`)
- **Purpose:** LLM maliyet kaydı — tahmini + gerçek.
- **Key fields:** `cost_usd` (tahmini, parity için sabit), `actual_cost_usd`, `generation_id`, `operation`, model (`mig 039`). `cost_tl = cost_usd*38` hardcoded (`costLog.ts`).
- **Relations:** N—1 run/step (soft). **Sensitive:** yok. **Provenance:** OpenRouter `usage:{include:true}`. **Retention:** analytics; kalıcı. **Versioning:** append. **RLS:** default-deny. **Audit:** cost-aggregation worker `generation_id` ile uzlaştırır. **Cap:** `caps.ts` ($20/ay) + lead-intel $0.40/gün.

## ToolCost (= `tool_cost_logs`) — NEW `mig 052`
- **Purpose:** Gerçek maliyet riski **Google Places/PSI/Apollo** (bugün loglanmıyor, `24-cost` düzeltmesi). LLM değil tool maliyeti belirsizlik kaynağı.
- **Key fields:** `tool` (`places`/`psi`/`apollo`/`firecrawl`/`serpapi`), `operation`, `units`, `cost_usd`, `run_id`, `created_at`. **Relations:** soft run ref. **Retention:** analytics. **RLS:** default-deny+REVOKE. **Audit:** append-only.

## Job — EXISTING (`agent_tasks` = kuyruk step)
- **Purpose:** İş kuyruğu birimi = `agent_tasks` (Postgres-as-queue). **DİKKAT:** kariyer "job engine" (`mig 011`, ATS ilanları) AYRI kavram — karıştırma.
- **Key fields:** `agent_tasks` (yukarı AgentRun.step ile aynı). **Retention:** done sonrası; run_spans izler. **RLS:** default-deny. **Audit:** lease/retry (`lease.ts`).

## FeedbackEvent (= `lead_match_feedback`) — EXISTING `mig 033` (+ human override)
- **Purpose:** Operatör geri bildirimi → sektör/scoring öğrenme; human override → feedback loop.
- **Key fields:** `lead_id`, `assessment_id`, `match_id`, `verdict` (`uygun`/`uygun_degil`), `reason_code` (7 enum, `mig 033:82-85`), `note`.
- **Relations:** N—1 Lead/assessment. **Index:** `idx...lead` (`mig 033:89`). **Sensitive:** yok. **Provenance:** operatör. **Retention:** kalıcı (öğrenme). **Versioning:** append. **RLS:** default-deny. **Audit:** `created_at`. **Genişletme:** score/qualification human-override da bu desende bir `feedback` satırı yazar (skoru değiştirmez, öğrenmeyi besler).

---

# B. Net-new (NEW — asıl build)

## Contact — NEW `mig 045`
- **Purpose:** Kanonik kişi kimliği; `leads`(firma) ile `person_leads`(Apollo kişi) arasında kanal-sahibi köprü. Rol-aware personalizasyonun (K2) veri temeli.
- **Key fields:** `id`, `lead_id` (soft ref → leads), `person_lead_id` (soft ref → person_leads), `full_name`, `email`, `phone`, `role` (aşağı Role), `title`, `seniority`, `verified`, `source`, `created_at`.
- **Relations:** N—1 Lead; 0—1 person_lead; 1—N EmailThread. **Unique/Index:** `(lead_id)`, `(person_lead_id)`; `assumption:` `UNIQUE(lower(email))` (kanal dedup — çok-kanal `contact_channels` MVP'den DEFER). **Sensitive:** `email`/`phone`/`full_name` = PII (C9). **Provenance:** enrichment/manuel; `source`. **Retention:** Lead ile aynı; opt-out → suppression. **Versioning:** yok (mutable); karar-verici değişimi Company Memory'de supersession. **RLS:** default-deny+REVOKE. **Audit:** `created_at`, `verified_at`. **Not:** `scope_id` soft-ref deseni (`mig 033:67`) — hard FK yok (iki lead sistemi ayrık).

## Role — NEW (Contact üzerinde alan, `mig 045` — ayrı tablo DEĞİL)
- **Purpose:** K2 rol modeli: owner/CTO/CFO/pazarlama-dir → rol-farkındalıklı açı (CTO→verimlilik, CFO→maliyet, sahip→büyüme).
- **Key fields:** `contacts.role` (`owner`/`cto`/`cfo`/`marketing`/`ops`/`other`), `contacts.seniority`, `contacts.title` (serbest metin).
- **Relations:** Contact'ın alanı. **Versioning:** değişim Contact üstünde; eski rol Company Memory supersession. **RLS/Audit:** Contact ile. **Not:** Ayrı `roles` tablosu MVP-fazlası; tek operatör için enum kolon yeter (C10).

## Signal — NEW (opsiyonel `mig 053` `signals`)
- **Purpose:** B2B-tech firmografik/teknik sinyaller (ekip yapısı, tech-stack, hiring) — K2 ICP genişletmesi. Bugün sinyaller `leads` üstünde **boolean kolonlar** (`has_ads_signal`/`has_job_signal`/`instagram_as_site`, `types.ts:110-114`).
- **Key fields:** `lead_id`, `signal_type` (`tech_stack`/`hiring`/`team_size`/`ads`/`funding`), `value jsonb`, `source`, `confidence`, `observed_at`, `evidence_id` (→ SourceEvidence).
- **Relations:** N—1 Lead; → SourceEvidence. **Index:** `(lead_id, signal_type)`. **Sensitive:** internal. **Provenance:** research agent (K3) + evidence. **Retention:** 12 ay `assumption:`. **Versioning:** append (zaman-serisi). **RLS:** default-deny+REVOKE. **Audit:** `observed_at`. **MVP notu:** mevcut boolean-kolon sinyalleri MVP'de yeter; `signals` tablosu B2B-tech genişlemesiyle (opsiyonel 053) gelir.

## EmailThread — NEW `mig 046`
- **Purpose:** Gmail thread ankrajı + follow-up/senkron durumu. `outreach_messages`(taslak) bu modele eşlenmez → ayrı tablo.
- **Key fields:** `id`, `contact_id`, `lead_id`, `gmail_thread_id`, `subject`, `last_history_id` (artımlı sync), `last_synced_at`, `status`.
- **Relations:** N—1 Contact/Lead; 1—N EmailMessage; ref: FollowUp. **Unique/Index:** `UNIQUE(gmail_thread_id)`, `(contact_id)`. **Sensitive:** subject (PII olabilir). **Provenance:** Gmail sync. **Retention:** 24 ay `assumption:` (operatör kararı). **Versioning:** yok. **RLS:** default-deny+REVOKE. **Audit:** `last_synced_at`, `last_history_id`.

## EmailMessage — NEW `mig 046`
- **Purpose:** Gerçek gelen/giden posta (Gmail). `outreach_messages`'tan AYRI (o taslak defteri).
- **Key fields:** `id`, `thread_id`, `gmail_message_id`, `direction` (`inbound`/`outbound`), `message_id_header`, `in_reply_to`, `references`, `from`, `to`, `subject`, `body`, `sent_at`, `received_at`.
- **Relations:** N—1 EmailThread; 1—1 ReplyAnalysis (yalnız inbound). **Unique/Index:** `UNIQUE(gmail_message_id)`, `(thread_id)`. **Sensitive:** **`body` = PII yüksek** (C8: içerik DATA, talimat değil). **Provenance:** Gmail sync/gönderim. **Retention:** 24 ay → sonra gövde özete indirgenir (PII minimizasyonu, data-expiry worker). **Versioning:** append (immutable posta). **RLS:** default-deny+REVOKE. **Audit:** `direction`, `sent_at`, headers.

## MessageDraft (= `outreach_messages` genişletme) — EXISTING `mig 010` + NEW alanlar `mig 046`
- **Purpose:** Outreach taslak defteri (draft-only, `mig 010`). Voice edit-delta (K4) için additive kolonlar.
- **Key fields (mevcut):** `lead_id`, `subject`, `body`, `status` (draft/sent, idempotent `markMessageSent`), `angle`. **NEW additive:** `original_body` (LLM çıktısı), `final_body` (operatör düzeltmesi → edit-delta), `gmail_message_id`, `gmail_thread_id` (`mig 046`).
- **Relations:** N—1 Lead; → EmailMessage (gönderildiğinde). **Sensitive:** body PII. **Provenance:** coldEmail.ts (`buildColdEmail*`) + operatör edit. **Retention:** kalıcı (taslak geçmişi). **Versioning:** `original`/`final` çifti = edit-delta; Voice DNA memory bunu tüketir. **RLS:** default-deny. **Audit:** `status`+timestamp. **Kilit:** imza/footer deterministik (`coldEmail.ts:159-195`), LLM yazmaz.

## OutreachStrategy — DERIVED (kalıcı tablo YOK; MVP)
- **Purpose:** Evidence-pack → rol-aware strateji (angle seçimi + kanıt). Transient/log; ayrı tablo MVP-fazlası.
- **Key fields (mantıksal):** `lead_id`, `role`, `selected_angle` (mini_audit/launch/hiring/before_after, `coldEmailTemplates.ts`), `evidence_refs[]`, `portfolio_ref`. Persist: `outreach_messages.angle` + run_spans.
- **Relations:** → MessageDraft. **Provenance:** research + offerMatcher. **Retention:** run_spans. **Versioning:** yok. **RLS:** default-deny. **Audit:** run_spans. **Not:** "hangi açı işe yaradı" özeti → Outreach Memory (MemoryItem `layer='outreach'`).

## LeadDossier — DERIVED (kalıcı tablo YOK MVP; opsiyonel `lead_events` 053)
- **Purpose:** K3 `build-lead-dossier` çıktısı: firma + sinyaller + rol-aware önerilen hizmet/kanıt aggregate. Read-time kompoze.
- **Key fields (mantıksal):** `lead` + `contacts` + `signals` + `lead_evidence` + `lead_service_matches` + Company Memory birleşimi. Persist: `lead_assessments.chair_verdict jsonb` (mevcut) + opsiyonel `lead_events` snapshot.
- **Relations:** aggregate. **Sensitive:** birleşik PII. **Provenance:** research agent + evidence grounding. **Retention:** assessment ile. **Versioning:** koşu-başına (`lead_assessments.run_date`). **RLS:** default-deny. **Audit:** assessment `created_at`. **Not:** MVP'de yeni `dossiers` tablosu AÇILMAZ — mevcut `lead_assessments` + read-model yeter (C6/C12).

## FollowUp (= `follow_up_sequences` genişletme) — EXISTING `mig 010` + additive `state`/`reason`
- **Purpose:** Follow-up state machine (5-7 iş günü). Deterministik (LLM yok). `follow_up_rules` DB tablosu DEFER (§3 kararı).
- **Key fields (mevcut):** `lead_id`, `step`, `channel`, `scheduled_at`, `done`. **NEW additive:** `state` (`pending`/`sent`/`cancelled`/`replied`), `reason` (iptal nedeni: `reply`/`bounce`/`opt_out`/`manual`).
- **Relations:** N—1 Lead; ref EmailThread. **Unique/Index:** `(lead_id, step)`. **DİKKAT:** `follow_ups` (`mig 014`, dashboard due-list) AYRI — karıştırma. **Sensitive:** yok. **Provenance:** scheduler. **Retention:** kalıcı. **Versioning:** step-serisi. **RLS:** default-deny. **Audit:** `state`+timestamp. **Kural:** yanıt/bounce/opt-out/suppression → açık job'ları iptal (deterministik state-transition).

## ReplyAnalysis (= `inbound_messages` + `reply_classifications`) — NEW `mig 051`
- **Purpose:** Gelen yanıt sınıflandırma (+/- + ~19 sınıf) + sonraki eylem önerisi. Deterministik prefilter → LLM → confidence gate.
- **Key fields:** `inbound_messages`(ham gelen ref) + `reply_classifications`: `email_message_id`, `intent` (`olumlu`/`itiraz`/`soru`/`ret`/`opt_out`/`ooo`/`bounce`), `sentiment`, `objection`, `suggested_action`, `confidence`, `model`, `run_id`, `cost_usd`.
- **Relations:** 1—1 EmailMessage (inbound). **Unique/Index:** `(email_message_id)`, `(intent)`. **Sensitive:** özet (ham metin DEĞİL — PII minimizasyonu). **Provenance:** reply-process worker; e-posta içeriği **DATA, talimat değil** (C8). **Retention:** 12 ay `assumption:`. **Versioning:** message başına 1. **RLS:** default-deny+REVOKE. **Audit:** `model`/`run_id`/`cost_usd`. **Kural:** düşük confidence → otomatik iş yok; cevap TASLAĞI üretir, göndermez (HITL).

## Proposal (= `proposals` + `proposal_outcomes`) — NEW `mig 049`
- **Purpose:** Versiyonlu teklif (append-only chain). Mevcut `proposalGenerator.ts` stateless; `types.ts:314` Proposal in-memory → kalıcılaştırılır.
- **Key fields:** `proposals`: `id`, `lead_id`, `version`, `body`, `price_snapshot jsonb`, `evidence_refs[]`, `status` (`draft`/`sent`/`accepted`/`rejected`), `superseded_by`, `created_by`, `approved_by`. `proposal_outcomes`: kabul/ret + neden.
- **Relations:** N—1 Lead; self supersede chain. **Unique/Index:** `(lead_id, version)`. **Sensitive:** fiyat/gövde internal. **Provenance:** proposalGenerator + operatör. **Retention:** 24 ay `assumption:`. **Versioning:** **append-only version chain** (superseded, silinmez). **RLS:** default-deny+REVOKE. **Audit:** `status`/`created_by`/`approved_by`. **Kilit:** fiyat AI-uydurmaz (price-rules/operatör); proposal gate (pain+decision_maker+budget) korunur.

## PortfolioItem (= `portfolio_items` + `portfolio_claims`) — NEW `mig 048`
- **Purpose:** Ali Cem'in GERÇEK işleri (proof-matching). **İsim çakışması:** emlak "portföy"ünden AYRI (`portfolio_item`/`case_study`).
- **Key fields:** `portfolio_items`: `id`, `title`, `service_slugs[]`, `sector_tags[]`, `proof_url`, `metrics jsonb`. `portfolio_claims`: `item_id`, `claim`, `approved` (yalnız `approved=true` dışa çıkar).
- **Relations:** eşleşme → Service (slug), Lead (sektör). **Unique/Index:** GIN `service_slugs`/`sector_tags`. **Sensitive:** proof public. **Provenance:** operatör (elle giriş). **Retention:** kalıcı. **Versioning:** yok. **RLS:** default-deny+REVOKE. **Audit:** `created_at`; claim `approved` gate. **Kural:** deterministik skor (sektör+similarServices); eşleşme yoksa hiçbir iddia ekleme (uydurma yasak).

## SuppressionEntry (= `suppression_list`) — NEW `mig 047` (kritik)
- **Purpose:** Merkezî gönderim engeli; **her gönderim öncesi zorunlu kontrol** (C9).
- **Key fields:** `address`, `reason` (`bounce`/`complaint`/`opt_out`/`manual`), `scope` (`global`/`lead`), `source`, `operator`, `created_at`.
- **Relations:** kontrol: her outbound EmailMessage. **Unique/Index:** `UNIQUE(address)`, `(scope)`. **Sensitive:** address PII. **Provenance:** bounce/complaint/opt-out/manuel; **her yazımda `source`+`reason`+`operator`**. **Retention:** kalıcı (yasal). **Versioning:** upsert. **RLS:** default-deny+REVOKE. **Audit:** her yazım kaydı. **Kural:** hard bounce/complaint/unsubscribe → anında suppress.

## ConsentRecord (= `consent_records`) — NEW `mig 047` (kritik)
- **Purpose:** KVKK/6563/İYS onay-itiraz kaydı (append-only). Mevcut `mig 018` yalnız footer ayarı; kişi-başı kayıt yok.
- **Key fields:** `contact_id`, `address`, `state` (`granted`/`objected`/`withdrawn`), `basis` (dayanak), `channel`, `recorded_at`, `source`.
- **Relations:** N—1 Contact. **Unique/Index:** `(contact_id)`, `(state)`. **Sensitive:** address + dayanak. **Provenance:** İYS/manuel/itiraz. **Retention:** yasal (kalıcı). **Versioning:** **append-only, immutable**. **RLS:** default-deny+REVOKE. **Audit:** append-only doğası audit. **Not:** hukuki kesinlik `assumption:` — profesyonel inceleme flag'li; ilk itirazda dur.

---

# C. Genişletilen mevcut (EXTENDED)

## MemoryItem (= `agent_memory` scope genişletme) — EXISTING `mig 044` + NEW `mig 050`
- **Purpose:** İlişki hafızası (5 katman) + Voice DNA. Bugün scope'suz, hiç kullanılmıyor (`16-relationship-memory`); scope + governance ekle.
- **Key fields (mevcut):** `memory_key`, `content`, `status` (`quarantine`/`active`/`archived`/`rejected`), `confidence`, `occurrences`, `source_run_id`/`step_id`/`tool`, `retention_until` (`mig 044:34-48`). **NEW `mig 050`:** `scope_type` (`lead`/`person`/`global`), `scope_id` (soft-ref), `layer` (`contact`/`company`/`outreach`/`offer`/`preference`), `sensitivity` (`public`/`internal`/`confidential`/`secret` — `mig 043:27-28` ile AYNI enum), `supersedes_id`, `last_verified_at`, `human_approved`, `memory_type` (`voice_pattern` dahil).
- **Relations:** scope → Lead/person (soft); self supersede chain; `memory_embeddings` (`mig 042`). **Unique/Index:** `(scope_type, scope_id, layer)` (`mig 050`); scope-consistency CHECK. **Sensitive:** `confidential`/`secret` + `human_approved=false` → retrieval'da GİZLİ. **Provenance:** `source_*` + `source_evidence_id`. **Retention:** 90g + decay (`decayConfidence` half-life 30g). **Versioning:** supersession (silinmez, `archived`+`supersedes_id`). **RLS:** default-deny+REVOKE. **Audit:** governance quarantine→active. **İzolasyon (C8/C10):** `WHERE scope_type='global' OR scope_id=$1` **SQL'de zorunlu** (asla LLM/post-hoc) + `lead:<id>:` key prefix (defense-in-depth, §3).

---

# D. Cross-cutting / Audit

## PipelineActivity — DERIVED (MVP) / opsiyonel `lead_events` `mig 053`
- **Purpose:** Pipeline aşama-geçiş kaydı ("ne zaman contacted→responded oldu"). Bugün `leads` stage timestamp'leri + dedicated tablo yok.
- **Key fields (mantıksal):** `lead_id`, `activity_type` (`stage_change`/`email_sent`/`reply`/`proposal`), `from`/`to`, `actor`, `at`. Persist: `leads.*_at` timestamp'leri (MVP) → opsiyonel `lead_events` append-only.
- **Relations:** N—1 Lead. **Sensitive:** internal. **Provenance:** state-transition. **Retention:** lead ile. **Versioning:** append. **RLS:** default-deny. **Audit:** kendisi. **Not:** ayrı tablo yalnız `lead_events` (opsiyonel 053) açılırsa.

## AuditLog — DERIVED (`run_spans` + `approval_requests` + append-only tablolar)
- **Purpose:** Sistem denetim izi. **Dedicated `audit_log` tablosu §5'te YOK** → mevcut katmanlar audit sağlar.
- **Kaynaklar:** `run_spans` (her adım, redacted, `mig 044`) + `approval_requests` (`decided_by`/`decided_at`/`executed_at`, `mig 043`) + append-only tablolar (`consent_records`, `suppression_list`, `proposals` chain). **Sensitive:** REDACTED. **Retention:** run_spans 30g; consent/suppression kalıcı. **RLS:** default-deny+REVOKE. **Not:** genel `audit_log` MVP-fazlası; gerekirse opsiyonel `lead_events` (053). Yeni migration icat edilmez.

---

# E. LIFE DB — DOKUNULMAZ (referans, App DB'de değil)

> `lifeSupabaseAdmin` (proje `xcqrk…`); App DB'den ayrı; cross-DB FK yok. Bu üçlü **v2'de hiç değişmez** (yalnız satıştan ayrılır).

## Task (= `active_tasks` + `active_task_steps`) — EXISTING, LIFE DB, UNTOUCHED
- **Purpose:** Kullanıcı-yüzü aktif görev yöneticisi (`/gorevler`). **DİKKAT:** sistem `agent_tasks` (App DB kuyruk) AYRI kavram.
- **Kaynak:** LIFE `mig 001-004`. **RLS:** default-deny (LIFE 002). **Not:** dokunulmaz.

## Routine (= `daily_v2` / `dailyRoutines.ts`) — EXISTING, LIFE DB, UNTOUCHED
- **Purpose:** Günlük rutin (Command Center özet, read-only). **Kaynak:** LIFE DB + `dailyRoutines.ts`. **Not:** yalnız `ui_mode` tüketiliyor; dokunulmaz.

## Habit (= `habits` + `habit_logs`) — EXISTING, LIFE DB, UNTOUCHED
- **Purpose:** Oyunlaştırılmış alışkanlık (`/aliskanliklar`, puan/XP/zincir). **Kaynak:** LIFE DB + `src/lib/habits/*`. **RLS:** default-deny. **Not:** izole, temiz, dokunulmaz.

---

## Özet: EXISTING vs NEW vs DERIVED

| Kategori | Entity'ler |
|----------|------------|
| **EXISTING (koru+genişlet)** | Company/Lead(`leads`), LeadScore, Service(`service_catalog`), ServiceMatch, SourceEvidence, Opportunity(`leads`+`projects`), AgentRun(`directives`/`agent_tasks`/`run_spans`), ModelUsage, Job, FeedbackEvent |
| **EXTENDED (additive kolon)** | MessageDraft(`outreach_messages`+046), FollowUp(`follow_up_sequences`+state/reason), MemoryItem(`agent_memory`+050) |
| **NEW (net-new tablo)** | Contact/Role(045), EmailThread/EmailMessage(046), Suppression/Consent(047), Portfolio(048), Proposal(049), ReplyAnalysis(051), ToolCost(052), Signal(053 ops.) |
| **DERIVED (tablo YOK, read-model)** | LeadDossier, OutreachStrategy, PipelineActivity, AuditLog |
| **LIFE DB (DOKUNULMAZ)** | Task, Routine, Habit |
