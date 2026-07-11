---
Doküman: 24-parallel-workstreams
Dalga: 2 (Motor — paralelleştirme; Dalga 1 sözleşmelerine referans)
Tarih: 2026-07-11
Durum: Workstream sözleşmesi (25-sprint-roadmap.md ve 23-mvp-v1-v2.md ile senkron)
Bağımlılık: 04-domain-model.md (entity), 05-event-contracts.md (event), 06/07 (agent/skill), 16 (routing), plan §5 (migration ownership); araştırma 25-parallel-workstreams.md
---

# AgencyOS V2 — Paralel Workstream'ler

## 0. Contract-gate bir WORKSTREAM DEĞİL, bir KAPIDIR

Contract-first ilkesi (araştırma 25 §1 [CERTAIN]): bağımsız motorların paralel gelişmesinin **tek pratik yolu**, önce sıkı değişim-kontrollü sözleşme dondurmaktır. Contract-gate paralel-kodlamadan **ÖNCE** kapanmalı; kapanmazsa her motor kendi "lead"/"mesaj" şeklini uydurur, entegrasyonda çakışır.

**İyi haber:** AgencyOS zaten contract-first iskelet taşıyor — 8 sözleşmenin çoğu kodda tipli+testli. Dalga 1 dokümanları (04 domain, 05 event, 06 agent, 07 skill, 16 routing) bu sözleşmeleri **kilitledi**. Contract-gate = bu dokümanların dondurulması + repo-tarafı 3 eksik/2 kısmi sözleşmenin kapatılması:

| Sözleşme | Durum (araştırma 25 §3) | Kapı aksiyonu |
|---|---|---|
| Agent/step I-O · run/step DAG · HITL · scope · trace · cost · eval | **VAR** (tipli/testli) | Dondur; tüm WS bunu kullanır — kendi kuyruğunu kurmaz |
| Kanonik ilişki (Lead/Contact) view | KISMİ | `leads` üstünde read-only relationship view (yeni tablo değil) + `contacts` (mig 045) |
| Message/Thread | EKSİK | `outreach_messages` additive (mig 046: `thread_id`,`gmail_message_id`,`in_reply_to`,`direction`) + `email_threads`/`email_messages` |
| Domain event akışı | EKSİK | `agent_tasks` üstünde mantıksal olay (05); durable=kendi tablosu; `lead_events` OPSİYONEL (mig 053) |
| Model preset kaydı | KISMİ | 16'daki PRESETS pin (canlı `/api/v1/models` doğrulanmış); ad kesinleşmeden merge YOK |

**KURAL:** Migration ownership §5 kanonik (Data/Worker=H sahibi); **hiçbir WS bağımsız şema değişikliği yapmaz** — H'ye (mig 045-053) talep açar. Yeni kuyruk/onay sistemi KURULMAZ; mevcut `agent_tasks`/`approval_requests` kullanılır.

---

## 1. Workstream A — Product / Daily UX

| Alan | Değer |
|---|---|
| **Worktree** | `feat/ws-a-daily-cockpit` |
| **Scope** | 4 dağınık ekranı (`/harita`,`/firsatlar`,`/pipeline`,`/command-center`) tek **Bugün** kokpitinde recompose (yeni ekran şişkinliği YOK; ≤3 adım kuralı, rules/os/70) |
| **Files** | `src/app/(dashboard)/bugun/*` (yeni, `/command-center` temeli), `Sidebar.tsx:36-67` (nav recompose), tüketici bileşenleri; `/icraat-firsatlari`→HIDE, `/dashboard`+`/tasks`→DELETE |
| **Shared deps** | relationship view (okuma-sözleşmesi) + event okuma (05); **E'nin çıktı şeklini tüketir** |
| **DB dep** | yalnız OKUMA; yeni tablo YOK (mevcut+view) |
| **API contract** | relationship read-model (lead + son mesaj + follow-up durumu + reply intent); 05 event tüketici |
| **Tests** | Playwright: kokpit render, ≤3 adım akışı, loading/empty/error/success her durum; mobil+desktop |
| **Merge order** | contract-gate sonrası paralel; **E ile eşzamanlı** (A, E çıktısını tüketen UI — sözleşme dondu mu mock/shadow veriyle başlar) |
| **DoD** | Bugün kokpiti tek route; 4 ekran birleşti; her durum tasarlı; mobil+desktop; Görev/Alışkanlık özeti read-only (LIFE dokunulmaz) |

