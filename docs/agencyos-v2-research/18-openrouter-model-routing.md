---
Doküman: 18-openrouter-model-routing
Tarih: 2026-07-11
Kaynak kalitesi: karışık (OpenRouter canlı API + resmî dokümanlar birincil; repo denetimi birincil; tier tasarımı çıkarım)
Güven: yüksek (canlı model ID + fiyatları doğrulandı; mimari öneriler orta-yüksek)
AgencyOS'a etki: Mevcut `openrouter.ts` router'ını, ölü model ID'lerini kendiliğinden onaran preset+fallback+policy+timeout+retry registry'sine yükseltir ve görevleri doğrulanmış Tier 0–5 modellerine eşler.
---

## Özet

Mevcut `src/lib/openrouter.ts` çalışan ama **kırılgan** bir router içeriyor: `OPERATION_MODEL_MAP` model ID'lerini string olarak sabit-gömüyor, fallback yok, timeout yok, retry yok, provider politikası yok. Kritik bulgu: 2026-07-11 canlı `GET /api/v1/models` sorgusuna göre repoda referanslanan **üç model artık katalogda yok** — `deepseek/deepseek-v4-pro` (draft_proposal + callHeavy), `google/gemini-2.5-flash-lite` (7+ operasyon), ve büyük olasılıkla `anthropic/claude-haiku-4-5` (draft_email + chair). Bu modeller 404 dönerse teklif taslağı üretimi **sessizce patlar**. Bu doküman, mevcut mimariyi (settings-override deseni, cost logging, HITL gate, eval harness) KORUYARAK bunun üstüne bir **Preset → Primary → Fallback → Provider-Policy → Timeout → Retry → Human-Approval** registry'si ve doğrulanmış 6 preset öneriyor. Model adları statik kabul edilmedi; canlı sorguyla doğrulandı ve "model expiration" için `models[]` fallback dizisi bir dayanıklılık mekanizması olarak öneriliyor.

## Canlı doğrulanmış modeller (OpenRouter /api/v1/models, 2026-07-11)

Aşağıdaki fiyatlar canlı API'den milyon-token başına USD'ye çevrildi (birincil kaynak, `WebFetch openrouter.ai/api/v1/models`, 2026-07-11). [CERTAIN]

| Model ID | Girdi $/M | Çıktı $/M | Bağlam | Tool | Vision | Rol |
|---|---|---|---|---|---|---|
| `qwen/qwen3.6-flash` | 0.19 | 1.13 | 1.0M | ✓ | ✓ | Ultra-ekonomik + vision |
| `google/gemini-3.1-flash-lite` | 0.25 | 1.50 | 1.05M | ✓ | ✓ | Ultra-ekonomik (2.5-lite halefi) |
| `qwen/qwen3.7-plus` | 0.32 | 1.28 | 1.0M | ✓ | ✓ | Ekonomik araştırma |
| `x-ai/grok-4.3` | 1.25 | 2.50 | 1.0M | ✓ | ✓ | Ekonomik alternatif |
| `google/gemini-3.5-flash` | 1.50 | 9.00 | 1.05M | ✓ | ✓ | Orta araştırma/judge |
| `openai/gpt-5.6-luna` | 1.00 | 6.00 | 1.05M | ✓ | ✓ | Ana profesyonel (ucuz) |
| `anthropic/claude-sonnet-5` | 2.00 | 10.00 | 1.0M | ✓ | ✓ | Ana profesyonel (yazım) |
| `x-ai/grok-4.5` | 2.00 | 6.00 | 500K | ✓ | ✓ | Alternatif ana |
| `openai/gpt-5.6-terra` | 2.50 | 15.00 | 1.05M | ✓ | ✓ | Yüksek-değer / judge |
| `anthropic/claude-opus-4.8` | 5.00 | 25.00 | 1.0M | ✓ | ✓ | Yüksek-değerli lead |
| `openai/gpt-5.6-sol` | 5.00 | 30.00 | 1.05M | ✓ | ✓ | Yüksek-değer alternatif |
| `openai/gpt-5.5-pro` | 30.00 | 180.00 | 1.05M | ✓ | ✓ | Premium (nadir, gated) |

