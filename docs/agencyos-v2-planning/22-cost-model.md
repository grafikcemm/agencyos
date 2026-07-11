# 22 — Cost Model (V2)

> Dalga 2 · motor dokümanı. Satış hattının gerçek $ maliyeti: cost funnel + 3 senaryo + birim ekonomi. **Temel bulgu: LLM maliyeti önemsiz; gerçek risk loglanmayan Google Places** → yeni `tool_cost_logs` (mig 052, `19` sahibi). Fiyatlar `16-openrouter-routing.md` §2 canlı-doğrulanmış katalogdan alınır — **yeniden türetilmez**.
>
> **Kaynak zinciri:** onaylı plan §4 (cost funnel) · araştırma raporu `24-cost-scenarios.md` (birim ekonomi, senaryolar) · `16-openrouter-routing.md` §2 (canlı fiyat, 2026-07-11 WebFetch) · repo: `src/lib/ai/caps.ts` ($20/ay), `src/lib/leadIntel/budget.ts` ($0.40/gün), `src/lib/ai/costLog.ts` (council parity), `src/lib/leads/scan.ts:42-82` + `src/app/api/cron/daily-scan/route.ts:182,217` (Places, UNLOGGED), `src/lib/leadIntel/psi.ts:8` (PSI $0).
>
> **Bu doküman kod yazmaz.** Tüm rakamlar tahmin; kesin ölçüm `tool_cost_logs` + `ai_cost_logs` canlı veriyle gelir.

---

## 1. Cost funnel (100 keşif → 1-2 fırsat)

Her aşama farklı maliyet-sürücüsüne sahip; pahalı LLM her lead'de çalışmaz (plan §4: deterministik normalize → cheap extract → budget research → professional yalnız qualified → premium yalnız 1-2/gün).

| Aşama | Adet (100 taban) | Maliyet sürücüsü | Tier |
|-------|------------------|-------------------|------|
| **Discovered** | 100 | ⚠ **Google Places** textsearch+details (LOGLANMIYOR) | tool |
| **Unique** (dedup sonrası) | ~70 | deterministik dedup (`UNIQUE(google_place_id)`) — **$0** | Tier 0 |
| **ICP eşleşen** | ~25 | deterministik ICP filtre (leadScoringV3, customerCategory) — **$0 LLM** | Tier 0 |
| **Qualified** | ~10 | council/dossier: `fast-extract`+`research` (+ evidence: PSI **$0**, HTML ~$0) | Tier 1-2 |
| **Outreach** | ~5 | `draft_email`: `professional` | Tier 3 |
| **Premium escalation** | **1-2** | `premium-deal` (sonnet-5 → terra; opus-4.8 yalnız explicit) | Tier 4 (HITL) |

**Kilit gözlem:** Funnel daraldıkça LLM devreye girer; en pahalı katman (premium) yalnız **1-2/gün**. Ama funnel **girişindeki** Places tüm 100 keşfe uygulanır → maliyet ağırlığı LLM'de değil, tool'da. [rapor 24 §4]

---

## 2. Birim ekonomi (canlı fiyat — `16` §2, yeniden türetilmedi)

Fiyatlar `16-openrouter-routing.md` §2 tablosundan ($/M girdi / çıktı, 2026-07-11 canlı):

| Preset / model | $/M in | $/M out | Kullanım |
|----------------|--------|---------|----------|
| `qwen/qwen3.6-flash` (fast-extract) | 0.1875 | 1.125 | council light, classify, prefilter |
| `google/gemini-3.1-flash-lite` (research) | 0.25 | 1.50 | dossier, şirket araştırma |
| `openai/gpt-5.6-luna` (professional) | 1.00 | 6.00 | draft_email, proposal, qualify |
| `anthropic/claude-sonnet-5` (premium primary) | 2.00 | 10.00 | professional fallback, premium primary |
| `openai/gpt-5.6-terra` (premium fallback) | 2.50 | 15.00 | premium escalation |
| `anthropic/claude-opus-4.8` (escalation-only) | 5.00 | 25.00 | ⚠ pahalı, yalnız explicit HITL |

**Operasyon-başı maliyet (rapor 24 canlı-ikame, doğrulanmış):**
- **Council/dossier** (audit 1 aday, 4 aşama + %8 retry): **~$0.005/aday**
- **draft_email** (outreach taslağı, luna): **~$0.0024/taslak**
- **draft_proposal** (sonnet-5): **~$0.011/teklif**
- **Araç:** PSI = **$0** (25k/gün ücretsiz kota) [CERTAIN]; HTML fetch ~$0; **Places textsearch ~$0.032/çağrı, details ~$0.035/çağrı** [ASSUMPTION — legacy endpoint SKU doğrulanmadı, §4].

