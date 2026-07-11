---
Doküman: agent-and-skill-architecture
Tarih: 2026-07-11
Kaynak kalitesi: karışık (birincil: repo kodu + Anthropic/Google resmî dokümanları; ikincil: OpenRouter canlı gözlem)
Güven: yüksek
AgencyOS'a etki: Eksik yetenekleri (Gmail taslak, reply-zekâsı, follow-up, portföy eşleştirme) MEVCUT Brain v2 + skill catalog + agent registry içine SKILL olarak ekler; yeni bir paralel ajan sistemi kurmaz.
---

## Kısa özet

AgencyOS'un satış hattındaki gerçek boşluklar (Gmail taslak/yanıt, reply intelligence, yarım follow-up state machine, portföy eşleştirme, öğrenen Voice DNA) **yeni ajanlar değil, yeni SKILL'lerdir**. Mevcut mimari — Brain v2 (intake→plan→route→gate→execute→active), `skills/catalog.ts` manifest kataloğu + `registry.ts` compile-time handler allowlist, DB `agents` registry (6 ajan) + `agent_skill_grants` — bu boşlukları taşıyacak şekilde zaten tasarlanmış. Eksikler `handlerKey: null` olarak katalogda kayıtlı ama yürütülmez; iş, **sözleşme yazıp handler'ı allowlist'e bağlamak** ve **eval geçince `active=true` yapmaktır**.

Bu doküman: (1) brief'in ajan gruplarını mevcutla örtüştürür, (2) tek büyük ajan riskini Anthropic'in resmî rehberiyle çerçeveler, (3) 10 yeni skill için tam sözleşme (I/O şeması, izin, deterministik kontroller, model preset, hata davranışı, idempotency, eval slug, audit) tanımlar, (4) shadow→active aktivasyon yolunu (parity-guard + eval-gate + flag) verir. **Kural: yeni paralel sistem YOK; her şey mevcut dosyaların üstüne.**

---

## 1. Brief'in ajan grupları → mevcut mimariyle örtüşme

Brief altı ajan grubu öneriyor. Gerçekte bunların çoğu **zaten mevcut** — ya bir DB ajanı, ya deterministik bir modül, ya da konseyin (leadIntel) geçici (ephemeral) rolü olarak. Yeni **standing (kalıcı) ajan gerekmiyor**; gereken, mevcut ajanlara skill *grant* etmek.

