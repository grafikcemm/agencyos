---
Doküman: 24-cost-scenarios
Tarih: 2026-07-11
Kaynak kalitesi: karışık
Güven: orta
AgencyOS'a etki: Lead→outreach hattının gerçek $ maliyetini (LLM + araç çağrısı) üç ölçekte gösterir; en büyük bulgu LLM değil Google Places API'nin baskın maliyet kalemi olması ve bunun bugün hiç izlenmemesidir.
---

## Özet

AgencyOS'un lead→outreach hattında LLM maliyeti (`ai_cost_logs`, `caps.ts` $20/ay, Lead Intelligence $0.40/gün) **son derece ucuz** — üç senaryonun hiçbirinde aylık $2'yi geçmiyor. Asıl maliyet riski LLM değil: `src/app/api/cron/daily-scan/route.ts` her gün Google Places Text Search + Place Details çağırıyor ve bu çağrıların **hiçbiri `ai_cost_logs`'a ya da başka bir yere loglanmıyor** — bugün gözlemlenebilirlik sıfır. İkinci büyük bulgu: kodun `TOKEN_RATES_PER_M`'de sabitlediği modeller (`google/gemini-2.5-flash-lite`, `anthropic/claude-haiku-4-5`, `deepseek/deepseek-v4-pro`) 2026-07-11 itibarıyla OpenRouter `/api/v1/models`'de **NOT FOUND** — canlı denk modellerle gerçek maliyet kod varsayımının ~4-10 katı.

## 1) Fiyatlandırma temeli — kod varsayımı vs. canlı doğrulanmış (2026-07-11)

`src/lib/openrouter.ts` `TOKEN_RATES_PER_M` yorumunda zaten "TAHMİNDİR, sabit gerçek değil" diyor — bu doğrulandı:

| Model (kodda) | Kod varsayımı in/out ($/M) | OpenRouter `/api/v1/models` durumu |
|---|---|---|
| `google/gemini-2.5-flash-lite` (light) | $0.05 / $0.05 | **NOT FOUND** |
| `anthropic/claude-haiku-4-5` (medium) | $0.25 / $0.25 | **NOT FOUND** |
| `deepseek/deepseek-v4-flash` | $0.10 / $0.10 | **NOT FOUND** |
| `deepseek/deepseek-v4-pro` (heavy) | $0.50 / $0.50 | **NOT FOUND** |
| `DEFAULT_RATE` (bilinmeyen model) | $0.10 / $0.10 | — (kod-içi güvenlik ağı) |

Bu dört model **artık üretimde gerçek bir OpenRouter çağrısı yapamıyor olabilir** [LIKELY] — `callOpenRouter` `response.ok` değilse throw ediyor, council bunu yakalayıp deterministik moda düşüyor (zarar yok, bkz. §5), ama `draft_email`/`draft_proposal`/`jarvis_chat` gibi throw'u yakalamayan yollar 502/hata dönebilir [UNKNOWN — doğrulanmadı, gerçek API key ile canlı çağrı testi yapılmadı].

Bu doküman iki paralel maliyet izi kullanıyor:
- **"Kod-varsayımı"**: yukarıdaki sabit oranlarla (mevcut `ai_cost_logs.cost_usd` bugün ne yazıyorsa onu yansıtır — model gerçekte çağrılabiliyor mu sorusundan bağımsız, çünkü `logAiCost` her zaman bu tabloyla hesaplanmış tahmini yazar).
- **"Canlı ikame"**: 2026-07-11'de fiilen var olan, benzer tier'daki modellerle — gerçekte bugün bu sistemi çalıştırırsan ödeyeceğin yakın tahmin.

| Tier | Canlı ikame model | in/out ($/M) | Kaynak |
|---|---|---|---|
| light | `qwen/qwen3.6-flash` | $0.1875 / $1.125 | OpenRouter models API, 2026-07-11 fetch |
| medium | `openai/gpt-5.6-luna` | $1.00 / $6.00 | OpenRouter models API, 2026-07-11 fetch |
| heavy | `anthropic/claude-sonnet-5` | $2.00 / $10.00 | OpenRouter models API, 2026-07-11 fetch |

Referans (kullanılmadı, üst sınır bilgisi): `anthropic/claude-opus-4.8` $5/$25, `google/gemini-3.5-flash` $1.5/$9. [ASSUMPTION: canlı ikame seçimi bendendir — Anthropic ailesinde bugün Haiku tier'ı OpenRouter'da görünmüyor, en ucuz Anthropic seçeneği sonnet-5; gerçek üretim kararı ayrı bir model-seçim çalışması gerektirir.]

