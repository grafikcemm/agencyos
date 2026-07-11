# 19 — Data & Worker Architecture (V2 Foundation Contract)

> Dalga 1 · load-bearing. **Bu doküman migration numaralandırmasının KANONİK sahibidir** (plan §5). Diğer tüm dokümanlar (`04-domain-model.md`, `05-event-contracts.md`, `20`, `22`) buradaki numaraları referans alır; hiçbiri yeni numara icat etmez. Ayrıca: yeni kuyruk motoru KURULMAZ (`agent_tasks` = mevcut Postgres kuyruk), 15 worker'ın davranış sözleşmesi, cron eklemeleri, refresh-token şifreleme kararı, retention.
>
> **Kaynak zinciri:** onaylı plan §2/§5 · araştırma raporu `21-data-and-worker-architecture.md` · repo: `supabase/migrations/*` (001-044 doğrulandı), `src/lib/runs/lease.ts`, `src/lib/runs/repo.ts`, `src/app/api/cron/agent-tick/route.ts`, `vercel.json`, `src/lib/leads/scan.ts:42-82`, `src/app/api/cron/daily-scan/route.ts:182,217`, `src/lib/ai/costLog.ts`, `src/lib/ai/caps.ts` · canlı `list_migrations` (App DB, 2026-07-11).
>
> **Bu doküman kod yazmaz** — hedef mimariyi kilitler. Kodlama Sprint 0'da ayrı temiz context'te.

---

## 1. Migration Ownership — KANONİK (App DB only, additive, LIFE DB dokunulmaz)

### 1.1 Numara doğrulaması (neden 045 güvenli)

**Repo dosya taraması (`supabase/migrations/*.sql`, 2026-07-11):** en yüksek dosya numarası **`044_trace_memory_governance.sql`**. Diziler: `001-002`, `004-044` (003 boş; `041`/`042`/`042a` sıra-dışı ama mevcut). → **Bir sonraki serbest sıralı numara = 045.** [CERTAIN — dosya listesi okundu]

**Canlı `list_migrations` (App DB) uyumsuzluğu — açıklama:** Uygulanan DB'nin migration defterindeki `version` alanları **timestamp tabanlıdır** (`20260703085435 … 20260703133003`), sıralı `0NN` değil. Bunun nedeni: 037+ MCP/Supabase CLI ile timestamp-adlandırmayla uygulandı; 001-036 elle SQL Editor'dan uygulandı (repo `mig 031/033` notları: "programatik uygulanamıyor"). **Sonuç:** kanonik kaynak **repo dosya numaralandırmasıdır** (`0NN_ad.sql`), applied-defter değil. 045-053 aralığı **ne dosya adında ne timestamp-defterde** çakışmaz. [CERTAIN]

> **Build zorunluluğu:** Sprint 0'da her migration uygulanmadan ÖNCE `list_migrations` yeniden çalıştırılır; arada başka bir dal (`feat/*`) 045'i kullandıysa numara kaydırılır. Bu doküman numarayı **sahiplenir**, ama build canlı defteri son-söz olarak yeniden doğrular.

### 1.2 Kanonik tablo (plan §5 — bu doküman sahibi)

