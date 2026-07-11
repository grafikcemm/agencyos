---
Doküman: veri-ve-worker-mimarisi
Tarih: 2026-07-11
Kaynak kalitesi: karışık
Güven: yüksek
AgencyOS'a etki: E-posta gönder/oku, reply-intelligence ve follow-up state-machine için gereken yeni entity ve worker'ları, mevcut kanonik run/step + lease-retry + agent_memory governance altyapısının ÜSTÜNE (yeni bir kuyruk sistemi kurmadan) haritalar.
---

## Kısa özet

AgencyOS'un satış döngüsündeki gerçek boşluklar (Gmail gönder/oku, reply-intelligence, follow-up state-machine, ilişki hafızası, portfolyo eşleme) veri şeması ve worker eksikliği. Bu doküman iki soruya cevap verir: (1) hangi entity'ler **yeni tablo** gerektirir, hangileri **mevcut tabloyu genişletir/kullanır** — böylece `leads`, `person_leads`, `outreach_messages`, `follow_up_sequences`, `agent_memory`, `agent_tasks`, `approval_requests`, `run_spans` yeniden yaratılmaz; (2) yeni worker'lar mevcut **kanonik run/step + ADR-001 lease/retry** (`supabase/migrations/038_canonical_run_model.sql`, `src/lib/runs/lease.ts`) ve **HITL onay** (`043_approvals_hitl.sql`) altyapısına nasıl oturur.

Temel karar [CERTAIN]: **Yeni bir kuyruk motoru KURULMAZ.** `agent_tasks` (= kanonik step) zaten Postgres-tabanlı bir iş kuyruğudur; lease/retry sütunları (`lease_owner`, `lease_expires_at`, `attempts`, `next_run_at`) mig 038'de eklendi; `agent-tick` cron'u zaten bunu drain ediyor ve bayat `working` satırları geri alıyor (`src/app/api/cron/agent-tick/route.ts`). Yeni worker'lar bu deseni genişletir. Tüm yeni satış/e-posta durumu **App DB'ye** yazılır; LIFE/FTG DB (`src/lib/lifeSupabaseAdmin.ts`, görev/alışkanlık) hiç dokunulmaz.

---

## 1. Entity haritası — yeni vs mevcut

| Entity | Karar | Nereye bağlanır / gerekçe |
|---|---|---|
| **Contact** | Yeni (ince köprü) | `leads`(firma) ve `person_leads`(kişi) var ama kanonik "kanal sahibi kimlik" yok. `contacts`: `lead_id`/`person_lead_id` FK + doğrulama durumu. Yeni değil ama birleştirici. [LIKELY] |
| **ContactChannel** | Yeni | Bir kişinin çok e-posta/telefon/IG'si olabilir; `leads.email` tekil. `contact_channels(contact_id, channel, address, is_primary, verified, consent_state)`. |
| **EmailThread** | Yeni | Gmail `threadId` + son `historyId` ankraj; `outreach_messages` draft-only ve Gmail thread modeline eşlenmez. |
| **EmailMessage** | Yeni | Gmail `messageId`/`In-Reply-To`/`References`; gelen+giden gerçek posta. `outreach_messages`'tan AYRI (o taslak defteri). |
| **ReplyAnalysis** | Yeni | Gelen `EmailMessage` başına 1 sınıflandırma (niyet/duygu/itiraz/sonraki adım). Türetilmiş; ham metin değil özet+skor. |
| **FollowUpRule** | Yeni (küçük config) | State-machine kuralları (koşul→aksiyon→gecikme). Bugün `channelMatrix.ts` kodda sabit; kuralı DB'ye alır. |
| **FollowUpJob** | **Mevcut = `follow_up_sequences`** | Zaten "zamanı gelince agent_task'a terfi eden sıradaki adım" tablosu (mig 010). Yeniden yaratma; `reason`/`state` sütunu ekle. [CERTAIN] |
| **PortfolioItem** | Yeni | `career.portfolio_gap` skill kayıtlı, handler yok (registry). `portfolio_items(title, service_slugs[], sector_tags[], proof_url, metrics_jsonb)`. Sadece GERÇEK iş. |
| **ContactMemory / CompanyMemory / OutreachMemory / OfferMemory** | **Mevcut = `agent_memory` genişletmesi** | `agent_memory` (mig 044) governance'lı (quarantine/confidence/provenance/retention). 4 tablo YERİNE `scope`+`subject_type`+`subject_id` sütunları ekle; retrieval namespace'le filtreler. [LIKELY] |
| **SuppressionEntry** | Yeni (kritik) | `suppression_list(address, reason, scope, source, operator, created_at)`. Merkezî; her gönderim öncesi zorunlu kontrol. |
| **ConsentRecord** | Yeni (kritik) | İYS/KVKK. `018_compliance_footer.sql` yalnız footer ayarı; kişi-başı onay/itiraz kaydı yok. Append-only. |
| **Opportunity (satış anlaşması)** | **Mevcut = `leads.status` + `projects`** | Pipeline durumu `leads.status`(new→…→converted/lost) + kazanılan iş `projects`(mig 001). Mig 008 `opportunity_*` PAZAR/ürün fırsatıdır, satış anlaşması DEĞİL — karıştırma. MVP'de yeni deal tablosu açma. [LIKELY] |
| **ProposalVersion** | Yeni | `proposalGenerator.ts` metin üretir, versiyonlu saklama yok. `proposal_versions(lead_id, version, body, price_snapshot, evidence_refs[], status)`. |

