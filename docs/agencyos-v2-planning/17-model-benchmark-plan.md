# 17 — Model Benchmark Plan (Kalite-Eşiği-Geçen EN EKONOMİK Model)

> Dalga 2 / motor dokümanı. Bu doküman **hangi modelin hangi görevi yapacağını veriyle** belirler. Merkez ilke: **premium model asla otomatik seçilmez** — her görev için *minimum kalite eşiğini geçen EN UCUZ* model seçilir; kalite deltasının maliyet deltasını hakedip-etmediği hesaplanır. Sonuçlar `16-openrouter-routing.md` preset↔operasyon eşlemesini son haline getirir.
>
> **Kaynak zinciri:** onaylı plan §4 (kanonik preset katalog, canlı-doğrulanmış 2026-07-11) · §7-5 (routing operasyon↔preset eşlemesi eval sonrası kesinleşir) · repo `src/lib/eval/harness.ts` (golden runner), `judge.ts` (rubrik + trajectory), `coldEmail.ts` (outreach), `offerMatcher`/`customerCategory` (deterministik service-match) · sibling `16-openrouter-routing.md` (verified katalog + presetler), `18-evaluation-framework.md` (3-katman eval, judge rubric).
>
> **Not (19-Benchmark raporu EKSİK):** Araştırma raporu 19 hiç üretilmedi (plan §3'te "eksik: 19 Benchmark"). Bu doküman o içeriği repo gerçeğinden + doğrulanmış katalogdan **yeniden inşa eder**. Bu doküman kod yazmaz; benchmark ölçüm protokolünü ve seçim kuralını tanımlar.

---

## 1. Neden sadece 6 görev — HER modeli HER görevde denemek israftır

Anti-bloat: sistemde onlarca LLM çağrı-noktası, katalogta 72 model var (`16-openrouter-routing.md:47`). Her model × her görev matrisi (72 × N) hem pahalı hem anlamsız — çoğu görev **deterministik** (Tier 0, LLM yok) ya da düşük-risk. Benchmark yalnızca **yüksek-değerli, kalite-hassas, tekrarlı** 6 göreve odaklanır:

| # | Görev | Skill (`07`) | Aday preset (`16`) | Neden benchmark |
|---|---|---|---|---|
| T1 | **Lead Dossier** (araştırma→sinyal→özet) | `build-lead-dossier` | `agencyos-research` | Tüm downstream'in girdisi; kötü dossier → kötü outreach |
| T2 | **Service matching** (LLM-destekli kısım) | `match-service` | `agencyos-fast-extract`→`professional` | Yanlış hizmet önerisi = güven kaybı |
| T3 | **Outreach writing** | `generate-outreach` | `agencyos-professional` | Voice DNA + halüsinasyon riski en yüksek |
| T4 | **Reply classification** (+/− + ~19 sınıf) | `classify-reply` | `agencyos-fast-extract` | Yüksek hacim → maliyet duyarlı; yanlış sınıf = yanlış sonraki-eylem |
| T5 | **Reply drafting** | `draft-reply` | `agencyos-professional` | Müşteriye gidecek yanıt; ton/doğruluk kritik |
| T6 | **Feedback extraction** (memory fact çıkarımı) | `extract-memory` | `agencyos-memory` | Hafızayı besler; poisoning riski |

**Deterministik olan benchmarklanmaz:** T2 Service matching'in **çekirdeği deterministik** (`offerMatcher.ts` evidence-gated, `customerCategory` 7 kategori — AI yalnız `otomasyon_fit`, plan §2). Benchmark **yalnız LLM-destekli alt-parça** (otomasyon_fit sınıflama + kanıt-özet) içindir; deterministik kısım Tier 0'da kalır (`16-openrouter-routing.md:80`). Aynı şekilde skorlama, tarih aritmetiği, suppression, follow-up state machine, imza/footer → **hiç benchmarklanmaz** (LLM'e verilmez).

---

## 2. Ölçüm metrikleri — göreve göre uygulanabilirlik

Dokuz metrik. Hepsi her göreve uygulanmaz; matris kalite eşiğini görev-özel yapar.

| Metrik | Ne ölçer | Nasıl (deterministik/judge/insan) |
|---|---|---|
| **golden accuracy** | Golden set beklenen çıktıyla eşleşme | `harness.ts` `runGoldenSet` — SAF, deterministik equals |
| **JSON compliance** | Yapısal çıktı geçerli-parse oranı | `parseColdEmailOutput` deseni (`coldEmail.ts:124`) + Zod parse başarı % |
| **hallucination rate** | Kanıtsız somut iddia / toplam çıktı | Layer-1 lint (`18-evaluation-framework.md`) + judge ikinci-göz |
| **voice match** | Cem'in sesi/tonuyla tutarlılık | judge rubric `professional-voice` kriteri (`18`) |
| **edit distance** | operatör düzeltme miktarı (normalize Levenshtein `original_body`↔`final_body`) | `mig 046` alanları; düşük = iyi |
| **rubric score** | 10-kriterli ağırlıklı judge skoru | `judge.ts` `judgeWithRubric` + cross-family scorer (`18`) |
| **human accept** | operatörün ilk-gösterimde onay oranı | `outreach_feedback` / `lead_match_feedback` (`18`) |
| **latency** | p50 / p95 yanıt süresi | `run_spans.duration_ms` (`spans.ts:76`) |
| **cost/call** | gerçek OpenRouter `usage.cost` × çağrı | `ai_cost_logs.actual_cost_usd` (`openrouter.ts:253`) |

**Görev × metrik uygulanabilirlik matrisi** (● zorunlu eşik · ○ izlenir, eşik değil · — uygulanmaz):

| Metrik | T1 Dossier | T2 Service | T3 Outreach | T4 Classify | T5 Reply-draft | T6 Feedback |
|---|---|---|---|---|---|---|
| golden accuracy | ○ | ● | — | ● | — | ● |
| JSON compliance | ● | ● | ● | ● | ● | ● |
| hallucination rate | ● | ● | ● | ○ | ● | ● |
| voice match | — | — | ● | — | ● | — |
| edit distance | ○ | — | ● | — | ● | — |
| rubric score | ○ | ○ | ● | — | ● | ○ |
| human accept | ○ | ● | ● | ● | ● | ○ |
| latency | ○ | ○ | ○ | ● | ○ | ○ |
| cost/call | ● | ● | ● | ● | ● | ● |

---

## 3. Golden set + rubrik — nasıl kurulur

**Golden examples (küçük, gerçek, elle etiketli).** Dış benchmark HEDEF DEĞİL (`18-evaluation-framework.md`, `20-evaluation-and-analytics`: TR-SMB nişi hiçbir genel benchmark setinde yok). Her görev için **10-25 gerçek örnek** Cem'in kendi lead verisinden elle etiketlenir:

| Görev | Golden örnek şekli | Beklenen (etiket) |
|---|---|---|
| T1 Dossier | gerçek lead + web sinyalleri | doğru sektör/sinyal/pain — `mig 033` evidence'a bağlı |
| T2 Service | lead + kanıt paketi | doğru hizmet + `otomasyon_fit` bool + kanıt-ref |
| T3 Outreach | lead dossier + rol | kabul-edilebilir taslak (Cem onaylı referans) |
| T4 Classify | gerçek yanıt metni | doğru +/− + ~19 sınıftan biri (`13-reply-intelligence`) |
| T5 Reply-draft | inbound + bağlam | Cem onaylı yanıt referansı |
| T6 Feedback | thread + sonuç | çıkarılması gereken fact + scope + confidence |

**Human rubric.** `judge.ts:70` `judgeWithRubric` deseni — enjekte edilen scorer. Writing görevleri (T3/T5) için 10-kriterli ağırlıklı rubric (`18-evaluation-framework.md §Layer2`); classification (T4) için accuracy + confusion matrix; extraction (T6) için fact-precision/recall (`judge.ts` trajectory `jaccardCounts` deseni uyarlanır). **Cross-family judge** (`16-openrouter-routing.md:113` `agencyos-judge`): GPT yazdı→Claude değerlendirir, öz-yanlılık kesilir.

**Harness reuse:** `harness.ts` `runGolden` deterministik görevlerde (T2 bool, T4 sınıf) doğrudan pass/fail verir; `judge.ts` subjektif görevlerde (T1/T3/T5/T6) rubric skoru üretir. **Yeni harness yazılmaz** — mevcut ikisi genişletilir.

---

## 4. Aday havuzu — preset zincirinden, dışına taşma minimal

Her görev için adaylar `16-openrouter-routing.md`'nin verified katalogundan (2026-07-11 canlı) ve o görevin preset zincirinden gelir. **Katalogun tamamı denenmez** — preset primary + fallback'ler + bir üst/alt tier'dan 1 komşu:

| Görev | Ana aday (preset primary) | Ucuz alt-aday | Kalite üst-aday (yalnız eşik geçmezse) |
|---|---|---|---|
| T1 Dossier | `gemini-3.1-flash-lite` (0.25/1.50) | `qwen3.6-flash` (0.19/1.13) | `gpt-5.6-luna` (1.00/6.00) |
| T2 Service | `qwen3.6-flash` (0.19/1.13) | — | `gpt-5.6-luna` (1.00/6.00) |
| T3 Outreach | `gpt-5.6-luna` (1.00/6.00) | `gemini-3.1-flash-lite` (0.25/1.50) | `claude-sonnet-5` (2.00/10.00) |
| T4 Classify | `qwen3.6-flash` (0.19/1.13) | `gemini-3.1-flash-lite` (0.25/1.50) | `qwen3.7-plus` (0.32/1.28) |
| T5 Reply-draft | `gpt-5.6-luna` (1.00/6.00) | — | `claude-sonnet-5` (2.00/10.00) |
| T6 Feedback | `qwen3.6-flash` (0.19/1.13) | — | `gpt-5.6-luna` (1.00/6.00) |

Fiyatlar $/M (in/out), `16-openrouter-routing.md §2` verified tablosundan. **opus-4.8/gpt-5.6-terra/sol havuzda YOK** — bunlar yalnız `agencyos-premium-deal` escalation (yüksek-değer, HITL); benchmark bunları default-aday yapmaz (plan §3: premium escalation-only, "opus-4.8 pahalıdır").

---

## 5. SEÇİM KURALI — kalite eşiğini geçen EN UCUZ model

Bu, dokümanın kalbi. **Yüksek-kaliteli değil, eşiği-geçen-en-ucuz** seçilir.

### 5.1 Minimum kalite eşiği (görev-özel, elle konur — kalibre edilir)

[ASSUMPTION: aşağıdaki eşikler başlangıç değerleridir; ilk 4-6 haftalık iç baseline'la kalibre edilir — dış benchmark hedef değil.]

| Görev | Zorunlu eşik(ler) |
|---|---|
| T1 Dossier | hallucination ≤ %2 · JSON compliance ≥ %98 |
| T2 Service | golden accuracy ≥ %95 (`otomasyon_fit`) · hallucination ~0 (deterministik çekirdek) |
| T3 Outreach | rubric ≥ 0.80 · hallucination ≤ %2 · voice match ≥ 0.75 · human accept ≥ baseline |
| T4 Classify | golden accuracy ≥ %90 · latency p95 ≤ 3s |
| T5 Reply-draft | rubric ≥ 0.80 · hallucination ≤ %2 · voice match ≥ 0.75 |
| T6 Feedback | fact-precision ≥ %90 · JSON compliance ≥ %98 |

### 5.2 Seçim algoritması

```
adayları maliyet artan sırada sırala
en ucuz aday A için:
  A tüm zorunlu eşikleri geçiyorsa → SEÇ A (dur)
  geçmiyorsa → sıradaki (daha pahalı) adaya geç
hiçbiri geçmezse → en yüksek-kaliteli adayı SEÇ + "eşik gerçekçi mi" gözden geçir
```

Sonuç: en ucuz aday zaten yeterliyse pahalı model **hiç seçilmez**. Bu, cost-funnel'in benchmark-seviyesi karşılığıdır (`16-openrouter-routing.md:103` "pahalı model her çağrıda çalışmaz").

### 5.3 Kalite deltası maliyet deltasını hakediyor mu? (escalation kararı)

İki aday **ikisi de eşiği geçtiğinde** her zaman ucuz olan seçilir. Bir aday eşiği geçmiyor, pahalı olan geçiyorsa — pahalıya geçiş **zorunlu** (eşik pazarlıksız). Ama eşik-üstü bir "daha iyi" için ödeme yapılıp yapılmayacağı şöyle hesaplanır:

```
ΔQ = quality(pahalı) − quality(ucuz)          // eşik-üstü kalite kazancı
ΔC = costPerCall(pahalı) − costPerCall(ucuz)   // ek maliyet
value_ratio = ΔQ / ΔC
```
Her iki aday eşiği geçiyorsa `ΔQ` **iş değeri üretmez** (eşik = "yeterli") → ucuz seçilir, `value_ratio` yok sayılır. Kural tek yönlüdür: **eşik-altı → pahalıya zorunlu geç; eşik-üstü → ekstra kaliteye ödeme yok.** İstisna yalnız `agencyos-premium-deal` escalation — A-tier lead'de operatör HITL ile bilinçli pahalı seçer (otomatik değil).

### 5.4 Örnek (T3 Outreach, hipotetik)

| Aday | rubric | hallucination | voice | cost/call | eşik? | karar |
|---|---|---|---|---|---|---|
| `gemini-3.1-flash-lite` | 0.72 | %3 | 0.68 | $0.004 | ✗ (rubric<0.80, voice<0.75) | ele |
| `gpt-5.6-luna` | 0.83 | %1.5 | 0.78 | $0.011 | ✓ | **SEÇ (en ucuz geçen)** |
| `claude-sonnet-5` | 0.88 | %1 | 0.82 | $0.021 | ✓ | ele (ekstra kaliteye ödeme yok) |

`gpt-5.6-luna` primary doğrulanır → `agencyos-professional` primary'si (`16-openrouter-routing.md:99-103`) benchmark'la teyit. `claude-sonnet-5` fallback/escalation kalır (eşik-üstü, otomatik değil). **[ASSUMPTION]** sayılar hipotetik; gerçek benchmark koşusu Sprint'te.

---

## 6. Preset↔operasyon eşlemesini kesinleştirme (16'ya geri besleme)

`16-openrouter-routing.md:203` "operasyon↔preset eşlemesi 17'nin kalite-eşiği sonuçlarıyla son halini alır" der. Benchmark çıktısı şunları kesinleştirir:

- T1 → `analyze_lead`/`batch_enrichment` gerçekten `agencyos-fast-extract`'te mi yoksa `research`'e mi (dossier kalitesi flash-lite'ta yeterli mi).
- T3/T5 → `draft_email`/reply-draft `professional` primary `gpt-5.6-luna` yeterli mi, yoksa `sonnet-5` primary mi olmalı.
- T4 → classify `fast-extract` primary `qwen3.6-flash` %90 accuracy tutuyor mu, yoksa `qwen3.7-plus` mı gerekli.
- T6 → `extract-memory` extract alt-yolu `qwen3.6-flash` fact-precision yeterli mi.

Sonuçlar `OPERATION_PRESET_MAP` (`16 §5`) tablosunu **veriyle** günceller — bugünkü eşleme [ASSUMPTION] etiketli, benchmark sonrası [CERTAIN].

---

## 7. Yürütme protokolü — tekrarlanabilir, ucuz

1. **Golden set dondur.** Her görev 10-25 elle-etiketli örnek; versiyonlanmış JSON (bundle, `knowledgeIndex.json` deseni — DB yok).
2. **Adayları koştur.** Her aday × golden set; çıktı + `usage.cost` + `duration_ms` `run_spans`'a. Küçük set → toplam maliyet birkaç $ (72 model değil, görev başı 2-3 aday).
3. **Skorla.** Deterministik görevler `harness.ts`; subjektif görevler `judge.ts` cross-family scorer.
4. **Seçim kuralını uygula** (§5). Kazanan preset primary'ye yazılır.
5. **Nightly re-verify.** Model drift (`16 §6`) preset modelini öldürürse benchmark'ın seçtiği primary fallback'e düşer + yeniden-benchmark tetiklenir (yeni model kataloga girince).
6. **Kalibrasyon.** İlk üretim baseline'ı (4-6 hafta) toplandıkça eşikler (§5.1) ve half-life gibi sabitler güncellenir.

---

## Grounding & açık noktalar

- **Repo atıfları:** `src/lib/eval/harness.ts:52` (runGoldenSet), `:81` (runGolden). `src/lib/eval/judge.ts:70` (judgeWithRubric), `:18-29` (jaccardCounts fact-precision uyarlaması), `:83-84` (fallback scorer). `src/lib/coldEmail.ts:124` (parseColdEmailOutput JSON compliance). `src/lib/openrouter.ts:253` (actual_cost_usd/generation_id). `src/lib/trace/spans.ts:76` (duration_ms). offerMatcher/customerCategory (deterministik service-match, plan §2). mig 033 (evidence), 046 (original_body/final_body edit-distance).
- **Sibling atıfları:** `16-openrouter-routing.md §2` (verified katalog fiyatları), `:99-103` (professional preset), `:113-116` (cross-family judge), `:203` (eşleme 17'de kesinleşir). `18-evaluation-framework.md` (10-kriter rubric, Layer-1 lint hallucination). `07-skill-registry.md` (6 skill). `13-reply-intelligence.md` (~19 sınıf T4).
- **Rapor 19 EKSİK:** plan §3 "eksik: 19 Benchmark" — bu doküman içeriği repo + verified katalogdan yeniden inşa etti; dış benchmark verisi HEDEF olarak kullanılmadı (`20-evaluation-and-analytics` TR-SMB niş uyarısı).
- **[ASSUMPTION]** §5.1 eşikleri + §5.4 sayıları başlangıç/hipotetik; gerçek benchmark koşusu Sprint'te, ilk baseline'la kalibre. Fiyatlar 2026-07-11 anlık — `/api/v1/models` ile re-verify (`16 §6`).
- **Cross-refs:** `16-openrouter-routing.md` (preset kaynağı), `18-evaluation-framework.md` (eval pipe + judge), `22-cost-model.md` (seçilen modellerin funnel maliyeti), `09-scoring-and-qualification.md` (T2 deterministik çekirdek).