---

## 3. Üç senaryo (per-lead / per-qualified / per-outreach / per-opportunity / aylık)

"Lead/gün" = `leads` kabul edilen yeni kayıt. Rakamlar canlı-ikame (bugün fiilen ödenecek yakın tahmin). `DAILY_OPPORTUNITY_TARGET=2` bugün sabit; senaryolar olası ölçek büyütmeyi modeller (kodda henüz karşılığı yok, `assumption:`).

### 3.1 Düşük — 5 lead/gün, 2 outreach/gün, ~3 follow-up/hafta

| Kalem | $/gün (canlı) | $/ay |
|-------|---------------|------|
| Council (~5 aday) | 0.025 | 0.75 |
| draft_email (2) | 0.0048 | 0.14 |
| follow-up taslağı (~0.43) | 0.0010 | 0.03 |
| **LLM toplam** | **~0.031** | **~0.94** |
| ⚠ **Places** (60-150 çağrı/gün) | **2.0–5.0** | **~60–150** |

- Per-lead LLM: ~$0.006 · Per-qualified LLM: ~$0.016 · Per-outreach: ~$0.0024 · Per-opportunity LLM: ~$0.016
- Premium escalation oranı: ~%0 (teklif ~1/ay) · $20 cap kullanımı: **<%5**

### 3.2 Normal — 15-20 lead/gün, 5-10 outreach/gün

| Kalem | $/gün (canlı) | $/ay |
|-------|---------------|------|
| Council (~9 aday) | 0.046 | 1.38 |
| draft_email (7.5) | 0.018 | 0.54 |
| follow-up (~1) | 0.0024 | 0.07 |
| draft_proposal (~0.14) | 0.0016 | 0.05 |
| **LLM toplam** | **~0.068** | **~2.03** |
| ⚠ **Places** (200-450 çağrı/gün) | **6.7–15.1** | **~200–450** |

- Per-lead LLM: ~$0.004 · Per-qualified LLM: ~$0.034 · Per-outreach: ~$0.0024 · Per-opportunity LLM: ~$0.034
- Premium oranı: ~%1.5 çağrı payı · $20 cap kullanımı: **<%11**

### 3.3 Yoğun — 50+ lead/gün, çok-pazar, çok premium deal

| Kalem | $/gün (canlı) | $/ay |
|-------|---------------|------|
| Council (~19 aday) | 0.097 | 2.91 |
| draft_email (17.5) | 0.042 | 1.26 |
| follow-up (~3) | 0.0072 | 0.22 |
| draft_proposal premium (2.5) | 0.028 | 0.83 |
| **LLM toplam** | **~0.174** | **~5.22** |
| ⚠ **Places** (600-1500 çağrı/gün) | **20–50** | **~600–1500** |
| Apollo (kredi bazlı) | [UNKNOWN] | [UNKNOWN] |

- Per-lead LLM: ~$0.0035 · Per-qualified LLM: ~$0.087 · Per-outreach: ~$0.0024 · Per-opportunity LLM: ~$0.087
- Premium oranı: ~%12 çağrı payı, ~%50 $-payı (heavy en pahalı segment) · $20 cap kullanımı: canlı-ikamede **~%26**

**Sonuç:** LLM üç senaryonun **hiçbirinde** aylık ~$5.22'yi geçmez (Yoğun canlı-ikame) — $20 cap'e göre önemsiz. **Gerçek maliyet kalemi Places** (aylık $60 → $1500), ve bugün **hiç ölçülmüyor**.

---

## 4. En büyük bulgu: Google Places loglanmıyor → `tool_cost_logs`

`ai_cost_logs` yalnız OpenRouter LLM'i kaydeder. `scan.ts:82` (textsearch) + `daily-scan/route.ts:217` (details) her çalıştığında Places çağırır ama **hiçbir tabloya yazmaz** — gözlemlenebilirlik sıfır. Worst-case `daily-scan` `maxAttempts=40` ilçe × sektör query × sonuç-başı details → günde 40-80+ çağrı (dedup zamanla düşürür, ama kesin sayı kod-okumasıyla belirlenemedi, rapor 24 §4).

**Çözüm (`19` §1 mig 052 sahibi):** `tool_cost_logs` (`tool`,`operation`,`units`,`cost_usd`,`run_id`,`created_at`) — mevcut `logAiCostRow` deseni (`costLog.ts`) birebir kopyalanır. Bu, "gerçek maliyet"i tahminden **ölçüme** taşır ve Yoğun senaryodaki $600-1500/ay belirsizliğini kapatır. `20-observability` System Health maliyet paneli bunu okur.

