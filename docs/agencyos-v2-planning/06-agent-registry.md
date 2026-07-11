---
Doküman: 06-agent-registry
Dalga: 1 (Foundation/contracts — ⚑ load-bearing)
Tarih: 2026-07-11
Durum: Sözleşme (diğer dokümanlar buna referans verir)
Bağımlılık: 04-domain-model.md (entity'ler), 05-event-contracts.md (event/idempotency), 07-skill-registry.md (skill spec'leri), 16-openrouter-routing.md (preset katalog)
---

# AgencyOS V2 — Ajan Registry (11 Rol Sözleşmesi)

## 0. Kritik çerçeve — bunlar YENİ ajan DEĞİL

Bu dokümandaki 11 "rol", yeni paralel ajanlar değildir. Satış hattındaki boşluklar (Gmail taslak/gönderim, reply-zekâsı, follow-up state machine, portföy eşleştirme, öğrenen Voice DNA) **yeni SKILL'lerdir** — mevcut DB `agents` registry'sindeki (`supabase/migrations/009`, `registry.ts:5-19`) ajanlara `agent_skill_grants` (mig 041) ile grant edilir ve/veya Brain v2 skill handler'ı olarak koşar. Yeni `agents` satırı **açılmaz**.

Gerekçe (research 17 §2, birincil Anthropic rehberi 2025): iyi tasarlanmış tek ajan beklenenden fazlasını yapar; çok-ajan 3-10× token harcar. Çok-ajana geçiş yalnız üç koşulda haklı: context pollution, gerçek paralelleşme, uzmanlaşmanın araç seçimini iyileştirmesi. AgencyOS'ta bu koşullar **context izolasyonu** (özellikle güvenilmez inbound e-posta) ve **council'in mevcut ephemeral C1-C4 rol deseni** (`leadIntel/council.ts`) ile zaten karşılanıyor — kalıcı yeni ajan gerekmez.

**Repo gerçeği (canlı DB ajanları, `runner.ts:126-138` gatherContext switch + `registry.ts:70-72`):** `ceo` (orchestrator), `sales_rep` (SALES_FRAMEWORK yüklü), `researcher`, `data_analyst`, `cmo`, `job_*` (kariyer motoru — bu suit dışı). 11 rol bu 5 iş-ajanına (+ ephemeral critic/judge) haritalanır.

---

## 1. 11 rol → mevcut ajan taşıyıcısı haritası

