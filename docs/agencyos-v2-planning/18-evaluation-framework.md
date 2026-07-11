# 18 — Evaluation Framework (3-Katman: Deterministik Lint + LLM-Judge + Human Feedback)

> Dalga 2 / motor dokümanı. Bu doküman satış döngüsünün her otomatik çıktısına (dossier, taslak, follow-up, reply) **3-katmanlı kalite kapısı** kurar: (1) LLM'siz deterministik lint (runtime, sadece test-time değil), (2) cross-family LLM-judge rubrik, (3) insan geri bildirimi. Mevcut eval/trace/feedback altyapısını **genişletir, değiştirmez**. En kritik somut hedef: kanıta-bağlı iddia doğrulama disiplinini konseyden `coldEmail.ts` **runtime'ına** taşımak — sistemin asıl kör noktası.
>
> **Kaynak zinciri:** araştırma raporu `20-evaluation-and-analytics.md` (3-katman mimarisi, KPI, grounding boşluğu) · repo `src/lib/eval/harness.ts` (golden), `judge.ts` (rubrik + trajectory), `trace/spans.ts` (redaksiyonlu span), `coldEmail.ts` (outreach — grounding boşluğu), `catalog.test.ts` `UNPROVEN_CLAIM_RE`, `leadIntel/schemas.ts` (evidence_id deseni) · sibling `16-openrouter-routing.md` (`agencyos-judge` cross-family), `17-model-benchmark-plan.md` (metrik), `04-domain-model.md` (`FeedbackEvent`, `MemoryItem`, `mig 046` original_body).
>
> **Bu doküman kod yazmaz** — eval sözleşmesini tanımlar. Dış benchmark HEDEF olarak kullanılmaz; kendi baseline'ımız kurulur.

---

## 1. Mevcut durum — üç eval parçası VAR ama bağlı DEĞİL

AgencyOS'ta üç ayrı değerlendirme mekanizması zaten kodlanmış, ama birbirine ve satış döngüsüne bağlı değil:

