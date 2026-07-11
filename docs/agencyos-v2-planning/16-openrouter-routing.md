# 16 — OpenRouter Model Routing (V2 Foundation Contract)

> Dalga 1 / load-bearing. Bu doküman, tüm satış/lead/asistan LLM çağrılarının hangi modele, hangi fallback zinciriyle, hangi politika ve bütçe tavanıyla gideceğini kilitleyen **tek sözleşmedir**. `06-agent-registry.md` ve `07-skill-registry.md` her agent/skill için buradaki bir `preset_key`'e referans verir.
>
> **Kaynak zinciri:** onaylı plan §4 (kanonik preset listesi) + §3 rulings · araştırma raporu `18-openrouter-model-routing.md` + `24-cost-scenarios.md` · repo `src/lib/openrouter.ts` (satır atıfları aşağıda) · **canlı `GET https://openrouter.ai/api/v1/models` WebFetch, 2026-07-11** (bu doküman yazılırken yeniden doğrulandı).
>
> **Bu doküman kod yazmaz** — hedef mimariyi ve sözleşmeyi tanımlar. Kodlama Sprint 0'da ayrı temiz context'te.

---

## 1. Mevcut durum + ACİL sorun (neden #1 acil düzeltme)

Tüm model routing **tek dosyada**, tek statik tabloda: `src/lib/openrouter.ts`.

- **Statik operasyon→model tablosu** — `OPERATION_MODEL_MAP` (`openrouter.ts:11-36`) 16 operasyonu üç tier'a (`light`/`medium`/`heavy`) ve **sabit-gömülü string model ID'lerine** bağlar. Aynı ID'ler ayrıca `TOKEN_RATES_PER_M`'de (`:47-52`), `getModel` default'unda (`:97`) ve legacy `callLight/callMedium/callHeavy`'de (`:379`, `:397`, `:411`) tekrarlanır — yani **bir model ID dört ayrı yere** gömülü. Bir modeli değiştirmek dört noktaya dokunmayı gerektirir.
- **Üç canlı model ID'si BOZUK (superseded/404).** `OPERATION_MODEL_MAP`'te üretimde çağrılan üç ID — `google/gemini-2.5-flash-lite` (7 operasyon: `jarvis_chat`, `session_briefing`, `read_knowledge`, `wrap_session`, `build_visual_prompt`, `analyze_lead`, `batch_enrichment` + 3 lead_intel light + `callLight`), `anthropic/claude-haiku-4-5` (`generate_briefing`, `draft_email`, `build_carousel_brief`, `intent_detection`, `lead_intel_chair` + `callMedium`), `deepseek/deepseek-v4-pro` (`draft_proposal` + `callHeavy`) — **canlı `/api/v1/models`'de ARTIK YOK** (2026-07-11 doğrulandı, §2 tablo). `deepseek/deepseek-v4-flash` de yok.
- **Fallback YOK.** `callOpenRouter` body'si (`:207-217`) tek `model` alanı gönderir; `models:[...]` dizisi yok. Primary model 404 dönerse **otomatik yönlendirme yoktur**.
- **Timeout YOK.** `fetch` (`:224-233`) `AbortController`/signal olmadan çağrılır — provider asılırsa istek süresiz bekler.
- **Retry YOK.** Tek deneme; geçici 5xx/429'da yeniden deneme yoktur.
- **`!response.ok`'da throw** (`:235-238`). Bozuk model 404 dönünce fonksiyon fırlatır. Bunu yakalayan yol (Lead Intel council) deterministik moda düşer — zarar yok; ama yakalamayan yollar (`draft_email`, `draft_proposal`, `jarvis_chat`) kullanıcıya **sessiz/500 hata** verir. `draft_proposal`'ın bozuk `deepseek-v4-pro`'ya gitmesi = teklif taslağı üretimi bugün fiilen **patlıyor olabilir** (canlı API-key testi bu görevde yapılmadı — `unverified:`, raporlar 18/24 ile tutarlı [LIKELY]).

**Neden #1 acil:** Refactor yüzeyi küçük (tek dosya, mevcut `usage:{include:true}` cost logging + `getTokenRate` + settings-override deseni KORUNUR), ama etkisi büyük — bugün üretimdeki üç ID'nin üçü de ölü. Bu, V2'nin diğer tüm motorlarının (outreach, proposal, reply, memory) üstüne bineceği taşıyıcı katman. Foundation'da ilk düzeltilmesi gereken budur. **Onarım deseni:** `models:[primary, ...fallbacks]` dizisi ölü-ID sorununu **kendiliğinden onarır** — primary 404 olsa bile OpenRouter otomatik sonraki modele geçer.