| Brief grubu | Mevcut karşılık | Karar | Eksik olan |
|---|---|---|---|
| Lead Intelligence | `researcher` ajanı + `leadIntel/council.ts` C1∥C2→C3→C4 (ephemeral) + `lead.score_deterministic`, `lead.match_services` (wired) | **ÖRTÜŞÜYOR — koru** | `lead.audit_website` handler'ı (kayıtlı, null) |
| Qualification | `leads/pipelineGate.ts` (pain+decision_maker+budget) + `leads.status` FSM | **ÖRTÜŞÜYOR — koru** | reply→qualification sinyali (classify-reply çıktısı gate'e bağlanmalı) |
| Offer | Deterministik `leadIntel/offerMatcher.ts` (C2, uydurma imkânsız) + `services/catalog.ts` | **ÖRTÜŞÜYOR — koru** | angle seçimi (build-offer-angle), portföy kanıtı (match-portfolio) |
| Outreach | `sales_rep` ajanı + `coldEmail.ts` + `coldEmailTemplates.ts` (4 açı) + `outreach/*` (DRAFT-only) | **ÖRTÜŞÜYOR — genişlet** | create-gmail-draft (Gmail'e taslak yazma), draft-reply |
| Pipeline | `sales_rep`/`data_analyst` + `follow_up_sequences` + `sequences.ts` (yarım) | **GENİŞLET** | schedule-follow-up (tamamla), recommend-next-action |
| Quality | (yok — deliverability/compliance audit'i yalın) `buildComplianceFooter` (mig 018) | **YENİ SKILL, ajan değil** | audit-deliverability, audit-compliance → `data_analyst`'a grant |

**Çıkarım:** Altı grubun beşi mevcut yapıya haritalanıyor; sadece "Quality" yeni bir *yetenek* getiriyor ama o da **kalıcı ajan değil, iki deterministik audit skill'i**. Yeni `agents` satırı açmaya gerek yok — `agent_skill_grants` yeterli.

---

## 2. Tek büyük ajan riski (neden dağıtmalı — hem kalite hem güvenlik)

Anthropic'in resmî rehberi (`claude.com/blog`, `anthropic.com/engineering`, 2025) çok-ajanlı sisteme geçmeyi **yalnız üç koşulda** önerir: (a) *context pollution* performansı bozduğunda, (b) görev *paralelleşebildiğinde*, (c) *uzmanlaşma* araç seçimini iyileştirdiğinde. Aksi halde "iyi tasarlanmış tek bir ajan geliştiricilerin beklediğinden çok daha fazlasını yapar" ve çok-ajan "3-10× daha fazla token" harcar. [CERTAIN — birincil: Anthropic, 2025-06]

AgencyOS'a uygulaması: **JARVIS/tek mega-ajanın "yanıt oku → sınıflandır → taslakla → gönder" zincirini tek bağlamda yapması hem kaliteyi düşürür hem de GÜVENLİK ihlalidir.** Gelen e-posta = **güvenilmez dış içerik** (prompt-injection taşıyıcısı). Aynı bağlamda hem confidential lead verisi okunur hem dış-gönderim scope'u bulunursa **lethal trifecta** (`brain/permissions.ts:hasLethalTrifecta`) tetiklenir ve adım bloke olur. Yani ayrıştırma zaten mevcut guard tarafından **zorunlu kılınıyor**.

Doğru desen — Anthropic'in "bağlama göre böl, iş türüne göre değil" ilkesi + repo'nun mevcut plan→step DAG'ı:

| Yanlış (tek büyük ajan) | Doğru (mevcut Brain adımlarına böl) |
|---|---|
| Bir ajan inbound e-postayı okur, niyeti çıkarır, taslak yazar ve gönderir | `classify-reply` (izole, salt-okuma, injection-guard) → `recommend-next-action` (deterministik FSM) → `draft-reply` (LLM) → `create-gmail-draft` (external, HITL) |
| Tüm satış bağlamı tek pencerede birikir | Her adım `step.input` ile minimal bağlam alır (`brain/types.ts:PlanStep.input`) |
| Gönderim otomatik | Gönderim **imkânsız** — taslak inert; digest-locked approval (`approvals/integrity.ts`) olmadan yan etki yok |

**Karar [CERTAIN]:** Yeni yetenekler **skill** olarak eklenir, mevcut `sales_rep`/`data_analyst`/`researcher` ajanlarına grant edilir; council'in ephemeral-rol deseni (C1-C4) uzmanlaşma için zaten mevcut — yeni kalıcı ajan açılmaz.

---

## 3. Yeni skill sözleşmeleri (10 skill)

Hepsi `SKILL_CATALOG`'a (`src/lib/skills/catalog.ts`) `SkillManifest` olarak eklenir; deterministik/composite olanların handler'ı `SKILL_HANDLERS` allowlist'ine (`registry.ts`) girer; LLM olanlar `handlerKey: null` kalır ve `route.ts`/execute üzerinden LLM ile koşar. `validateRegistry()` benzersiz slug/summary + dolu I/O + eval_slug zorlar. Model preset **tier adıyla** (`getModel()` → light/medium/heavy) verilir; **model ID hardcode edilmez** (canlı OpenRouter doğrulaması şart — brief 2026-07-11). Her skill `run_spans`'e (`trace/spans.ts`, redacted) audit yazar.

### 3.1 Deterministik / composite skill'ler (LLM'siz veya LLM-son) — auto-run adayı

| slug | kind | scopes / class | I/O (özet) | deterministik kontrol | idempotency | eval slug | hata davranışı |
|---|---|---|---|---|---|---|---|
| `pipeline.schedule_follow_up` | deterministic | `leads:write` / write | in: `{leadId, step, channel, dueInDays}` → out: `{sequenceId, dueAt}` | tarih matematiği + aynı (lead,step) tekilliği; **LLM YOK** | `unique(lead_id, step)` insert-guard | `eval.pipeline.schedule_follow_up` | mevcut satır → no-op; DB hatası → throw, step 'error' |
| `pipeline.recommend_next_action` | composite | `leads:read` / read | in: `{leadStatus, lastReply?, daysSinceTouch, followUpState}` → out: `{action, reason, dueInDays?}` | FSM tablosu (status×replyLabel→action); LLM yalnız eşit skorlu dallarda gerekçe | saf fonksiyon (yan etki yok) | `eval.pipeline.recommend_next_action` | belirsiz girdi → `action='review'` (güvenli varsayılan) |
| `outreach.audit_deliverability` | deterministic | `system:read`, `research:read` / external(DNS) | in: `{sendingDomain}` → out: `{spf, dkim, dmarc, oneClickUnsub, issues[]}` | DNS TXT kaydı varlık kontrolü; **LLM YOK** | domain başına cache (TTL) | `eval.outreach.audit_deliverability` | DNS timeout → `unknown` + issue, throw yok |
| `compliance.audit_outreach` | deterministic | `outreach:read` / read | in: `{draftBody, recipientAddrType, suppressed}` → out: `{ok, footerPresent, optOut, addrClass, blockers[]}` | KVKK/İYS footer regex + iş-vs-kişisel adres heuristiği + suppression kontrolü; **LLM YOK** | saf | `eval.compliance.audit_outreach` | eksik footer → `ok:false` (gönderim bloke) |
| `sales.match_portfolio` | deterministic | `leads:read`, `portfolio:read` / read | in: `{leadEvidence[], sector}` → out: `{pieces: PortfolioRef[]}` | **offerMatcher deseni**: gerçek `portfolio` tablosu ∩ kanıt-türü; **uydurma yapısal imkânsız** | saf | `eval.sales.match_portfolio` | eşleşme yok → boş dizi (asla hayali örnek) |
| `sales.build_offer_angle` | composite | `leads:read`, `services:read` / read | in: `{serviceMatches[], evidence[]}` → out: `{angle, templateKey, rationale}` | kanıt-türü→açı eşlemesi (mini_audit/launch/hiring/before_after) deterministik; LLM yalnız framing | saf seçim | `eval.sales.build_offer_angle` | kanıt yok → `mini_audit` (en güvenli açı) |

**Not:** `pipeline.schedule_follow_up` yeni değil — `outreach/sequences.ts:scheduleFollowUp` **zaten var**; iş, onu bir *skill manifest'ine kaydetmek* ve dedup/eval eklemek. `sales.match_portfolio` de kayıtlı `career.portfolio_gap`'ten farklı bir amaç (lead için kanıt seçimi ≠ role için boşluk) — ayrı slug.

### 3.2 LLM skill'leri (handlerKey: null; her zaman gate → çoğu HITL)

| slug | kind | scopes / class | I/O (özet) | model preset | güvenlik/deterministik ön-filtre | eval slug | hata davranışı |
|---|---|---|---|---|---|---|---|
| `outreach.create_gmail_draft` | composite | `outreach:external` / **external** | in: `{leadId, subject, body, threadId?}` → out: `{gmailDraftId}` | — (araç çağrısı; LLM yok) | `threadId` + `In-Reply-To`/`References` başlıkları RFC 2822'ye uygun (yalın Re: konu **thread'e bağlamaz**) [CERTAIN — Google, 2025] | `eval.outreach.create_gmail_draft` | Gmail API hata → step 'error'; **taslak inert = teslimat yok** |
| `sales.classify_reply` | llm | `leads:read` / read | in: `{threadText}` → out: `{label, confidence, extracted}` | tier: light | **injection-guard**: gövde=VERİ; deterministik ön-filtre unsubscribe/bounce/auto-reply'ı LLM'siz yakalar; yapılandırılmış çıktı zorunlu | `eval.sales.classify_reply` | düşük confidence → `label='needs_human'` |
| `sales.draft_reply` | llm | `leads:read`, `outreach:write` / write | in: `{threadText, replyLabel, persona}` → out: `{subject, body}` | tier: medium | persona `personaContext.ts` + `PROMPT_STYLE_GUIDE.md`; asla otomatik göndermez → `create_gmail_draft`'a besler | `eval.sales.draft_reply` | üretim boş → step 'error', taslak oluşturulmaz |
| `memory.extract_sales_memory` | llm | `leads:read`, `assistant:write` / write | in: `{threadText, leadId}` → out: `{facts: MemoryCandidate[]}` | tier: light | çıktı **quarantine**'a yazılır (`memory/governance.ts`: occurrence≥3/onay→active); confidence + 90g retention | `eval.memory.extract_sales_memory` | çıkarım yok → boş; hatalı fact quarantine'da kalır |

**Kritik ayrım (deterministik işe LLM koyma):** tarih/dedup/state-transition/suppression/DNS = **deterministik** (`pipeline.*`, `*.audit_*`, `match_portfolio`). Metin üretimi/niyet çıkarımı/hafıza özütleme = **LLM**. `create_gmail_draft` bir **araç çağrısıdır** (LLM değil) — gövdeyi `draft_reply`/`coldEmail` üretir, bu skill yalnız Gmail API'ye yazar.

### 3.3 create-gmail-draft: neden "external ama güvenli" sınırı

Taslak oluşturma teslimat DEĞİLDİR — hiçbir alıcı görmez, taslak silinebilir. Yine de Gmail API'ye dış yan-etkidir → gate `external` → **approval gerekir** (`gate.ts:gateDecision` auto yalnız read+low+internal). İki katmanlı güvenlik:
1. **Draft ≠ send:** Sistemde **gerçek gönderim skill'i yok** (mevcut `email.ts:markMessageSent` yalnız kayıt tutar). Operatör Gmail'de taslağı görür, elle gönderir. HITL bu noktada *yapısal*.
2. **Approval digest-lock:** `create_gmail_draft` yine de `approval_requests`'e (mig 043) girer; onaylanan `action_digest` yürütülende yeniden hesaplanır (`integrity.ts:verifyExecutionDigest`) — "X onayla, Y taslakla" imkânsız. Günlük taslak sayısı için cap (spam-drafts önleme) `ai/caps.ts` desenine paralel eklenmeli.

---

## 4. Ajan sözleşmeleri (mevcut ajanları genişlet, yeni açma)

Yeni skill'ler mevcut `agents` (mig 009/041) satırlarına `agent_skill_grants` ile bağlanır. Aşağıda her **etkilenen** ajan için tam profil; yeni ajan **eklenmiyor**.

| Ajan (mevcut) | Amaç | Yeni grant'lar | Model tier | Memory erişimi | Write izni | Tetikleyici | İnsan onayı | Timeout | Retry | Maliyet sınıfı | Failure-mode |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `researcher` | Kanıt topla, siteyi denetle | `lead.audit_website` | light | governed read | none | cron/manuel scan | hayır (read) | 30s | 1 | ~$0.10/lead | kanıt eksik → düşük skor, throw yok |
| `sales_rep` | Outreach + reply + follow-up | `sales.classify_reply`, `sales.draft_reply`, `sales.build_offer_angle`, `sales.match_portfolio`, `outreach.create_gmail_draft`, `pipeline.schedule_follow_up`, `pipeline.recommend_next_action` | light→medium | governed read + quarantine write (memory extract) | `leads:write`, `outreach:write/external` | inbound reply webhook / due-sequence cron / manuel | **evet** (draft/external adımları) | 15-25s | draft 1, LLM 1 | ~$0.05-0.20/aksiyon | üretim boş→'error'; digest uyuşmazsa yürütmez |
| `data_analyst` | Sinyal + kalite denetimi | `outreach.audit_deliverability`, `compliance.audit_outreach`, `sysops.cost_anomaly_detect` (kayıtlı) | light | read | none | pre-send gate / haftalık cron | hayır (read) | 3-10s | 0 | ~$0 (deterministik) | DNS timeout→`unknown`+issue |
| `ceo` (orchestrator) | Hedef ayrıştır, öncelik | (mevcut `orchestration.plan_decompose` wired) | medium | read | none | operatör hedefi | plan onayı | 8s | 0 | ~$0.02 | — |

**Memory erişim ilkesi:** Yalnız `sales_rep` **yazabilir** ve o da **quarantine**'a (`memory/governance.ts` — occurrence≥3 veya onay ile active'e geçer). Hiçbir ajan `agent_memory`'ye doğrudan active-write yapmaz. İlişki hafızası jenerikliği bu governed katman + `extract_sales_memory`'nin lead-bağlı fact'leriyle çözülür (kaynak: memory roadmap, MEMORY.md).

---

## 5. shadow → active aktivasyon yolu

Her yeni skill üç kapıdan geçmeden `active=true` olmaz (mig 041 `skills.active` default `false`; brief §10.1 "registered ≠ active"):

| Kapı | Mekanizma (dosya) | Geçme kriteri |
|---|---|---|
| **1. Flag** | `BRAIN_V2_ENABLED` + `BRAIN_ACTIVE_ENABLED` (`brain/index.ts`) default OFF; leadIntel `flag.ts` off/shadow/active | Operatör açıkça açar; kapalıysa active istense bile shadow'a düşer |
| **2. Eval-gate** | `eval/harness.ts` golden set + `judge.ts` trajectory/rubric; skill'in `evalSlug`'ı gerçek eval_case'e bağlı | Golden %100 pass; LLM skill'lerde judge rubrik eşiği; deterministik'te birebir parity |
| **3. Parity-guard** | `eval/cases/councilParity.ts` deseni — deterministik skorlar refactor sonrası BİREBİR korunmalı | shadow çıktısı mevcut yolun kararıyla eşleşir (regresyon yok) |

Akış: skill'i katalog + handler (allowlist) olarak ekle → `handlerKey` set (deterministik) veya `null` (LLM) → eval_case yaz → **shadow modda** koştur (`runBrainShadow` — hiçbir write/dış-çağrı yok, yalnız "would-do") → parity + eval yeşilse `skills.active=true` + `agent_skill_grants` ekle → `BRAIN_ACTIVE_ENABLED` ile active. Bu yol **mevcut** — yeni altyapı gerekmiyor.

---

## 6. AgencyOS'a entegrasyon (dosya yollarıyla)

- **Katalog + allowlist:** `src/lib/skills/catalog.ts`'e 10 `SkillManifest` ekle; `src/lib/skills/registry.ts:SKILL_HANDLERS`'a deterministik/composite handler'ları (`pipeline.schedule_follow_up`, `pipeline.recommend_next_action`, `outreach.audit_deliverability`, `compliance.audit_outreach`, `sales.match_portfolio`, `sales.build_offer_angle`) bağla. LLM skill'leri `handlerKey: null`.
- **Handler kaynakları (mevcut modülleri sar, yeniden yazma):** `schedule_follow_up`→`outreach/sequences.ts` (zaten var); `match_portfolio`→`leadIntel/offerMatcher.ts` desenini kopyala; `build_offer_angle`→`coldEmailTemplates.ts` 4 açısını seç; `compliance.audit_outreach`→`buildComplianceFooter` (mig 018); `recommend_next_action`→`leads/pipelineGate.ts` + `leads/staleDeals.ts`.
- **Gmail (yeni tool):** `outreach.create_gmail_draft` yeni bir `tool_registry` (mig 041) girdisi + Gmail API wrapper (`src/lib/outreach/gmail.ts` — henüz yok). **Bu tek gerçek yeni dış-entegrasyon.** Least-privilege scope (`gmail.compose`/`gmail.modify`), OAuth. Reply okuma için `gmail.readonly` + History API artımlı sync.
- **Ajan bağlama:** `agent_skill_grants` satırları (mig 041) — yeni migration DEĞİL, veri INSERT (skills tablosu doldurulunca).
- **Gate/approval:** Değişiklik yok — `brain/gate.ts` + `approvals/*` external/write adımları zaten yakalar.
- **Audit:** Her skill `trace/spans.ts:recordSpan` (redacted) yazar; maliyet `ai_cost_logs`.
- **DOKUNULMAZ:** Görev/Alışkanlık/Rutin (`/gorevler`, `/aliskanliklar`, LIFE DB `active_tasks`/`habits`) bu mimarinin dışında — hiçbir skill oraya scope talep etmez.

---

## 7. MVP / V1 / V2 ayrımı

| Aşama | Kapsam | Skill'ler | Gerekçe |
|---|---|---|---|
| **MVP** | Follow-up + karar + kalite kapıları (hepsi deterministik, LLM'siz, düşük risk, auto-run adayı) | `pipeline.schedule_follow_up` (tamamla), `pipeline.recommend_next_action`, `compliance.audit_outreach`, `outreach.audit_deliverability`, `sales.match_portfolio`, `sales.build_offer_angle` | Sıfır/düşük maliyet, dış-entegrasyon yok, mevcut modülleri sarar; en hızlı değer + en düşük risk |
| **V1** | Gmail taslak + reply intelligence (external + LLM, HITL) | `outreach.create_gmail_draft`, `sales.classify_reply`, `sales.draft_reply` | Gmail OAuth + tool_registry gerektirir; inbound = untrusted → injection-guard + trifecta izolasyonu; hepsi draft/HITL |
| **V2** | Öğrenen hafıza + Voice DNA | `memory.extract_sales_memory` + persona geri-besleme döngüsü | Governed memory olgunlaşınca (occurrence≥3 birikimi); Voice DNA = `personaContext.ts` + toplanan onaylı fact'lerden öğrenme |

MVP tümüyle **deterministik ve dış-entegrasyonsuz** olduğu için `BRAIN_ACTIVE_ENABLED` ile güvenle açılabilir; V1 gerçek Gmail izni ve deliverability altyapısı (SPF/DKIM/DMARC) tamamlanmadan **shadow'da** kalmalı.

---

## 8. Açık sorular / doğrulanamayanlar

1. **[UNKNOWN] Gmail OAuth durumu:** Ortamda "claude.ai Gmail" connector'ı **yetkilendirilmemiş** (oturum non-interactive). Gerçek `create_gmail_draft`/reply-okuma, operatörün claude.ai connector ayarlarından veya kendi Google Cloud OAuth istemcisinden yetki vermesini gerektirir — fabrike edilemez. Takvim entegrasyonundaki OAuth blokajıyla aynı sınıf (kaynak: assistant roadmap, MEMORY.md).
2. **[UNKNOWN] `portfolio` tablosu yok:** `sales.match_portfolio` gerçek bir portföy kaynağı ister; repo'da böyle bir tablo doğrulanmadı. Uydurma yasak olduğundan, önce **operatörün gerçek işlerinden** bir `portfolio` tablosu/seed gerekir (bu doküman kapsamı dışı — kod/migration YOK kuralı).
3. **[ASSUMPTION] Model preset tier→ID:** light=flash-lite, medium=haiku, heavy=deepseek-v4-pro *repo'da yazılı* ama brief flash-lite'ın superseded, deepseek'in katalogda görünmediğini not düşüyor. **Aktivasyon öncesi `GET /api/v1/models` ile canlı doğrulama şart** — ID'ler bu dokümanda kasıtlı hardcode edilmedi.
4. **[LIKELY] TR mevzuat kesinliği:** İş adreslerine ön-onaysız B2B ticari e-posta + ilk itirazda dur + İYS (KVKK 2025/1072) brief'te doğrulanmış; ama hukuki kesinlik iddia edilemez → `compliance.audit_outreach` bir **teknik kapı**dır, hukuki görüş değil. Ölçek büyürse profesyonel hukuk incelemesi flag'lenmeli.
5. **[UNKNOWN] Reply webhook tetikleyicisi:** Gmail `watch` (Pub/Sub push) veya History API polling seçimi — Vercel cron ile polling en düşük-bağımlılık yol gibi görünüyor ama gerçek hacim/gecikme gereksinimi doğrulanmadı.

**Sources:**
- [When to use multi-agent systems — Claude by Anthropic](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them)
- [How we built our multi-agent research system — Anthropic Engineering](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Manage threads — Gmail API, Google for Developers](https://developers.google.com/workspace/gmail/api/guides/threads)
- Repo (birincil, 2026-07-11): `src/lib/brain/*`, `src/lib/skills/{catalog,registry,types}.ts`, `src/lib/leadIntel/offerMatcher.ts`, `src/lib/approvals/*`, `src/lib/outreach/sequences.ts`, `supabase/migrations/{009,041,043,044}.sql`