**[ASSUMPTION]** Places fiyatı (~$0.032 textsearch, ~$0.035 details): Google 2026 birleşik SKU (SafeGraph/mapatlas kaynaklı); legacy endpoint'lere (`place/textsearch/json`, `place/details/json`) birebir uygulanıp uygulanmadığı **doğrulanmadı** — Cloud Console faturasından teyit edilmeli.

---

## 5. Cap durumu — DEĞİŞİKLİK GEREKMİYOR

- **`DEFAULT_MONTHLY_CAP_USD=20`** (`caps.ts:9`, settings-override 5dk cache): üç senaryonun hiçbirinde LLM bu cap'i zorlamaz (Yoğun ~%26). **Değiştirme.**
- **`LEAD_INTEL_DAILY_CAP_USD=0.40`** (`budget.ts`): canlı-ikame oranıyla bile ~78 aday/gün karşılar; Yoğun'da 19 aday × $0.005 ≈ $0.097/gün, rahat. **Değiştirme.**
- Her iki cap = **güvenlik ağı, darboğaz değil**. Cap aşımı → `callOpenRouter` throw → council deterministik moda düşer (`computeDeterministicScores`, $0) — ek maliyet değil, maliyet önleme.
- **Council parity KIRILMAZ** (`costLog.ts:6-9`): canlı yolda `cost_usd` DAİMA tahmini oran; gerçek yalnız `actual_cost_usd`. Cap toplaması tahmini üstünden — bilinçli tasarım. Yeni `settings.ai_token_rates` satırı canlı-ikame oranlarını **deploy'suz** güncelleyebilir (mevcut override).

---

## 6. Premium escalation sınırlaması (maliyet kontrolü)

- `agencyos-premium-deal` (Tier 4) **default DEĞİL** — yalnız explicit escalation (A-tier lead, çok-sinyalli proposal, yüksek-riskli reply) ve **HITL onaylı** (`requiresApproval:true` → mig 043, `16` §3).
- `opus-4.8` ($5/$25, katalogun en pahalısı) **yalnız** premium içinde explicit escalation — otomatik asla. Sentez notunun "opus ucuz" iddiası YANLIŞ'tı (`16` §3 düzeltmesi).
- **Sınır:** premium ~1-2/gün (funnel §1). Yoğun senaryoda bile $-payı ~%50 ama mutlak ~$0.83/ay — cap'e uzak. `budgetUsdMax:0.2` (`catalog.ts sales.draft_proposal`) teklif-başı ek koruma.
- **Cache fırsatı (V2):** council'in 4 sistem promptu birebir tekrar → OpenRouter prompt-caching (`cache_control`) ~%15-20 tasarruf (rapor 24). MVP'de zorunlu değil.

---

## Grounding & açık noktalar

- **Repo atıfları:** `caps.ts:9` ($20/ay + resolveMonthlyCapUsd + 5dk cache), `budget.ts` ($0.40/gün lead-intel), `costLog.ts:6-9` (council parity, actual_cost_usd), `scan.ts:82` + `daily-scan/route.ts:217` (Places UNLOGGED), `psi.ts:8` (PSI $0), `catalog.ts` (budgetUsdMax:0.2).
- **Fiyat kaynağı:** `16-openrouter-routing.md` §2 (canlı WebFetch 2026-07-11) — yeniden türetilmedi; rapor 24 birim ekonomisiyle drift yok.
- **[ASSUMPTION]** Places $0.032/$0.035 legacy-endpoint SKU doğrulanmadı; "lead/gün" tanımı + AUDIT_TOP büyütme oranları rapor 24 yorumu (gerçek ürün kararı değil); token sayıları prompt-uzunluğu tahmini (`ai_cost_logs.input/output_tokens` canlı veriyle doğrulanmalı); "kazanılan zaman" / ölçek sabitleri (`DAILY_TARGET`/`AUDIT_TOP`) kodda henüz karşılıksız.
- **[UNKNOWN]** Apollo çağrı-başı fiyat (kredi bazlı, repoda yok); 3 ölü model ID'nin bugün gerçekten 500 mü döndürdüğü (canlı API-key testi yapılmadı).
- **Cross-refs:** `19-data-and-worker-architecture.md` §1 (mig 052 tool_cost_logs sahibi), §3.12 (cost-aggregation), `16-openrouter-routing.md` §2 (fiyat), `20-observability-and-analytics.md` §3 (maliyet paneli), `24-cost-scenarios` (araştırma temeli).