**Katalogda BULUNAMAYAN, repoda kullanılan modeller (kırık):** `deepseek/deepseek-v4-pro`, `deepseek/deepseek-v4-flash`, `google/gemini-2.5-flash-lite`, `anthropic/claude-haiku-4-5` (claude filtresinde görünmedi). deepseek ailesi filtre sonuçlarında hiç yok. [LIKELY kırık] — kesin 404 doğrulaması bir sonraki adımda tekil-ID sorgusuyla yapılmalı.

## Tier modeli → AgencyOS görev eşlemesi

Preset isimleri brief'ten; modeller yukarıdaki canlı listeden atandı. "Rate" değerleri 2026-07-11 doğrulama tarihiyle etiketli. [LIKELY — fiyat/erişim aylık değişir]

| Preset | Tier | Primary | Fallback zinciri | Provider policy | HITL | AgencyOS görevi (mevcut dosya) |
|---|---|---|---|---|---|---|
| — | **0** deterministik | **LLM YOK** | — | — | — | Tarih/dedup/state-transition/suppression: `leads/pipelineGate.ts`, follow_up state, İYS suppression, `buildComplianceFooter`, `computeDeterministicScores`, `offerMatcher.ts` |
| `agencyos-fast-extract` | **1** ultra-ekonomik | `qwen/qwen3.6-flash` | `google/gemini-3.1-flash-lite` | `sort:price`, `require_parameters:true` | hayır | `batch_enrichment`, `analyze_lead`, `lead_intel_design_critic` (vision!), `lead_intel_automation_analyst`, `lead_intel_skeptic` |
| `agencyos-research-budget` | **2** ekonomik araştırma | `qwen/qwen3.7-plus` | `google/gemini-3.5-flash`, `x-ai/grok-4.3` | `sort:price` | hayır | Evidence özetleme (`leadIntel/*`), sektör/şehir sinyal sentezi, `read_knowledge`, RAG cevap oluşturma |
| `agencyos-professional` | **3** ana profesyonel | `anthropic/claude-sonnet-5` | `openai/gpt-5.6-luna`, `google/gemini-3.5-flash` | `data_collection:deny` | hayır (taslak) | `draft_email` (`coldEmail.ts`), `generate_briefing`, `lead_intel_chair`, cold-email 4 açı, `proposalGenerator.ts` taslağı |
| `agencyos-premium-deal` | **4** yüksek-değerli lead | `anthropic/claude-opus-4.8` | `openai/gpt-5.6-terra`, `openai/gpt-5.6-sol` | `data_collection:deny`, `zdr:true` | **EVET** (spend/external) | A-tier lead teklifi, karmaşık çok-sinyalli proposal, yüksek-riskli reply stratejisi |
| `agencyos-routine-judge` | **5** bağımsız judge | `google/gemini-3.5-flash` | `qwen/qwen3.7-plus` | `sort:price` | hayır | Tier 1–2 çıktılarını çapraz-aile değerlendirme (eval) |
| `agencyos-premium-judge` | **5** bağımsız judge | çapraz-aile: GPT yazdıysa `anthropic/claude-opus-4.8`, Claude yazdıysa `openai/gpt-5.6-terra` | diğer aile | `data_collection:deny` | hayır | Tier 3–4 çıktı denetimi; self-bias'ı kesen çapraz-aile judge |

**Tier 0 kuralı (sıkı):** tarih aritmetiği, dedup, state-transition, suppression, imza/footer, cosine benzerlik LLM'e **verilmez** — bunlar zaten deterministik kod (`offerMatcher.ts` "halüsinasyon-servis imkânsız", `pipelineGate.ts`). LLM buraya konursa hem maliyet hem hata artar. [CERTAIN]

**Çapraz-aile judge mantığı (Tier 5):** Bir çıktıyı üreten aynı model ailesi onu değerlendirirse öz-yanlılık oluşur. Kural: **GPT üretti → Claude değerlendirir; Claude üretti → GPT değerlendirir.** Bu, mevcut `eval/judge.ts`'in enjekte-edilen skorer desenine doğrudan oturur (LLM çağrısı dışarıda, judge saf kalır).

