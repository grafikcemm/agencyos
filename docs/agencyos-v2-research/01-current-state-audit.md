---
Doküman: 01-current-state-audit
Tarih: 2026-07-11
Kaynak kalitesi: birincil (repo denetimi — 3 paralel Explore ajanı, dosya-satır kanıtlı)
Güven: yüksek (kod okundu); "canlı DB" ve "gerçek runtime davranışı" için orta (kod ≠ deploy)
AgencyOS'a etki: Tüm v2 planlaması bu envanter üstüne kurulur — neyin korunacağı, neyin genişletileceği, neyin eksik olduğu.
---

# AgencyOS — Mevcut Durum Denetimi

> Kaynak: `c:\Users\alice\.gemini\antigravity\scratch\agency-os`, branch `feat/ftg-merge`. Üç bağımsız read-only Explore denetiminin sentezi (UI/frontend, backend/data/lead-engine, AI/agent/skill/eval). Her iddia repo dosya yoluna dayanır.

## 0. Tek cümle
AgencyOS, brief'in "sıfırdan kurulacak" varsaydığı Revenue-OS vizyonunun **~%65'ini zaten içeriyor** — ama çoğu **shadow/kapalı (off-by-default)**, parity-guard'lı bir paralel temel olarak; canlı sistem hâlâ eski/basit yolları kullanıyor.

## 1. Stack ve Araçlar
- **Next.js 16.2.9** (App Router, Turbopack dev) + **React 19.2.4** + TypeScript 5 + **Tailwind v4** (CSS-first `@import`, `src/app/globals.css`). Non-standart Next sürümü — `AGENTS.md` uyarıyor.
- **Vitest 4** test; ESLint 9. UI: framer-motion, @hello-pangea/dnd (Kanban), recharts, leaflet+markercluster (lead haritası), radix/shadcn, lucide.
- **Veri**: @supabase/supabase-js + @supabase/ssr, @tanstack/react-query, @google/generative-ai (Gemini).
- **İki Supabase projesi**: App/İş DB (`dfedeh…`, `src/lib/supabase.ts`) ve **LIFE/"Feed The Goat" DB** (`xcqrk…`, `src/lib/lifeSupabaseAdmin.ts`). Tüm DB erişimi server-side service-role.