---

## 2. Doğrulanmış canlı katalog (OpenRouter `/api/v1/models`, 2026-07-11)

Fiyatlar canlı API'den (per-token → per-milyon-token USD'ye çevrildi). **Bu tablo iki bağımsız WebFetch çağrısıyla 2026-07-11'de doğrulandı**; raporla drift kontrol edildi.

| Model ID | $/M girdi | $/M çıktı | Durum | Kaynak |
|---|---|---|---|---|
| `qwen/qwen3.6-flash` | 0.1875 | 1.125 | ✅ canlı | live-webfetch 2026-07-11 |
| `google/gemini-3.1-flash-lite` | 0.25 | 1.50 | ✅ canlı | live-webfetch 2026-07-11 |
| `qwen/qwen3.7-plus` | 0.32 | 1.28 | ✅ canlı | live-webfetch 2026-07-11 |
| `x-ai/grok-4.3` | 1.25 | 2.50 | ✅ canlı | live-webfetch 2026-07-11 |
| `google/gemini-3.5-flash` | 1.50 | 9.00 | ✅ canlı | live-webfetch 2026-07-11 |
| `openai/gpt-5.6-luna` | 1.00 | 6.00 | ✅ canlı | live-webfetch 2026-07-11 |
| `anthropic/claude-sonnet-5` | 2.00 | 10.00 | ✅ canlı | live-webfetch 2026-07-11 |
| `openai/gpt-5.6-terra` | 2.50 | 15.00 | ✅ canlı | live-webfetch 2026-07-11 |
| `anthropic/claude-opus-4.8` | 5.00 | 25.00 | ✅ canlı | live-webfetch 2026-07-11 |
| `openai/gpt-5.6-sol` | 5.00 | 30.00 | ✅ canlı | live-webfetch 2026-07-11 |
| **`google/gemini-2.5-flash-lite`** | — | — | ❌ **404 (absent)** | live-webfetch 2026-07-11 (repoda kullanılıyor) |
| **`anthropic/claude-haiku-4-5`** | — | — | ❌ **404 (absent)** | live-webfetch 2026-07-11 (repoda kullanılıyor) |
| **`deepseek/deepseek-v4-pro`** | — | — | ❌ **404 (absent)** | live-webfetch 2026-07-11 (repoda kullanılıyor) |
| **`deepseek/deepseek-v4-flash`** | — | — | ❌ **404 (absent)** | live-webfetch 2026-07-11 (rate tablosunda) |

**Drift durumu:** Rapor 18'in canlı katalog tablosuyla (2026-07-11) **fiyat driftı YOK** — tüm preset modelleri ve fallback'ler birebir aynı fiyatta doğrulandı. Rapor 18'in "[LIKELY kırık]" olarak işaretlediği üç repo modeli bu doğrulamada **kesin 404 (absent)** olarak teyit edildi (rapor 18'in tekil-ID doğrulama açık sorusu böylece kapandı). Toplam katalog: 72 model.

**Kritik kural (rapor 18 + 24 ortak):** Fiyatlar 2026-07-11 anlıktır, aylık değişir. Hiçbir model ID veya fiyatı, **canlı `/api/v1/models` ile doğrulanmadan** kesinleştirilmez. Bu dokümanın kendisi bu kuralın kanıtıdır: her preset modeli `verifiedAt: '2026-07-11'` taşır.

---

## 3. Central Model Registry + Preset tasarımı

Tek `PRESETS` kaynağı statik-gömülü ID'lerin dört noktaya dağılmasını bitirir. Her agent/skill bir `preset_key` ile çağırır; hiçbir yer ham model ID görmez. Yapı (rapor 18 §"Model registry veri yapısı" temel alındı):