| No | Migration adı (öneri) | Kapsam | Tür | Doküman |
|----|----------------------|--------|-----|---------|
| **045** | `045_contacts_and_roles.sql` | `contacts` (`lead_id`/`person_lead_id` soft-ref, `full_name`,`email`,`phone`,`role`,`title`,`seniority`,`verified`,`source`); rol enum kolonu | NEW tablo | 04 (Contact/Role) |
| **046** | `046_email_threads_messages.sql` | `email_threads` (`gmail_thread_id` UNIQUE, `last_history_id`, `last_synced_at`) + `email_messages` (`gmail_message_id` UNIQUE, `direction`, `in_reply_to`, `references`, `body`, `sent_at`); `outreach_messages` ADD `original_body`,`final_body`,`gmail_message_id`,`gmail_thread_id` | NEW + ALTER | 04, 11, 12 |
| **047** | `047_suppression_consent.sql` | `suppression_list` (`address` UNIQUE, `reason`, `scope`, `source`, `operator`) + `consent_records` (append-only) ; `leads` ADD `do_not_contact`,`do_not_contact_reason`,`retention_until` | NEW + ALTER | 04, 12, 21 |
| **048** | `048_portfolio.sql` | `portfolio_items` (`service_slugs[]` GIN, `sector_tags[]` GIN, `proof_url`, `metrics jsonb`) + `portfolio_claims` (`approved` gate) | NEW tablo | 04, 10 |
| **049** | `049_proposals.sql` | `proposals` (version chain, `superseded_by`, `status`, `price_snapshot jsonb`, `evidence_refs[]`) + `proposal_outcomes` | NEW tablo | 04, 14 |
| **050** | `050_agent_memory_scope.sql` | `agent_memory` ADD `scope_type`,`scope_id`,`layer`,`sensitivity`,`supersedes_id`,`last_verified_at`,`human_approved`; `voice_pattern` memory_type; decay index | ALTER | 04, 15 |
| **051** | `051_reply_intelligence.sql` | `inbound_messages` + `reply_classifications` (`email_message_id` UNIQUE, `intent`, `sentiment`, `objection`, `suggested_action`, `confidence`, `model`, `run_id`, `cost_usd`) | NEW tablo | 04, 13 |
| **052** | `052_tool_cost_logs.sql` | `tool_cost_logs` (`tool`, `operation`, `units`, `cost_usd`, `run_id`, `created_at`) + (opsiyonel) `ai_route_presets` settings config | NEW tablo | 04, 16, 22 |
| **053** | `053_lead_events_signals.sql` | **(opsiyonel)** `lead_events` append-only + `signals` (B2B-tech firmografik/teknik) | NEW tablo (defer) | 04, 05, 08 |

**Tüm 045-053 için ortak desen (mevcut mig 029/033/043/044 birebir kopyası):** additive + idempotent · tek atomik `BEGIN/COMMIT` · politikasız RLS + `REVOKE ALL FROM anon, authenticated` (service-role bypass) · `NOTIFY pgrst, 'reload schema'` · App DB'ye **elle SQL Editor** (programatik uygulanamıyor). [CERTAIN — mig 031/033 notları]

**LIFE DB (`lifeSupabaseAdmin`, proje `xcqrk…`) HİÇ dokunulmaz** — `active_tasks`/`habits`/`daily_v2` cross-DB FK yok, ayrı proje. 045-053 yalnız App DB (`supabaseAdmin`, mig 001-044 dizisi). [CERTAIN]

**Strip-retry güvenliği:** Yeni kolonlar (`outreach_messages.original_body`, `agent_memory.scope_type` vb.) migration uygulanmadan önce, yazma servisleri `PGRST204`/`42703` yakalayıp eksik-kolon olmadan yeniden dener (mevcut `costLog.ts:28-32` `isMissingColumn` deseni birebir). → Migration-sırası kod deploy'unu kırmaz.

---

## 2. Kuyruk yaklaşımı — `agent_tasks` mevcut motor (ADR-001)

**Karar [CERTAIN]: Yeni kuyruk motoru KURULMAZ.** `agent_tasks` zaten Postgres-tabanlı bir iş kuyruğudur; V2 worker'ları bu desenin üstüne oturur.

- **Claim/lease/retry çekirdeği** saf ve test-edilebilir: `src/lib/runs/lease.ts` — `isClaimable` (queued+`next_run_at` hazır VEYA working+bayat lease), `retryDecision` (attempts++ → `queued`+exponential backoff `30sn→15dk` tavan, yoksa kalıcı `error`), `LEASE_TTL_MS=5dk`, `computeBackoffMs`.
- **Drain + reclaim** çalışıyor: `src/app/api/cron/agent-tick/route.ts` — 5 `queued` task (oldest-first) çeker, `STALE_WORKING_MINUTES=15` cutoff ile çökmüş `working` satırları `queued`'a geri alır, `processDueSequences(10)` follow-up terfisi, CRON_SECRET bearer + `guardCronEnv`, `maxDuration=300`.
- **Yazma yüzeyi** hazır: `src/lib/runs/repo.ts` — `createRun` (`directives`), `addStep` (`agent_tasks`, `permission_scopes`/`risk_level`/`data_sensitivity` alanlarıyla), `addDependencies` (`run_step_dependencies`, `depends_on[]` DEĞİL). Yeni worker'lar `agent_tasks` insert eder; ince repo modülleri (`src/lib/email/*`, `src/lib/suppression/*`) bu deseni kopyalar (never-throws + `console.error` + `notifyOps`).
- **Gate** hazır: yazma/dış/harcama adımı `approval_requests` + `blocked_on_approval` (`mig 043`, digest-lock/idempotency/TTL).
- **Trace** hazır: her adım `run_spans` (`mig 044`, redacted `redactAttributes`).
- **Cost** hazır: `ai_cost_logs` (`actual_cost_usd`+`generation_id`, `mig 039`); `caps.ts` ($20/ay) + `leadIntel/budget.ts` ($0.40/gün).