## 2. Route ve Navigasyon (22 canlı route)
`src/app/page.tsx` → `/harita`'ya redirect. Kabuk: `src/app/(os)/layout.tsx` (QueryProvider + AppLayout). Nav tek kaynak `src/components/layout/Sidebar.tsx`, gruplar:
- **TOP (pinned)**: `/aliskanliklar` (Alışkanlıklar), `/gorevler` (Aktif Görevler) — en kritik günlük yüzeyler.
- **YAŞAM**: `/gelisim`, `/akademi`, `/kutuphane`, `/finans`.
- **KOMUTA**: `/command-center`, `/asistan`, `/agents`, `/konsol`.
- **PIPELINE**: `/harita` (Lead Radar), `/firsatlar` (Bugünün Fırsatları), `/pipeline` (Müşteri Akışı Kanban), `/projects`, `/services`, `/icraat-firsatlari`, `/kariyer`.
- **SİSTEM**: `/schedule`, `/bilgi`, `/settings`.
- **Orphan (URL var, nav yok)**: `/dashboard` (eski dashboard, Command Center ile mükerrer), `/tasks` (agentic görev kuyruğu — `/gorevler`'den farklı).

~60 API handler `src/app/api/**`. Redirect'ler `/map`,`/playbooks`,`/radar` → `/harita` (eski "çift Lead Radar" konsolidasyonu).

## 3. Veri Modeli — İki DB, Manuel-Apply Migration
**Migration'lar elle** Supabase SQL Editor'da uygulanıyor (otomatik runner yok); repo klasörü "şema kanıtı". Kod savunmacı: eksik tablo/sütun `PGRST204`/`42P01` strip-retry ile atlanır → **repo şeması canlı DB'den sapabilir**.

- **App DB**: `supabase/migrations/` 001–044 (**003 kasıtlı boşluk**). Önemli kilometre taşları:
  - `001` core (`leads`,`projects`,`playbooks`,`settings`); `004` evidence engine (~35 lead sütunu: evidence/fit/urgency/money/contactability sub-score, why_now, pain_signals, proof_points, recommended_offer, digital-presence sinyalleri); `006` quality engine (tier A-D, conversion_probability, customer_category); `009` **agentic engine** (`agents`,`directives`,`agent_tasks`,`agent_messages` + 6 ajan seed); `010` outreach; `011` job engine; `017` **RLS default-deny**; `018` İYS/KVKK compliance; `020` pipeline discipline (proposal gate); `027` person_leads (Apollo); `031` customer_category; `032` service_catalog + private `lead-evidence` bucket; `033` **Lead Intelligence v2** (lead_intel_runs/lead_evidence/lead_assessments/lead_service_matches/lead_match_feedback); `038` **canonical run model** (directives=run, agent_tasks=step, lease/retry, ADR-001, `runs`/`run_steps` view); `039` gateway+cost+eval (actual_cost_usd, eval_cases/runs/results); `041` **skill/agent registry** (skills/skill_versions/tool_registry/agent_skill_grants); `042` **pgvector** (skill/tool/memory_embeddings vector(768), gemini-embedding-001); `043` **HITL approvals** (approval_requests, digest/idempotency/expiry); `044` **trace/memory governance** (run_spans OTel + agent_memory + eval_datasets).
- **LIFE DB**: `supabase/life-migrations/` 001–004 (~24 tablo: daily_v2, habits, habit_logs, active_tasks, active_task_steps, task_templates, finance_*, assistant_*, command_*, universities…). Bazı tablolar (`daily_commitments`,`mentor_memory`) yalnız canlıda, migration'da yok.

## 4. Lead Motorları (üç paralel)
1. **Google Places iş-lead keşfi** (`src/lib/leads/scan.ts` `scanLeads`): Text Search → Place Details → `runEvidenceEngine` (`evidenceEngine.ts`, website sinyalleri) → `calculateLeadScoreV3` (`leadScoringV3.ts`, potential=base−risk + route) → `runQualityEngine` (`highQualityLeadEngine.ts`, tier/customer_category) → `leads` upsert (dedup google_place_id).
2. **City×sector hedefleme** (günlük cron `api/cron/daily-scan`, maxDuration 300): `sectorRotation.ts` (~24 ödeme-gücü sıralı sektör, learned rotation) + `cityTargeting.ts` (20 şehir, top-30 city×sector) → deterministik günlük plan → yalnız **A-tier + doğrulanmış pain signal** insert (**2/gün**). `2026-06-01`'e kadar standby.
3. **Apollo kişi-lead** (`src/lib/personLeads/*`, cron `person-scan`): People Search, tipli preset'ler, person_score/tier, `person_leads`.
- **Kariyer/İş motoru** (operatöre, CRM'e değil): `src/lib/jobs/*` Global ATS watchlist (Greenhouse/Lever/Ashby/Workable/Recruitee/SmartRecruiters, SSRF-guard) + TR fetch (Firecrawl: LinkedIn/kariyer.net…).

## 5. Lead Intelligence v2 (kanıt → konsey → 2/gün) — VAR, shadow
`src/lib/leadIntel/*`, günlük-scan cron'u İÇİNDE çalışır. Mode `off/shadow/active` (`flag.ts`, env kill-switch `LEAD_INTELLIGENCE_V2_KILL`). Akış: discovery pool → ucuz prefilter (top 6) → evidence collection (top 4: PSI+HTML+Places+screenshot) → **multimodal council** C1 Design Critic (screenshot image_url) ∥ Automation Analyst → C2 deterministic **Offer Matcher** (yalnız katalog slug'ından seçer → **halüsinasyon-servis imkânsız**) → C3 Skeptic → C4 Chair → **selection 2/gün** (`selection.ts`, ≥2 kanıt + max(design,ai)≥70 + bilinen kanal) → persist → screenshot retention. **Never-throws**; her iddia `evidence_id`'ye bağlı; kanıtsız %/ROI yasak; budget cap $0.40/gün. UI `/firsatlar`.

## 6. CRM / Pipeline
- Kayıtlar: `leads` (Places işletmeleri) + `person_leads` (Apollo) + `projects` (kazanılan iş, MRR kaynağı setup/monthly_fee).
- Aşamalar (`leads.status`): new→contacted→responded→meeting→proposal→converted/lost (+archived/dismissed), her aşama outcome timestamp'i.
- **Pipeline discipline gate** (`src/lib/leads/pipelineGate.ts`): proposal'a terfi için `pain_point`+`decision_maker`+`budget_band` zorunlu (yoksa 422).
- Follow-up: `follow_ups` (dashboard due list) + `follow_up_sequences` (multichannel drip, agent-tick ile promote). Stale-deal: `staleDeals.ts`.

## 7. Outreach — VAR ama DRAFT-ONLY
- `src/lib/coldEmail.ts`: TR system+user prompt, 60-120 kelime, banned klişe, ≥1 somut gözlem zorunlu, JSON `{subject,body}`. **LLM link/imza YAZMAZ** — imza + İYS/KVKK footer deterministik `settings`'ten eklenir (`buildSignatureBlock`,`buildComplianceFooter`).
- 4 açı `coldEmailTemplates.ts` (mini_audit/launch/hiring/before_after, sinyalle seçilir). `objectionLibrary.ts`, `persuasionTriggers.ts`, `proposalGenerator.ts`/`proposalBuilder.ts`. Kanal: `outreach/channelMatrix.ts`, `sequences.ts`.
- **Kritik**: hiç e-posta GÖNDERİLMEZ. `outreach/email.ts` `markMessageSent` yalnız kaydeder; `POST api/outreach/send` yalnız status='sent' yapar. **Resend/Gmail/nodemailer YOK** (kod yorumu: "no Resend integration"). Manuel-dispatch modeli.

## 8. AI / LLM Katmanı
- **Tek canlı sağlayıcı: OpenRouter** (`src/lib/openrouter.ts`). Model registry BURADA: `OPERATION_MODEL_MAP` + `getModel(operation)` + tier'ler. Canlı modeller: light `google/gemini-2.5-flash-lite`, medium `anthropic/claude-haiku-4-5`, heavy `deepseek/deepseek-v4-pro` (yalnız proposal). Ajan modelleri **DB-editable** (`agents.model`). İkinci yol: `src/lib/ai/gateway.ts` (flag `AI_GATEWAY_ENABLED`, default off).
- **Embeddings**: Google `gemini-embedding-001` 768d (`GOOGLE_GEMINI_API_KEY`). İki kullanım: bundled in-memory index `src/data/knowledgeIndex.json` (~4.6 MB, pgvector'sız cosine, mentor RAG) + pgvector tabloları (mig 042, exact cosine, ANN index yok).
- **Cost**: `src/lib/ai/costLog.ts` → `ai_cost_logs` (tahmini cost_usd + gerçek actual_cost_usd/generation_id). Cap: aylık `caps.ts` (default $20, hard-throw) + lead-intel $0.40/gün. `cost_tl = cost_usd * 38` hardcoded.

## 9. Agent / Multi-Agent ("Brain v2") — VAR, off
İki nesil yan yana:
- **Legacy/canlı**: DB `agents` registry + CEO orchestrator (`src/lib/agents/*` orchestrator/runner/planParser), lead-intel konseyi, Telegram mentor + iş deliberasyonu, JARVIS (`src/lib/jarvis/engine.ts`).
- **Brain v2** (`src/lib/brain/*`, commit `da94dbc`, **default OFF**): saf/deterministik orchestrator intake→plan→route→gate→execute→active. `gate.ts` scope sınıflama (spend>external>write>read), auto yalnız read+low-risk; `computeActionDigest` (sha256), `redactPreview`. `permissions.ts` **lethal-trifecta guard** (confidential-read + external-send + untrusted-input → blok). `execute.ts` yalnız zero-cost deterministik handler auto; write/external/spend → needs_approval. `verify.ts` genel critic (evidence_id'siz bulgu reddedilir).
- **HITL onay** (`src/lib/approvals/*`, mig 043): `buildApprovalDraft` action_digest + idempotencyKey + 24s TTL; `canExecuteApproval` = approved + not-expired + **digest eşleşir** + not-executed → "X'i onayla, Y'yi çalıştır" yapısal imkânsız. UI `/konsol`.
- **Registry İKİ tane**: agent registry (DB `agents`, mig 009/041) + skill registry (**kod kaynak** `src/lib/skills/catalog.ts` ~30 skill; compile-time handler allowlist `registry.ts` — yalnız 3 wired; `skills.active` eval geçmeden true olamaz). Kapasite hedefi "204 agent / 487 skill" (`api/registry/route.ts`).
- **Trace/eval**: `trace/spans.ts` (`run_spans`, redactAttributes prompt/secret/token maskeler, 30g retention); `eval/*` golden harness + judge (trajectory LCS + LLM-judge injected scorer + deterministik keyword fallback) + parity locks (mentorRoute, councilParity).
- **Council İKİ kavram**: lead-intel council (`leadIntel/council.ts`) + iş deliberasyon council (`assistant/deliberate.ts` + `api/council` 4 direktör + Yönetim Kurulu Başkanı → `council_debates`).

## 10. Memory
- **Governed agent memory** (Brain v2, mig 044): `memory/governance.ts` quarantine→active (occurrence≥3 veya operatör onayı), confidence, 90g retention, confidence-weighted retrieval; `agent_memory` + `memory_embeddings`.
- **Assistant/mentor memory** (LIFE DB): `assistant/memory.ts` (conversation turn, commitment), `learnPrefs.ts`, tema/pattern (`mentor_memory`,`daily_commitments`).
- **Strategy/session** (App DB, mig 015): sessions/memories/strategy/hypotheses/decisions.
- **Feedback**: `lead_match_feedback` (uygun/uygun_degil, mig 033) → sektör öğrenme; cutover surface `api/admin/lead-intel-comparison`.

## 11. Cron / Worker
`vercel.json`: `daily-scan` (05:00 UTC, Places+LeadIntel v2), `opportunity-scan` (Pzt 06:00), `agent-tick` (09:00, agent_tasks kuyruğu 5/tick + stale reclaim + follow-up promote), `job-scan` (04:00), `person-scan` (03:30), `orchestrator` (4×/gün Telegram brifing/reminder LIFE DB), `weekly-retro` (Paz 16:00). Hepsi `CRON_SECRET` bearer + `guardCronEnv()`. Kalıcı worker yolu: canonical run/step lease/retry (`runs/*`, ADR-001, mig 038).

## 12. Auth / RLS / Güvenlik
- **Tek operatör, auth kapısı YOK** (şifre kapısı commit `66a14b1` kaldırıldı; `src/lib/auth.ts` hardcoded `LOCAL_USER`, `assertSession` no-op).
- **Defense-in-depth**: tüm DB service-role server-side; **RLS default-deny (policyless)** iki DB'de de (mig 017/029/033/041-044, LIFE 002); engagement view'ları `security_invoker`+REVOKE (030/035/036).
- **API guard**: `api/db/[table]/route.ts` tablo+field allowlist + proposal gate + person_leads raw-Apollo stripping + error redaction + 5s timeout + pagination cap; `api/guards.ts` enforceSameOrigin; `rateLimit.ts`; `redact.ts`; cron secret; Telegram webhook secret + chat-ID allowlist.

## 13. Environment (yalnız isimler)
App Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), LIFE Supabase (`NEXT_PUBLIC_LIFE_SUPABASE_URL`, `LIFE_SUPABASE_SERVICE_ROLE_KEY`), `CRON_SECRET`, `OPENROUTER_API_KEY`/`OPENROUTER_MODEL`, `BRAIN_V2_ENABLED`/`BRAIN_ACTIVE_ENABLED`/`AI_GATEWAY_ENABLED`, `GOOGLE_GEMINI_API_KEY`, `GOOGLE_MAPS_KEY`, `APOLLO_API_KEY`, `FIRECRAWL_API_KEY`, `SERPAPI_API_KEY`, `PAGESPEED_API_KEY`, `LEAD_INTELLIGENCE_V2_KILL`, Telegram (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`/`TELEGRAM_WEBHOOK_SECRET`/`TELEGRAM_USER_ID`), `ORCHESTRATOR_START_DATE`, snapshot token'ları, `ALERT_WEBHOOK_URL`. **Dış servisler**: OpenRouter, Gemini, Google Places+PageSpeed, Apollo, Firecrawl, SerpAPI, Telegram, Supabase×2, Vercel Cron, ATS sağlayıcıları.

## 14. Korunacak Çekirdek — Görev / Alışkanlık / Rutin
İzole ve temiz, **DOKUNULMAZ**:
- `/gorevler` — `src/app/(os)/(life)/gorevler/page.tsx`, `src/components/tasks/*`, loader `src/lib/activeTasks.ts`, actions `src/app/actions/taskActions.ts`, tablolar `active_tasks`/`active_task_steps` (LIFE DB).
- `/aliskanliklar` — `src/components/habits/*`, engine `src/lib/habits/*` (scoring/streaks/cadence), actions `habitActions.ts`, tablolar `habits`/`habit_logs`.
- Rutinler: `src/lib/dailyRoutines.ts` (read-only, Command Center'da özet). Day-mode `dailyV2.ts` (`daily_v2`, yalnız `ui_mode` tüketiliyor — yazma UI'ı yok, yarım-bağlı).

## 15. Duplicate / Orphan / Yarım Akışlar
- **Orphan route**: `/dashboard` (Command Center mükerrer), `/tasks` (agentic kuyruk, `/gorevler`'den ayrı).
- **Mock**: `/icraat-firsatlari` "Opportunity Intelligence OS" tamamen `MOCK_OPPORTUNITIES` üstünde (statik prototip).
- **Unused component**: `RightPanel` (hiçbir yerde render değil), `OrchestratorPage` (route'a mount değil ama `api/orchestrator/*` var).
- **Yarım**: day-mode yazma (setDayMode vb. UI yok), `/schedule` (statik 3-iş, "coming soon"), `/bilgi` (hardcoded doc listesi), header search + notification bell (placeholder), settings danger-zone (disabled).
- **İki "council", iki model registry, üç agent tanımı** yan yana (kasıtlı ama gerçek mükerrerlik yüzeyi).
- **Doc drift**: `HANDOFF.md` temayı sarı `#F5C518` diyor ama `globals.css` mavi Framer reskin'i tamamlanmış; habit redesign "pending" diyor ama bitmiş.

## 16. AgencyOS'a Etki — Neyi Koru, Neyi Genişlet, Neyi Kur
| Kategori | Durum | v2 aksiyonu |
|---|---|---|
| Brain v2 / HITL / registry / trace / eval | Var, OFF | **Aktive et** (shadow→active), eksik skill handler'larını wire et |
| Lead Intel v2 / evidence / council | Var, shadow | Active'e al, kanıt kaynaklarını genişlet |
| Model router | Var | Preset/fallback/provider-policy'ye yükselt + model tazele |
| ICP / sektör / city×sector | Var, olgun | Koru; SYNTHESIS'e katla |
| Outreach draft | Var, draft-only | Gmail gönderme + reply ingest EKLE |
| Compliance footer / cost cap / memory governance | Var | Genişlet (consent/suppression, ilişki hafızası) |
| Görev/Alışkanlık/Rutin | Var, izole | **KORU — dokunma** |
| Gmail send/reply, reply-intel, follow-up SM, portfolyo, Voice DNA, günlük cockpit | **YOK** | **Kur** (asıl build) |

## Açık Sorular / Doğrulanamayanlar
- Canlı DB şeması ile repo migration'ları arasındaki gerçek sapma (manuel-apply → yalnız DB sorgusuyla doğrulanabilir; bu görevde production'a dokunulmadı).
- Brain v2 / Lead Intel v2'nin production'da hangi flag durumunda olduğu (env değerleri okunmadı — güvenlik).
- `deepseek/deepseek-v4-pro` ve `gemini-2.5-flash-lite`'ın OpenRouter'da hâlâ mevcut/güncel olup olmadığı (bkz. `18-openrouter-model-routing`).
- Domain/e-posta altyapısının (SPF/DKIM/DMARC, gönderim domain'i) mevcut durumu — repo'da yok, operatör bilgisi gerek.