**Vision notu:** `lead_intel_design_critic` screenshot alır (multimodal). `qwen/qwen3.6-flash` vision destekler ve ultra-ucuzdur — mevcut `gemini-2.5-flash-lite` vision rolünün doğrudan halefi. `qwen3.7-max`/`qwen3.6-max-preview` vision **desteklemez**, Design Critic'e atanmamalı. [CERTAIN — canlı vision sütunu]

## Embedding + rerank kararı

- **Üretim (generation):** `src/lib/assistant/embeddings.ts` → Google `gemini-embedding-001`, 768-dim, doğrudan provider (`generativelanguage.googleapis.com`), OpenRouter DEĞİL. Mevcut `GOOGLE_GEMINI_API_KEY` yeterli, yeni anahtar yok, Vercel'de çalışıyor. **KORU.** [CERTAIN — repo]
- **Depolama:** Supabase **pgvector** (`vector(768)`, mig 042: `skill_embeddings`/`tool_embeddings`/`memory_embeddings`). ANN index (ivfflat/hnsw) bilerek yok — 487 satırda exact cosine sub-ms; index yalnız ölçüm gerekçelendirince eklenecek. **KORU.** [CERTAIN — mig 042]
- **OpenRouter embed endpoint:** OpenRouter chat-completions odaklı; native embedding endpoint'ine **bağımlılık kurma**. Embedding router'dan ayrı tutulmalı (farklı vektör uzayı ⇒ mig 042 ile uyumsuzluk riski). [UNKNOWN — OpenRouter native embed erişimi doğrulanmadı; ASSUMPTION: yok/güvenilmez]
- **Rerank:** 487 satırlık exact-cosine budgesinde rerank YAGNI. Gerekirse Tier-1 modeli LLM-reranker olarak kullanılabilir veya Cohere rerank doğrudan çağrılır — ama OpenRouter native rerank yok. MVP: değiştirme. [ASSUMPTION]

## Model registry veri yapısı (hardcode dağıtma)

`OPERATION_MODEL_MAP` + `TOKEN_RATES_PER_M` + 3 legacy `callLight/Medium/Heavy` fonksiyonu şu an model string'lerini **dört ayrı yere** gömüyor. Öneri: tek `PRESETS` kaynağı + mevcut settings-override desenini (bkz. `ai/caps.ts`) yeniden kullan.

```ts
interface ProviderPolicy {
  order?: string[]; allowFallbacks?: boolean; requireParameters?: boolean
  dataCollection?: 'allow' | 'deny'; only?: string[]; ignore?: string[]
  sort?: 'price' | 'throughput' | 'latency'; zdr?: boolean
  maxPrice?: { prompt: number; completion: number }   // $/M koruma tavanı
}
interface RoutePreset {
  key: string; tier: 0|1|2|3|4|5
  primary: string; fallbacks: string[]        // → OpenRouter body.models = [primary, ...fallbacks]
  provider?: ProviderPolicy
  timeoutMs: number; maxRetries: number
  requiresApproval: boolean                    // Tier 4 → HITL gate (mig 043)
  rate: { input: number; output: number }      // $/M, TAHMİNİ
  verifiedAt: string                           // '2026-07-11' — expiration audit izi
}
```

`fallbacks` dizisi doğrudan OpenRouter'ın `models: [primary, ...]` dizisine + `provider.allow_fallbacks:true`'a çevrilir. Primary 404/expire olursa OpenRouter **otomatik** sonraki modele yönlendirir — bu, mevcut ölü-ID sorununun kendiliğinden-onaran çözümüdür. `require_parameters:true`, fallback'ın tool/vision gereksinimini karşılamasını zorlar. [CERTAIN — provider-routing docs]

## OpenRouter istek ayarları (resmî docs, 2026-07-11)

Kaynak: `openrouter.ai/docs/features/provider-routing` + `.../prompt-caching` (birincil). [CERTAIN — alan adları doğrulandı]