**Sonuç:** V2 "worker" = mevcut `agent_tasks` step'i + yeni `agent_key` + (LLM'liyse) preset (`16-openrouter-routing.md`) + (yazma/dış/harcamaysa) approval gate. Altyapı net-new DEĞİL.

---

## 3. Worker kataloğu (15 worker)

**Her worker 6 evrensel özellik taşır** (rapor 21 §4): idempotent (doğal anahtar/dedup) · retry-safe (`lease.ts` backoff) · observable (`run_spans`) · cost-attributed (`ai_cost_logs`/`tool_cost_logs`) · cancelable (mode off/shadow/active + `next_run_at`) · human-review-aware (yazma/dış/harcama → `approval_requests`).

**Sınıflandırma:** `discovery`=lead/veri bulma · `enrich`=veri zenginleştirme · `email`=Gmail I/O · `governance`=hafıza/uyum · `ops`=maliyet/sağlık/retention. **Deterministik worker'lar (LLM yok):** follow-up, suppression, cost-aggregation, model-health, data-expiry, contact-verification (format kontrolü). **LLM'li:** dossier, outreach, reply-analysis, proposal, memory-consolidation.

Her worker için: **Tetik · Frekans · Kuyruk · Eşzamanlılık · Timeout · Retry · İdempotens · Dead-letter · İptal · İnsan-bekleme · Trace · Maliyet bütçesi.**

---

### 3.1 `lead-discovery` (discovery)
- **Tetik:** cron `daily-scan` (mevcut) + operatör manuel · **Frekans:** günlük `0 5 * * *` (mevcut vercel.json) · **Kuyruk:** doğrudan route (scheduled-batch); bulunan lead `agent_tasks` enqueue etmez, `leads` upsert eder · **Eşzamanlılık:** 1 (tek cron) · **Timeout:** `maxDuration` (route) + Places `MAX_PAGES=3` × ~2sn sayfa gecikmesi (`scan.ts:72`) · **Retry:** yok (ertesi gün yeniden tarar; kısmi sonuç best-effort, `scan.ts:101-108`) · **İdempotens:** `UNIQUE(google_place_id)` upsert (`mig 001:16`) → tekrar tarama dedup · **Dead-letter:** yok (idempotent, ertesi gün) · **İptal:** `DAILY_TARGET` doldu → döngü kırılır · **İnsan-bekleme:** yok · **Trace:** scan_runs + `run_spans` (opsiyonel) · **Maliyet:** ⚠ **Google Places (LOGLANMIYOR)** — `scan.ts:62,82` textsearch + `daily-scan:217` details; `tool_cost_logs` (mig 052) bunu ölçüme taşır (`22-cost-model.md`).

### 3.2 `company-refresh` (enrich)
- **Tetik:** `lead-discovery` sonrası enqueue (bayat lead) veya cron (haftalık) · **Frekans:** lead başına ≤1/hafta (freshness eşiği) · **Kuyruk:** `agent_tasks` (`agent_key='company-refresh'`) · **Eşzamanlılık:** tick limiti (5) · **Timeout:** step <30s · **Retry:** `lease.ts` (≤maxAttempts, backoff) · **İdempotens:** `lead_id + ':' + refresh_date` (gün-başına 1) · **Dead-letter:** maxAttempts sonrası `agent_tasks.status='error'` + `notifyOps` · **İptal:** lead `archived`/`do_not_contact` → skip · **İnsan-bekleme:** yok (salt-oku enrich) · **Trace:** `run_spans` · **Maliyet:** Places details (`tool_cost_logs`) + opsiyonel HTML fetch (~$0, `urlGuard`).