| # | Rol (plan §4) | Taşıyıcı ajan (mevcut) | Skill grant'ları (07-skill-registry) | Kalıcılık |
|---|---|---|---|---|
| 1 | **Lead Intelligence** | `researcher` + `leadIntel/council` (ephemeral C1∥C2→C3→C4) | verify-company, build-lead-dossier, extract-signals, score-lead (+`lead.audit_website`) | Standing agent + ephemeral council |
| 2 | **Qualification** | `data_analyst` / `sales_rep` + `leads/pipelineGate.ts` (deterministik FSM) | score-lead (çıktısı gate'e), recommend-next-action | Deterministik modül (LLM'siz) |
| 3 | **Service & Offer** | Deterministik `leadIntel/offerMatcher.ts` (C2) + `services/catalog.ts` | match-service, match-portfolio, build-offer | Deterministik + composite framing |
| 4 | **Outreach** | `sales_rep` + `coldEmail.ts` + `coldEmailTemplates.ts` (4 açı) | generate-outreach | Standing agent |
| 5 | **Outreach Reviewer** | Ephemeral **critic/judge** (council C3 Skeptic deseni) — kalıcı ajan değil | review-outreach | Ephemeral judge (cross-family) |
| 6 | **Email Ops** | `sales_rep` (araç-çağıran; LLM yok) + yeni `outreach/gmail.ts` | create-gmail-draft, send-gmail, sync-email-thread, schedule-follow-up | Tool-caller (external) |
| 7 | **Reply Intelligence** | `sales_rep` / `data_analyst` (izole, salt-okuma girişli) | classify-reply, draft-reply | Standing agent (injection-izole) |
| 8 | **Proposal** | `sales_rep` + `proposalGenerator.ts` / price rules | generate-proposal | Standing agent |
| 9 | **Relationship Memory** | `sales_rep` → quarantine (`memory/governance.ts`) | extract-memory | Standing agent (yalnız quarantine-write) |
| 10 | **Pipeline Manager** | `data_analyst` / `sales_rep` + `sequences.ts` + `staleDeals.ts` | update-pipeline, schedule-follow-up, recommend-next-action | Deterministik modül |
| 11 | **Compliance & Risk** | `data_analyst` (yeni yetenek, yeni ajan değil) + `buildComplianceFooter` (mig 018) | audit-compliance, audit-deliverability | Deterministik gate (LLM'siz) |

**Sonuç:** 11 rolün 8'i `sales_rep`/`researcher`/`data_analyst`'e grant; 1'i (Outreach Reviewer) ephemeral judge; 2'si (Qualification, Compliance) deterministik gate. Sıfır yeni `agents` satırı; yalnız `agent_skill_grants` INSERT + skill handler wiring.

---

## 2. Ajanlar yapılandırılmış sözleşme ile konuşur (serbest-metin YOK)

Kural (plan §4, research 17 §2): **agent-to-agent serbest-metin sohbeti yasak.** Ajanlar birbirine doğrudan konuşmaz; her adım `PlanStep.input` (`brain/types.ts:44-50`) ile **minimal, tiplenmiş** girdi alır ve tiplenmiş çıktı üretir. Bağ, ajanlar arası mesaj değil, **event + entity**tir.

- **Girdi/çıktı şeması:** her rolün I/O şeması aşağıda tanımlı; skill seviyesinde `SkillManifest.inputSchema`/`outputSchema` (`skills/types.ts:22-23`) zorlar; `validateRegistry` boş I/O'yu **hard-fail** eder (`registry.ts:66-67`).
- **Bağlantı = event, konuşma değil:** bir rol tamamlandığında **05-event-contracts.md**'deki event'i yayar (ör. `lead.dossier_ready`, `outreach.draft_created`, `reply.classified`); sonraki rol o event'i **trigger** olarak tüketir. Payload tiplenmiş entity referansıdır (ör. `{ leadId, dossierId }`), serbest metin değil.
- **Idempotency:** her event/aksiyon `idempotencyKey` taşır (05-event-contracts); `create_gmail_draft`/`send_gmail` gibi dış etkiler `approval_requests` UNIQUE idempotency_key (mig 043, `repo.ts:21-47`) ile çift-tetiklenmeye karşı korunur.
- **Trace:** her adım `run_spans`'e (`trace/spans.ts`, redacted) audit yazar; ajanlar-arası akış span zinciriyle (run_id/step_id) izlenir — sohbet log'uyla değil.

Anti-desen (yasak) vs doğru desen (research 17 tablosu):

| Yanlış | Doğru |
|---|---|
| Tek ajan inbound e-postayı okur → niyet çıkarır → taslak yazar → gönderir | `classify-reply` (izole) → `recommend-next-action` (FSM) → `draft-reply` (LLM) → `create-gmail-draft` (external, HITL) |
| Tüm satış bağlamı tek pencerede birikir | Her adım `step.input` ile minimal bağlam |
| Gönderim otomatik | Gönderim daima `approval_requests` digest-lock'lu (yapısal HITL) |

---

## 3. Rol sözleşmeleri (11 tam profil)

Ortak notlar (her role uygulanır):
- **Model preset** plan §4 preset ADIYLA verilir; **model ID hardcode edilmez** — canlı `GET /api/v1/models` doğrulaması aktivasyon önkoşulu (research 17 §8, plan §2: canlı tier'ler `gemini-2.5-flash-lite`/`haiku-4-5`/`deepseek-v4-pro` **superseded/bozuk**).
- **Human approval class** `brain/gate.ts:classifyScopes` (spend>external>write>read) + `gateDecision`'dan türetilir: auto yalnız `read + risk≤low + sensitivity≤internal` (`gate.ts:20-30`); geri kalan → `approval_requests`.
- **Memory access** scope'ludur (plan K4, mig 050 `scope_type`/`scope_id`); hiçbir ajan `agent_memory`'ye doğrudan **active-write** yapmaz — yalnız Relationship Memory quarantine'a yazar.
- **Retry/timeout** `agent_tasks` lease/retry (mig 038) + `SkillManifest.timeoutMs`'ten gelir; atomik claim (`runner.ts:41-55`) çift-yürütmeyi engeller.

### 3.1 Lead Intelligence
| Alan | Değer |
|---|---|
| Taşıyıcı | `researcher` + ephemeral `leadIntel/council` |
| Input | `{ leadId: string, url?: string, sector?: string, forceRefresh?: boolean }` |
| Output | `{ dossierId, evidence: Evidence[], signals: Signal[], scores: { design, ai, reasons[] }, dataConfidence: number }` (STRUCTURED) |
| Skill/tools | build-lead-dossier, verify-company, extract-signals, score-lead, `lead.audit_website`; araçlar: Places, PageSpeed, HTML fetch, screenshot (SSRF-guard mevcut `jobs/*` deseni) |
| Model preset | `agencyos-research` (dossier ön-taslak) + `agencyos-fast-extract` (signal-tag) + **deterministik** (score-lead, LLM'siz) |
| Memory | governed **read** (scope `lead:<id>`); write YOK |
| Read perms | `leads:read`, `research:read` |
| Write perms | `leads:write` (yalnız dossier/evidence/score alanları; provenance `evidence_id`'li) |
| Trigger | cron `daily-scan` / manuel scan / `lead.created` event |
| Human approval | Hayır (read + write internal-scored) — deterministik skorlama auto |
| Timeout | 30s (audit_website), 15s (dossier LLM) |
| Retry | 1 (lease-based) |
| Failure mode | Kanıt eksik → **düşük dataConfidence + düşük skor**, throw YOK (never-throws deseni, audit §5); ağ hatası → step 'error', lead kirletilmez |
| Eval | `eval.lead.build_dossier`, `eval.lead.score_deterministic` (birebir parity), `eval.lead.extract_signals` |
| Cost class | ~$0.10-0.15/lead (research budget) — funnel: cheap prefilter önce |

### 3.2 Qualification
| Alan | Değer |
|---|---|
| Taşıyıcı | `data_analyst`/`sales_rep` + `leads/pipelineGate.ts` (deterministik) |
| Input | `{ leadId, scores, signals[], reply?: ReplyClassification }` |
| Output | `{ qualified: boolean, tier: 'A'|'B'|'C'|'D', missing: string[], gateReason: string }` (STRUCTURED) |
| Skill/tools | score-lead çıktısı gate'e; recommend-next-action; **LLM yok** — `pipelineGate` FSM (pain+decision_maker+budget zorunlu, audit §6) |
| Model preset | **Yok** (deterministik) — eşit-skorlu dalda gerekçe için `agencyos-fast-extract` opsiyonel |
| Memory | read (scope `lead:<id>`) |
| Read perms | `leads:read` |
| Write perms | `leads:write` (status FSM: new→contacted→…→proposal geçişi 422-guard'lı) |
| Trigger | dossier_ready event / reply.classified (K1 reply→qualification sinyali) |
| Human approval | Hayır (deterministik, internal) |
| Timeout | 3-4s |
| Retry | 0 (saf fonksiyon) |
| Failure mode | Belirsiz girdi → `qualified:false` + `missing[]` (güvenli varsayılan); proposal terfi eksik alanla **yapısal imkânsız** (mig 020 gate) |
| Eval | `eval.qualification.gate` (parity: mevcut pipelineGate kararı birebir) |
| Cost class | ~$0 |

### 3.3 Service & Offer
| Alan | Değer |
|---|---|
| Taşıyıcı | Deterministik `offerMatcher.ts` (C2) + `services/catalog.ts` |
| Input | `{ designScore, aiScore, sector, evidence: Evidence[] }` |
| Output | `{ matches: ServiceMatch[], portfolio: PortfolioRef[], angle, templateKey, rationale }` (STRUCTURED) |
| Skill/tools | match-service (wired `lead.match_services`), match-portfolio, build-offer |
| Model preset | **Deterministik** (match-service/portfolio, uydurma yapısal imkânsız) + `agencyos-professional` yalnız build-offer framing |
| Memory | read (`lead:<id>`, portföy kanıtı için `portfolio:read`) |
| Read perms | `leads:read`, `services:read`, `portfolio:read` |
| Write perms | Yok (öneri üretir; persist Outreach/Proposal'da) |
| Trigger | dossier_ready / qualified event |
| Human approval | Hayır (read) |
| Timeout | 3s (match), 15s (build-offer) |
| Retry | 0 |
| Failure mode | Eşleşme yok → **boş dizi** (asla hayali hizmet/örnek — offerMatcher yalnız katalog slug'ından seçer, audit §5); kanıt yok → `mini_audit` en güvenli açı |
| Eval | `eval.lead.match_services` (parity), `eval.sales.match_portfolio`, `eval.sales.build_offer_angle` |
| Cost class | ~$0 (match) + ~$0.03 (framing) |

### 3.4 Outreach
| Alan | Değer |
|---|---|
| Taşıyıcı | `sales_rep` + `coldEmail.ts` (persona `personaContext.ts`) |
| Input | `{ leadId, contactId, role: 'owner'|'cto'|'cfo'|'marketing', angle, evidencePack, serviceMatch }` (K2 **rol-farkındalıklı**) |
| Output | `{ subject, body, originalBody, evidenceIds: string[] }` (STRUCTURED); imza+İYS/KVKK footer **deterministik** eklenir (LLM yazmaz, `coldEmail.ts:159-172`) |
| Skill/tools | generate-outreach (rol-aware K2; edit-delta yakalar K4 → `original_body`/`final_body` mig 046) |
| Model preset | `agencyos-professional`; yüksek-değer lead → `agencyos-premium-deal` (opus-4.8 yalnız explicit escalation, plan §3) |
| Memory | read (`lead:<id>` ilişki hafızası + persona) |
| Read perms | `leads:read`, `services:read`, `portfolio:read` |
| Write perms | `outreach:write` (DRAFT satırı — teslimat DEĞİL) |
| Trigger | Bugün kokpiti "onay bekleyen outreach" / operatör / qualified event |
| Human approval | **Evet** — taslak `outreach:write` ama gönderim ayrı (Email Ops); voice-guard + judge sonrası HITL |
| Timeout | 15-25s |
| Retry | 1 |
| Failure mode | Üretim boş / kanıtsız iddia → step 'error', taslak yaratılmaz (evidence_id grounding zorunlu) |
| Eval | `eval.sales.draft_cold_email` (rubric: rol-uygunluk, kanıt-bağlılık, klişe-yokluğu) |
| Cost class | ~$0.05/taslak (professional); premium escalation ~$0.20 |

### 3.5 Outreach Reviewer
| Alan | Değer |
|---|---|
| Taşıyıcı | **Ephemeral judge/critic** (council C3 Skeptic deseni; kalıcı ajan değil) |
| Input | `{ draft: { subject, body }, persona, evidenceIds[], leadRole }` |
| Output | `{ verdict: 'pass'|'revise'|'block', issues: Finding[], voiceScore, groundingOk: boolean }` (STRUCTURED) |
| Skill/tools | review-outreach (Voice Guard deterministik lint + bağımsız judge) |
| Model preset | `agencyos-judge` (**cross-family**: writer GPT ise judge Claude / tersi — plan §4) |
| Memory | read (persona referansı) |
| Read perms | `outreach:read`, `leads:read` |
| Write perms | Yok (yalnız verdict) |
| Trigger | outreach.draft_created event (Outreach'tan sonra, HITL'den önce) |
| Human approval | Hayır (read-only critic) — ama verdict `block`/`revise` operatöre gösterilir |
| Timeout | 12s |
| Retry | 0 |
| Failure mode | `evidence_id`'siz bulgu **reddedilir** (`brain/verify.ts` deseni); judge belirsiz → `revise` (güvenli) |
| Eval | `eval.orchestration.judge_decision` (mevcut) + `eval.outreach.review` |
| Cost class | ~$0.05/inceleme |

### 3.6 Email Ops
| Alan | Değer |
|---|---|
| Taşıyıcı | `sales_rep` (araç-çağıran, **LLM yok**) + yeni `outreach/gmail.ts` (tek gerçek yeni dış-entegrasyon) |
| Input | create-gmail-draft: `{ leadId, subject, body, threadId? }`; send-gmail: `{ draftId, approvalId }`; sync: `{ sinceHistoryId }`; schedule: `{ leadId, step, channel, dueInDays }` |
| Output | `{ gmailDraftId }` / `{ gmailMessageId, threadId }` / `{ newMessages: EmailMessage[], historyId }` / `{ sequenceId, dueAt }` (STRUCTURED) |
| Skill/tools | create-gmail-draft (V1), send-gmail, sync-email-thread, schedule-follow-up; Gmail API MVP scope: **`gmail.send` + `gmail.readonly`**; `gmail.compose` yalnız V1 `create-gmail-draft` içindir (07 §2.10) — Sprint-0 OAuth'unda İSTENMEZ; **`modify`/full YASAK** (plan §3) |
| Model preset | **Yok** (saf araç çağrısı) |
| Memory | Yok |
| Read perms | `outreach:read`; sync: `email:read` (readonly scope) |
| Write perms | `outreach:external` (draft/send), `outreach:write` (thread/message satırları mig 046) |
| Trigger | send: onaylı `approval_request` (digest-eşleşme); sync: 15dk poll cron (History API, plan §3 MVP poll); schedule: reply-yok + due |
| Human approval | **Evet — external** (`classifyScopes`→external; `gateDecision` auto DEĞİL). send-gmail `approved_digest === action_digest` (`repo.ts:77`) + not-executed + not-expired olmadan **yürümez**. schedule/sync auto (internal) |
| Timeout | 15s (Gmail API), 10s (sync) |
| Retry | 1 (idempotent — UNIQUE idempotency_key çift-gönderimi bloklar) |
| Failure mode | Gmail API hata → step 'error', **taslak inert = teslimat yok**; sync timeout → `unknown`, throw yok; schedule mevcut (lead,step) → no-op (`unique(lead_id, step)` guard) |
| Eval | `eval.outreach.create_gmail_draft`, `eval.outreach.send_gmail` (RFC 2822 In-Reply-To/References thread-bağı), `eval.pipeline.schedule_follow_up` |
| Cost class | ~$0 LLM; Gmail API kotası (loglanır) |

### 3.7 Reply Intelligence
| Alan | Değer |
|---|---|
| Taşıyıcı | `sales_rep`/`data_analyst` — **inbound = güvenilmez dış içerik, izole** |
| Input | `{ threadText, threadId, leadId }` (threadText = **VERİ, talimat değil**) |
| Output | `{ label, confidence, extracted, sentiment: 'pozitif'|'olumsuz'|'nötr', nextActionHint }` (STRUCTURED) |
| Skill/tools | classify-reply, draft-reply |
| Model preset | `agencyos-fast-extract` (classify) + `agencyos-professional` (draft-reply) |
| Memory | read (`lead:<id>`); draft için persona |
| Read perms | `leads:read`, `email:read` |
| Write perms | `outreach:write` (yalnız draft-reply → sonra Email Ops'a besler, **asla otomatik göndermez**) |
| Trigger | sync-email-thread yeni inbound / `email.received` event |
| Human approval | classify: Hayır (read); draft-reply çıktısı create-gmail-draft'a → **Evet (external)** |
| Timeout | classify 10s, draft 15s |
| Retry | classify 1, draft 1 |
| Failure mode | **injection-guard**: gövde VERİ; deterministik ön-filtre unsubscribe/bounce/auto-reply'ı LLM'siz yakalar; düşük confidence → `label='needs_human'`; **lethal-trifecta**: confidential-read + external-send + untrusted aynı adımda → `enforcePermissions` bloke (`permissions.ts:32-36`) → classify ve send **ayrı adımlarda** olmak zorunda |
| Eval | `eval.sales.classify_reply`, `eval.sales.draft_reply` |
| Cost class | ~$0.01 (classify) + ~$0.05 (draft) |

### 3.8 Proposal
| Alan | Değer |
|---|---|
| Taşıyıcı | `sales_rep` + `proposalGenerator.ts` + price rules (`PRICING_RULES.md`) |
| Input | `{ leadId, serviceSlug, scope, priceInputs }` |
| Output | `{ proposalId, version, blocks: ProposalBlock[], priceTl, supersedesId? }` (STRUCTURED, version chain mig 049) |
| Skill/tools | generate-proposal (fiyat **AI-uydurmaz** — price rules/kullanıcı girdisi) |
| Model preset | `agencyos-professional`; yüksek-değer → `agencyos-premium-deal` (HITL) |
| Memory | read (`lead:<id>` + geçmiş teklif zinciri) |
| Read perms | `leads:read`, `services:read`, `finance:read` |
| Write perms | `outreach:write` (proposals append-only; superseded eski versiyon) |
| Trigger | pipeline `proposal` aşaması (gate geçmiş) / operatör |
| Human approval | **Evet (high risk + confidential)** — `gateDecision` auto DEĞİL |
| Timeout | 25s |
| Retry | 1 |
| Failure mode | Fiyat kuralı yok → **fiyat alanı boş + operatör-girişi işareti**, LLM sayı uydurmaz; üretim boş → 'error' |
| Eval | `eval.sales.draft_proposal` (rubric: fiyat-grounding, modülerlik) |
| Cost class | ~$0.20 (heavy/professional) |

### 3.9 Relationship Memory
| Alan | Değer |
|---|---|
| Taşıyıcı | `sales_rep` — **yalnız quarantine-write** (`memory/governance.ts`) |
| Input | `{ threadText, leadId, source }` |
| Output | `{ facts: MemoryCandidate[] }` (STRUCTURED; her fact confidence + scope) |
| Skill/tools | extract-memory |
| Model preset | `agencyos-memory` (extract `light` → consolidate → high-risk `sonnet-5`) |
| Memory | **quarantine-write** (scope `lead:<id>`, mig 050 `scope_type`/`scope_id` + key-prefix `lead:<id>:` — defense-in-depth, plan §3); active'e yalnız occurrence≥3 veya operatör onayıyla geçer |
| Read perms | `leads:read` |
| Write perms | `assistant:write` (yalnız `agent_memory` quarantine layer) |
| Trigger | reply.classified / thread kapanışı |
| Human approval | Hayır (quarantine inert) — active'e terfi HITL |
| Timeout | 10s |
| Retry | 0 |
| Failure mode | Çıkarım yok → boş; hatalı fact **quarantine'da kalır** (active yola sızmaz); 90g retention decay; **cross-lead sızıntı koruması**: scope-filter-before-retrieval + key-prefix |
| Eval | `eval.memory.extract_sales_memory` |
| Cost class | ~$0.005/çıkarım (light) |

### 3.10 Pipeline Manager
| Alan | Değer |
|---|---|
| Taşıyıcı | `data_analyst`/`sales_rep` + `sequences.ts` + `staleDeals.ts` |
| Input | `{ leadId, event, replyLabel?, daysSinceTouch, followUpState }` |
| Output | `{ newStatus, action, dueInDays?, reason }` (STRUCTURED) |
| Skill/tools | update-pipeline (deterministik FSM), schedule-follow-up, recommend-next-action |
| Model preset | **Deterministik** (update/schedule); recommend-next-action eşit-dalda `agencyos-fast-extract` gerekçe |
| Memory | read (`lead:<id>`) |
| Read perms | `leads:read` |
| Write perms | `leads:write` (status geçişi), `outreach:write` (sequence) |
| Trigger | reply.classified / bounce / opt-out / due-sequence cron (5-7 iş günü, TR tatil/iş-günü) |
| Human approval | Hayır (deterministik state-transition, internal) |
| Timeout | 3-5s |
| Retry | 0 (saf) |
| Failure mode | Yanıt/bounce/opt-out'ta follow-up **iptal** (stop-on-reply); belirsiz → `action='review'` güvenli varsayılan; state-transition **LLM'siz** (dedup/tarih/FSM) |
| Eval | `eval.pipeline.recommend_next_action`, `eval.pipeline.update_status` (parity), `eval.pipeline.schedule_follow_up` |
| Cost class | ~$0 |

### 3.11 Compliance & Risk
| Alan | Değer |
|---|---|
| Taşıyıcı | `data_analyst` (yeni yetenek, yeni ajan değil) + `buildComplianceFooter` (mig 018) |
| Input | audit-compliance: `{ draftBody, recipientAddrType, suppressed }`; audit-deliverability: `{ sendingDomain }` |
| Output | `{ ok, footerPresent, optOut, addrClass, blockers[] }` / `{ spf, dkim, dmarc, oneClickUnsub, issues[] }` (STRUCTURED) |
| Skill/tools | audit-compliance, audit-deliverability; **LLM YOK** (regex footer + DNS TXT) |
| Model preset | **Yok** (deterministik) |
| Memory | Yok |
| Read perms | `outreach:read`, `system:read`, `research:read` (DNS) |
| Write perms | Yok (pre-send gate — bloke eder, yazmaz) |
| Trigger | pre-send gate (Email Ops'tan önce zorunlu) / haftalık deliverability cron |
| Human approval | Hayır (read + external-DNS) — ama `ok:false` **gönderimi bloke eder** |
| Timeout | 3-10s |
| Retry | 0 (DNS cache TTL) |
| Failure mode | Eksik footer → `ok:false` (gönderim bloke, KVKK/İYS teknik kapı — hukuki görüş değil, research 17 §8.4); suppression'da → block; DNS timeout → `unknown`+issue, throw yok |
| Eval | `eval.compliance.audit_outreach`, `eval.outreach.audit_deliverability` |
| Cost class | ~$0 |

---

## 4. Shadow → active aktivasyon kapıları

Hiçbir rol/skill üç kapı geçmeden `active=true` olmaz (mig 041 `skills.active` default `false`; "registered ≠ active"). Bu yol **mevcut** — yeni altyapı gerekmez.

| Kapı | Mekanizma (dosya) | Geçme kriteri |
|---|---|---|
| **1. Flag** | `BRAIN_V2_ENABLED` + `BRAIN_ACTIVE_ENABLED` (`brain/index.ts:14-21`, default OFF); leadIntel `flag.ts` off/shadow/active | Operatör açıkça açar; kapalıysa active istense bile **shadow'a düşer** (`index.ts:56-59`) |
| **2. Eval-gate** | `eval/harness.ts` golden set + `judge.ts` (trajectory/rubric); rolün `evalSlug`'ı gerçek eval_case'e bağlı (`validateRegistry` `eval_slug` boşsa hard-fail, `registry.ts:68`) | Golden %100 pass; LLM skill judge rubrik eşiği; deterministik birebir parity |
| **3. Parity-guard** | `eval/cases/councilParity.ts` deseni — deterministik skorlar refactor sonrası **birebir** korunmalı | Shadow çıktısı mevcut yolun kararıyla eşleşir (regresyon yok) |

**Akış:** katalog + handler (allowlist `registry.ts:20-33`) ekle → `handlerKey` set (deterministik) veya `null` (LLM) → eval_case yaz → **shadow modda** koştur (`runBrainShadow` — hiçbir write/dış-çağrı, yalnız "would-do", `index.ts:29-46`) → parity + eval yeşilse `skills.active=true` + `agent_skill_grants` INSERT → `BRAIN_ACTIVE_ENABLED` ile active.

**MVP-önce sıralama (plan K1 + research 17 §7 ile hizalı):** deterministik roller (Qualification, Service&Offer match, Pipeline Manager, Compliance&Risk) sıfır-maliyet + dış-entegrasyonsuz → önce active. Email Ops + Reply Intelligence (Gmail OAuth + inbound untrusted) → Gmail scope + SPF/DKIM/DMARC tamamlanana kadar **shadow**. Relationship Memory (extract-memory) → governed memory olgunlaşınca (V2).

---

## 5. Lethal-trifecta guard + güvenilmez e-posta izolasyonu

**`hasLethalTrifecta` (`permissions.ts:32-36`):** tek adım aynı anda (a) confidential+ okuma, (b) dış-gönderim (external/spend), (c) güvenilmez içerik taşıyamaz → `enforcePermissions` (`permissions.ts:50-68`) scope→grant→trifecta sırasıyla bloke eder.

**AgencyOS'a uygulaması:** gelen e-posta **güvenilmez dış içeriktir** (prompt-injection taşıyıcısı). "Yanıt oku → sınıflandır → taslakla → gönder" **tek adımda yasak** — trifecta tetiklenir. Bu yüzden Reply Intelligence (confidential lead-read + untrusted inbound) ve Email Ops (external send) **ayrı adımlardır**; aralarındaki bağ event + entity, ajan-sohbeti değil. Bu ayrıştırma bir tercih değil, mevcut guard tarafından **zorunlu kılınıyor**.

- **Email Ops send** yine `approval_requests` digest-lock'lu (mig 043): onaylanan `action_digest` yürütmede yeniden hesaplanır → "X'i onayla, Y'yi gönder" **yapısal imkânsız** (`repo.ts:77`, `gate.ts:computeActionDigest`).
- **Taslak ≠ gönderim:** create-gmail-draft dış yan-etkidir ama teslimat değil (alıcı görmez, silinebilir); yine external-gate + günlük taslak cap (spam-drafts önleme, `ai/caps.ts` deseni).
- **DOKUNULMAZ:** Görev/Alışkanlık/Rutin (`/gorevler`, `/aliskanliklar`, LIFE DB) — hiçbir rol oraya scope talep etmez.