---

## 2. Yeni entity detayları

Her yeni tablo App DB'de, **politikasız RLS + `REVOKE ALL FROM anon, authenticated`** deseniyle (service-role bypass — mig 029/033/043/044 ile aynı). Tümü additive + idempotent migration; tek atomik `BEGIN/COMMIT`.

| Entity | Purpose | Hassas alanlar | Kaynak | Retention | Anahtar index | İlişkiler | Denetlenebilirlik |
|---|---|---|---|---|---|---|---|
| `contacts` | Kanonik kişi kimliği | ad, e-posta | `leads`/`person_leads` join | Lead'le aynı | `(lead_id)`, `(person_lead_id)` | 1—N `contact_channels`, `email_threads` | `created_at`, `source` |
| `contact_channels` | Adreslenebilir kanallar | address(PII) | enrichment/manuel | Lead'le aynı | `unique(channel,address)` | N—1 `contacts` | `verified_at`, `consent_state` |
| `email_threads` | Gmail thread ankraj | konu | Gmail sync | 24 ay (config) | `unique(gmail_thread_id)`, `(contact_id)` | 1—N `email_messages` | `last_history_id`, `last_synced_at` |
| `email_messages` | Gerçek gelen/giden posta | **gövde (PII)**, header | Gmail sync/gönderim | 24 ay → sonra özet | `unique(gmail_message_id)`, `(thread_id)` | N—1 thread; 1—1 `reply_analyses` | `direction`, `sent_at`, `message_id_header` |
| `reply_analyses` | Yanıt niyeti/aksiyonu | özet (ham metin değil) | reply-process worker | 12 ay | `(email_message_id)`, `(intent)` | N—1 message | `model`, `run_id`, `cost_usd` |
| `follow_up_rules` | State-machine config | — | operatör | Kalıcı | `(active)` | referans: `follow_up_sequences` | `updated_at`, `updated_by` |
| `portfolio_items` | Kanıtlı iş örnekleri | — (public proof) | operatör | Kalıcı | `(service_slugs gin)`, `(sector_tags gin)` | eşleşme: `service_catalog` | `created_at` |
| `suppression_list` | Gönderim engeli | address | bounce/complaint/opt-out/manuel | Kalıcı | `unique(address)`, `(scope)` | kontrol: her gönderim | **her yazımda source+reason+operator** |
| `consent_records` | KVKK/İYS onay-itiraz | address, dayanak | İYS/manuel/itiraz | Yasal (kalıcı, append-only) | `(contact_id)`, `(state)` | N—1 `contacts` | append-only, immutable |
| `proposal_versions` | Versiyonlu teklif | fiyat, gövde | `proposalGenerator.ts` | 24 ay | `(lead_id, version)` | N—1 `leads` | `status`, `created_by`, `approved_by` |

**`agent_memory` genişletme (4 memory entity yerine):** `ALTER TABLE agent_memory ADD COLUMN scope TEXT` ('contact'|'company'|'outreach'|'offer'|'core') + `subject_type` + `subject_id UUID`. Governance mantığı (`src/lib/memory/governance.ts` — `promotionDecision`, `confidenceFromOccurrences`, retention) değişmez; yalnız retrieval `scope`+`subject_id`'ye göre daraltılır. Bu, "ilişki hafızası jenerik" boşluğunu tek kötü turun hafızayı zehirlemesine izin vermeden kapatır.

---

## 3. Mevcut şemayla örtüşme haritası (yeniden yaratma)