| Ayar | Değer | AgencyOS kullanımı |
|---|---|---|
| `provider.order` | slug[] | Genelde boş bırak; tek preset'te sağlayıcı sabitleme gerekmez |
| `provider.allow_fallbacks` | bool (default true) | `models[]` fallback için AÇIK tut |
| `provider.require_parameters` | bool | Tool/vision gerektiren preset'lerde `true` |
| `provider.data_collection` | `allow`/`deny` | Tier 3–4 (müşteri verisi/teklif) → `deny` |
| `provider.zdr` | bool | Tier 4 premium-deal → `true` (zero-data-retention endpoint) |
| `provider.sort` | `price`/`throughput`/`latency` | Tier 1–2 → `price`; kritik yol → `latency` |
| `provider.max_price` | `{prompt,completion}` $/M | Bütçe tavanını sağlayıcı seviyesinde de zorla |
| `:floor` / `:nitro` sonekleri | slug soneki | `:floor`=en ucuz, `:nitro`=en hızlı; preset yerine geçmez |
| `usage.include:true` | bool | ZATEN AÇIK — gerçek `usage.cost` + `generation_id` döner (`openrouter.ts` satır 216) |
| structured outputs | `response_format` | Zod-parse edilen JSON çıktılarında JSON-validity'yi yükseltir |
| prompt caching | Anthropic **explicit** `cache_control`; OpenAI/Google/DeepSeek/Grok **otomatik** | Persona/framework sistem promptları sabit → Anthropic'te `cache_control` ile 0.1–0.25x okuma indirimi (V2) |

**Model expiration/stable-fallback:** Tek en önemli dayanıklılık kalıbı — `models[]` fallback dizisi + nightly `/api/v1/models` senkron. `verifiedAt` alanı, hangi preset'in en son ne zaman doğrulandığını izler; drift tespitinde uyarı. [CERTAIN — bu dokümanın canlı bulgusu buna kanıt]

## AgencyOS'a entegrasyon (mevcut dosya yollarıyla)

- `src/lib/openrouter.ts` — `OPERATION_MODEL_MAP`'i preset çözümlemesiyle değiştir; `MODEL_REGISTRY`+`PRESETS` ekle. `callOpenRouter` gövdesine `models:[primary,...fallbacks]`, `provider:{...}`, `response_format`, `AbortController` timeout ve retry döngüsü ekle. Mevcut `usage:{include:true}`, `getTokenRate`, cost logging KORUNUR.
- `src/lib/ai/caps.ts` — kopyalanacak referans desen: `settings` satırından 5-dk cache'li deploy'suz override. Yeni `ai_route_presets` settings anahtarı aynı desenle preset primary/fallback'ı ezebilir (tıpkı `ai_token_rates` ve `ai_monthly_cap_usd` gibi).
- `src/lib/ai/costLog.ts` / `ai_cost_logs` — mevcut `actual_cost_usd`+`generation_id` loglamasını koru; `preset_key`, `fallback_used`, `retry_count` alanları ekle (gözlem; parity için `cost_usd` tahmini kalır).
- `src/lib/brain/gate.ts` — Tier 4 `requiresApproval` mevcut HITL onayına (mig 043 `approvals`, digest-lock/idempotency/TTL) bağlanır. **Yeni onay sistemi kurma; mevcudu çağır.**
- `src/lib/eval/harness.ts` + `judge.ts` + `eval_cases/runs/results` — çapraz-aile Tier-5 judge'lı LLM-skorlu setler ekle. `judge.ts` enjekte-skorer deseni değişmez; sadece gerçek LLM skorer dışarıdan verilir.
- `src/lib/skills/registry.ts` — `notImplemented` handler'lar (`lead.audit_website`, `sales.pricing_explain`, `automation.integration_matcher`) preset'lerle ilişkilendirilir; her skill manifesti bir preset anahtarı taşıyabilir.
- `src/lib/assistant/embeddings.ts` + mig 042 — **DEĞİŞMEZ**; embedding router'dan ayrı kalır.
- **DOKUNULMAZ:** `/gorevler`, `/aliskanliklar`, LIFE DB `active_tasks`/`habits`. Bu router değişikliği o modüllere değmez; yalnız `openrouter.ts` çağrı yapan satış/lead/asistan yolları etkilenir.

## AgencyOS-özel benchmark yöntemi (kısa)

Mevcut `eval/harness.ts` (saf/deterministik golden runner) + `judge.ts` (trajectory precision/recall/order + rubrik) + `eval_cases/runs/results/datasets` tabloları yeniden kullanılır. Tek operatör + düşük hacim ⇒ küçük ama temsili datasetler.