```ts
interface ProviderPolicy {
  allowFallbacks?: boolean        // → provider.allow_fallbacks (models[] için AÇIK)
  requireParameters?: boolean     // → provider.require_parameters (tool/vision zorlar)
  dataCollection?: 'allow' | 'deny'
  sort?: 'price' | 'throughput' | 'latency'
  zdr?: boolean                   // zero-data-retention endpoint
  maxPrice?: { prompt: number; completion: number }  // $/M koruma tavanı
}
interface RoutePreset {
  key: string
  tier: 0 | 1 | 2 | 3 | 4 | 5
  primary: string
  fallbacks: string[]             // → body.models = [primary, ...fallbacks]
  provider?: ProviderPolicy
  timeoutMs: number
  maxRetries: number
  requiresApproval: boolean       // Tier 4 → HITL (mig 043 approvals)
  ceiling: { prompt: number; completion: number }  // $/M — provider.max_price ile hizalı
  verifiedAt: string              // '2026-07-11' — expiration audit izi
}
```

**Tier 0 (LLM YOK) — sıkı kural.** Tarih aritmetiği, dedup, state-transition, suppression, imza/footer, cosine benzerlik LLM'e **verilmez**; bunlar zaten deterministik kod (`offerMatcher.ts`, `pipelineGate.ts`, `computeDeterministicScores`, follow-up state machine, İYS suppression, `buildComplianceFooter`). Preset yok; buraya LLM koymak hem maliyet hem hata artırır.

### Presetler (plan §4 kanonik — birebir; yalnız canlı-doğrulanmış modeller)

Fiyatlar §2 tablosundan. `ceiling`/`maxPrice` değerleri zincirin en pahalı modelini baş-boşlukla kapsar [ASSUMPTION: tavanlar eval sonrası kalibre edilecek koruma değerleridir].

#### `agencyos-fast-extract` — Tier 1 (ultra-ekonomik, vision)
- **Primary:** `qwen/qwen3.6-flash` (0.1875 / 1.125)
- **Fallback:** `google/gemini-3.1-flash-lite` (0.25 / 1.50) → `qwen/qwen3.7-plus` (0.32 / 1.28)
- **Görevler:** classify, signal-tag, reply-prefilter, JSON çıkarım, `batch_enrichment`, `analyze_lead`, `lead_intel_design_critic` (**vision**), `lead_intel_automation_analyst`, `lead_intel_skeptic`.
- **Vision notu:** zincirdeki üç model de vision destekler (§2 rapor 18 vision sütunu) → Design Critic screenshot'ı güvenle fallback'e düşebilir. `requireParameters:true` fallback'in vision/tool desteğini zorlar.
- **timeout:** 20s · **retry:** 1 · **HITL:** hayır · **provider:** `sort:price`, `requireParameters:true` · **ceiling:** { prompt: 0.5, completion: 2.0 }

