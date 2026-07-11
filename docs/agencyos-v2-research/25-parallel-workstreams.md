---
Doküman: 25-parallel-workstreams
Tarih: 2026-07-11
Kaynak kalitesi: karışık (birincil: repo denetimi + resmî yazılım-mühendisliği pratikleri; ikincil: web)
Güven: yüksek
AgencyOS'a etki: 8 motorun eş zamanlı gelişebilmesi için ÖNCE bitmesi gereken ortak sözleşmeleri (entity/event/agent I-O/model preset/audit/HITL/state-machine) ve bağımlılık-sıralı MVP kritik yolunu tanımlar.
---

## Kısa özet

AgencyOS'un gerçek eksikleri (Gmail gönderme+okuma, reply intelligence, follow-up state machine, tek satış merkezi, portfolyo eşleştirme, öğrenen Voice DNA, ilişki hafızası) 8 ayrı "motora" düşüyor. Bu motorlar eş zamanlı geliştirilebilir — **ama yalnızca ortak sözleşmeler (contracts) donduktan sonra.** Yazılım mühendisliğinde bu, "contract-first / API-first" olarak bilinir: bağımsız ekiplerin paralel çalışabilmesinin tek pratik yolu, önce sıkı değişim-kontrollü bir arayüz sözleşmesi tanımlamaktır ([Traffic Parrot, 2022](https://blog.trafficparrot.com/2022/01/three-case-studies-on-api-first.html); [Canada.ca API Guidance](https://www.canada.ca/en/government/system/digital-government/digital-government-innovations/enabling-interoperability/api-guidance/contract.html)). AgencyOS için iyi haber: Brain v2 + skills registry + kanonik run/step modeli bu sözleşmelerin **büyük kısmını zaten kodda, tipli ve testli** olarak barındırıyor. Eksik olan 4 sözleşme (kanonik ilişki entity'si, mesaj/thread modeli, domain event akışı, doğrulanmış model preset kaydı) bu dokümanın "kritik yol"unu oluşturuyor.

Tez: **Sözleşme katmanı bir workstream değil, bir kapıdır (gate).** O bitmeden paralel kodlama başlatılırsa, her motor kendi "lead" ve "mesaj" şeklini uydurur; sonra entegrasyon aşamasında hepsi çakışır. [CERTAIN]

## 1) Neden önce ortak sözleşme (contract-first)