1. **Deterministik golden runner** — `src/lib/eval/harness.ts` (`runGoldenSet:52`, `runGolden:81`) — SAF, DB'siz, deterministik equals. Bugün mentor route + council deterministik skorlarını kilitliyor (parity guard).
2. **LLM-as-judge rubrik + trajectory** — `src/lib/eval/judge.ts` (`judgeWithRubric:70` — kriter listesi + **enjekte edilen** `CriterionScorer`, gerçek LLM çağrısı dışarıda → test edilebilir; `scoreTrajectory:48` tool-seçim precision/recall/order).
3. **Redaksiyonlu trace** — `src/lib/trace/spans.ts` (`recordSpan:81`, `buildSpan:62`, `redactAttributes:17` — ham prompt/secret span'e yazılmaz; `DEFAULT_SPAN_RETENTION_DAYS=30`).

Ve **tek insan-geri-bildirim noktası:** `lead_match_feedback` (`mig 033`, `04-domain-model.md:92-95` — `verdict`/`reason_code`/`note`), yalnız **dossier** (lead değerlendirmesi) için.

**Asıl boşluk (`20-evaluation-and-analytics` en kritik bulgu):** kanıta-bağlı iddia doğrulama deseni (`leadIntel/schemas.ts` `FindingSchema` — her bulgu `evidence_id` zorunlu, `validateChair`/`validateDesignCritic` parse-SONRASI kod doğrulaması) **mükemmel çalışıyor ama `coldEmail.ts`'e uygulanmamış.** Orada "yasak klişe" + "somut gözlem kullan" kuralları yalnız **prompt talimatı** (`coldEmail.ts:59-71`) — çıktı sonrası hiçbir kod doğrulaması yok. Bu, false-personalization ve hallucination'ın kör noktası.

---

## 2. Üç katmanlı eval pipe

Her outreach çıktısı (ve genelleştirilerek reply/proposal) sırayla üç katmandan geçer: ucuz→pahalı, deterministik→subjektif→insan.

```
LLM taslak üretir
  → Layer 1: deterministik lint (LLM'siz, saf, never-throws)   ── FAIL → HITL'e "red bayrağı" ile git, gönderilemez
  → Layer 2: LLM-judge rubrik (cross-family, ucuz tier)        ── düşük skor → HITL'e uyarıyla
  → Layer 3: human feedback (operatör verdict + edit)          ── öğrenme + edit-delta → memory (15)
```

Her adım `recordSpan()` (`spans.ts:81`) ile `run_spans`'a zincirlenir → bir mesajın tüm karar geçmişi tek sorguda çekilir.

---

## 3. Layer 1 — Deterministik lint (yeni `src/lib/outreach/lint.ts`)

**Amaç:** LLM'siz, saf fonksiyon, `pipelineGate.ts` idiomu (girdi→çıktı, DB/LLM yok, never-throws). Runtime'da çalışır — sadece test-time değil. Bu, `20-evaluation-and-analytics §Layer1` tablosunun somutlaştırılmasıdır.

| Kontrol | Ne yapar | Mevcut durum |
|---|---|---|
| **UNPROVEN_CLAIM_RE (runtime)** | Kanıtsız %/ROI/"X kat" iddiasını taslak gövdesinde yakalar | **KISMEN VAR** — `UNPROVEN_CLAIM_RE` `catalog.test.ts`'te statik katalog için **test-time** tarıyor; aynı regex draft-body'ye **runtime** uygulanmıyor → taşınır (§3.1) |
| **evidence grounding** | Her somut iddia bir `lead_evidence.id`/`pain_signals`/`proof_points`/sayısal alana bağlı mı | **KISMEN** — desen `leadIntel/schemas.ts`'te var, `coldEmail.ts`'e taşınmamış (§4) |
| şirket adı doğru | Taslaktaki işletme adı `leads.business_name` ile birebir mi | YOK — basit string-eşleşme |
| yasaklı klişe | "Değerli yetkili", "sinerji", "çözüm ortağı" vb. (`coldEmail.ts:62-63` listesi) | Yalnız prompt-seviyesi; runtime regex YOK → lint'e taşınır |
| e-posta formatı | RFC 5322 syntax, boş konu, placeholder kalıntısı (`[isim]`) | YOK — basit regex (`coldEmail.ts:71` prompt-only) |
| suppression | Alıcı İYS/suppression listesinde mi | `mig 047` suppression_list — Layer-1'in en kritik kapısı (gönderim bloke) |
| dedup | Aynı lead'e aynı `sequence_step` içeriği ikinci kez mi | YOK — `outreach_messages` dedup kontrolü eklenir |
| follow-up timing | `follow_up_sequences.due_at` tutarlı, `step` sıralı mı | VAR — `mig 010` + saf doğrulama fonksiyonu |
| proposal-gate | Teklif aşaması alanları dolu mu | VAR — `pipelineGate.ts` `canEnterProposal`/`missingProposalFields` doğrudan reuse |

### 3.1 `UNPROVEN_CLAIM_RE` runtime'a taşıma (test-time → runtime, DRY)

`catalog.test.ts`'teki regex import-edilebilir bir yardımcıya (`src/lib/services/catalog.ts` içine `lintSalesCopy(text)`) taşınır; **hem statik katalog testi hem runtime draft-lint aynı fonksiyonu çağırır** (`20-evaluation-and-analytics §entegrasyon`). Böylece: (a) test-time koruması bozulmaz, (b) üretilen taslak da aynı disiplinden geçer. `outreach/lint.ts` bu yardımcıyı çağırır + yukarıdaki diğer kontrolleri ekler; `lintOutreachCopy(draft, lead)` bir `LintResult { passed, violations[] }` döner (never-throws).

**FAIL davranışı:** Layer-1 red → taslak **gönderilemez**, HITL kartına "red bayrağı" + ihlal listesiyle gider (operatör görür, düzeltir veya atar). Bu **yapısal** engel — false-personalization rate hedefi ~0 (`20-evaluation-and-analytics` KPI).

---

## 4. evidence_id grounding'i coldEmail.ts runtime'ına taşımak (kilit iş)

En kritik somut hedef. Bugün `coldEmail.ts` LLM'e serbest `{subject, body}` üretttiriyor (`:73-76`); parse (`:124`) sonrası hiçbir kod body içindeki iddiaların gerçek alanlarla (`lead.pain_signals`/`rating`/`has_real_website`) örtüştüğünü doğrulamıyor.

**MVP çözümü (tam konsey-seviyesi gerekmez):** LLM'den serbest `body` yerine **yapılandırılmış ara-şema** iste (Lead Intelligence konseyi deseni, küçük alt-küme):
```
{ opening_observation, evidence_ref, body_middle, cta }
```
- `evidence_ref` → bir `lead_evidence.id` veya `pain_signals`/`proof_points` öğesi.
- `opening_observation` yalnız `lead.pain_signals`/`proof_points`/sayısal alanlarından biriyle **regex/whitelist eşleşirse** kabul (parse-sonrası kod doğrulaması — LLM'e güvenilmez, `leadIntel/schemas.ts` `validateChair` deseni).
- Eşleşmezse → Layer-1 FAIL (kanıtsız kişiselleştirme yakalanır).

Böylece `coldEmail.ts`'in imza/footer determinizmine (`:158-172` LLM link yazmaz) **iddia-grounding determinizmi** eklenir. Sonuç: outreach'in kanıt-uydurma yüzeyi yapısal olarak kapanır.

---

## 5. Layer 2 — LLM-judge rubrik (10 kriter, cross-family, ucuz tier)

`judge.ts:70` `judgeWithRubric` **genişletilir, yeniden yazılmaz** — yeni `OUTREACH_RUBRIC: RubricCriterion[]` sabiti + `judgeOutreachDraft()` sarmalayıcı; gerçek LLM `CriterionScorer` **dışarıdan enjekte** (mevcut mimari zaten zorluyor → test edilebilirlik korunur).

10 ağırlıklı kriter (`20-evaluation-and-analytics §Layer2`, 0-1 skorlu, ordinal 3-5 seviye — geniş ölçekte judge merkeze-çekilme yanlılığı gösterir):

| Kriter | Ölçer | Ağırlık |
|---|---|---|
| lead-fit | Sektör/ICP eşleşmesi mantıklı mı | 0.10 |
| service-fit | Önerilen hizmet kanıtla tutarlı (offerMatcher çıktısıyla çelişmez) | 0.15 |
| evidence-strength | Kanıt sayısı + `verified` oranı yeterli | 0.15 |
| personalization | Somut gözlem var mı, jenerik mi | 0.15 |
| professional-voice | Marka sesi (`coldEmail.ts` persona) tutarlı | 0.10 |
| clarity | Kısa, 60-120 kelime (`coldEmail.ts:61`) | 0.05 |
| CTA | Net, tek, düşük-sürtünmeli | 0.10 |
| **spam-risk** | Spam-tetikleyici kelime/format | 0.05 (ceza) |
| **hallucination-risk** | Layer-1'i geçen ama kanıtsız iddia (ikinci-göz) | 0.10 (ceza) |
| **compliance-risk** | KVKK/İYS footer + ret mekanizması eksik | 0.05 (ceza) |

**Negatif kriterler** (spam/hallucination/compliance) **ceza** olarak: ağırlıklı ortalamanın paydasından çıkarılıp skoru yalnız aşağı çeker — judge'ların bilinen hoşgörü (leniency) yanlılığını dengeler.

**Cross-family (öz-yanlılık kesici):** `agencyos-judge` preset (`16-openrouter-routing.md:113-117`) — **writer GPT → judge Claude; writer Claude → judge GPT.** Judge modeli **ucuz tier** (`agencyos-routine-judge` `gemini-3.5-flash`→`qwen3.7-plus`; premium çıktı için `agencyos-premium-judge` cross-family). En pahalı model asla varsayılan judge olmaz.

**[LIKELY]** Judge düşük-risk yüksek-hacim "ikinci göz" — insan gözünü değiştirmez, önceler. Skor eşiği-altı → HITL'e uyarıyla (bloke değil; operatör kararı).

---

## 6. Layer 3 — Human feedback (yeni `outreach_feedback`, mevcut deseni aynala)

`lead_match_feedback` (`mig 033`) yalnız dossier için. Outreach taslağı için **aynı desende, farklı taksonomi** yeni tablo — append-only:

| Alan | Amaç |
|---|---|
| `verdict` | `approved` / `small_edit` / `large_edit` / `rejected` (sektörde yaygın AI-review durum kümesi) |
| `reason_code` | `jenerik_ton` / `yanlis_gozlem` / `cok_uzun` / `cta_zayif` / `diger` |
| `original_body` / `final_body` | edit-distance (normalize Levenshtein) — **`mig 046`'da zaten planlı** (`04-domain-model.md:128`), icat DEĞİL |
| `sent` / `replied` / `outcome` | reply-intelligence'e bağlanır (`13`) |

**Migration numarası:** `outreach_feedback` yeni tablo; **numaralandırma sahibi `19-data-and-worker-architecture.md`** (plan §5 kanonik sahip). Bu doküman **numara icat etmez** — `lead_match_feedback` (`mig 033`) şema deseniyle birebir tutarlı olacağını belirtir, numarayı 19'a bırakır. `original_body`/`final_body` kolonları `mig 046`'da (email additive) zaten var → edit-distance için ayrı migration gerekmez.

**Route + guard:** `POST /api/outreach/[id]/feedback` — mevcut `src/app/api/leads/[id]/feedback/route.ts` ile **aynı guard zinciri** (`requireApiUser`, `enforceSameOrigin`, `sanitizeWriteBody`).

**Memory'ye bağ (K4):** `original_body`↔`final_body` edit-delta `15-memory-architecture.md §7` write-policy'sine besleme yapar → 3× tekrar → `voice_pattern` (tek edit asla kalıcı kural olmaz).

---

## 7. KPI seti — kendi baseline'ımız, dış benchmark HEDEF değil

`20-evaluation-and-analytics §2` KPI'leri. **Kritik uyarı:** cold-email reply-rate benchmark'ları kaynağa göre 10 kata kadar sapar (Belkins %0.45 ↔ Instantly %3.43 ↔ Apollo %5-10) ve TR-SMB nişi hiçbir genel sette yok → **dış sayı hedef DEĞİL, yalnız kaba mantık kontrolü.** Asıl hedef: 4-6 haftalık **iç baseline** kur, ona göre iyileşme izle.

| KPI | Formül | Kaynak | Katman |
|---|---|---|---|
| Dossier acceptance | uygun/(uygun+uygun_degil) | `lead_match_feedback` VAR | 3 |
| Outreach first-draft acceptance | approved(ilk)/toplam | `outreach_feedback` YENİ | 3 |
| Edit-distance | norm.Levenshtein(original,final) | `mig 046` alanları | 3 |
| Reply rate | replied/sent | `outreach/metrics.ts` `computeOutreachMetrics` VAR | 3 |
| Positive-reply rate | olumlu/sent | reply-intelligence GEREKLİ (`13`) | 3 |
| False-personalization rate | evidence'siz taslak/toplam | Layer-1 lint ÜRETİR (hedef ~0) | 1 |
| Hallucination rate | kanıtsız gönderilen/toplam | Layer-1+2 | 1+2 |
| Layer-1 red oranı | lint FAIL/toplam | YENİ | 1 |
| Judge skor dağılımı | Layer-2 ort/percentil | YENİ | 2 |
| Cost-per-positive-reply | AI maliyet/olumlu | `ai_cost_logs` + reply-intel | maliyet |

Meeting/proposal/win rate (`leads` timestamp'leri VAR) + follow-up completion (`follow_up_sequences` VAR) tek bir salt-okunur `GET /api/admin/outreach-eval-summary` endpoint'inde toplanır (`lead-intel-comparison` deseni: zod query, tablo yoksa soft-fail).

---

## 8. Trace zinciri — mevcut spans.ts reuse

Her otomatik karar (dossier→taslak→Layer1/2→operatör→gönderim→yanıt) `run_spans`'a `kind:'llm'|'tool'|'internal'|'approval'` (`spans.ts:8`) olarak zincirlenir. **Yeni mekanizma gerekmez** — `recordSpan()` çağrıları outreach adımlarına eklenir; `runId`/`stepId` ile `lead_id`+`outreach_message_id` bağlanır → bir mesajın tüm karar geçmişi tek sorguda. Redaction (`redactAttributes:17`) ham gövde/prompt'u yazmaz → PII güvenli.

---

## 9. Entegrasyon (dosya-bazlı) + MVP/V1/V2

**Dosya haritası:**
- Layer 1 → yeni `src/lib/outreach/lint.ts` (`pipelineGate.ts` idiomu) + `catalog.ts`'e `lintSalesCopy` (test+runtime paylaşır).
- Layer 2 → `judge.ts`'e `OUTREACH_RUBRIC` + `judgeOutreachDraft` (enjekte scorer, cross-family).
- Layer 3 → yeni `outreach_feedback` (numarası 19'da) + `POST /api/outreach/[id]/feedback` (mevcut guard zinciri); `mig 046` `original_body`.
- Grounding → `coldEmail.ts` yapılandırılmış ara-şema (§4).
- KPI → `GET /api/admin/outreach-eval-summary` (soft-fail).
- Trace → outreach adımlarına `recordSpan()`.

**MVP:** Layer-1 lint (`outreach/lint.ts`, UNPROVEN_CLAIM_RE **runtime**) + §4 grounding ara-şema + `outreach_feedback` (approved/small_edit/large_edit/rejected) + `outreach-eval-summary`. **Layer-2 judge henüz YOK** — insan gözü birincil kapı.

**V1:** Layer-2 cross-family judge (`judge.ts`, ucuz tier) + edit-distance canlı + fallback-oranı/agent-success/günlük-maliyet kartları (`20-observability`).

**V2:** reply-intelligence canlıyken positive-reply/hallucination (serbest metin) gerçek veriyle; judge↔insan verdict uyumu (basit Cohen's κ benzeri) izlenip rubric kalibre edilir.

---

## Grounding & açık noktalar

- **Repo atıfları:** `src/lib/eval/harness.ts:52`/`:81` (golden), `judge.ts:70` (judgeWithRubric enjekte scorer), `:48` (trajectory), `:83` (fallback scorer). `trace/spans.ts:8` (SpanKind), `:17` (redactAttributes), `:81` (recordSpan). `coldEmail.ts:59-71` (prompt-only kurallar — kör nokta), `:73-76` (serbest body), `:124` (parse), `:158-172` (deterministik imza/footer — grounding'in genişletileceği desen). `catalog.test.ts` (UNPROVEN_CLAIM_RE test-time). `leadIntel/schemas.ts` (FindingSchema/validateChair evidence_id deseni). `pipelineGate.ts` (canEnterProposal reuse). `outreach/metrics.ts` (computeOutreachMetrics). mig 010 (follow_up), 033 (lead_match_feedback), 046 (original_body/final_body), 047 (suppression).
- **Sibling atıfları:** `16-openrouter-routing.md:113-117` (agencyos-judge cross-family, ucuz tier). `17-model-benchmark-plan.md §2` (metrikler ortak). `04-domain-model.md:92-95` (FeedbackEvent), `:128` (mig 046 original_body). `13-reply-intelligence.md` (positive-reply). `19-data-and-worker-architecture.md` (outreach_feedback migration sahibi — numara icat edilmedi). `15-memory-architecture.md §7` (edit-delta → voice_pattern).
- **[CERTAIN]** `UNPROVEN_CLAIM_RE` bugün yalnız test-time (`catalog.test.ts`); `coldEmail.ts` çıktısında runtime doğrulama YOK — bu dokümanın birincil düzeltmesi.
- **[LIKELY]** judge↔insan κ≈0.6+ yeterli sayılır (literatür) ama günde ~2 fırsat hacminde istatistiksel anlamlılık aylar alır → judge V1, kalibrasyon V2.
- **[ASSUMPTION]** edit-distance normalize Levenshtein (mühendislik kararı, endüstri standardı yok); hallucination ölçümü başlangıçta yalnız operatör red-flag'i, otomatik claim-extraction V2.
- **Cross-refs:** `20-observability-and-analytics.md` (KPI kartları, sistem-health AYRI), `21-security-and-compliance.md` (email içeriği DATA, injection), `11-outreach-engine.md` (voice-guard→judge→HITL akışı), `17-model-benchmark-plan.md` (eşik).