| İhtiyaç | Mevcut yüzey | Aksiyon |
|---|---|---|
| İş kuyruğu / step | `agent_tasks` + lease/retry (mig 038) | Genişlet; yeni worker'lar `agent_tasks` insert eder |
| Run başlığı | `directives` (= run, mig 038 sütunları) | `runs` view'ı üzerinden oku; `src/lib/runs/repo.ts` API |
| Bağımlılık | `run_step_dependencies` (mig 038) | Kullan (`depends_on[]` DEĞİL) |
| Onay bekleme | `approval_requests` + `blocked_on_approval` (mig 043) | E-posta gönderimi bu kapıdan geçer |
| İz/telemetri | `run_spans` (mig 044, redacted) | Her worker adımı span yazar (`src/lib/trace/spans.ts`) |
| Maliyet | `ai_cost_logs` (`actual_cost_usd`+`generation_id`, mig 039) + `settings` cap | reply-process/council buraya yazar |
| Taslak defteri | `outreach_messages` (draft-only, mig 010) | KORU; `email_messages` bundan AYRI (gerçek posta) |
| Sıradaki adım | `follow_up_sequences` (mig 010) | = FollowUpJob; `state`/`reason` sütunu ekle |
| Hatırlatma | `follow_ups` (mig 014, dashboard) | Ayrı — karıştırma (mig 014 notu bunu açıkça yazar) |
| Kanıt | `lead_evidence` (mig 033) | reply/portfolyo kanıtı buraya bağlanabilir |
| Kişi lead | `person_leads` (mig 027) | `contacts.person_lead_id` ile köprü |

---

## 4. Worker / kuyruk kataloğu

Her worker şu 6 özelliği taşır: **idempotent** (doğal anahtar/dedup), **retry-safe** (`lease.ts` backoff), **observable** (`run_spans`), **cost-attributed** (`ai_cost_logs`), **cancelable** (mode off/shadow/active + `next_run_at`), **human-review-aware** (yazma/dış/harcama → `approval_requests`).

| Worker | Tetik | İdempotens anahtarı | HITL? | Maliyet |
|---|---|---|---|---|
| **gmail-sync** | cron (günlük) + Pub/Sub push | `gmail_message_id` unique | Hayır (salt-oku) | Yok (API) |
| **reply-process** | gmail-sync sonrası enqueue | `email_message_id` (1 analiz) | Aksiyon önerir → gönderim HITL | LLM |
| **follow-up-scheduler** | cron (günlük) | `(lead_id, step)` + `done` | Hayır (yalnız terfi) | Yok |
| **memory-consolidation** | cron + reply sonrası | `memory_key`+occurrence merge | Promosyon eşiği/onay | Embed (düşük) |
| **bounce-handling** | gmail-sync (DSN tespiti) | bounce `message_id` | Hayır | Yok |
| **suppression-update** | bounce/complaint/opt-out/manuel | `unique(address)` upsert | Manuel yazımda operatör | Yok |
| **cost-aggregation** | cron (saatlik/günlük) | `generation_id` | Hayır | Yok |
| **data-expiry** | cron (günlük) | `retention_until` filtre | Hayır | Yok |