### 3.3 `evidence-refresh` (enrich)
- **Tetik:** qualification öncesi enqueue veya cron (bayat evidence) · **Frekans:** lead başına ihtiyaç-anında (PSI/HTML/screenshot bayatsa) · **Kuyruk:** `agent_tasks` · **Eşzamanlılık:** tick limiti · **Timeout:** step <45s (PSI yavaş olabilir) · **Retry:** `lease.ts` · **İdempotens:** `lead_id + ':' + evidence_kind + ':' + collected_date` → `lead_evidence` append (mig 033) · **Dead-letter:** `status='error'` + notifyOps · **İptal:** lead archived → skip · **İnsan-bekleme:** yok · **Trace:** `run_spans` · **Maliyet:** **PSI = $0** (25k/gün ücretsiz kota, `psi.ts:8`) [CERTAIN]; HTML fetch ~$0; screenshot storage (private bucket `lead-evidence`).

### 3.4 `contact-verification` (enrich, deterministik)
- **Tetik:** `contacts` insert/update sonrası enqueue · **Frekans:** kişi-başı 1× (+opt-in yeniden) · **Kuyruk:** `agent_tasks` · **Eşzamanlılık:** tick limiti · **Timeout:** <10s · **Retry:** `lease.ts` · **İdempotens:** `contact_id + ':' + email` → `contacts.verified`/`verified_at` set · **Dead-letter:** `status='error'` · **İptal:** contact silindi/suppress → skip · **İnsan-bekleme:** yok · **Trace:** `run_spans` · **Maliyet:** **LLM YOK** — sözdizim/MX kontrolü deterministik (Tier 0, `16-routing.md`); harici MX lookup ~$0.

### 3.5 `dossier-generation` (enrich, LLM)
- **Tetik:** `lead.qualified` sonrası enqueue (K3 araştırma ajanı) · **Frekans:** qualified lead başına 1/gün · **Kuyruk:** `agent_tasks` (`agent_key='research-agent'`) · **Eşzamanlılık:** tick limiti · **Timeout:** step <60s (çok-aşamalı) · **Retry:** `lease.ts`; LLM geçersiz-JSON → 1 retry (preset) · **İdempotens:** `lead_id + ':' + run_date` (`lead_assessments` 1/gün) · **Dead-letter:** `status='error'`; council-tarzı deterministik fallback (LLM cap aşımı → `computeDeterministicScores`) · **İptal:** cap aşıldı → deterministik; lead archived → skip · **İnsan-bekleme:** yok (salt üretim; CRM auto-update `lead.updated` event, evidence-grounded K3) · **Trace:** `run_spans` + `lead_assessments.chair_verdict` · **Maliyet:** `agencyos-research` preset; council ~$0.005/aday (canlı ikame, `22-cost`); `LEAD_INTEL_DAILY_CAP_USD=0.40` rayı.

### 3.6 `outreach-generation` (email, LLM)
- **Tetik:** `service.matched` sonrası enqueue · **Frekans:** lead başına outreach-anında · **Kuyruk:** `agent_tasks` (`agent_key='outreach-agent'`) · **Eşzamanlılık:** tick limiti · **Timeout:** <45s · **Retry:** `lease.ts`; judge fail → 1 revizyon · **İdempotens:** `outreach_message_id` (draft `outreach_messages`) · **Dead-letter:** `status='error'` · **İptal:** lead suppress/`do_not_contact` → hiç üretme · **İnsan-bekleme:** ⚠ **draft üretir, GÖNDERMEZ** — gönderim ayrı `send-gmail` adımı, `approval_requests` HITL (`12-gmail`) · **Trace:** `run_spans` (gövde YAZILMAZ, referans) · **Maliyet:** `agencyos-professional` preset; ~$0.0024/taslak (canlı, `draft_email`).