#### `agencyos-research` — Tier 2 (ekonomik araştırma)
- **Primary:** `google/gemini-3.1-flash-lite` (0.25 / 1.50)
- **Fallback:** `openai/gpt-5.6-luna` (1.00 / 6.00)
- **Görevler:** şirket araştırması, dossier ön-taslağı, evidence özetleme, sektör/şehir sinyal sentezi, RAG cevap oluşturma, `read_knowledge`. [ASSUMPTION: `jarvis_chat`/`session_briefing`/`wrap_session` konuşma-özeti yolları da bu preset'e; kullanıcı-görünür ama ekonomik-kalite yeterli.]
- **timeout:** 25s · **retry:** 1 · **HITL:** hayır · **provider:** `sort:price`, `requireParameters:true` · **ceiling:** { prompt: 1.5, completion: 8.0 }

#### `agencyos-professional` — Tier 3 (ana profesyonel, yazım)
- **Primary:** `openai/gpt-5.6-luna` (1.00 / 6.00)
- **Fallback:** `anthropic/claude-sonnet-5` (2.00 / 10.00)
- **Görevler:** qualify, offer, outreach (`draft_email`), reply-draft, proposal taslağı, `generate_briefing`, `intent_detection`, `build_carousel_brief`, `lead_intel_chair`.
- **Not (§3 ruling):** Bu tier'ın kalite çıpası `claude-sonnet-5`; opus-4.8 profesyonel işe **girmez**. Primary olarak ucuz `gpt-5.6-luna`, kalite gerektiğinde/hata halinde sonnet-5 fallback (cost-funnel: pahalı model her çağrıda çalışmaz).
- **timeout:** 45s · **retry:** 1 · **HITL:** hayır (taslak; gönderim ayrı HITL kapısında — `12-gmail-and-followup-engine.md`) · **provider:** `dataCollection:deny` (müşteri verisi/teklif), `requireParameters:true` · **ceiling:** { prompt: 3.0, completion: 12.0 }

#### `agencyos-premium-deal` — Tier 4 (yüksek-değerli lead, escalation-only)
- **Primary:** `anthropic/claude-sonnet-5` (2.00 / 10.00)
- **Fallback:** `openai/gpt-5.6-terra` (2.50 / 15.00)
- **Escalation-only:** `anthropic/claude-opus-4.8` (5.00 / 25.00) yalnız **explicit escalation** ile devreye girer (A-tier lead, çok-sinyalli karmaşık proposal, yüksek-riskli reply stratejisi). Otomatik/default DEĞİL.
- **⚠ Synthesis hatası düzeltmesi:** Sentez notu opus-4.8'i "ucuz" saydı — **YANLIŞ**. Canlı katalog: opus-4.8 = **$5/$25 per M** (§2), katalogtaki en pahalı ikinci aile. Rapor 18/24 ile hizalı doğru değer budur; opus-4.8 **pahalıdır ve yalnızca escalation'dır** (plan §3 ruling).
- **timeout:** 60s · **retry:** 1 · **HITL:** **EVET** (`requiresApproval:true` → mig 043 `approvals` digest-lock/idempotency/TTL kapısına bağlanır; spend + external etki) · **provider:** `dataCollection:deny`, `zdr:true` · **ceiling:** { prompt: 6.0, completion: 28.0 } (opus escalation'ı kapsar)

#### `agencyos-judge` (cross-family) — Tier 5 (bağımsız değerlendirme)
`agencyos-judge` bir **üst-anahtar** (routing kuralı), somut preset değil: çağıran görev Tier'ına göre iki alt-varyanttan birine çözülür. 07 §2.9'daki ★MVP `review-outreach` bu üst-anahtarı kullanır → **rutin outreach taslağı denetimi `agencyos-routine-judge`'a çözülür**; premium-judge yalnız Tier-4 (premium-deal) çıktısında devreye girer. Öz-yanlılığı kesmek için **çapraz-aile** kural: **GPT üretti → Claude değerlendirir; Claude üretti → GPT değerlendirir.**
- **`agencyos-routine-judge`** (Tier 1–3 rutin çıktı denetimi, ★MVP `review-outreach` dahil): ekonomik structured model. **Primary:** `google/gemini-3.5-flash` (1.50 / 9.00) → **Fallback:** `qwen/qwen3.7-plus` (0.32 / 1.28). timeout 30s · **ceiling:** { prompt: 2.0, completion: 10.0 }
- **`agencyos-premium-judge`** (yalnız Tier-4 premium-deal çıktı denetimi): çapraz-aile. Varsayılan primary **sonnet-5-sınıfı** (GPT yazdıysa `claude-sonnet-5`; Claude yazdıysa `openai/gpt-5.6-terra` → `gpt-5.6-sol` fallback). **`anthropic/claude-opus-4.8` burada da escalation-only kuralına tabidir** (plan §3) — her taslakta değil, yalnız explicit escalation'da judge olarak seçilebilir. timeout 45s · **ceiling:** { prompt: 6.0, completion: 28.0 }
- **retry:** 1 · **HITL:** hayır · **provider:** `dataCollection:deny`. Mevcut `eval/judge.ts` enjekte-skorer deseni değişmez; LLM skorer dışarıdan verilir.

#### `agencyos-memory` — relationship memory (scoped)
- **extract:** `qwen/qwen3.6-flash` (0.1875 / 1.125) — düşük-riskli çıkarım (`fast-extract` ile aynı ekonomi)
- **consolidate:** `openai/gpt-5.6-luna` (1.00 / 6.00) — orta konsolidasyon
- **high-risk:** `anthropic/claude-sonnet-5` (2.00 / 10.00) — hassas/high-sensitivity memory
- **Görevler:** `extract-memory` skill, memory consolidation. `15-memory-architecture.md` sensitivity katmanına göre üç alt-yolu seçer.
- **timeout:** 30s · **retry:** 1 · **HITL:** hayır (yüksek-riskli yazım gerekirse `human_approved` kolonu üzerinden, mig 050) · **provider:** `dataCollection:deny`, `requireParameters:true` · **ceiling:** { prompt: 3.0, completion: 12.0 }

### Embeddings — OpenRouter'DAN DEĞİL (KORU)
Embedding **üretimi** doğrudan Google `gemini-embedding-001` (768-dim, `generativelanguage.googleapis.com`, mevcut `GOOGLE_GEMINI_API_KEY`) — bu router'a **hiç girmez**. Gerekçe: OpenRouter chat-completions odaklı; native embedding endpoint erişimi doğrulanmadı [rapor 18: ASSUMPTION yok/güvenilmez] ve farklı vektör uzayı mig 042 pgvector `vector(768)` şemasıyla uyumsuzluk riski taşır. `src/lib/assistant/embeddings.ts` + mig 042 **DEĞİŞMEZ**. Depolama Supabase pgvector exact-cosine; ANN index YAGNI. [CERTAIN — repo + mig 042]

### Preset özet matrisi

| Preset | Tier | Primary | Fallback(ler) | HITL | timeout | ceiling $/M (in/out) |
|---|---|---|---|---|---|---|
| `agencyos-fast-extract` | 1 | qwen3.6-flash | gemini-3.1-flash-lite, qwen3.7-plus | hayır | 20s | 0.5 / 2.0 |
| `agencyos-research` | 2 | gemini-3.1-flash-lite | gpt-5.6-luna | hayır | 25s | 1.5 / 8.0 |
| `agencyos-professional` | 3 | gpt-5.6-luna | claude-sonnet-5 | hayır | 45s | 3.0 / 12.0 |
| `agencyos-premium-deal` | 4 | claude-sonnet-5 | gpt-5.6-terra (+opus-4.8 escalation) | **EVET** | 60s | 6.0 / 28.0 |
| `agencyos-routine-judge` | 5 | gemini-3.5-flash | qwen3.7-plus | hayır | 30s | 2.0 / 10.0 |
| `agencyos-premium-judge` | 5 | cross-family sonnet-5-sınıfı (claude-sonnet-5 ↔ gpt-5.6-terra; opus-4.8 yalnız escalation) | diğer aile | hayır | 45s | 6.0 / 28.0 |

`agencyos-judge` = üst-anahtar; matris satırı yok — Tier'a göre routine/premium alt-varyantına çözülür (yukarıdaki blok).
| `agencyos-memory` | 1/3 | qwen3.6-flash (extract) | gpt-5.6-luna → claude-sonnet-5 (risk artışı) | hayır | 30s | 3.0 / 12.0 |

---

## 4. Router policy (davranış sözleşmesi)

`callOpenRouter` gövdesine eklenecek zorunlu davranışlar (mevcut `usage:{include:true}` + cost logging KORUNUR):

1. **Self-heal fallback dizisi.** `body.models = [primary, ...fallbacks]` + `provider.allow_fallbacks:true`. Primary 404/expire/5xx olursa OpenRouter **otomatik** sonraki modele geçer — ölü-ID sorununun kalıcı çözümü. [CERTAIN — provider-routing docs]
2. **AbortController timeout.** Her istek preset'in `timeoutMs`'i ile `AbortController.signal`'a bağlanır; süre aşımında istek iptal + retry/fallback devreye. (Bugün timeout YOK — `openrouter.ts:224`.)
3. **1 retry.** Geçici hata (429/5xx/timeout/network) → en çok `maxRetries` (default 1) yeniden deneme, exponential backoff (kısa). Kalıcı hata (4xx model/param) retry edilmez → fallback zinciri devralır.
4. **Görünür fallback logging.** Primary dışına düşüldüğünde `model.fallback.used` event'i yayınlanır (`05-event-contracts.md`) + cost log'a `fallback_used:true`, `retry_count:n`, `preset_key` yazılır. Sessiz düşüş YASAK — hangi modelin fiilen yanıtladığı (`data.model`) daima kaydedilir.
5. **`require_parameters` (structured/tool/vision).** Tool veya vision gerektiren preset'lerde `provider.require_parameters:true` — fallback'in gereksinimi karşılamasını zorlar (Design Critic vision fallback güvenliği). Zod-parse edilen JSON çıktılarında `response_format` (structured outputs) JSON-validity'yi yükseltir.
6. **Provider retry/price budget.** `provider.max_price:{prompt,completion}` her preset'in `ceiling`'iyle hizalı gönderilir → bütçe tavanı sağlayıcı seviyesinde de zorlanır (pahalı beklenmedik fallback'i keser). Tier 1–2 `sort:price`; kritik-yol gerekirse `sort:latency`.
7. **Per-task cost attribution.** Mevcut `logAiCostRow` (`ai_cost_logs`) korunur; eklenecek alanlar: `preset_key`, `fallback_used`, `retry_count`. `actual_cost_usd` (gerçek OpenRouter `usage.cost`) + `generation_id` zaten loglanıyor (`openrouter.ts:253`) — KORU. `cost_usd` tahmini parity için kalır. Maliyet lead'e (`related_lead_id`) ve agent'a (`agent_key`) bağlı kalır.
8. **Data-collection / ZDR politikası.** Müşteri verisi/teklif taşıyan Tier 3–4 (`professional`, `premium-deal`, `memory`, judge'lar) → `provider.data_collection:'deny'`. Tier 4 premium-deal ayrıca `provider.zdr:true` (zero-data-retention endpoint). Tier 1–2 ham/kamuya-açık sinyal → varsayılan.
9. **Prompt cache (V2).** Sabit persona/framework sistem promptları (`coldEmail.ts` persona, council'in 4 sistem promptu) tekrarlıdır. Anthropic'te **explicit** `cache_control`; OpenAI/Google/Grok **otomatik**. Cache'lenmiş input token'da ~%75-90 indirim (rapor 24 ~%15-20 toplam konsey tasarrufu). MVP'de zorunlu değil; V2'de eklenir. Bugün `cache_control` gönderilmiyor (`unverified:` test edilmedi — rapor 24 [CERTAIN kod okundu]).
10. **HITL sınıfı.** `requiresApproval:true` (yalnız `premium-deal`) → mevcut mig 043 `approvals` kapısı çağrılır; **yeni onay sistemi kurulmaz**, mevcut digest-lock/idempotency/TTL akışı kullanılır (`src/lib/brain/gate.ts`).

---

## 5. Migration path (OPERATION_MODEL_MAP → PRESETS, çağıranları kırmadan)

**Hedef: sıfır çağıran-kırılması.** `callWithOperation(operation, ...)` ve `callWithOperationMultimodal` imzaları **değişmez**; tüm mevcut çağıranlar (JARVIS tools, council, cold-email route) aynı `operation` anahtarını geçmeye devam eder. Değişen tek şey: `getModel(operation)` artık statik tablo yerine bir **operation→preset→model** çözümlemesi yapar.

1. **`OPERATION_MODEL_MAP` → `OPERATION_PRESET_MAP`.** Her operasyon anahtarı bir `preset_key`'e maplenir (model ID değil). `getModel(operation)` içeride preset'i çözer, `primary`+`fallbacks`+`provider`+`timeout`+`tier`+`ceiling` döndürür. Operasyon anahtarları korunduğu için çağıran taraf hiç değişmez.

   | Operasyon (mevcut) | Yeni preset |
   |---|---|
   | `analyze_lead`, `batch_enrichment`, `lead_intel_design_critic`, `lead_intel_automation_analyst`, `lead_intel_skeptic` | `agencyos-fast-extract` |
   | `jarvis_chat`, `session_briefing`, `read_knowledge`, `wrap_session`, `build_visual_prompt` | `agencyos-research` [ASSUMPTION] |
   | `generate_briefing`, `draft_email`, `build_carousel_brief`, `intent_detection`, `lead_intel_chair` | `agencyos-professional` |
   | `draft_proposal` | `agencyos-professional` (default) → `agencyos-premium-deal` yalnız explicit escalation (HITL) |
   | legacy `light_generic` (`callLight`) | `agencyos-fast-extract` |
   | legacy `medium_generic` (`callMedium`) | `agencyos-professional` |
   | legacy `heavy_generic` (`callHeavy`) | `agencyos-professional` (**premium DEĞİL** — premium escalation-only) |
   | `agent:<key>` (`callAgentModel`) | agent registry'nin `preset_key`'i (`06-agent-registry.md`); ham model geçen mevcut yol geriye-uyumlu korunur, tercih preset'e kayar |

2. **Bilinmeyen operasyon default'u** `google/gemini-2.5-flash-lite` (ölü, `:97`) → `agencyos-fast-extract` primary'sine değişir. Böylece haritada olmayan operasyon bile canlı modele düşer.
3. **`TOKEN_RATES_PER_M` güncellenir** (`:47-52`) — ölü ID rate'leri yerine §2 canlı modelleri; `getTokenRate` + `settings.ai_token_rates` override deseni (`:60-93`) **aynen korunur** (deploy'suz güncelleme).
4. **Legacy `callLight/Medium/Heavy` korunur** (geriye-uyum, `:371-417`) ama içleri preset çözümlemesine yönlendirilir; ham ölü ID string'leri kaldırılır.
5. **Settings-override genişletme.** `src/lib/ai/caps.ts` deseni (5-dk cache'li, deploy'suz) kopyalanarak yeni `ai_route_presets` settings anahtarı preset primary/fallback'ı ezebilir — tıpkı `ai_token_rates` gibi. Model drift'inde SQL Editor'dan anında düzeltme mümkün olur (repo migration-runner'sız gerçeğine uygun).

**Kırılmama garantisi:** İmzalar sabit + operasyon anahtarları sabit + `usage:{include:true}`/cost-log alanları eklemeli (additive) → mevcut çağıranların hiçbiri tip/davranış değişikliği görmez.

---

## 6. Nightly verification (kayan model tespiti)

Bu dokümanın canlı bulgusu (üç ölü ID) tam olarak bu işin neden gerektiğini kanıtlıyor: OpenRouter kataloğu drift eder, statik ID'ler sessizce ölür.

- **İş:** günlük cron (mevcut cron worker deseni; `19-data-and-worker-architecture.md`) `GET /api/v1/models`'i çeker.
- **Kontrol:** `PRESETS` içindeki her `primary` + `fallbacks` model ID'sini canlı katalogla karşılaştırır.
- **Alarm koşulları:** (a) bir preset modeli **katalogtan kaybolmuş** (404 → drift), (b) fiyat `ceiling`'in üstüne çıkmış, (c) `verifiedAt` > 30 gün eskimiş.
- **Aksiyon:** drift tespitinde `20-observability-and-analytics.md`'e uyarı yayınlanır (system-health kanalı, kullanıcı-analytics'ten AYRI) + `verifiedAt` güncellenir. Kaybolan primary → fallback zaten çalıştığı için sistem ayakta kalır; uyarı proaktif düzeltme içindir (reaktif 404 değil).
- **Grounding:** Bu cron olmasaydı, mevcut üç ölü ID canlı bir kullanıcı isteği patlayana kadar fark edilmezdi. Nightly sync, stale-model riskini reaktiften proaktife taşır.

---

## Grounding & açık noktalar

- **Repo atıfları:** `src/lib/openrouter.ts:11-36` (OPERATION_MODEL_MAP), `:47-52` (TOKEN_RATES), `:97` (default), `:207-217` (body, models[] yok), `:224-233` (fetch, timeout yok), `:235-238` (throw on !ok), `:253` (actual_cost/generation_id), `:371-417` (legacy callLight/Medium/Heavy). `src/lib/ai/caps.ts` (settings-override deseni). mig 042 (pgvector), mig 043 (approvals), mig 044 (trace/eval).
- **Canlı doğrulama:** iki WebFetch, 2026-07-11 — 7 preset modeli + 3 fallback (gpt-5.6-sol, gemini-3.5-flash, grok-4.3) **PRESENT**; 3 repo modeli + deepseek-v4-flash **ABSENT (404)**. Rapor 18 fiyatlarıyla **drift yok**.
- **`unverified:`** `draft_proposal`/`draft_email`'in bugün gerçekten 500 mü döndüğü canlı API-key testiyle doğrulanmadı (bu görev kod/yan-etki kısıtı altında); raporlar 18/24 ile tutarlı [LIKELY].
- **[ASSUMPTION]** `jarvis_chat` ve konuşma-özeti operasyonlarının `agencyos-research`'e maplenmesi; ceiling/max_price değerleri koruma tavanıdır, eval sonrası kalibre edilecek; operasyon↔preset eşlemesi `17-model-benchmark-plan.md` kalite-eşiği sonuçlarıyla son halini alır.
- **Cross-refs:** `06-agent-registry.md` (agent `preset_key`), `07-skill-registry.md` (skill `preset_key`), `12-gmail-and-followup-engine.md` (gönderim HITL), `17-model-benchmark-plan.md` (kalite-eşiği-geçen-en-ekonomik seçim), `18-evaluation-framework.md` (cross-family judge), `20-observability-and-analytics.md` (drift alarmı), `22-cost-model.md` (Places dahil funnel maliyeti).