**Worker davranış notları (birincil kaynak: Google):**
- **gmail-sync** — Artımlı sync: son mesajın `historyId`'sini sakla, `users.history.list?startHistoryId=` ile kısmi çek; **HTTP 404 → tam sync** (historyId ~1 hafta geçerli, nadiren birkaç saat). Push için `users.watch` **en az 7 günde bir**, önerilen **günde 1 kez** yenilenmeli; watch response `expiration` + `historyId` döner. Push mesajı Base64URL JSON = `emailAddress`+`historyId`. ([Sync](https://developers.google.com/workspace/gmail/api/guides/sync), [Push](https://developers.google.com/workspace/gmail/api/guides/push), 2026-07-11, güven: yüksek). Bu yüzden `email_threads.last_history_id` + `gmail_accounts.watch_expires_at` sütunları zorunlu. Webhook route SADECE enqueue eder + 200 döner; gerçek çekimi tick worker yapar (Vercel fonksiyon süresi + retry güvenliği).
- **reply-process** — Gelen mesajı `ReplyAnalysis`'e sınıflar; niyet 'olumlu/itiraz/soru/ret/opt-out' + önerilen sonraki adım. Cevap TASLAĞI üretir ama **göndermez** — gönderim `email.send` scope'lu adım olarak `approval_requests`'e düşer (lethal-trifecta: dış+yazma). Never-throws; `lead.status` 'contacted'→'responded' geçişini tetikler (`pipelineGate.ts` disiplinine saygı).
- **follow-up-scheduler** — `follow_up_rules`'u thread durumuna karşı değerlendirir; yanıt geldiyse VEYA `suppression_list`/opt-out varsa açık FollowUpJob'ları **iptal eder** (deterministik state-transition — LLM yok). Zamanı gelenleri `processDueSequences` deseniyle (`src/lib/outreach/sequences.ts`) agent_task'a terfi eder.
- **suppression-update / bounce-handling** — Suppression merkezî ve gönderimden önce sorgulanır; her yazım `source`+`reason`+`operator` kaydeder. Hard bounce/complaint/unsubscribe → **anında** suppress; soft bounce 30 günde 3–5× → suppress. Pazarlama vs işlemsel ayrı mantık. ([Suppression best practices](https://www.sender.net/blog/email-suppression-list/), 2026, güven: orta). Opt-out varsayılan; RFC 8058 one-click unsubscribe alanı `email_messages` header'ında.
- **cost-aggregation** — Tahmini `cost_usd`'yi (parity için sabit) `generation_id` ile gerçek `actual_cost_usd`'ye uzlaştırır; günlük/aylık cap'i (`src/lib/ai/caps.ts`, `settings.ai_daily_caps`) günceller. Council parity KIRILMAZ (mig 039 notu).
- **data-expiry** — `run_spans.retention_until` dolanları özetle+düşür; `agent_memory` 90g; `email_messages` gövdesini 24 ay sonra özetine indirgeyerek PII minimizasyonu. KVKK veri-minimizasyonu ile hizalı.

---

## 5. İş sınıfları (job classes)

| Sınıf | Örnek | Yürütme | Bütçe/limit |
|---|---|---|---|
| realtime | Operatör taslağı onaylar → gönder | Senkron API route | — |
| short-bg | Tek yanıt sınıflandırması | 1 step, <30s tick | Düşük LLM |
| scheduled-batch | daily-scan, gmail-sync, follow-up-scheduler | Vercel cron → tick drain | `limit N` |
| long-research | Lead-intel konseyi, opportunity-scan | Çok-step, dakikalar | `budget.ts` $0.40/gün |
| human-approval-wait | E-posta gönderim adımı | `blocked_on_approval` (mig 043) | digest+TTL |
| webhook | Gmail Pub/Sub push, Telegram | enqueue→200, tick işler | — |
| high-cost | Multimodal C1 (screenshot) | Cap-gated (caps.ts + budget.ts) | Aylık $ cap |

**Karar [CERTAIN]:** Deterministik işler (tarih hesabı, dedup, state-transition, suppression) **LLM'siz** — yalnız reply-process ve council LLM kullanır. En pahalı model varsayılan değil; model seçimi mevcut `OPERATION_MODEL_MAP` (`src/lib/openrouter.ts`) üzerinden, canlı `/api/v1/models` doğrulamasıyla.

---

## 6. Kuyruk yaklaşımı — mevcutun üstüne

**Postgres-as-queue, mig 038 + `lease.ts` üstüne (yeni altyapı yok):**

1. **Claim** — `agent-tick` cron'u `agent_tasks`'ı `status IN ('queued')` + `next_run_at` hazır olanlar için tarar; ADR-001 `FOR UPDATE SKIP LOCKED` + `lease_owner`/`lease_expires_at` set eder (`idx_agent_tasks_lease`). Çakışma-güvenli çoklu tick.
2. **Reclaim** — bayat `working` (lease/started_at eski) satırlar kuyruğa geri alınır (agent-tick bunu 15dk cutoff ile zaten yapıyor; `run_steps` lease reclaim'inin `agent_tasks` karşılığı).
3. **Retry** — hata → `retryDecision` (`lease.ts`): kalan hak varsa `queued`+exponential backoff (30sn→15dk tavan), yoksa kalıcı `error`.
4. **Gate** — yazma/dış/harcama adımı yürütülmeden `approval_requests` (digest-lock/idempotency/TTL, mig 043) beklenir.
5. **Trace** — her adım `run_spans` (redacted) yazar.

**Yeni cron'lar** `vercel.json`'a eklenir (mevcut 6 path deseni): `gmail-sync` (örn. `0 */2 * * *` — watch yenileme için günde ≥1), `follow-up-scheduler` günlük, `cost-aggregation` günlük, `data-expiry` günlük. Vercel Fluid (`"fluid": true`) açık; uzun step'ler `maxDuration` ile korunur (agent-tick zaten 300). Pub/Sub push için ayrı `/api/webhooks/gmail` route — CRON_SECRET yerine Google JWT doğrular, enqueue eder.

**Çıkarım:** Vercel cron dakika-altı tetik veremez; sub-dakika gecikme gereken tek akış gelen-yanıt bildirimidir → onu Pub/Sub push + hızlı enqueue karşılar, cron değil.

---

## 7. İki-Supabase mimarisine saygı

[CERTAIN] Tüm yeni satış/e-posta/worker tabloları **App DB**'de (`src/lib/supabase.ts` → `supabaseAdmin`, mig 001–044 dizisi). LIFE/FTG DB (`lifeSupabaseAdmin`, `active_tasks`/`habits`) **hiç dokunulmaz** — yalnız ayrım notu. Cross-DB FK yok; iki proje ayrı.

**Gmail OAuth token'ı [ASSUMPTION → güvenlik incelemesi gerekir]:** refresh token bir kimlik bilgisidir. `gmail_accounts` App DB'de, politikasız-RLS + service-role-only; token Supabase Vault/pgsodium ile şifreli saklanmalı, asla düz metin/log/rapor değil. Bu tablo yüksek-risk → bağımsız güvenlik incelemesi + KVKK/hukuk onayı olmadan canlıya alınmaz.

---

## AgencyOS'a entegrasyon

- **Migration'lar** `supabase/migrations/045_*`+ olarak, mevcut deseni birebir kopyalayarak (additive, idempotent, `BEGIN/COMMIT`, RLS+REVOKE, `NOTIFY pgrst`). App DB'ye elle SQL Editor ile (programatik uygulanamıyor — mig 031/033 notları).
- **Repo API** yeni tablolar için `src/lib/runs/repo.ts` desenli ince repository modülleri (`src/lib/email/*`, `src/lib/suppression/*`, `src/lib/consent/*`). Yazma servisleri never-throws + `console.error` + `notifyOps` (agent-tick deseni).
- **Worker'lar** `agent_tasks` insert eder; `src/lib/agents/runner.ts` + `processDueSequences` genişletilir. Yeni cron route'lar `src/app/api/cron/{gmail-sync,follow-up-scheduler,cost-aggregation,data-expiry}/route.ts` — CRON_SECRET bearer + `guardCronEnv`.
- **Memory** genişletmesi `governance.ts`'yi değiştirmez; retrieval `scope` filtresi `src/lib/memory/`'e eklenir.
- **Gate** e-posta gönderimi Brain v2 `gate.ts`/`execute.ts` üzerinden `approval_requests`'e; scope 'external'+'write'.

## MVP / V1 / V2

- **MVP** — `contacts`+`contact_channels` köprüsü, `email_threads`+`email_messages`, `gmail-sync` (salt-oku + günlük watch), `reply-process` (sınıflandır + TASLAK, HITL gönderim), `suppression_list`+`consent_records`, `follow_up_sequences`'a `state`/`reason` sütunu. Gönderim İNSAN ONAYI olmadan asla. Deterministik işler LLM'siz.
- **V1** — `follow_up_rules` state-machine + follow-up-scheduler iptal mantığı; `agent_memory` scope genişletmesi (Contact/Company/Outreach/Offer hafızası); `proposal_versions`; `bounce-handling`+`cost-aggregation` worker'ları; Pub/Sub push webhook.
- **V2** — `portfolio_items` + proof-matching (portfolio_gap handler wire); OutreachMemory'den öğrenen Voice DNA; `data-expiry` tam otomasyon + e-posta gövdesi özet-indirgeme; tek günlük satış merkezi UI (ayrı doküman).

## Açık sorular / doğrulanamayanlar

1. **[UNKNOWN]** Gmail Pub/Sub topic + service-account kurulumu Vercel ortamında; push webhook JWT doğrulama detayı canlı test gerektirir.
2. **[UNKNOWN]** Refresh token'ın Supabase Vault ile şifreli saklanması repo'da henüz yok — güvenlik incelemesi + implementasyon kararı ayrı.
3. **[ASSUMPTION]** `agent_memory`'ye scope sütunu eklemenin mevcut retrieval (`src/lib/skills/retrieve.ts`, knowledgeIndex) ile çakışmadığı varsayıldı; doğrulanmalı.
4. **[UNKNOWN]** KVKK: kurumsal vs kişisel adres ayrımının `contact_channels`'ta nasıl işaretleneceği — hukuki kesinlik iddia edilmez, profesyonel hukuk incelemesi flag'lenir (İYS zorunluluğu, ilk itirazda dur).
5. **[LIKELY]** Bounce tespiti Gmail'de DSN/`delivery-status` MIME'ından; dedike bounce webhook (Resend/SES) yok — Gmail gönderiminde bounce sinyali gecikmeli/eksik olabilir, doğrulanmalı.
6. **[UNKNOWN]** 24 ay e-posta retention'ı iş gereksinimi mi yasal tavan mı — operatör kararı.