### 3.7 `gmail-sync` (email)
- **Tetik:** cron (MVP) + Pub/Sub push webhook (V2, §6) · **Frekans:** MVP `0 */2 * * *` (watch yenileme için ≥1/gün; rapor 21) · **Kuyruk:** webhook route SADECE enqueue+200 döner; asıl çekim `agent_tasks` step (Vercel süre+retry güvenliği) · **Eşzamanlılık:** 1 (hesap başına history cursor) · **Timeout:** <60s (History API sayfalama) · **Retry:** `lease.ts`; **HTTP 404 historyId → tam sync** (historyId ~1 hafta geçerli, `users.history.list?startHistoryId=`) · **İdempotens:** `gmail_message_id` UNIQUE (`email_messages`) · **Dead-letter:** `status='error'` + notifyOps; historyId kaybı → full-sync recovery · **İptal:** watch süresi doldu → yenile · **İnsan-bekleme:** yok (salt-oku) · **Trace:** `run_spans`; `email_threads.last_history_id`/`last_synced_at` · **Maliyet:** **Gmail API ücretsiz kota** (~$0); tespit ettiği inbound → `reply-process` + `bounce-handling` enqueue.

### 3.8 `follow-up-schedule` (email, deterministik)
- **Tetik:** cron + `email.sent` sonrası (ilk step planla) · **Frekans:** günlük · **Kuyruk:** `processDueSequences` (`sequences.ts`) → `agent_tasks` terfi (mevcut agent-tick deseni) · **Eşzamanlılık:** 1 (cron) · **Timeout:** <30s · **Retry:** `lease.ts` · **İdempotens:** `lead_id + ':' + step` (`follow_up_sequences` doğal; `done` flag) · **Dead-letter:** yok (deterministik terfi) · **İptal:** ⚠ **yanıt/bounce/opt-out/suppression → açık job'ları İPTAL** (`follow_up_sequences.state='cancelled'`, `reason`) — saf state-transition, LLM YOK · **İnsan-bekleme:** gönderilecek follow-up taslağı yine `send-gmail` HITL'e düşer · **Trace:** `run_spans` + `state` · **Maliyet:** **LLM YOK** (5-7 iş günü + TR tatil/iş-günü deterministik).

### 3.9 `reply-analysis` (email, LLM)
- **Tetik:** `gmail-sync` inbound tespiti sonrası enqueue (`email.replied`) · **Frekans:** gelen mesaj başına 1 · **Kuyruk:** `agent_tasks` (`agent_key='reply-process'`) · **Eşzamanlılık:** tick limiti · **Timeout:** <30s · **Retry:** `lease.ts`; geçersiz-JSON 1 retry · **İdempotens:** `email_message_id` (1 analiz/mesaj, `reply_classifications`) · **Dead-letter:** `status='error'`; düşük-confidence → otomatik iş YOK · **İptal:** — · **İnsan-bekleme:** ⚠ cevap **TASLAĞI** üretir, göndermez; `lead.status` `contacted→responded` tetikler (`pipelineGate` disiplini); gönderim HITL · **Trace:** `run_spans` (⚠ e-posta içeriği DATA, talimat değil — C8 prompt-injection sınırı) · **Maliyet:** `agencyos-fast-extract` (prefilter) → `agencyos-professional` (draft); deterministik prefilter LLM'siz.

### 3.10 `proposal-generation` (enrich, LLM)
- **Tetik:** `reply.classified` (olumlu intent) veya operatör · **Frekans:** fırsat başına (nadir; ~1/hafta normal senaryo) · **Kuyruk:** `agent_tasks` (`agent_key='proposal-agent'`) · **Eşzamanlılık:** tick limiti · **Timeout:** <60s · **Retry:** `lease.ts` · **İdempotens:** `lead_id + ':' + version` (`proposals` version chain, append-only) · **Dead-letter:** `status='error'` · **İptal:** proposal gate fail (pain+decision_maker+budget yoksa → 422, `pipelineGate.ts`) · **İnsan-bekleme:** ⚠ draft; gönderim `send-gmail` HITL; ⚠ **fiyat AI-uydurmaz** (price-rules/operatör) · **Trace:** `run_spans` + `proposals` · **Maliyet:** `agencyos-professional` (default) → `agencyos-premium-deal` yalnız explicit escalation (HITL); ~$0.011/teklif (canlı sonnet-5); `budgetUsdMax:0.2` cap (`catalog.ts`).