## 2. Workstream B — Lead Intelligence / Qualification

| Alan | Değer |
|---|---|
| **Worktree** | `feat/ws-b-lead-intel` |
| **Scope** | Mevcut `leadIntel/*` v2 olgun; K2 B2B-tech sinyalleri + K3 autonomous research→signal→CRM auto-update→score; kanonik entity view'a bağla |
| **Files** | `src/lib/leadIntel/*` (council, offerMatcher, urlGuard, budget), `leadScoringV3.ts`, yeni `extract-signals`/`build-lead-dossier` skill sarmalayıcıları |
| **Shared deps** | Evidence sözleşmesi (VAR) + service catalog (C); relationship view |
| **DB dep** | `signals` (mig 053 ops.); MVP mevcut boolean-kolon sinyalleri yeter (04 Signal) |
| **API contract** | 06 §3.1 Lead Intelligence I/O; `dossier.generated`/`service.matched` event (05) |
| **Tests** | `eval.lead.build_dossier`, `eval.lead.score_deterministic` (**birebir parity**), `eval.lead.extract_signals`; T1 injection fixture |
| **Merge order** | **contract-gate sonrası bağımsız başlar** (iç motor olgun; E'yi beklemez) |
| **DoD** | dossier kanıt-zincirli; skor parity korunur; sinyaller rol-aware (K2); CRM auto-update `evidence_id`-grounded |

## 3. Workstream C — Service / Offer / Portfolio

| Alan | Değer |
|---|---|
| **Worktree** | `feat/ws-c-offer-portfolio` |
| **Scope** | Katalog VAR; portfolyo/proof eşleştirme YOK → `match-portfolio` + `build-offer` + `generate-proposal`; internal/clientFacing split |
| **Files** | `src/lib/services/catalog.ts`, `leadIntel/offerMatcher.ts`, `proposalGenerator.ts`, `PRICING_RULES.md`, yeni portfolio skill'leri |
| **Shared deps** | Evidence sözleşmesi (VAR); D/proposal'ı zenginleştirir; E'yi beklemez |
| **DB dep** | `portfolio_items`+`portfolio_claims` (mig 048), `proposals`+`proposal_outcomes` (mig 049) → **H'ye talep** |
| **API contract** | 06 §3.3/3.8; `proposal.created`/`proposal.sent` event |
| **Tests** | `eval.sales.match_portfolio`, `eval.sales.build_offer_angle`, `eval.sales.draft_proposal` (fiyat-grounding) |
| **Merge order** | contract-gate sonrası bağımsız (evidence'a bağlı); V1 |
| **DoD** | portfolio-match uydurma-örnek YOK (claim gate approved-only); fiyat AI-uydurmaz; proposal version chain append-only |

## 4. Workstream D — Outreach / Voice

| Alan | Değer |
|---|---|
| **Worktree** | `feat/ws-d-outreach-voice` |
| **Scope** | Draft-only VAR; K2 rol-aware personalizasyon; K4 öğrenen Voice DNA (edit-delta); Voice Guard + cross-family judge |
| **Files** | `src/lib/coldEmail.ts`, `coldEmailTemplates.ts` (4 açı), `personaContext.ts`, yeni `generate-outreach`/`review-outreach` |
| **Shared deps** | Persona sözleşmesi + **E'den yanıt/sonuç sinyali** (öğrenme); C'den offer/portfolio |
| **DB dep** | `outreach_messages` additive `original_body`/`final_body` (mig 046) → H |
| **API contract** | 06 §3.4/3.5; `outreach.drafted`/`outreach.approved` event |
| **Tests** | `eval.sales.draft_cold_email` (rol-uygunluk, kanıt-bağlılık, klişe-yokluğu), `eval.outreach.review` |
| **Merge order** | contract-gate sonrası draft başlar; **öğrenme E'yi bekler** (gerçek yanıt verisi olmadan Voice DNA statik) |
| **DoD** | rol-aware taslak; kanıtsız-iddia YOK; imza/footer deterministik; edit-delta yakalanır (öğrenme V1-V2) |

## 5. Workstream E — Email Operations / Gmail (KRİTİK YOL)

| Alan | Değer |
|---|---|
| **Worktree** | `feat/ws-e-gmail-ops` |
| **Scope** | **En büyük boşluk:** gönderim YOK, reply YOK, state-machine yarım → Gmail HITL-send + thread-reply-read + follow-up state machine tamamı |
| **Files** | yeni `src/lib/outreach/gmail.ts` (tek gerçek dış-entegrasyon), `outreach/email.ts` (`markMessageSent` KAYIT olarak kalır), `outreach/sequences.ts` (state machine tamamla), token-şifreli-tablo yardımcıları |
| **Shared deps** | Message/Thread + Event sözleşmesi + **HITL (VAR, mig 043)**; Gmail OAuth (Sprint-0 önkoşul) |
| **DB dep** | `email_threads`+`email_messages` (mig 046), `suppression_list`+`consent_records` (mig 047), token tablosu → **H'ye talep** |
| **API contract** | 06 §3.6 Email Ops; 05 `email.sent`/`email.replied`/`email.bounced`/`followup.due`/`followup.cancelled` |
| **Tests** | `eval.outreach.send_gmail` (thread-bağı RFC 2822, suppression-honor, **double-execute→tek gönderim**), `eval.outreach.sync_email_thread`, `eval.pipeline.schedule_follow_up`; T5/T6/T8 güvenlik |
| **Merge order** | contract-gate sonrası **kritik yol #1**; A ile paralel; D/F bunu bekler |
| **DoD** | gönderim tek fonksiyondan; HITL digest-lock; idempotency `outreach_messages.id`; suppression pre-send gate; `gmail.send`+`readonly` scope (modify YASAK); follow-up 5-7 iş günü stop-on-reply |

## 6. Workstream F — Memory / Personalization

| Alan | Değer |
|---|---|
| **Worktree** | `feat/ws-f-memory` |
| **Scope** | Governance VAR; ilişki hafızası jenerik → scoped 5-katman + Voice DNA governance; **cross-lead sızıntı boşluğu kapat** |
| **Files** | `src/lib/memory/governance.ts` (App DB — dokunmadan genişlet), yeni `extract-memory`, retrieval fonksiyonu (`scopeId` zorunlu) |
| **Shared deps** | Entity sözleşmesi + **E'den event akışı** (gerçek yanıt olmadan hafıza jenerik) |
| **DB dep** | `agent_memory` scope (mig 050: `scope_type`/`scope_id`/`layer`/`sensitivity`/`human_approved`) → **H; V1 önkoşulu** |
| **API contract** | 06 §3.9; `memory.proposed`/`memory.approved` event; filter-before-retrieval SQL |
| **Tests** | `eval.memory.extract_sales_memory` (**cross-scope izolasyon**); T7 sızıntı fixture |
| **Merge order** | contract-gate sonrası; **namespace ayrımı reply-ingest'ten ÖNCE** (21 §3); V1 |
| **DoD** | retrieval scope'suz derlenemez; `lead:<id>:` prefix + scope kolon (defense-in-depth); yalnız quarantine-write; active terfi HITL |

## 7. Workstream G — AI Infra (routing / eval / cost)

| Alan | Değer |
|---|---|
| **Worktree** | `feat/ws-g-ai-infra` |
| **Scope** | Model preset pin (**3 ölü ID acil fix**) + self-heal fallback + eval harness + cost attribution; kesişen (herkesi besler) |
| **Files** | `src/lib/openrouter.ts` (OPERATION_MODEL_MAP→PRESETS, 16 §5), `ai/caps.ts`/`costLog.ts`, `eval/*` (harness/judge), nightly model-verify cron |
| **Shared deps** | Doğrulanmış preset sözleşmesi (16); kimseyi beklemez |
| **DB dep** | `tool_cost_logs` + preset config (mig 052) → H; `ai_cost_logs` additive `preset_key`/`fallback_used` |
| **API contract** | 16 preset katalog; `model.fallback.used` event (05) |
| **Tests** | preset-registry unit (Tier 3-4→data_collection:deny), fallback-self-heal, cost parity; T16 |
| **Merge order** | **contract-gate ile eşzamanlı — URGENT** (3 ölü ID canlıda); kesişen |
| **DoD** | ham model ID hiçbir yerde; `models:[primary,...fallbacks]`; AbortController timeout; görünür fallback log; nightly drift-verify; imza sabit (çağıran kırılmaz) |

## 8. Workstream H — Platform (workers / observability / security / migrations)

| Alan | Değer |
|---|---|
| **Worktree** | `feat/ws-h-platform` |
| **Scope** | Kesişen temel: **migration ownership §5 sahibi** (mig 045-053), workers, observability (system-health≠user-analytics), güvenlik kontrolleri (21) |
| **Files** | `supabase/migrations/045-053*.sql`, `src/app/api/cron/*`, `trace/spans.ts`, `redact.ts` (token prefix), RLS şablonu, guard bakımı (`urlGuard`) |
| **Shared deps** | Tüm WS'nin şema/cron/audit ihtiyacını karşılar; kendi başına sürer |
| **DB dep** | **TÜM migration sahibi** — diğer WS talep açar, H uygular (App DB only; LIFE dokunulmaz) |
| **API contract** | mig 045-053 (04/§5 kanonik); RLS default-deny+REVOKE+NOTIFY şablonu |
| **Tests** | `get_advisors` RLS-lint, data-expiry cron, redaksiyon unit, T10/T11/T13 |
| **Merge order** | **contract-gate ile eşzamanlı** (kesişen temel; E'nin cron/webhook/token ihtiyacını mümkün kılar) |
| **DoD** | her mig additive+idempotent+RLS+REVOKE+NOTIFY; canlı `list_migrations` ile numara doğrula; LIFE DB'ye sıfır dokunuş; retention cron canlı |

---

## 9. Bağımlılık grafiği + kritik yol

```
        ┌──── CONTRACT-GATE (Dalga 1 dondu + repo: message/thread·relationship view·event·preset pin) ────┐
        │                          + Gmail OAuth (Sprint-0 önkoşul) + model-fix (G, URGENT)                │
        └───────────────────────────────────────────┬───────────────────────────────────────────────────┘
   ┌──────────┬───────────┬──────────────┬───────────┼───────────┬──────────────┬─────────────┐
   ▼          ▼           ▼              ▼           ▼           ▼              ▼             ▼
  B (bağımsız) C(evidence) G(kesişen)   H(kesişen)  E [KRİTİK]   A(tüketici)
  leadIntel   offer/port   routing/eval  workers/    Gmail/reply  Bugün        (A∥E: A mock/shadow ile başlar)
              (E beklemez)  /cost         mig/sec     /follow-up   kokpit
                                              │
                                    ┌─────────┴─────────┐
                                    ▼                   ▼
                              D Voice DNA          F ilişki hafızası
                            (E yanıt sinyali)      (E event akışı)
```

**Kritik yol:** contract-gate → **E (Gmail)** → D-öğrenme + F → A tam-yüzey. **Neden E:** D'nin Voice DNA'sı ve F'nin ilişki hafızası ancak **gerçek yanıt/sonuç** varsa öğrenir; o veri E'den gelir. E olmadan D/F statik/jenerik kalır (bugünkü durum) [CERTAIN].

**Bağımsız başlayanlar (kapıdan hemen sonra):** B (olgun), G (kesişen, URGENT), H (kesişen temel), C-portfolio (evidence'a bağlı). **E'yi bekleyenler:** D-öğrenme, F, A'nın inbox/thread yüzeyi.

**MVP = E + A + çekirdek döngü** (+ G-ince preset-pin, B-mevcut). A ve E sözleşme-kapısına bağlı, birbirine değil → **paralel** (A, sözleşme dondu anda mock/shadow veriyle başlar).

## 10. Açık sorular
- [LIKELY] A ve E tam-paralel mi? Sözleşme-kapısı iyi tanımlıysa evet; tanımsızsa A kısmen E'yi bekler.
- [BLOKÖR] Gmail OAuth — E'nin ön-koşulu; gecikirse E shadow'da, A mock veriyle ilerler.
- [CERTAIN — kural] Model preset canlı `/api/v1/models` doğrulanmadan pin YOK; H migration numaraları canlı `list_migrations` doğrulanmadan kesinleşmez.
