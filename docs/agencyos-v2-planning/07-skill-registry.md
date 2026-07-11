---
Doküman: 07-skill-registry
Dalga: 1 (Foundation/contracts — ⚑ load-bearing)
Tarih: 2026-07-11
Durum: Sözleşme (diğer dokümanlar buna referans verir)
Bağımlılık: 06-agent-registry.md (owning agent), 05-event-contracts.md (idempotency/event), 04-domain-model.md (entity), 16-openrouter-routing.md (preset katalog)
---

# AgencyOS V2 — Skill Registry (21 Skill Spec)

## 0. Çerçeve — skill = kaynak-of-truth, mevcut allowlist'i genişlet

Skill kataloğu **KODDA** kaynak-of-truth'tur (`skills/catalog.ts`, service_catalog deseni); DB (`skills` tablosu, mig 041) yalnız enable/override. `handlerKey` **yalnız** compile-time allowlist `SKILL_HANDLERS`'tan (`registry.ts:20-33`) çözülür — DB satırından **dinamik import YASAK** (`registry.ts:1-3`).

**Repo gerçeği:** allowlist'te bugün **yalnız 3 skill wired** — `orchestration.plan_decompose`, `lead.score_deterministic`, `lead.match_services` (`registry.ts:21-29`); 3 tanesi `notImplemented` throw eder (`lead.audit_website`, `sales.pricing_explain`, `automation.integration_matcher`, `registry.ts:30-32`); kalan LLM skill'leri `handlerKey: null` ("kayıtlı, henüz aktif değil"). `skills.active` default `false` (mig 041) — **registered ≠ active** (`registry.ts` §10.1 değişmezleri; `validateRegistry` boş I/O / eksik eval_slug / duplicate summary → hard-fail).

**Yeni skill yolu:** (1) `SkillManifest` olarak `SKILL_CATALOG`'a ekle (benzersiz slug + dolu I/O + `evalSlug` + `permissionScopes`, aksi `validateRegistry` reddeder); (2) deterministik/composite ise handler'ı `SKILL_HANDLERS` allowlist'e bağla (mevcut modülü **sar**, yeniden yazma); LLM ise `handlerKey: null`; (3) eval_case yaz → shadow → parity/eval yeşil → `skills.active=true` + `agent_skill_grants` (06 §4).

**Deterministik işe LLM koyma (mutlak kural, plan §4 + research 17 §3.2):** tarih/dedup/state-transition/suppression/DNS/skorlama = **pure-code**. Metin üretimi/niyet çıkarımı/hafıza özütleme = **LLM**. `create-gmail-draft`/`send-gmail`/`sync-email-thread` = **araç çağrısı** (LLM değil).