### 3.11 `memory-consolidation` (governance, LLM)
- **Tetik:** cron + `reply.classified` sonrası enqueue · **Frekans:** günlük + olay-tetikli · **Kuyruk:** `agent_tasks` (`agent_key='relationship-memory'`) · **Eşzamanlılık:** tick limiti · **Timeout:** <30s · **Retry:** `lease.ts` · **İdempotens:** `memory_key + occurrence merge` (scope+subject); `scope_type + ':' + scope_id + ':' + layer + ':' + memory_key` · **Dead-letter:** `status='error'` · **İptal:** — · **İnsan-bekleme:** ⚠ promosyon eşiği (occurrence≥3) VEYA `human_approved` (mig 050) high-sensitivity için; quarantine→active governance (`governance.ts`, değişmez) · **Trace:** `run_spans` · **Maliyet:** `agencyos-memory` preset (extract qwen → consolidate luna → high-risk sonnet); embed düşük (Google `gemini-embedding-001`, router-dışı). ⚠ **Cross-lead izolasyon:** retrieval `WHERE scope_type='global' OR scope_id=$1` SQL'de zorunlu + `lead:<id>:` key prefix.

### 3.12 `cost-aggregation` (ops, deterministik)
- **Tetik:** cron · **Frekans:** günlük (saatlik opsiyonel) · **Kuyruk:** doğrudan cron route veya `agent_tasks` · **Eşzamanlılık:** 1 · **Timeout:** <30s · **Retry:** `lease.ts` · **İdempotens:** `generation_id` (tahmini `cost_usd` → gerçek `actual_cost_usd` uzlaşma) · **Dead-letter:** `status='error'` · **İptal:** — · **İnsan-bekleme:** yok · **Trace:** `run_spans` · **Maliyet:** **LLM YOK**; ⚠ **council parity KIRILMAZ** (`costLog.ts:6-9`: canlı yolda `cost_usd` DAİMA tahmini; gerçek yalnız `actual_cost_usd`) — günlük/aylık cap günceller (`caps.ts`+`leadIntel/budget.ts`); `tool_cost_logs` (mig 052) Places toplamını da toplar.