| Metrik | Ölçüm | Dataset boyutu | Kaynak |
|---|---|---|---|
| Accuracy / trajectory | precision+recall+order (`scoreTrajectory`) | mentorRoute + councilParity (mevcut) | `judge.ts` |
| JSON-validity | Zod-parse geçme oranı | 30–50 vaka | çağıran zod şeması |
| Evidence-consistency | her iddia → `evidence_id`; halüsinasyon-servis=0 | 20–30 | `offerMatcher.ts` (deterministik) |
| Hallucination | kanıtsız %/ROI yasağı ihlali | 20–40 | `coldEmail.ts` anti-ROI lint |
| Turkish-quality | LLM-as-judge rubrik (çapraz-aile) veya insan spot | 20–30 | `judge.ts` rubrik |
| **Edit-distance** | Cem'in gönderdiği vs taslak (Levenshtein) | HITL akışından canlı | `outreach/email.ts markMessageSent` |
| Cost | gerçek `actual_cost_usd` | her çağrı | `ai_cost_logs` |

**Edit-distance en değerli sinyal:** her e-posta HITL-onaylı ve Cem göndermeden önce düzenlediği için, taslak↔gönderilen farkı **yer-gerçeği kalite ölçüsüdür**. Zamanla düşen edit-distance = Voice DNA öğrenmesi çalışıyor (eksik #6'ya bağlanır). Yöntem: aynı vakayı 2 preset'ten geçir, çapraz-aile judge ile skorla, `run_spans` (OTel GenAI, redacted) + `eval_results`'a yaz. [CERTAIN yapı — ASSUMPTION metrik ağırlıkları ayarlanacak]

## MVP / V1 / V2

**MVP (acil, küçük, yüksek-değer):**
1. Kırık model ID'lerini ŞİMDİ düzelt: `deepseek/deepseek-v4-pro`→`agencyos-professional` primary, `gemini-2.5-flash-lite`→`gemini-3.1-flash-lite`/`qwen3.6-flash`, `claude-haiku-4-5`→`claude-sonnet-5`. (Önce tekil-ID 404 doğrulaması.)
2. `callOpenRouter`'a `models:[primary,...fallbacks]` dizisi ekle → expiration kendiliğinden onarılır.
3. `AbortController` timeout (örn. Tier 1–2: 20s, Tier 3–4: 60s) + 1 retry.

**V1:** Tam 6-preset registry + provider policy (`sort:price` default, Tier 3–4 `data_collection:deny`, `require_parameters`) + `ai_route_presets` settings-override + `preset_key`/`fallback_used`/`retry_count` loglama. Cold-email + proposal eval setleri; çapraz-aile Tier-5 judge; HITL akışından edit-distance metriği.

**V2:** Nightly `/api/v1/models` fiyat/erişim senkron cron'u (drift uyarısı + kaybolan model bayrağı + rate otomatik güncelleme); Anthropic prompt caching (sabit persona/framework sistem promptlarına `cache_control`); pgvector exact-cosine budgeyi aşarsa reranker/ANN index; throughput/latency-farkında yönlendirme.

## Açık sorular / doğrulanamayanlar

- `anthropic/claude-haiku-4-5` katalogda gerçekten yok mu, yoksa özet çıkarıcı mı atladı? Tekil-ID sorgusu gerek. [UNKNOWN]
- deepseek ailesinin tamamı OpenRouter'dan mı kalktı yoksa filtre mi eşleşmedi? `draft_proposal`/`callHeavy` **kesin etkilenir**. [UNKNOWN — yüksek risk]
- `google/gemini-2.5-flash-lite` hâlâ çözülüyor mu yoksa 404 mü? Canlı veri `gemini-3.1-flash-lite`'ı halef gösteriyor. [LIKELY superseded]
- OpenRouter native embedding/rerank endpoint erişimi doğrulanmadı — öneri: bağımlılık kurma. [UNKNOWN]
- Fiyatlar 2026-07-11 anlıktır; aylık değişir. Kural: model adı+fiyatı **canlı `/api/v1/models` ile doğrulanmadan** kesinleştirme. [CERTAIN kural]
- Preset↔görev eşlemesi ve metrik ağırlıkları eval sonuçlarıyla kalibre edilecek çıkarımdır. [ASSUMPTION]