## 2) Birim ekonomi — bir çağrının maliyeti

### Lead Intelligence Konseyi (`src/lib/leadIntel/council.ts`) — audit edilen 1 aday başına

4 aşama: Design Critic (light, multimodal) ∥ Automation Analyst (light) → Skeptic (light) → Chair (medium). Her aşama 1 geçersiz-JSON retry hakkına sahip (`runLlmStage`).

| Aşama | maxTokens | Tahmini input/output token |
|---|---|---|
| Design Critic | 900 | ~1200 / ~350 (ekran görüntüsü varsa görsel token dahil, kabaca) |
| Automation Analyst | 900 | ~900 / ~300 |
| Skeptic | 800 | ~1100 / ~250 |
| Chair | 700 | ~1300 / ~300 |

[ASSUMPTION: token sayıları promptların uzunluğundan kaba tahmindir, gerçek `ai_cost_logs.input_tokens/output_tokens` ile doğrulanmadı.]

- **Kod-varsayımı** (retry'sız): light 3 aşama ~$0.0002 + chair ~$0.0004 = **~$0.0006/aday**
- **Canlı ikame** (retry'sız): light 3 aşama ~$0.0016 + chair (gpt-5.6-luna) ~$0.0031 = **~$0.0047/aday**
- +%8 retry payı [ASSUMPTION, gözlenmiş retry oranı yok]: kod-varsayımı **~$0.00065**, canlı **~$0.0051/aday**

Bütçe rayı: `LEAD_INTEL_DAILY_CAP_USD = 0.4` (`budget.ts`) — canlı ikame oranıyla bile **~78 aday/gün** karşılar; bugünkü `AUDIT_TOP=4` bunun çok altında. Cap şu an bir güvenlik ağı, darboğaz değil.

### Soğuk e-posta taslağı (`draft_email`, `src/app/api/leads/[id]/cold-email/route.ts`)

`maxTokens=700`; sistem promptu ~220 kelime (~375 token TR), kullanıcı promptu değişken ~80-150 kelime. Tahmini input ~600, output ~300 token.

- Kod-varsayımı (haiku $0.25/$0.25): **~$0.00023/taslak**
- Canlı ikame (gpt-5.6-luna $1/$6): **~$0.0024/taslak**

### Teklif taslağı (`draft_proposal`, `src/lib/jarvis/engine.ts:697`, heavy tier)

`maxTokens=2000`; sistem promptu PRICING_RULES.md'den 600 karakter kırpma (~400 token) + talimat, kullanıcı promptu küçük. Tahmini input ~550, output ~1000 token (gerçek üretim 2000 tavanının altında kalır, tahmin).

- Kod-varsayımı (deepseek-pro $0.5/$0.5): **~$0.00078/teklif**
- Canlı ikame (sonnet-5 $2/$10): **~$0.0111/teklif**

Çapraz kontrol: `src/lib/skills/catalog.ts` `sales.draft_proposal` için `budgetUsdMax: 0.2` tanımlı — hesaplanan $0.011 bunun çok altında, cap burada da darboğaz değil.

### Araç çağrıları (LLM değil)

| Araç | Birim maliyet | Güven |
|---|---|---|
| PageSpeed Insights (PSI v5) | **$0** — 25.000 sorgu/gün ücretsiz kota | [CERTAIN] Google resmi dokümantasyonu + 2026 doğrulaması |
| Kendi HTML fetch (`urlGuard.ts`) | ~$0 (bant genişliği ihmal edilebilir) | [CERTAIN] |
| Google Places Text Search (legacy `place/textsearch/json`) | ~$0.032/çağrı | [ASSUMPTION — bkz. §4] |
| Google Places Details (telefon/website/rating alanlı) | ~$0.035/çağrı | [ASSUMPTION — bkz. §4] |
| Apollo (person-scan, yalnız Yoğun senaryoda) | kredi/abonelik bazlı, çağrı-başı yayınlanmış fiyat yok | [UNKNOWN] |

## 3) Üç senaryo

`DAILY_TARGET = 2` ve `DAILY_OPPORTUNITY_TARGET = 2` bugün kodda **sabit** — bu senaryolar gelecekteki olası ölçek büyütmelerini modelliyor; kodda henüz karşılığı yok [ASSUMPTION, doküman görevi gereği]. "Lead/gün" = `leads` tablosuna kabul edilen yeni kayıt; "audit edilen aday" = konseyin gördüğü aday (`AUDIT_TOP`, bugün 4). Follow-up taslakları `draft_email` birim maliyetiyle modellendi çünkü ayrı bir `follow_up_email` operasyonu `OPERATION_MODEL_MAP`'te tanımlı değil [ASSUMPTION].

### Düşük — 5 lead/gün, 2 outreach/gün, ~3 follow-up/hafta

| Kalem | Adet/gün | Kod-varsayımı $/gün | Canlı ikame $/gün |
|---|---|---|---|
| Konsey (audit ~5 aday) | 5 | $0.0033 | $0.0255 |
| draft_email (outreach) | 2 | $0.00046 | $0.0048 |
| follow-up taslağı | ~0.43 | $0.0001 | $0.0010 |
| **LLM toplam/gün** | | **~$0.0039** | **~$0.0313** |
| **LLM toplam/ay (×30)** | | **~$0.12** | **~$0.94** |
| Places (arama+detay, geniş aralık) | 60-150 çağrı | — | $2.01–$5.03 (tool, LLM dışı) |

- Lead başına LLM: ~$0.0008 (kod) / ~$0.0063 (canlı)
- Qualified-lead (fırsat, hâlâ 2/gün sabit) başına LLM: ~$0.0020 (kod) / ~$0.0157 (canlı)
- Outreach başına: $0.00023 / $0.0024
- Premium(heavy) model oranı: ~%0 (teklif nadiren, ayda ~1)
- Aylık $20 cap kullanım oranı: <%5

### Normal — 15-20 lead/gün, 5-10 outreach/gün

Orta nokta: 17-18 lead/gün, audit top ~8-10 (ön eleme genişletilmiş varsayım), 7-8 outreach/gün, ~1 teklif/hafta.

| Kalem | Adet/gün | Kod-varsayımı $/gün | Canlı ikame $/gün |
|---|---|---|---|
| Konsey (audit ~9 aday) | 9 | $0.0059 | $0.0459 |
| draft_email | 7.5 | $0.0017 | $0.018 |
| follow-up taslağı | ~1 | $0.00023 | $0.0024 |
| draft_proposal | ~0.14 | $0.00011 | $0.0016 |
| **LLM toplam/gün** | | **~$0.0079** | **~$0.068** |
| **LLM toplam/ay (×30)** | | **~$0.24** | **~$2.03** |
| Places (arama+detay, geniş aralık) | 200-450 çağrı | — | $6.7–$15.1 (tool, LLM dışı) |

- Lead başına LLM: ~$0.00047 (kod) / ~$0.0040 (canlı)
- Qualified-lead (2/gün sabit) başına LLM: ~$0.0040 (kod) / ~$0.034 (canlı) — **not**: audit havuzu büyüdükçe "kazanan başına" maliyet artıyor çünkü seçilen fırsat sayısı sabit kalıyor.
- Outreach başına: $0.00023 / $0.0024 (birim değişmez, hacim artar)
- Premium(heavy) oranı: ~%1.5 çağrı payı ama $-payı daha yüksek (heavy $/M oranı ~13-16x light)
- Aylık $20 cap kullanım oranı: canlı ikamede bile <%11

### Yoğun — 50+ lead/gün, yüksek araştırma, çok pazar, çok premium deal

50 lead/gün taban alındı ("50+" — üst sınır açık). Çok pazar = birden fazla şehir×sektör hedef planı paralel taranıyor varsayımı; audit top ~18-20; outreach 15-20/gün; premium teklif 2-3/gün.

| Kalem | Adet/gün | Kod-varsayımı $/gün | Canlı ikame $/gün |
|---|---|---|---|
| Konsey (audit ~19 aday) | 19 | $0.0124 | $0.0969 |
| draft_email | 17.5 | $0.0040 | $0.042 |
| follow-up taslağı | ~3 | $0.0007 | $0.0072 |
| draft_proposal (premium) | 2.5 | $0.0020 | $0.0278 |
| **LLM toplam/gün** | | **~$0.019** | **~$0.174** |
| **LLM toplam/ay (×30)** | | **~$0.57** | **~$5.22** |
| Places (arama+detay, çok pazar, geniş aralık) | 600-1500 çağrı | — | $20–$50 (tool, LLM dışı) |
| Apollo (person-scan, kredi bazlı) | değişken | — | [UNKNOWN, çağrı-başı fiyat yayınlanmamış] |

- Lead başına LLM: ~$0.00038 (kod) / ~$0.0035 (canlı)
- Qualified-lead (2/gün sabit) başına LLM: ~$0.0095 (kod) / ~$0.087 (canlı) — funnel genişledikçe bu oran daha da büyür.
- Outreach başına: $0.00023 / $0.0024 (proposal karışımıyla ağırlıklı ortalama biraz yükselir)
- Premium(heavy) oranı: ~%12 çağrı payı, $-payı ~%50'ye yakın (heavy hem token hem $/M olarak en pahalı segment)
- Aylık $20 cap kullanım oranı: kod-varsayımıyla ~%3, canlı ikameyle ~%26 — **hâlâ cap'i zorlamıyor**, ama Lead Intel günlük $0.40 rayına audit hacmi arttıkça (AUDIT_TOP büyütülürse) yaklaşabilir; 19 aday × $0.0051 (retry'li canlı) ≈ $0.097/gün, hâlâ rahat.
- **Bu senaryoda LLM değil Places/Apollo tool-maliyeti bütçenin ana kalemi** — $20-50/gün Places tahmini tek başına aylık $600-1500'e çıkabilir; bu aralık geniş ve doğrulanmadı (§4).

### Cache kazancı (üç senaryoda ortak)

Konseyin 4 sistem promptu (`designCriticSystem`, `AUTOMATION_SYSTEM`, `SKEPTIC_SYSTEM`, `CHAIR_SYSTEM`) her aday için **birebir aynı metin** — yalnız kanıt özeti (`buildEvidenceDigest`) değişir. Bugün `callOpenRouter` hiçbir `cache_control`/prompt-caching alanı göndermiyor [CERTAIN — kod okundu]. Anthropic/Gemini/DeepSeek sağlayıcıları OpenRouter üzerinden prompt caching destekliyor (cache'lenmiş input tokenlarda tipik ~%75-90 indirim) [ASSUMPTION: genel sağlayıcı davranışı, bu repo için test edilmedi]. Sistem promptu toplam input'un kabaca %20-25'i — caching eklenirse toplam konsey LLM maliyetinde **~%15-20 tasarruf** [ASSUMPTION] mümkün; Yoğun senaryoda audit hacmi büyüdükçe bu mutlak $ olarak daha anlamlı hale gelir. **V2 önerisi**, kod değişikliği bu doküman kapsamında değil.

### Fallback maliyeti

İki farklı "fallback" var, ikisi de **ek maliyet değil, maliyet önleme**:
1. Günlük $0.40 / aylık $20 cap aşımı → `runLlmStage`/`callOpenRouter` throw eder → council deterministik skorlara düşer (`computeDeterministicScores`, $0 LLM). Bu güvenlik ağı, ek maliyet değil.
2. Geçersiz JSON → 1 retry (yukarıda %8 payla modellendi) → hâlâ geçersizse deterministik chair'e düşer. Tek ek maliyet retry çağrısının kendisi.

## 4) En büyük bulgu: Google Places maliyeti hiç izlenmiyor

`ai_cost_logs` yalnızca OpenRouter LLM çağrılarını kaydediyor (`logAiCostRow`, migration 014/037). `daily-scan/route.ts` her çalıştığında Google Places Text Search + Place Details çağırıyor ama **bu maliyetleri hiçbir tabloya yazmıyor**. Bugünkü kod 2 A-tier lead bulmak için `maxAttempts=40` ilçe denemesi + her denemede birden fazla sektör query'si + her query'de bulunan HER sonuç için (dedup geçmemişse) bir Details çağrısı yapıyor — worst-case teorik olarak günde 40-80+ çağrıya çıkabilir. Gerçek oran DB doluluğuna (tekrar taranan yerler dedup'lanır, Details çağrısı yapılmaz) göre zamanla düşer, ama **bu doküman gerçek çağrı sayısını kod-okumasıyla kesin belirleyemedi** — arama sonucu başına döngü query-bazlı, `attempts` sayacı yalnız ilçe-bazlı artıyor.

Fiyat kaynağı: Google'ın 2026 "Places API" birleşik SKU yapısı — Text Search Pro tier ~$32/1.000 çağrı (aylık 5.000 ücretsiz sonrası), Place Details rating/website/telefon alanlarıyla Enterprise tier'a yükseliyor ~$35/1.000 çağrı ([safegraph.com](https://www.safegraph.com/guides/google-places-api-pricing/), [mapatlas.eu](https://mapatlas.eu/blog/google-maps-api-pricing-2026), Haziran 2026 doğrulaması). **[ASSUMPTION]**: repo legacy endpoint'leri (`place/textsearch/json`, `place/details/json`) kullanıyor; bu fiyatların legacy endpoint'lere birebir uygulanıp uygulanmadığı doğrulanmadı — Google 2025'te legacy/new API faturalamasını aynı SKU yapısına taşımış olabilir ama bu doküman bunu teyit etmedi.

**Öneri (V1)**: `ai_cost_logs`'un yanına aynı desende bir `tool_cost_logs` (operation, provider, calls, cost_usd_estimated, created_at) eklemek — mevcut `logAiCostRow` deseni birebir kopyalanabilir, migration ve kod hafif. Bu, gerçek maliyeti tahmin yerine ölçüm haline getirir.

## AgencyOS'a entegrasyon

- Maliyet hesap yöntemi mevcut mimariye **hiçbir değişiklik gerektirmez** — `getTokenRate()`/`TOKEN_RATES_PER_M` (`src/lib/openrouter.ts`) zaten input/output ayrık oranlıyla çalışıyor; `settings.ai_token_rates` satırı canlı ikame oranlarını deploy'suz güncelleyebilir (mevcut override mekanizması).
- `LEAD_INTEL_DAILY_CAP_USD` (`src/lib/leadIntel/budget.ts`) ve `DEFAULT_MONTHLY_CAP_USD` (`src/lib/ai/caps.ts`) üç senaryoda da bağlayıcı değil — mevcut haliyle bırakılabilir.
- `AUDIT_TOP`/`PREFILTER_TOP` (`src/lib/leadIntel/pipeline.ts`) ve `DAILY_TARGET`/`DAILY_OPPORTUNITY_TARGET` (`daily-scan/route.ts`, `selection.ts`) senaryoları gerçekten desteklemek için büyütülmesi gereken sabitler — bu doküman onları DEĞİŞTİRMEZ, yalnız senaryo hesaplarında varsayım olarak kullanır.
- Google Places tool-maliyeti gözlemlenebilirliği eksik — `logAiCostRow` deseni (`src/lib/ai/costLog.ts`) genişletilebilir bir şablon.

## MVP / V1 / V2

- **MVP**: Mevcut cap'ler (`$0.40/gün`, `$20/ay`) hiçbir senaryoda değiştirilmeden yeterli — üç senaryonun hepsinde LLM maliyeti cap'in çok altında. Ek iş yok.
- **V1**: Google Places/PSI/Apollo çağrılarını `tool_cost_logs`'a yazan hafif bir logger; bu, "gerçek maliyet" sorusunu tahminden ölçüme taşır ve Yoğun senaryodaki $20-50/gün belirsizliğini kapatır.
- **V2**: Konsey sistem promptları için OpenRouter prompt-caching (`cache_control`) — Yoğun senaryoda audit hacmi büyüdükçe %15-20 LLM tasarrufu potansiyeli; ayrıca model-adı doğrulama otomasyonu (deploy öncesi `/api/v1/models` karşı kontrolü) — kodun stale model-id riskini kalıcı çözer.

## Açık sorular / doğrulanamayanlar

- [UNKNOWN] `google/gemini-2.5-flash-lite`, `anthropic/claude-haiku-4-5`, `deepseek/deepseek-v4-pro` gerçekten OpenRouter'da 404 mü dönüyor, yoksa alias/redirect mi var? Gerçek `OPENROUTER_API_KEY` ile canlı bir istek atılmadı (bu görev kod değiştirmeme/yan etkisiz kalma kısıtı altında).
- [UNKNOWN] Legacy Google Places endpoint'lerinin (`place/textsearch/json`, `place/details/json`) 2026 faturalama SKU'su tam olarak hangi tier'a denk düşüyor — Google Cloud Console faturasından doğrulanmalı.
- [UNKNOWN] Apollo çağrı-başı gerçek maliyeti (plan/kredi bazlı, repo'da hardcoded değer yok).
- [ASSUMPTION] Bu dokümandaki "lead/gün" tanımı ve audit/outreach oranları benim yorumumdur; Normal/Yoğun senaryolarda `AUDIT_TOP` büyütme oranı gerçek bir ürün kararı değil, hesaplama varsayımıdır.
- [ASSUMPTION] Token sayıları prompt uzunluğundan kaba tahmindir; gerçek doğrulama `ai_cost_logs.input_tokens/output_tokens` sütunlarından canlı veriyle yapılmalı.