### 3.13 `model-health-check` (ops, deterministik)
- **Tetik:** cron (nightly) · **Frekans:** günlük · **Kuyruk:** doğrudan cron route · **Eşzamanlılık:** 1 · **Timeout:** <20s · **Retry:** `lease.ts` · **İdempotens:** `check_date` (gün-başına 1) · **Dead-letter:** `status='error'` · **İptal:** — · **İnsan-bekleme:** yok · **Trace:** `run_spans`; **drift → system-health uyarısı** (`20-observability`, kullanıcı-analytics'ten AYRI) · **Maliyet:** **LLM YOK** — `GET /api/v1/models` çeker, `PRESETS` primary+fallback ID'lerini canlı katalogla karşılaştırır (`16-routing.md` §6). ⚠ Bu iş tam da neden gerekli: bugün 3 repo model ID'si (`gemini-2.5-flash-lite`, `claude-haiku-4-5`, `deepseek-v4-pro`) canlıda 404 — stale-model riskini reaktiften proaktife taşır.

### 3.14 `data-expiry` (ops, deterministik)
- **Tetik:** cron · **Frekans:** günlük · **Kuyruk:** doğrudan cron route veya `agent_tasks` · **Eşzamanlılık:** 1 · **Timeout:** <60s (batch) · **Retry:** `lease.ts` · **İdempotens:** `retention_until` filtre (tekrar-güvenli; zaten özetlenmiş satır atlanır) · **Dead-letter:** `status='error'` · **İptal:** — · **İnsan-bekleme:** yok · **Trace:** `run_spans` · **Maliyet:** **LLM YOK** (özetleme deterministik/şablon); `run_spans` 30g, `agent_memory` 90g+decay, `email_messages.body` 24 ay → özete indir (KVKK veri-minimizasyonu, `assumption:` retention süreleri operatör kararı).

### 3.15 `suppression-maintenance` (governance, deterministik)
- **Tetik:** `bounce-handling` (gmail-sync DSN), complaint, opt-out, manuel · **Frekans:** olay-tetikli (anlık) · **Kuyruk:** `agent_tasks` veya inline (kritik yol) · **Eşzamanlılık:** upsert-güvenli · **Timeout:** <10s · **Retry:** `lease.ts` · **İdempotens:** `UNIQUE(address)` upsert · **Dead-letter:** `status='error'` (kritik → notifyOps) · **İptal:** — · **İnsan-bekleme:** manuel yazımda operatör; her yazım `source`+`reason`+`operator` · **Trace:** `run_spans` + append kaydı · **Maliyet:** **LLM YOK** — hard bounce/complaint/unsubscribe → **anında** suppress; soft bounce 30g'de 3-5× → suppress; **her outbound öncesi zorunlu kontrol** (C9, `21-security`).

---

## 4. Cron eklemeleri (`vercel.json`)

Mevcut 10 cron path (daily-scan, opportunity-scan, agent-tick ×1, job-scan, person-scan, orchestrator ×4, weekly-retro) korunur. **Yeni eklenecek** (rapor 21 §6):

| Path | Schedule | Worker | Not |
|------|----------|--------|-----|
| `/api/cron/gmail-sync` | `0 */2 * * *` | 3.7 | watch yenileme için ≥1/gün; her 2 saatte inbound tarama |
| `/api/cron/follow-up-scheduler` | `0 8 * * *` | 3.8 | günlük terfi + iptal; TR iş-günü |
| `/api/cron/cost-aggregation` | `0 1 * * *` | 3.12 | gecelik uzlaşma |
| `/api/cron/model-health-check` | `0 2 * * *` | 3.13 | nightly drift tespiti |
| `/api/cron/data-expiry` | `0 3 * * *` | 3.14 | gecelik retention |

- Tüm yeni route'lar: **CRON_SECRET bearer + `guardCronEnv`** (mevcut agent-tick deseni). `"fluid": true` açık; uzun step `maxDuration` ile korunur.
- **Vercel cron dakika-altı tetik VEREMEZ.** Sub-dakika gecikme gereken tek akış = gelen-yanıt bildirimi → §6 (Pub/Sub push V2), cron değil.
- **`/api/webhooks/gmail`** (V2): ayrı route, CRON_SECRET yerine **Google JWT** doğrular, enqueue+200 döner (asıl çekim tick worker).

---

## 5. Gmail refresh token → Supabase Vault şifreleme

⚠ **[ASSUMPTION → bağımsız güvenlik incelemesi ZORUNLU]** Refresh token bir kimlik bilgisidir. `gmail_accounts` tablosu App DB'de, politikasız-RLS + service-role-only.

- **Token asla düz metin değil** — Supabase **Vault** (`vault.secrets`, pgsodium/`aead` şifreleme) ile saklanır; `gmail_accounts` yalnız `vault_secret_id` (UUID referans) tutar, token'ın kendisini değil. Okuma yalnız server-side service-role; log/rapor/backup'a **asla** yazılmaz (global CLAUDE.md secret politikası).
- **Repo'da HENÜZ YOK:** Vault entegrasyonu mevcut kodda değil → Sprint 0'ın Gmail-OAuth önkoşuluyla **birlikte** güvenlik incelemesi + implementasyon kararı. Bu tablo yüksek-risk → KVKK/hukuk onayı olmadan canlıya alınmaz. [rapor 21 §7, açık soru 2]
- **Scope:** `send + readonly` (plan §3 ruling); `modify`/full YASAK. Watch (`users.watch`) ≥7 günde bir, önerilen günde 1× yenilenir → `gmail_accounts.watch_expires_at` kolonu zorunlu.
- **Migration:** `gmail_accounts` tablosu bu dokümanın 045-053 aralığına **ayrı bir numarayla eklenmeli** — plan §5 açıkça listelemiyor. **Öneri: 046'ya dahil et** (email altyapısıyla aynı migration) VEYA ihtiyaç anında **054** olarak aç. Build kararı; bu doküman 046-içi `gmail_accounts` önerir (email thread/message ile aynı domain, tek atomik migration).

---

## 6. Inbound: poll (MVP) → Pub/Sub push (V2)

- **MVP = poll:** `gmail-sync` cron (`0 */2 * * *`) History API artımlı çekim. Gecikme ≤2 saat; yanıt-sınıflandırma zaman-kritik değil (HITL zaten insan hızında). Basit, ek altyapı yok, JWT doğrulama yok. [plan §3 ruling: MVP poll]
- **V2 = push:** Gmail `users.watch` + Cloud Pub/Sub → `/api/webhooks/gmail` (Base64URL JSON = `emailAddress`+`historyId`). Sub-dakika gecikme; webhook SADECE enqueue+200, tick çeker. **Bloklar [UNKNOWN]:** Pub/Sub topic + service-account kurulumu Vercel ortamında; JWT doğrulama canlı test gerektirir (rapor 21 açık soru 1). MVP'yi bloke etmez.

---

## 7. Retention & PII minimizasyonu (data-expiry sahibi)

| Veri | Retention | Aksiyon | Kaynak |
|------|-----------|---------|--------|
| `run_spans` | 30 gün | özetle + düşür (`retention_until`) | mig 044 |
| `agent_memory` | 90 gün + decay | half-life 30g confidence decay | mig 050 |
| `email_messages.body` | 24 ay `assumption:` | gövde → özet (PII minimizasyonu) | mig 046 |
| `reply_classifications` | 12 ay `assumption:` | düşür | mig 051 |
| `lead_evidence` (screenshot) | retention cron | private bucket temizlik | mig 032/033 |
| `consent_records`, `suppression_list`, `proposals` | **kalıcı** (yasal/append-only) | dokunma | mig 047/049 |

⚠ 24 ay/12 ay süreleri **iş gereksinimi mi yasal tavan mı — operatör kararı** (rapor 21 açık soru 6). KVKK veri-minimizasyonu ilkesiyle hizalı; hukuki kesinlik iddia edilmez.

---

## Grounding & açık noktalar

- **Repo atıfları:** `supabase/migrations/001-044` (dosya listesi, en yüksek=044), `lease.ts` (isClaimable/retryDecision/LEASE_TTL_MS/backoff), `agent-tick/route.ts` (drain/reclaim/STALE_WORKING_MINUTES/maxDuration=300), `runs/repo.ts` (createRun/addStep/addDependencies), `vercel.json` (10 cron, fluid:true), `scan.ts:42-82` (Places textsearch, GOOGLE_MAPS_KEY, MAX_PAGES=3, UNLOGGED), `daily-scan/route.ts:182,217` (textsearch+details, UNLOGGED), `costLog.ts` (isMissingColumn strip-retry, council parity), `caps.ts` ($20/ay settings-override), `psi.ts:8` (PSI $0).
- **Canlı doğrulama:** `list_migrations` (App DB, 2026-07-11) — 9 timestamp-adlı migration (20260703…); repo dosya numaralandırmasıyla çakışma yok; **045 serbest** [CERTAIN].
- **Kanonik karar:** 045-053 bu dokümanın sahipliğinde; build `list_migrations` ile son-kez doğrular; `gmail_accounts` → 046-içi (öneri) veya 054.
- **[ASSUMPTION]** retention süreleri (24ay/12ay/90g) operatör/hukuk kararı; refresh-token Vault entegrasyonu net-new + güvenlik incelemesi; `agent_memory` scope kolonu mevcut retrieval (`retrieve.ts`, knowledgeIndex) ile çakışmaz varsayıldı (doğrulanmalı, rapor 21 açık soru 3).
- **[UNKNOWN]** Pub/Sub push kurulumu + JWT doğrulama (V2); Gmail DSN bounce sinyali gecikmeli/eksik olabilir (dedike bounce webhook yok, rapor 21 açık soru 5).
- **Cross-refs:** `04-domain-model.md` (entity↔migration), `05-event-contracts.md` (worker↔event tüketici haritası), `12-gmail-and-followup-engine.md` (gönderim HITL), `16-openrouter-routing.md` (worker preset + nightly verify), `20-observability-and-analytics.md` (system-health drift alarmı), `22-cost-model.md` (tool_cost_logs Places funnel).