| İlke | Kaynak | AgencyOS karşılığı |
|---|---|---|
| Arayüz sözleşmesi paralel geliştirmenin ön koşuludur | [Traffic Parrot 2022](https://blog.trafficparrot.com/2022/01/three-case-studies-on-api-first.html) | Lead/Message/Event şeması dondurulmadan E ve D paralel yazılamaz |
| Sözleşme mock/shadow ile üretimden önce test edilir | [OneUptime schema-registry 2026](https://oneuptime.com/blog/post/2026-01-30-schema-registry-contract-testing/view) | Brain v2 `shadow` modu (write yok, "would-do" kaydı) tam bu shadow-mock rolünde |
| Shared library değil, şema kaydı bağlar (coupling'i azaltır) | [LinkedIn — Microservices Contracts](https://www.linkedin.com/pulse/microservices-contracts-stefano-rocco) | Kod = kaynak-of-truth, DB = override deseni (`skills/types.ts`, `service_catalog`) |
| Additive/geriye-uyumlu değişim + CI'da şema-diff kapısı | [Codelit — Event Schema Registry](https://codelit.io/blog/event-schema-registry) | `SkillManifest.version`, eval parity-lock (`src/lib/eval/*`) |

Çıkarım: AgencyOS zaten "contract-first" bir iskelet kurmuş; bu doküman o iskeleti tamamlanmamış 4 sözleşmeyle kapatıp motorları ona bağlamayı öneriyor — sıfırdan mimari değil. [CERTAIN]

## 2) 8 workstream ve olgunluk durumu

| WS | Motor | Bugünkü durum | Ana bağımlılık |
|---|---|---|---|
| **A** | Product / Daily UX (tek satış merkezi) | 4 ekrana dağılmış (`/harita`,`/firsatlar`,`/pipeline`,`/command-center`) — bkz. 02 | Entity + event **okuma** sözleşmesi (tüketici) |
| **B** | Lead Intelligence / Qualification | Büyük ölçüde VAR (`src/lib/leadIntel/*` v2) | Evidence sözleşmesi (VAR) + servis kataloğu (C) |
| **C** | Service / Offer / Portfolio | Katalog VAR; portfolyo/proof eşleştirme YOK (`career.portfolio_gap` handler'sız) — bkz. 07 | Yeni portfolyo/proof entity sözleşmesi + evidence |
| **D** | Outreach / Voice | Draft-only VAR (`src/lib/coldEmail.ts`); öğrenen Voice DNA YOK — bkz. 09 | Persona sözleşmesi + E'den yanıt/sonuç sinyali |
| **E** | Gmail / Follow-up / Reply | En büyük boşluk: gönderim YOK, reply YOK, state-machine yarım — bkz. 12/13/14 | **Message/Thread + Event sözleşmesi** + HITL (VAR) |
| **F** | Memory / Personalization | Governance VAR (`memory/governance.ts`); ilişki hafızası jenerik — bkz. 16 | Entity sözleşmesi + E'den event akışı |
| **G** | Model Router / Eval / Cost | VAR ama model adları kayıyor (brief: bazıları NOT FOUND) — bkz. 18/20 | Doğrulanmış model preset sözleşmesi |
| **H** | Data / Workers / Observability / Security | Temel VAR (`run_spans`, cron, RLS, mig 001-044) — bkz. 21/23 | Kesişen (cross-cutting) temel; kendi başına sürer |

## 3) ÖNCE bitmesi gereken ortak sözleşmeler (kapı)

Bunlar paralel kodlamadan ÖNCE dondurulmalı. Çoğu kısmen var; eksikler kritik yolu belirliyor.

| Sözleşme | Kanonik konum | Durum | Eksik/aksiyon |
|---|---|---|---|
| **Agent/step I-O şeması** | `src/lib/brain/types.ts` (`PlanStep`, `Goal`, `GateDecision`), `src/lib/skills/types.ts` (`SkillManifest.inputSchema/outputSchema`) | **VAR** (tipli, testli) | Skill başına gerçek zod I-O'yu handler'a bağla (bugün `FieldSpec` yapısal) |
| **Kanonik run/step + DAG** | `src/lib/runs/{repo,steps,deps,lease}.ts` (mig 038) | **VAR** | Ek yok; tüm motorlar bunu kullanmalı, kendi kuyruğunu kurmamalı |
| **Human-approval (HITL) modeli** | `src/lib/approvals/{integrity,repo}.ts` (digest-lock/idempotency/TTL), `brain/active.ts` | **VAR** | E'nin "gönder" eylemini bu action'a bağla — yeni onay yolu ACMA |
| **İzin/scope + risk sınıflama** | `brain/gate.ts` (`classifyScopes`: read>write>external>spend), `brain/permissions.ts` (lethal-trifecta) | **VAR** | Gmail send = `external`+`spend?`; scope'u burada tanımla |
| **Audit/trace log** | `src/lib/trace/spans.ts` (`run_spans`, OTel GenAI, redacted) | **VAR** | Domain-event akışı EKSİK (aşağıda) |
| **Cost sözleşmesi** | `src/lib/ai/{caps,costLog}.ts` (`ai_cost_logs`, TOKEN_RATES) | **VAR** | G ile senkron; yeni skill'ler cost_usd yazmalı |
| **Eval sözleşmesi** | `src/lib/eval/*` (harness/judge, `eval_cases/runs/results`), `SkillManifest.evalSlug` | **VAR** | Her yeni skill için evalSlug ZORUNLU (§10.1) |
| **Kanonik İlişki (Lead/Contact) entity'si** | `leads` tablosu + `src/lib/leads/*` | **KISMİ** | Tek "Relationship" görünümü YOK — E/D/F ortak okuyacak view gerek |
| **Mesaj/Thread sözleşmesi** | `outreach_messages` (+ `src/lib/outreach/email.ts`) | **EKSİK** | threadId + In-Reply-To/References + direction(in/out) alanları YOK — Gmail için şart (bkz. 12) |
| **Domain event akışı** | (yok) — bugün cron `follow_up_sequences` polling'i | **EKSİK** | Append-only "ne oldu" olay akışı YOK; reply→state geçişi için gerekli |
| **Model preset kaydı** | `src/lib/openrouter.ts` (`OPERATION_MODEL_MAP`, `getModel`) | **KISMİ** | Adlar kayıyor; canlı `/api/v1/models` ile doğrulanmış pin gerek (bkz. 18) |

**Kritik: 3 EKSİK + 2 KISMİ sözleşme, paralel işin kapısıdır.** Bunlar ~1 sözleşme-fazında (kod az, tasarım çok) bitirilmeli. [CERTAIN]

### Önerilen sözleşme-faz içeriği (kod değil, tasarım kararı)
1. **Message/Thread**: `outreach_messages`'a additive alanlar (`thread_id`, `provider_msg_id`, `in_reply_to`, `references`, `direction`). Geriye-uyumlu = mevcut draft akışı bozulmaz. [LIKELY]
2. **Relationship view**: `leads` üstünde read-only bir birleşik görünüm (lead + son mesaj + follow-up durumu + reply intent). Yeni tablo değil, mevcutların üzerine view. [LIKELY]
3. **Domain event**: minimal append-only tablo (`lead_events`: type, lead_id, payload, occurred_at) — `run_spans` (teknik trace) ile KARIŞTIRMA; bu iş-olayı. Reply/follow-up/sent bu akışa yazar, F ve A okur. [ASSUMPTION — en hafif alternatif; event-bus altyapısı ŞART DEĞİL]
4. **Model preset**: `OPERATION_MODEL_MAP`'i doğrulanmış preset listesine sabitle; ad kesinleşmeden merge yok (brief KURAL). [CERTAIN]

## 4) Bağımlılık grafiği ve kritik yol

```
           ┌─────────────────────── SÖZLEŞME KAPISI ───────────────────────┐
           │ entity view · message/thread · domain event · model preset     │
           │ (agent I-O, run/step DAG, HITL, scope, trace, cost, eval = VAR) │
           └────────────────────────────────┬───────────────────────────────┘
                                             │
     ┌───────────────┬─────────────┬─────────┼───────────┬──────────────┐
     ▼               ▼             ▼         ▼           ▼              ▼
   B (var)        C portfolio    E Gmail/   G model    H data/       A cockpit
 leadIntel        + proof        reply/     preset+    workers/      (tüketici)
 (bağımsız)       (evidence'a    follow-up  eval       obs/sec       B·C·D·E·F
                   bağlı)        [KRİTİK]   (kesişen)  (kesişen)     çıktısını
                                    │                                 gösterir
                          ┌─────────┴─────────┐
                          ▼                   ▼
                    D Voice DNA          F ilişki hafızası
                  (E'nin yanıt/          (E'nin event
                   sonuç sinyaline        akışına bağlı)
                   bağlı — öğrenme)
```

**Kritik yol:** Sözleşme kapısı → **E (Gmail send + reply read + follow-up tamamlama)** → D-öğrenme (Voice DNA) ve F (ilişki hafızası) → A (hepsini yüzeye çıkaran tek merkez). [CERTAIN]

**Neden E kritik:** D'nin "öğrenen Voice DNA"sı ve F'nin "ilişki hafızası" ancak GERÇEK yanıt/sonuç verisi varsa öğrenebilir. O veri E'den (gönderilen + gelen thread) gelir. E olmadan D ve F yalnızca statik/jenerik kalır (bugünkü durum). [CERTAIN]

**Bağımsız paralel başlayabilenler (kapıdan hemen sonra):**
- **B** (leadIntel v2) — sözleşmeleri zaten var; kanonik entity view'a bağlanır, iç motoru olgun. [CERTAIN]
- **G** (model preset + eval) — kesişen; her LLM işini besler, kimseyi beklemez. Sözleşme fazında preset'i pinleyip devam eder. [CERTAIN]
- **H** (workers/observability/security) — kesişen temel; E'nin cron/webhook ihtiyacını ve event akışını mümkün kılar. [CERTAIN]
- **C-portfolio** — evidence sözleşmesine (VAR) bağlı; E'yi beklemez, D/proposal'ı zenginleştirir. [LIKELY]

**E'yi bekleyenler:** D-öğrenme, F, ve A'nın "gelen kutusu/thread" yüzeyi. [CERTAIN]

## 5) MVP / V1 / V2 ayrımı

| Aşama | Kapsam | Workstream |
|---|---|---|
| **Sözleşme kapısı (MVP-0)** | Message/thread + relationship view + domain event + model preset pin. Kod az, karar çok. Shadow modda parity ile doğrula. | (kapı, WS değil) |
| **MVP** | Döngüyü kapatan minimum: **E** (Gmail HITL-onaylı gönder + thread reply oku + follow-up state-machine tamamla) **+ A** (4 ekranı tek günlük satış merkezinde birleştir). G'den ince dilim (preset pin) + B (mevcut) besler. | **E + A** (+ G-ince, B-mevcut) |
| **V1** | **D** öğrenen Voice DNA (E'nin yanıt sinyaliyle) + **F** ilişki hafızası (event akışıyla) + **C** portfolyo/proof eşleştirme (`career.portfolio_gap` handler'ı yaz) + reply-intent sınıflama. | D + F + C |
| **V2** | Brain `active` modu iş-rotasında (çok-adımlı otonom, hâlâ HITL kapılı) + tam domain event-bus + gelişmiş eval/cost dashboard + reply-driven otomatik state geçişleri. | Brain-active + event-bus + G-derin |

**MVP tezi:** En yüksek kullanıcı değeri = "gönder → yanıtı gör → sonraki adımı bir ekrandan yönet" döngüsünü kapatmak. Bu E + A demektir; ikisi de sözleşme kapısına bağlı, birbirine değil — yani **E ve A paralel gidebilir** (A, E'nin çıktısını tüketen UI; sözleşme dondurulduğu an A mock/shadow veriyle başlayabilir). [LIKELY]

**Kapsam disiplini:** MVP'de otomatik gönderim YOK (HITL zorunlu), yüksek hacim YOK, opt-out varsayılan (bkz. 10/11). Deterministik iş (tarih/dedup/state-transition/suppression) LLM'e verilmez. [CERTAIN]

## 6) Mevcut Brain v2 / registry / run-step temeli bunu nasıl mümkün kılıyor

Bu doküman "sıfırdan orkestrasyon" önermiyor; mevcut temel paralelliği hâlihazırda taşıyor:

| Foundation parçası | Sağladığı paralellik yeteneği | Konum |
|---|---|---|
| **Brain shadow modu** | Write/dış-çağrı olmadan "would-do" üretir → her motor canlıya dokunmadan sözleşmeye karşı doğrulanır (contract mock rolü) | `brain/index.ts:runBrainShadow` |
| **Kanonik run/step + DAG** | Her motorun işi aynı run/step tablosuna, bağımlılık kenarlarıyla yazılır → ortak iş modeli, motor-başına kuyruk yok | `runs/{repo,steps,deps}.ts`, `brain/active.ts` |
| **Bağımlılık kapısı** | Yalnız TÜM ancestor'ı `done` olan adım yürür → motorlar arası sıralama motor kodunda değil, DAG'da | `brain/active.ts` (donePlanIds) |
| **HITL approval + digest/idempotency** | E'nin "gönder" eylemi yeni onay yolu açmadan bu action'a takılır → kritik e-posta onaysız İMKÂNSIZ | `approvals/integrity.ts`, `active.ts:needs_approval` |
| **Scope/risk sınıflama + lethal-trifecta** | Her yeni skill read/write/external/spend olarak sınıflanır; Gmail external+veri → guard otomatik | `brain/gate.ts`, `brain/permissions.ts` |
| **Skill registry (kod=truth, DB=override)** | Yeni motor = yeni `SkillManifest` (I-O şema + evalSlug + budget + handlerKey allowlist) → ekleme additive, mevcut bozulmaz | `skills/{types,registry,catalog}.ts` |
| **Feature-flag izolasyon** | `BRAIN_V2_ENABLED`/`BRAIN_ACTIVE_ENABLED`/`*_MODE=off\|shadow\|active` → yarım motor canlıyı etkilemez | `brain/index.ts`, leadIntel mode |
| **Eval parity-lock** | Her motorun regresyonu golden harness'ta yakalanır → paralel merge güvenli | `eval/*`, `SkillManifest.evalSlug` |

Sonuç: 8 sözleşmenin 8'i zaten var/kısmi; 3 eksik + 2 kısmı tamamlamak, motorları bu temele "takmak" demektir. [CERTAIN]

## AgencyOS'a entegrasyon (mevcut dosya yollarıyla)

- **Sözleşme kapısı** → yeni skill'ler `src/lib/skills/catalog.ts`'e manifest olarak; I-O `skills/types.ts`; handler allowlist `skills/registry.ts` (`handlerKey`). Yeni tablo yerine ÖNCE mevcutların üstüne view/additive kolon.
- **E (Gmail)** → gönderim eylemi `brain/active.ts`'in `needs_approval` yoluna; `outreach/email.ts:markMessageSent` yalnız kayıt tutmaya devam eder, gerçek gönderim onaylı action'da. Thread alanları `outreach_messages`'a additive (bkz. 12). Follow-up state-machine `outreach/sequences.ts:processDueSequences` üstüne tamamlanır (reply gelince `done`/dallanma).
- **A (cockpit)** → `/harita`,`/firsatlar`,`/pipeline`,`/command-center`'ı tek route'ta birleştir (bkz. 02); relationship view'ı tüketir; ≤3 adım kuralı (rules/os/70).
- **B** → `leadIntel/*` mevcut; entity view'a bağla.
- **C** → `career.portfolio_gap` için handler yaz; `services/catalog.ts` + evidence (`leadIntel/schemas.ts`) sözleşmesine bağla (bkz. 07).
- **D** → `coldEmail.ts` + `personaContext.ts`/`prompts.ts` üstüne öğrenen katman; sinyal E'den (bkz. 09).
- **F** → `memory/governance.ts` (App DB) governance modelini ilişki-özel yap; event akışını oku (bkz. 16).
- **G** → `openrouter.ts` preset pin + `ai/caps.ts` cap; her skill eval'i `eval/*` (bkz. 18/20).
- **H** → `trace/spans.ts` + cron + RLS; Gmail için pull(polling) mü push(Pub/Sub) mu kararı (bkz. 12/21).
- **DOKUNULMAZ:** Görev/Alışkanlık/Rutin (`/gorevler`,`/aliskanliklar`, LIFE DB `active_tasks/habits/*`). Bu doküman bu modüle hiçbir bağımlılık ÖNERMEZ; ayrık tutulur.

## Açık sorular / doğrulanamayanlar

1. **Gmail sync modeli (pull vs push)** — Brief "watch (Pub/Sub push) + History API" mümkün diyor, ama Vercel cron + tek operatör için polling daha basit olabilir. Karar 12/21'de netleşmeli. [UNKNOWN]
2. **Domain event akışı gerçekten gerekli mi?** — Reply→state için minimal `lead_events` tablosu öneriyorum; ama bugünkü cron-polling deseni (`follow_up_sequences`) V1'e kadar yetebilir. Event-bus altyapısı V2'ye ait. [ASSUMPTION]
3. **A ve E gerçekten tam-paralel mi?** — A, E'nin çıktı şeklini tükettiği için sözleşme dondurulmadan A'nın "inbox/thread" paneli mock kalır. Sözleşme kapısı iyi tanımlanırsa paralel; tanımlanmazsa A kısmen E'yi bekler. [LIKELY]
4. **Model preset kesinliği** — Adlar canlı `/api/v1/models` ile doğrulanmadan pin YAPILMAMALI (brief KURAL); bu doküman ad kesinleştirmez. [CERTAIN — kural]
5. **TR ticari e-posta hukuki kesinliği** — B2B iş adreslerine ön-onaysız izin brief'te var ama "hukuki kesinlik iddia etme"; profesyonel hukuk incelemesi flag'lenmeli (bkz. 11). [UNKNOWN — hukuki]
6. **Voice DNA öğrenme sinyali eşiği** — Kaç yanıt/örnekten sonra "öğrenilmiş" sayılır? `memory/governance.ts`'teki occurrence≥3 deseni başlangıç olabilir ama doğrulanmadı. [ASSUMPTION]

---

*Kaynaklar (web):* [Traffic Parrot — API-first & CDC](https://blog.trafficparrot.com/2022/01/three-case-studies-on-api-first.html) · [Canada.ca — Contract-First Primer](https://www.canada.ca/en/government/system/digital-government/digital-government-innovations/enabling-interoperability/api-guidance/contract.html) · [OneUptime — Schema Registry Contract Testing](https://oneuptime.com/blog/post/2026-01-30-schema-registry-contract-testing/view) · [Codelit — Event Schema Registry](https://codelit.io/blog/event-schema-registry) · [LinkedIn — Microservices Contracts](https://www.linkedin.com/pulse/microservices-contracts-stefano-rocco). *Repo denetimi (birincil):* `src/lib/{brain,skills,runs,approvals,leadIntel,outreach,eval,trace,ai,memory,leads}/*` (2026-07-11).