**Model preset** plan §4 ADIYLA; model ID hardcode YOK (canlı `/api/v1/models` doğrulaması aktivasyon önkoşulu — mevcut tier'ler superseded).

---

## 1. Skill → mevcut katalog slug + MVP haritası

MVP = plan K1 Gmail satış döngüsü çekirdeği (research 17'nin "MVP Gmailsiz" görüşü K1 ile ezildi; ama HITL+suppression+opt-out pazarlıksız). ★ = MVP (10 skill).

| # | Skill (plan §4) | Katalog slug | Kind | Owning rol (06) | Aşama |
|---|---|---|---|---|---|
| 1 | verify-company | `lead.verify_company` (yeni) | composite | Lead Intelligence | V1 |
| 2 | ★ build-lead-dossier | `lead.build_dossier` (yeni; `lead.audit_website` sarar) | composite | Lead Intelligence | **MVP** |
| 3 | ★ extract-signals | `lead.extract_signals` (yeni) | llm | Lead Intelligence | **MVP** |
| 4 | ★ score-lead | `lead.score_deterministic` (**wired**) | deterministic | Lead Intelligence / Qualification | **MVP** |
| 5 | ★ match-service | `lead.match_services` (**wired**) | deterministic | Service & Offer | **MVP** |
| 6 | match-portfolio | `sales.match_portfolio` (yeni) | deterministic | Service & Offer | V1 |
| 7 | build-offer | `sales.build_offer_angle` (yeni) | composite | Service & Offer | V1 |
| 8 | ★ generate-outreach | `sales.draft_cold_email` (katalog, null) | llm | Outreach | **MVP** |
| 9 | ★ review-outreach | `outreach.review_draft` (yeni) | llm | Outreach Reviewer | **MVP** |
| 10 | create-gmail-draft | `outreach.create_gmail_draft` (yeni) | composite (tool) | Email Ops | V1 |
| 11 | ★ send-gmail | `outreach.send_gmail` (yeni) | composite (tool) | Email Ops | **MVP** |
| 12 | ★ schedule-follow-up | `pipeline.schedule_follow_up` (yeni; `sequences.ts` sarar) | deterministic | Email Ops / Pipeline | **MVP** |
| 13 | sync-email-thread | `outreach.sync_email_thread` (yeni) | composite (tool) | Email Ops | V1 |
| 14 | ★ classify-reply | `sales.classify_reply` (yeni) | llm | Reply Intelligence | **MVP** |
| 15 | draft-reply | `sales.draft_reply` (yeni) | llm | Reply Intelligence | V1 |
| 16 | generate-proposal | `sales.draft_proposal` (katalog, null) | llm | Proposal | V1 |
| 17 | recommend-next-action | `pipeline.recommend_next_action` (yeni) | composite | Pipeline Manager | V1 |
| 18 | extract-memory | `memory.extract_sales_memory` (yeni) | llm | Relationship Memory | V2 |
| 19 | audit-compliance | `compliance.audit_outreach` (yeni) | deterministic | Compliance & Risk | V1 |
| 20 | audit-deliverability | `outreach.audit_deliverability` (yeni) | deterministic | Compliance & Risk | V1 |
| 21 | ★ update-pipeline | `pipeline.update_status` (yeni) | deterministic | Pipeline Manager | **MVP** |

**Not — MVP kapsamı:** MVP döngüsü (Bugün → dossier → outreach → review → **gönder** → follow-up → reply-classify → pipeline-update) 10 skill'i kapsar. `send-gmail` MVP'dedir çünkü K1 (L2 onayla→gönder) çekirdek; ama Gmail OAuth **Sprint-0 önkoşulu** (fabrike edilemez tek blokör) ve `audit-compliance`+`audit-deliverability` pre-send gate olarak MVP send'i kapıda tutar. Research 17 §7'nin "MVP = yalnız deterministik" görüşünden ayrılır (kaynak: plan K1 rulings).

---

## 2. Skill spec'leri (21 tam sözleşme)

Her spec: Amaç · Input · Output · Ön-koşul · Deterministik kontroller (pure-code vs LLM) · Owning agent · Model preset · Araçlar · Hata davranışı · Idempotency · Logging · Eval · İnsan onayı.

### 2.1 verify-company `lead.verify_company` — composite — V1
- **Amaç:** Lead'in gerçek/aktif firma olduğunu doğrula (domain canlı, WHOIS/kayıt, sektör tutarlılığı) — hayalet kayıt eleme.
- **Input:** `{ leadId, url?, businessName, sector? }`
- **Output:** `{ verified: boolean, domainLive: boolean, signals: Signal[], confidence: number }`
- **Ön-koşul:** lead kaydı var; url veya businessName.
- **Deterministik:** domain DNS/HTTP canlılık + WHOIS varlık = **pure-code**; sektör-tutarlılık heuristiği pure-code. LLM yalnız belirsiz isim eşleme (opsiyonel).
- **Owning:** Lead Intelligence (`researcher`). **Preset:** `agencyos-research` (yalnız belirsiz eşleme) — çoğu deterministik. **Araçlar:** DNS, HTTP HEAD (SSRF-guard, `jobs/*` deseni).
- **Hata:** DNS timeout → `verified:false`+`confidence` düşük, throw yok. **Idempotency:** domain-cache TTL. **Logging:** `run_spans` (redacted). **Eval:** `eval.lead.verify_company`. **Onay:** Hayır (read).

### 2.2 build-lead-dossier `lead.build_dossier` — composite — ★MVP
- **Amaç:** Tek lead için kanıt-zincirli dosya (PSI/HTML/CTA/screenshot + firmografi) + ön-değerlendirme. Otonom araştırma ajanının çekirdeği (plan K3).
- **Input:** `{ leadId, url, sector? }`
- **Output:** `{ dossierId, evidence: Evidence[], assessment: object, dataConfidence: number }` (her iddia `evidence_id`'li)
- **Ön-koşul:** lead + url; `lead.audit_website` composite pattern'i sarar (`catalog.ts:45-52`).
- **Deterministik:** PSI/HTML/Places fetch + kanıt toplama = **pure-code**; assessment sentezi = **LLM**.
- **Owning:** Lead Intelligence. **Preset:** `agencyos-research`. **Araçlar:** PageSpeed, HTML fetch, Places, screenshot (private `lead-evidence` bucket, mig 032).
- **Hata:** kanıt eksik → **düşük dataConfidence**, never-throws (audit §5). **Idempotency:** `forceRefresh` yoksa mevcut dossier reuse. **Logging:** `run_spans` + `ai_cost_logs`. **Eval:** `eval.lead.build_dossier` (kanıt-bağlılık, ROI/% kanıtsız yasak). **Onay:** Hayır (read + internal write).

### 2.3 extract-signals `lead.extract_signals` — llm — ★MVP
- **Amaç:** Dosyadan B2B-tech firmografik/teknik sinyalleri **rol-farkındalıklı** çıkar (K2). Sinyaller: ekip yapısı, tech-stack, hiring, büyüme.
- **Input:** `{ dossierId, evidence: Evidence[], sector }`
- **Output:** `{ signals: Signal[], roleSignals: { owner?, cto?, cfo?, marketing? } }` (K2: **her role farklı açı** — CTO→verimlilik, CFO→maliyet, sahip→büyüme)
- **Ön-koşul:** dossier var.
- **Deterministik:** tech-stack fingerprint (header/HTML pattern) = **pure-code ön-filtre**; rol-bağlamlı sinyal yorumu = **LLM**. Kanıtsız sinyal reddedilir.
- **Owning:** Lead Intelligence. **Preset:** `agencyos-fast-extract` (signal-tag, JSON). **Araçlar:** yok (dossier girdisi).
- **Hata:** sinyal yok → boş; düşük confidence → işaretlenir. **Idempotency:** dossier+versiyon başına saf. **Logging:** `run_spans`. **Eval:** `eval.lead.extract_signals` (rol-eşleme doğruluğu). **Onay:** Hayır (read).
- **K2 vurgusu:** rol-farkındalık burada başlar; Outreach personalizasyonu bu `roleSignals`'ı tüketir.

### 2.4 score-lead `lead.score_deterministic` — deterministic — ★MVP (WIRED)
- **Amaç:** Kanıttan LLM'siz tasarım/AI fırsat skorları (`computeDeterministicScores`, `registry.ts:25-28`).
- **Input:** `{ evidence: Evidence[] }`
- **Output:** `{ design: number, ai: number, reasons: string[] }`
- **Ön-koşul:** evidence[].
- **Deterministik:** **%100 pure-code — LLM YOK.** Halüsinasyon-skor imkânsız.
- **Owning:** Lead Intelligence → Qualification. **Preset:** yok. **Araçlar:** yok.
- **Hata:** boş evidence → sıfır skor + reason. **Idempotency:** saf fonksiyon. **Logging:** `run_spans`. **Eval:** `eval.lead.score_deterministic` (**birebir parity** — refactor sonrası skor değişemez). **Onay:** Hayır.

### 2.5 match-service `lead.match_services` — deterministic — ★MVP (WIRED)
- **Amaç:** Doğrulanmış kanıt ∩ `service_catalog` ile hizmet fırsatlarını sırala (`matchServices`, `registry.ts:29`).
- **Input:** `{ designScore, aiScore, sector, evidence: Evidence[] }`
- **Output:** `{ matches: ServiceMatch[] }`
- **Ön-koşul:** skorlar + evidence.
- **Deterministik:** **pure-code — katalog slug'ından seçer, uydurma yapısal imkânsız** (offerMatcher C2 deseni, audit §5).
- **Owning:** Service & Offer. **Preset:** yok. **Araçlar:** yok.
- **Hata:** eşleşme yok → boş dizi. **Idempotency:** saf. **Logging:** `run_spans`. **Eval:** `eval.lead.match_services` (parity). **Onay:** Hayır.

### 2.6 match-portfolio `sales.match_portfolio` — deterministic — V1
- **Amaç:** Lead kanıtı için Ali Cem'in gerçek işlerinden (`portfolio_items`, mig 048) kanıt-parçası seç. `career.portfolio_gap`'ten AYRI amaç (lead için kanıt ≠ rol için boşluk).
- **Input:** `{ leadEvidence: Evidence[], sector }`
- **Output:** `{ pieces: PortfolioRef[] }`
- **Ön-koşul:** `portfolio_items` seed'i (operatörün gerçek işleri — research 17 §8.2 açık soru; seed yoksa boş).
- **Deterministik:** offerMatcher deseni — gerçek tablo ∩ kanıt-türü, **uydurma imkânsız**.
- **Owning:** Service & Offer. **Preset:** yok. **Araçlar:** yok.
- **Hata:** eşleşme yok → boş dizi (asla hayali örnek). **Idempotency:** saf. **Logging:** `run_spans`. **Eval:** `eval.sales.match_portfolio`. **Onay:** Hayır. **Claim gate:** yalnız `portfolio_claims` approved (mig 048).

### 2.7 build-offer `sales.build_offer_angle` — composite — V1
- **Amaç:** Kanıt+hizmet eşleşmesinden açı (mini_audit/launch/hiring/before_after) + template seç.
- **Input:** `{ serviceMatches: ServiceMatch[], evidence: Evidence[], roleSignals }`
- **Output:** `{ angle, templateKey, rationale }`
- **Ön-koşul:** service matches.
- **Deterministik:** kanıt-türü→açı eşlemesi (`coldEmailTemplates.ts` 4 açı) = **pure-code seçim**; LLM yalnız framing rationale.
- **Owning:** Service & Offer. **Preset:** `agencyos-professional` (yalnız framing). **Araçlar:** yok.
- **Hata:** kanıt yok → `mini_audit` (en güvenli açı). **Idempotency:** saf seçim. **Logging:** `run_spans`. **Eval:** `eval.sales.build_offer_angle`. **Onay:** Hayır.

### 2.8 generate-outreach `sales.draft_cold_email` — llm — ★MVP
- **Amaç:** Kanıta dayalı, **rol-farkındalıklı** (K2) tek-fırsat soğuk e-posta taslağı; edit-delta yakalar (K4).
- **Input:** `{ leadId, contactId, role, angle, evidencePack, serviceMatch }`
- **Output:** `{ subject, body, originalBody, evidenceIds: string[] }`
- **Ön-koşul:** dossier + offer + contact/rol (mig 045 `contacts`).
- **Deterministik:** imza + İYS/KVKK footer **deterministik** eklenir (LLM yazmaz, `coldEmail.ts:159-172`); gövde = LLM.
- **Owning:** Outreach (`sales_rep`). **Preset:** `agencyos-professional`; yüksek-değer → `agencyos-premium-deal`. **Araçlar:** persona (`personaContext.ts`).
- **Hata:** kanıtsız iddia / boş → 'error', taslak yok. **Idempotency:** lead+angle+versiyon. **Logging:** `run_spans`+`ai_cost_logs`. **Eval:** `eval.sales.draft_cold_email` (rol-uygunluk, kanıt-bağlılık, klişe-yokluğu). **Onay:** taslak `outreach:write`; gönderim ayrı (Email Ops HITL).
- **K4 vurgusu:** operatör düzenlerse `original_body` (LLM) vs `final_body` (gönderilen) farkı `outreach_messages`'a (mig 046) yazılır → governance quarantine → onaylı `voice_pattern` (mig 050). Corpus bootstrap yok.

### 2.9 review-outreach `outreach.review_draft` — llm — ★MVP
- **Amaç:** Taslağı Voice Guard (deterministik lint) + **bağımsız cross-family judge** ile denetle (gönderimden önce).
- **Input:** `{ draft: {subject, body}, persona, evidenceIds, leadRole }`
- **Output:** `{ verdict: 'pass'|'revise'|'block', issues: Finding[], voiceScore, groundingOk }`
- **Ön-koşul:** taslak var.
- **Deterministik:** Voice Guard lint (klişe/uzunluk/footer/link) = **pure-code**; judge = **LLM** (cross-family: writer GPT ise judge Claude).
- **Owning:** Outreach Reviewer (ephemeral judge). **Preset:** `agencyos-judge`. **Araçlar:** yok.
- **Hata:** `evidence_id`'siz bulgu reddedilir (`verify.ts` deseni); belirsiz → `revise`. **Idempotency:** taslak-hash başına saf. **Logging:** `run_spans`. **Eval:** `eval.outreach.review` + `eval.orchestration.judge_decision`. **Onay:** Hayır (read critic); `block`/`revise` operatöre gösterilir.

### 2.10 create-gmail-draft `outreach.create_gmail_draft` — composite (tool) — V1
- **Amaç:** Onaylı gövdeyi Gmail'e taslak yaz (teslimat DEĞİL). Tek gerçek yeni dış-entegrasyon (`outreach/gmail.ts`).
- **Input:** `{ leadId, subject, body, threadId? }`
- **Output:** `{ gmailDraftId }`
- **Ön-koşul:** Gmail OAuth (Sprint-0); compliance gate `ok:true`.
- **Deterministik:** **araç çağrısı — LLM YOK.** `threadId` + `In-Reply-To`/`References` RFC 2822 uyumlu (yalın "Re:" thread'e bağlamaz).
- **Owning:** Email Ops. **Preset:** yok. **Araçlar:** Gmail API (`gmail.compose`; `modify`/full YASAK).
- **Hata:** API hata → 'error'; **taslak inert = teslimat yok**. **Idempotency:** `approval_requests` UNIQUE idempotency_key (mig 043). **Logging:** `run_spans`. **Eval:** `eval.outreach.create_gmail_draft`. **Onay:** **Evet — external** (`gateDecision` auto değil; digest-lock).

### 2.11 send-gmail `outreach.send_gmail` — composite (tool) — ★MVP
- **Amaç:** L2 onaylı taslağı **gönder** (K1 çekirdeği). Repo'da bugün gerçek gönderim skill'i YOK (`email.ts:markMessageSent` yalnız kayıt, audit §7) — bu net-new.
- **Input:** `{ draftId | { leadId, subject, body, threadId? }, approvalId }`
- **Output:** `{ gmailMessageId, threadId, sentAt }` + `outreach_messages` `sent` + `gmail_message_id` (mig 046)
- **Ön-koşul:** `approval_requests` approved + digest-eşleşme + not-expired + not-executed (`repo.ts:63-97`); compliance `ok:true`; suppression'da değil.
- **Deterministik:** **araç çağrısı — LLM YOK.**
- **Owning:** Email Ops. **Preset:** yok. **Araçlar:** Gmail API (`gmail.send`), suppression check (mig 047).
- **Hata:** API hata → 'error', `markMessageSent` çağrılmaz; onay uyuşmazsa **yürümez** (`canExecuteApproval`). **Idempotency:** UNIQUE idempotency_key + `markApprovalExecuted` (`repo.ts:86-97`) → **çift-gönderim yapısal imkânsız**. **Logging:** `run_spans`+audit. **Eval:** `eval.outreach.send_gmail` (thread-bağı, suppression-honor). **Onay:** **Evet — external, HITL zorunlu (K1 L2, pazarlıksız)**.

### 2.12 schedule-follow-up `pipeline.schedule_follow_up` — deterministic — ★MVP
- **Amaç:** 5-7 iş günü follow-up planla (yanıt/bounce/opt-out'ta iptal). `sequences.ts:scheduleFollowUp` **zaten var** — skill manifest'ine kaydet + dedup/eval ekle (research 17 §3.1).
- **Input:** `{ leadId, step, channel, dueInDays }`
- **Output:** `{ sequenceId, dueAt }`
- **Ön-koşul:** gönderilmiş outreach; TR iş-günü/tatil takvimi.
- **Deterministik:** tarih matematiği + (lead,step) tekilliği = **pure-code, LLM YOK.**
- **Owning:** Email Ops / Pipeline. **Preset:** yok. **Araçlar:** yok.
- **Hata:** mevcut (lead,step) → **no-op** (`unique(lead_id, step)` insert-guard); DB hata → throw, step 'error'. **Idempotency:** unique(lead_id, step). **Logging:** `run_spans`. **Eval:** `eval.pipeline.schedule_follow_up`. **Onay:** Hayır (deterministik internal).

### 2.13 sync-email-thread `outreach.sync_email_thread` — composite (tool) — V1
- **Amaç:** Gmail History API ile artımlı inbound sync (15dk poll, plan §3 MVP poll; push V2).
- **Input:** `{ sinceHistoryId }`
- **Output:** `{ newMessages: EmailMessage[], historyId }` → `email_messages` (mig 046)
- **Ön-koşul:** Gmail OAuth `gmail.readonly`.
- **Deterministik:** **araç çağrısı — LLM YOK.**
- **Owning:** Email Ops. **Preset:** yok. **Araçlar:** Gmail History API.
- **Hata:** sync timeout → `unknown`, throw yok; historyId geriye kayarsa full-list fallback. **Idempotency:** `gmail_message_id` UNIQUE upsert. **Logging:** `run_spans`. **Eval:** `eval.outreach.sync_email_thread`. **Onay:** Hayır (read).

### 2.14 classify-reply `sales.classify_reply` — llm — ★MVP
- **Amaç:** Inbound yanıtı +/- + ~19 sınıf'a ayır. Inbound = **güvenilmez içerik** (injection taşıyıcı).
- **Input:** `{ threadText, threadId, leadId }` (threadText = **VERİ, talimat değil**)
- **Output:** `{ label, confidence, extracted, sentiment }`
- **Ön-koşul:** yeni inbound mesaj.
- **Deterministik:** **injection-guard**; deterministik ön-filtre unsubscribe/bounce/auto-reply'ı **LLM'siz** yakalar; kalan → LLM (yapılandırılmış çıktı zorunlu).
- **Owning:** Reply Intelligence. **Preset:** `agencyos-fast-extract` (light, reply-prefilter). **Araçlar:** yok.
- **Hata:** düşük confidence → `label='needs_human'`. **Idempotency:** thread-mesaj başına saf. **Logging:** `run_spans` (redacted). **Eval:** `eval.sales.classify_reply`. **Onay:** Hayır (read) — ama **lethal-trifecta**: classify (confidential-read + untrusted) send'den **ayrı adım** olmak zorunda (`permissions.ts:32-36`).

### 2.15 draft-reply `sales.draft_reply` — llm — V1
- **Amaç:** Sınıflanmış yanıta persona'lı taslak cevap (asla otomatik göndermez → create-gmail-draft'a besler).
- **Input:** `{ threadText, replyLabel, persona, leadId }`
- **Output:** `{ subject, body }`
- **Ön-koşul:** classify-reply çıktısı.
- **Deterministik:** persona (`personaContext.ts` + `PROMPT_STYLE_GUIDE.md`) = bağlam; gövde = LLM.
- **Owning:** Reply Intelligence. **Preset:** `agencyos-professional` (reply-draft). **Araçlar:** persona.
- **Hata:** boş → 'error', taslak yok. **Idempotency:** thread+label başına. **Logging:** `run_spans`+cost. **Eval:** `eval.sales.draft_reply`. **Onay:** çıktı create-gmail-draft'a → external HITL.

### 2.16 generate-proposal `sales.draft_proposal` — llm — V1
- **Amaç:** Modüler bloklarla danışmanlık teklifi (fiyat **AI-uydurmaz**; price rules/kullanıcı girdisi). Version chain (mig 049).
- **Input:** `{ leadId, serviceSlug, scope, priceInputs }`
- **Output:** `{ proposalId, version, blocks, priceTl, supersedesId? }`
- **Ön-koşul:** pipeline `proposal` aşaması (gate: pain+decision_maker+budget, mig 020).
- **Deterministik:** fiyat = **price rules/girdi (pure-code)**, LLM sayı uydurmaz; bloklar = LLM framing.
- **Owning:** Proposal (`sales_rep`). **Preset:** `agencyos-professional`; yüksek-değer → `agencyos-premium-deal`. **Araçlar:** `PRICING_RULES.md`.
- **Hata:** fiyat kuralı yok → **fiyat boş + operatör-girişi işareti**. **Idempotency:** append-only version (eski superseded). **Logging:** `run_spans`+cost. **Eval:** `eval.sales.draft_proposal` (fiyat-grounding). **Onay:** **Evet (high risk + confidential)**.

### 2.17 recommend-next-action `pipeline.recommend_next_action` — composite — V1
- **Amaç:** Lead durumundan sonraki eylemi öner (FSM status×replyLabel→action).
- **Input:** `{ leadStatus, lastReply?, daysSinceTouch, followUpState }`
- **Output:** `{ action, reason, dueInDays? }`
- **Ön-koşul:** lead durumu.
- **Deterministik:** FSM tablosu = **pure-code**; LLM yalnız eşit-skorlu dalların gerekçesi.
- **Owning:** Pipeline Manager. **Preset:** `agencyos-fast-extract` (yalnız eşit dal). **Araçlar:** `staleDeals.ts`.
- **Hata:** belirsiz → `action='review'` (güvenli). **Idempotency:** saf (yan etki yok). **Logging:** `run_spans`. **Eval:** `eval.pipeline.recommend_next_action`. **Onay:** Hayır (read).

### 2.18 extract-memory `memory.extract_sales_memory` — llm — V2
- **Amaç:** Thread'den lead-bağlı ilişki fact'leri çıkar → **quarantine** (occurrence≥3/onay→active). İlişki hafızası jenerikliğini bu governed katman çözer.
- **Input:** `{ threadText, leadId, source }`
- **Output:** `{ facts: MemoryCandidate[] }` (her fact confidence + scope)
- **Ön-koşul:** thread; `memory/governance.ts` mevcut.
- **Deterministik:** çıkarım = LLM; **çıktı quarantine'a** yazılır (active değil).
- **Owning:** Relationship Memory (`sales_rep`, yalnız quarantine-write). **Preset:** `agencyos-memory` (extract light → consolidate → high-risk sonnet-5). **Araçlar:** embeddings (`gemini-embedding-001` 768d, mig 042).
- **Hata:** çıkarım yok → boş; hatalı fact quarantine'da kalır (90g retention). **Idempotency:** thread+fact-hash dedup. **Logging:** `run_spans`. **Eval:** `eval.memory.extract_sales_memory`. **Onay:** Hayır (quarantine inert); active terfi HITL. **Sızıntı koruması:** scope `lead:<id>` (mig 050) + key-prefix `lead:<id>:` (defense-in-depth) + filter-before-retrieval.

### 2.19 audit-compliance `compliance.audit_outreach` — deterministic — V1
- **Amaç:** Gönderim öncesi KVKK/İYS teknik kapı (footer + adres-sınıfı + suppression). Hukuki görüş değil (research 17 §8.4).
- **Input:** `{ draftBody, recipientAddrType, suppressed }`
- **Output:** `{ ok, footerPresent, optOut, addrClass, blockers[] }`
- **Ön-koşul:** taslak; suppression listesi (mig 047).
- **Deterministik:** İYS/KVKK footer regex (`buildComplianceFooter`, mig 018) + iş-vs-kişisel adres heuristiği + suppression = **pure-code, LLM YOK.**
- **Owning:** Compliance & Risk (`data_analyst`). **Preset:** yok. **Araçlar:** yok.
- **Hata:** eksik footer / suppressed → `ok:false` (**gönderim bloke**). **Idempotency:** saf. **Logging:** `run_spans`. **Eval:** `eval.compliance.audit_outreach`. **Onay:** Hayır (read gate).

### 2.20 audit-deliverability `outreach.audit_deliverability` — deterministic — V1
- **Amaç:** Gönderim domain'i SPF/DKIM/DMARC + one-click-unsub denetimi.
- **Input:** `{ sendingDomain }`
- **Output:** `{ spf, dkim, dmarc, oneClickUnsub, issues[] }`
- **Ön-koşul:** gönderim domain'i (operatör bilgisi — audit §Açık sorular).
- **Deterministik:** DNS TXT varlık kontrolü = **pure-code, LLM YOK.**
- **Owning:** Compliance & Risk. **Preset:** yok. **Araçlar:** DNS.
- **Hata:** DNS timeout → `unknown`+issue, throw yok. **Idempotency:** domain-cache TTL. **Logging:** `run_spans`. **Eval:** `eval.outreach.audit_deliverability`. **Onay:** Hayır (read + external-DNS). V1'de send shadow'da kalır bu geçene kadar.

### 2.21 update-pipeline `pipeline.update_status` — deterministic — ★MVP
- **Amaç:** Lead status FSM geçişini uygula (new→contacted→responded→…→converted/lost). CRM auto-update (plan K3).
- **Input:** `{ leadId, event, replyLabel? }`
- **Output:** `{ newStatus, transitionOk: boolean, reason }`
- **Ön-koşul:** geçerli lead; proposal terfi gate (mig 020).
- **Deterministik:** state-transition tablosu = **pure-code, LLM YOK**; proposal'a terfi pain+decision_maker+budget zorunlu (422-guard).
- **Owning:** Pipeline Manager. **Preset:** yok. **Araçlar:** yok.
- **Hata:** geçersiz geçiş → no-op + reason (FSM ihlali reddedilir); gate eksik → 422. **Idempotency:** aynı (lead, event) → no-op. **Logging:** `run_spans`+`lead_events` (mig 053 opsiyonel). **Eval:** `eval.pipeline.update_status` (parity: geçerli geçiş kümesi). **Onay:** Hayır (deterministik internal).

---

## 3. Registry değişmezleri + aktivasyon (özet)

- **Benzersizlik (`validateRegistry`, `registry.ts:55-75`):** duplicate slug/summary, boş input/output_schema, eksik eval_slug, boş permission_scopes, allowlist-dışı handlerKey → **hard-fail**. Yeni 18 skill bu değişmezleri geçmeden katalog derlenmez.
- **handlerKey wiring:** deterministik/composite (score-lead✓, match-service✓, match-portfolio, build-offer, schedule-follow-up, update-pipeline, audit-compliance, audit-deliverability, recommend-next-action) → `SKILL_HANDLERS` allowlist'e bağla (mevcut modülü sar: `sequences.ts`, `offerMatcher.ts`, `pipelineGate.ts`, `buildComplianceFooter`). LLM/tool → `handlerKey: null`, `route.ts`/execute üzerinden.
- **Aktivasyon kapıları (06 §4):** Flag (`BRAIN_ACTIVE_ENABLED`) + Eval-gate (golden %100 / rubric eşiği) + Parity-guard (deterministik birebir). MVP deterministik skill'ler önce active; send-gmail/classify-reply Gmail OAuth + SPF/DKIM/DMARC tamamlanana kadar shadow.
- **Cost funnel (plan §4):** deterministik normalize → cheap extract/filter → budget research → professional yalnız qualified → premium yalnız 1-2 escalation/gün. Gerçek maliyet riski LLM değil Google Places → `tool_cost_logs` (mig 052).
- **DOKUNULMAZ:** hiçbir skill `/gorevler`/`/aliskanliklar`/LIFE DB scope'u talep etmez.
