---
Doküman: 20-evaluation-and-analytics
Tarih: 2026-07-11
Kaynak kalitesi: karışık
Güven: orta
AgencyOS'a etki: satış döngüsünün her otomatik çıktısına (dossier, taslak, follow-up kararı) 3 katmanlı bir kalite kapısı + KPI seti + izlenebilirlik ekler; mevcut eval/trace/feedback altyapısını genişletir, değiştirmez.
---

## Özet

AgencyOS'ta zaten üç ayrı değerlendirme parçası var ama birbirine bağlı değil: (1) saf/deterministik golden-eval koşucusu (`src/lib/eval/harness.ts`, `judge.ts`), (2) redaksiyonlu OTel-tarzı trace (`src/lib/trace/spans.ts`, tablo `run_spans`), (3) tek bir insan geri bildirim noktası — `lead_match_feedback` (uygun/uygun değil + neden). Yeni satış döngüsü (dossier → taslak → gönderim → yanıt → sonraki adım) bunların üstüne **3 katmanlı bir değerlendirme borusu** kurmalı: kod-seviyeli deterministik kontrol → model-judge rubrik → insan geri bildirimi; üçü de aynı `run_spans` zincirine bağlanmalı ki her otomatik karar geriye dönük izlenebilsin. En kritik somut bulgu: AgencyOS'ta kanıta-bağlı iddia doğrulama deseni (Lead Intelligence konseyinde `evidence_id` zorunluluğu, `src/lib/leadIntel/schemas.ts`) zaten var ve mükemmel çalışıyor — ama bu desen outreach taslak metnine (`src/lib/coldEmail.ts`) henüz **uygulanmamış**; oradaki "yasak klişe" ve "somut gözlem kullan" kuralları yalnızca prompt talimatı, kodda doğrulanmıyor. Bu, false-personalization ve hallucination risklerinin asıl kör noktası.

## 1) Üç katmanlı değerlendirme mimarisi

### Katman 1 — Deterministik kontrol (LLM'siz, saf fonksiyon)

| Kontrol | Ne yapar | Mevcut kod / durum |
|---|---|---|
| Şirket adı / domain doğru mu | Draft'taki işletme adı `leads.business_name` ile birebir mi | YOK — eklenmeli (basit string-eşleşme) |
| Kaynak var mı (evidence anchoring) | Taslaktaki her somut iddia bir `lead_evidence.id`'ye veya `pain_signals`/`proof_points` alanına bağlı mı | KISMEN — desen `src/lib/leadIntel/schemas.ts` (`validateDesignCritic`, `validateChair`) içinde var ama **coldEmail.ts'e taşınmamış**; `buildColdEmailSystemPrompt()` yalnız talimat veriyor, çıktı sonrası kod doğrulaması yok |
| Uydurma metrik var mı | Kanıtsız %/ROI/"X kat" ifadesi | KISMEN VAR — `UNPROVEN_CLAIM_RE` (`src/lib/services/catalog.test.ts`) statik hizmet kataloğunu test-time'da tarıyor; **üretilen taslak metnine runtime'da uygulanmıyor** — aynı regex'i draft-body üzerinde bir `lintOutreachCopy()` fonksiyonuna taşımak gerekir |
| Yasaklı ifade / klişe | "Değerli yetkili", "sinerji" vb. | Yalnız prompt seviyesinde (`coldEmail.ts` satır 62-63); post-generation regex kontrolü YOK |
| E-posta formatı | RFC 5322 syntax, boş konu satırı, placeholder kalıntısı (`[isim]`) | YOK — basit regex ile eklenebilir |
| Suppression listesinde mi | Alıcı daha önce itiraz etti / bounced mi | YOK — henüz suppression tablosu yok (bkz. `06-*` dokümanındaki reply-intelligence açığı); Layer 1'in en kritik eksik parçası |
| Follow-up zamanı doğru mu | `follow_up_sequences.due_at` geçmiş mi, sıra numarası (`step`) tutarlı mı | VAR — `follow_up_sequences` (migration 010) + cron promotor; saf doğrulama fonksiyonu yazılabilir |
| Aynı mesaj tekrar mı | Aynı lead'e aynı `sequence_step` içeriği ikinci kez mi gidiyor | YOK — `outreach_messages` şemasında dedup kontrolü yok |
| Proposal-gate | Teklif aşamasına geçmeden discovery alanları dolu mu | VAR — `src/lib/leads/pipelineGate.ts` (`canEnterProposal`, `missingProposalFields`) — doğrudan yeniden kullanılabilir |

Bu katmanın tamamı **saf fonksiyon** olmalı (girdi → çıktı, DB/LLM çağrısı yok) — mevcut `harness.ts`/`pipelineGate.ts` idiomunu birebir takip eder, `never-throws` ilkesiyle (Lead Intelligence council'daki gibi).

### Katman 2 — Model judge (LLM-as-judge, rubrik)

Mevcut `src/lib/eval/judge.ts` zaten rubrik altyapısını sağlıyor: `judgeWithRubric(criteria, output, scorer)` — kriter listesi + enjekte edilen `CriterionScorer`. Bunu genişletmek yeterli; yeniden yazmaya gerek yok. Önerilen kriter seti (ağırlıklı, 0-1 skorlu, ordinal 3-5 seviyeli — geniş ölçeklerde LLM judge'lar merkeze-çekilme yanlılığı gösteriyor [LIKELY, kaynak: Confident AI / Autorubric literatür taraması, 2026, güven orta]):

| Kriter | Ne ölçer | Ağırlık (öneri) |
|---|---|---|
| lead-fit | Sektör/ICP eşleşmesi mantıklı mı | 0.10 |
| service-fit | Önerilen hizmet, kanıtla tutarlı mı (Offer Matcher çıktısıyla çelişmiyor mu) | 0.15 |
| evidence-strength | Kanıt sayısı + `verified` oranı yeterli mi | 0.15 |
| personalization | Somut gözlem var mı, jenerik mi | 0.15 |
| professional-voice | Marka sesi (`PROMPT_STYLE_GUIDE.md`) ile tutarlı mı | 0.10 |
| clarity | Kısa, anlaşılır, 60-120 kelime aralığında mı | 0.05 |
| CTA | Net, tek, düşük-sürtünmeli bir eylem çağrısı var mı | 0.10 |
| spam-risk | Spam-tetikleyici kelime/format var mı | 0.05 |
| hallucination-risk | Katman 1'i geçen ama yine de kanıtsız iddia riski (LLM ikinci-göz kontrolü) | 0.10 (negatif ağırlık/ceza olarak da modellenebilir) |
| compliance-risk | KVKK/İYS footer + itiraz mekanizması eksik mi | 0.05 |

Negatif kriterler (spam-risk, hallucination-risk, compliance-risk) ceza olarak ele alınmalı; ağırlıklı ortalamanın paydasından çıkarılıp skoru yalnız aşağı çekmeli — bu, LLM judge'ların bilinen hoşgörü (leniency) yanlılığını dengelemek için literatürde önerilen bir yaklaşım [LIKELY, aynı kaynak grubu, 2026]. Judge modeli ucuz-tier olmalı (deterministik iş değil ama yüksek-hacim/düşük-risk bir "ikinci göz" — `openrouter.ts` OPERATION_MODEL_MAP'te ayrı bir `judge` operation key'i tanımlanabilir, en pahalı model asla varsayılan olmamalı).

### Katman 3 — Human feedback

Mevcut tek nokta `lead_match_feedback` (uygun/uygun_degil + `reason_code` + `note`) yalnız **dossier** (lead değerlendirmesi) için var. Outreach taslağı için aynı desende ama farklı bir taksonomi gerekiyor — sektörde yaygın kabul gören durum kümesi: `pending → approved | small_edit | large_edit | rejected` [LIKELY, kaynak: Glean/Velt/Zapier AI-review-workflow yazıları, 2026, güven orta — bunlar ürün blog'ları, akademik değil]. Önerilen alan seti (yeni tablo, `lead_match_feedback` deseniyle tutarlı, append-only):

| Alan | Amaç |
|---|---|
| `verdict` | approved / small_edit / large_edit / rejected |
| `reason_code` | jenerik_ton / yanlis_gozlem / cok_uzun / cta_zayif / diger |
| `original_body` / `final_body` | edit-distance hesabı için (şu an `outreach_messages.body` TEK alan — draft ile gönderilen ayrımı YOK, bu bir şema eksiği) |
| `sent` / `replied` / `outcome` | reply-intelligence ile bağlanacak (henüz yok) |

## 2) KPI tanımları

| KPI | Formül | Veri kaynağı (mevcut) | Hedef / benchmark | Katman |
|---|---|---|---|---|
| Dossier acceptance | uygun / (uygun+uygun_degil) | `lead_match_feedback` | İç baseline; dış kıyas yok | 3 |
| Outreach first-draft acceptance | approved(ilk gösterimde) / toplam taslak | YENİ alan gerekli (`outreach_messages` şu an approved/edited ayrımını tutmuyor) | İç baseline | 3 |
| Edit-distance | normalize Levenshtein(`original_body`,`final_body`) | YENİ alan gerekli | Düşükse iyi (taslak kalitesi yüksek) | 3 |
| Reply rate | replied / sent | `outreach_messages.status` + `src/lib/outreach/metrics.ts` (`computeOutreachMetrics`) zaten var | %3-10 arası geniş aralık; kaynaklar çelişiyor (bkz. not) [orta güven] | 3 |
| Positive-reply rate | olumlu yanıt / sent | Reply-intelligence GEREKTİRİR (şu an yalnız "replied" var, olumlu/olumsuz ayrımı yok) | %5+ iyi, %10+ mükemmel [Apollo/Instantly 2026, orta güven] | 3 |
| Meeting rate | meeting_at dolan / sent | `leads.meeting_at` (migration 012) VAR | %0.5-2.5 [Reachoutly 2026, orta güven] | 3 |
| Proposal rate | proposal_at dolan / meeting | `leads.proposal_at` VAR + `pipelineGate.ts` | İç baseline | 3 |
| Win rate | converted_at / proposal | `leads.converted_at`/`lost_at` VAR | İç baseline | 3 |
| Time-per-lead | ilk temas → outcome arası gün | `leads` timestamp kolonları VAR | İç baseline | analiz |
| Cost-per-qualified-lead | `lead_intel_runs.cost_usd` (gün) / o gün seçilen lead sayısı | `lead_intel_runs`, `lead_assessments` VAR | İç baseline | maliyet |
| Cost-per-positive-reply | toplam AI maliyet / olumlu yanıt | `ai_cost_logs` VAR + reply-intelligence GEREKLİ | İç baseline | maliyet |
| Cost-per-opportunity | toplam AI maliyet / proposal | `ai_cost_logs` + `leads.proposal_at` | İç baseline | maliyet |
| Follow-up completion rate | done=true / toplam due geçmiş | `follow_up_sequences` VAR | İç baseline | 1+3 |
| False-personalization rate | evidence_id'siz/yanlış iddia içeren taslak / toplam | YENİ — Katman 1 lintiyle üretilir | Hedef ~0 (yapısal olarak engellenebilir) | 1 |
| Hallucination rate | kanıtsız somut iddia içeren gönderilen mesaj / toplam gönderilen | YENİ — Katman 1+2 kombinasyonu | Hizmet seçiminde yapısal olarak ~%0 (Offer Matcher deterministik); serbest metin kişiselleştirmede referans aralık: RAG-faithfulness ~%4-9, özetleme ~%1-2.5 (frontier modeller, 2026) [Vectara HHEM / RAGTruth, orta güven — AgencyOS'a özgü ölçüm yok] | 1+2 |

**Not (çelişkili dış veri, açıkça işaretli):** Cold-email reply-rate benchmark'ları kaynağa göre 10 kata kadar farklılık gösteriyor — Belkins %0.45 (net-yeni kontaklara saf soğuk gönderim, 2025-2026) raporlarken, platform-geneli ortalamalar %3.43 (Instantly, 2026), "iyi" eşik %5-10 (Apollo, 2026) deniyor [ÇIKARIM: farklı ölçüm tanımları — net-yeni vs. tekrar-temas, tek e-posta vs. dizi]. AgencyOS TR-SMB nişi (İstanbul yerel işletmeler, düşük hacim, KVKK/İYS uyumlu) hiçbir genel benchmark setinde yok — **dış sayı hedef olarak KULLANILMAMALI**, yalnızca kaba mantık kontrolü (sanity check) olarak. Asıl hedef: kendi 4-6 haftalık iç baseline'ı oturtmak, sonra o baseline'a göre iyileşme izlemek.

## 3) Hallucination / grounding — mevcut deseni yeniden kullan

AgencyOS'ta zaten üretim-kalitesinde bir "iddia kanıta bağlı olmalı" deseni var: `src/lib/leadIntel/schemas.ts` içindeki `FindingSchema` (her bulgu `evidence_id` taşımak zorunda) + `validateDesignCritic`/`validateAutomation`/`validateChair` (parse-SONRASI kod doğrulaması — LLM'e güvenilmiyor, serbest metin asla karar verisi olmuyor). Bu, sektörde "misgrounding" ve "citation hallucination" olarak adlandırılan hataları yapısal olarak engelliyor [LIKELY, taksonomi kaynağı: hallucination-ölçüm literatürü, 2026, orta güven].

**Somut boşluk:** Aynı desen `coldEmail.ts` çıktısına uygulanmamış. Şu an LLM'e "en az bir somut gözlem kullan, uydurma" deniyor ama çıktı JSON'ı (`{subject, body}`) parse edildikten sonra hiçbir kod, body içindeki iddiaların `lead.pain_signals`/`lead.rating`/`lead.has_real_website` gibi gerçek alanlarla örtüştüğünü doğrulamıyor. En basit MVP çözümü: LLM'den serbest `body` yerine, Lead Intelligence konseyindeki gibi yapılandırılmış bir ara-şema istemek (`{opening_observation, evidence_ref, body_middle, cta}` gibi) ve `opening_observation`'ı yalnızca `lead.pain_signals`/`proof_points`/sayısal alanlardan biriyle regex/whitelist eşleşirse kabul etmek — tam konsey-seviyesi yapıya gerek yok, küçük bir alt-küme yeterli.

## 4) Observability delta — sistem ekranına eklenecek yeni sinyaller

Mevcut `/command-center` yalnız `totalSent` ve `positiveReplyRate` gösteriyor (`CommandCenterClient.tsx`). Eklenecekler:

- Gmail sync durumu (son başarılı senkron zamanı, bekleyen webhook sayısı) — Gmail entegrasyonu henüz YOK, bu sinyal o işle birlikte gelir.
- Bounce oranı — `outreach_messages.status='failed'` zaten `computeOutreachMetrics.bounceRate` içinde hesaplanıyor ama UI'da gösterilmiyor; UI'a eklemek küçük iş.
- Reply sayısı (ham) + olumlu/olumsuz kırılımı — ham sayı VAR, kırılım reply-intelligence gerektirir.
- Fallback oranı — hangi model-tier çağrılarının ucuz→pahalı fallback'e düştüğü; `ai_cost_logs.model_tier` + `cost_source` (migration 039) üzerinden hesaplanabilir, henüz agregasyon yok.
- Günlük AI maliyeti — `ai_cost_logs` + `getMonthlyCapUsd()` zaten var (`src/lib/ai/caps.ts`), günlük kırılım UI'da yok.
- Agent success rate — `agent_tasks.status IN ('queued','working','done','error')` (migration 009) üzerinden `done/(done+error)`; henüz agregasyon/UI yok.
- Katman 1 red oranı (kaç taslak deterministik kontrolden geçemedi) — yeni.
- Judge skoru dağılımı (Katman 2 ortalama/perçentil) — yeni.

## 5) Trace zinciri

Her otomatik karar (dossier üretimi → taslak üretimi → Katman 1/2 skorlama → operatör kararı → gönderim → yanıt işleme) `run_spans`'a `kind: 'llm'|'tool'|'internal'|'approval'` olarak zincirlenmeli — mevcut `recordSpan`/`buildSpan` (`src/lib/trace/spans.ts`) zaten redaksiyon (`redactAttributes`, hassas anahtar maskesi) ve retention (`DEFAULT_SPAN_RETENTION_DAYS=30`) sağlıyor; yeni bir mekanizma gerekmez, yalnızca outreach akışının her adımında `recordSpan()` çağrısı eklenmesi gerekir — `runId`/`stepId` ile lead_id + outreach_message_id bağlanarak bir mesajın tüm karar geçmişi tek sorguda çekilebilir hale gelir.

## AgencyOS'a entegrasyon (dosya bazlı)

- Katman 1 fonksiyonları → yeni `src/lib/outreach/lint.ts` (mevcut `pipelineGate.ts` idiomu: saf, testli, never-throws); `UNPROVEN_CLAIM_RE`'yi `catalog.test.ts`'ten import edilebilir bir yardımcıya taşı (`src/lib/services/catalog.ts` içine `lintSalesCopy(text)` ekle, hem statik katalog testi hem runtime draft lint aynı fonksiyonu çağırsın).
- Katman 2 → `src/lib/eval/judge.ts`'e yeni bir `OUTREACH_RUBRIC: RubricCriterion[]` sabiti + `judgeOutreachDraft()` sarmalayıcı; gerçek LLM çağrısı `CriterionScorer` olarak dışarıdan enjekte edilir (mevcut mimari zaten bunu zorluyor — test edilebilirlik korunur).
- Katman 3 → yeni tablo `outreach_feedback` (migration, `lead_match_feedback` şema deseniyle birebir), yeni route `POST /api/outreach/[id]/feedback` (`src/app/api/leads/[id]/feedback/route.ts` ile aynı guard zinciri: `requireApiUser`, `enforceSameOrigin`, `sanitizeWriteBody`).
- `outreach_messages` şemasına `original_body TEXT` kolonu eklenmeli (migration) — edit-distance ve first-draft-acceptance bunsuz hesaplanamaz.
- KPI agregasyonu → yeni salt-okunur endpoint `GET /api/admin/outreach-eval-summary` (mevcut `lead-intel-comparison/route.ts` deseniyle: zod query, `requireApiAccess`, tablo yoksa soft-fail).
- Trace → outreach pipeline adımlarına `recordSpan()` çağrıları; mevcut `run_spans` şemasında değişiklik gerekmez.
- `/command-center` (`CommandCenterClient.tsx`) → yukarıdaki yeni sinyaller için ek kart/satır; mevcut `totalSent`/`positiveReplyRate` kartlarının yanına eklenir, sıfırdan ekran açılmaz (basitlik ilkesi).

## MVP / V1 / V2

- **MVP:** Katman 1 lint (`src/lib/outreach/lint.ts`) + `original_body` kolonu + `outreach_feedback` tablosu + basit approved/small_edit/large_edit/rejected akışı. Mevcut reply/meeting/proposal/win rate'leri (zaten VAR olan `leads` timestamp'leri + `computeOutreachMetrics`) tek bir `outreach-eval-summary` endpoint'inde topla. Judge (Katman 2) henüz YOK — insan gözü birincil kalite kapısı kalır.
- **V1:** Katman 2 model-judge rubriği (ucuz-tier model, `judge.ts` üzerine); fallback oranı + agent success rate + günlük maliyet kartları `/command-center`'a; edit-distance hesaplaması canlı.
- **V2:** Reply-intelligence canlı olduğunda positive-reply-rate ve hallucination-rate (serbest metin kısmı) gerçek veriyle ölçülür; judge skorları ile insan verdict'i arasında uyum (Cohen's κ benzeri basit bir tutarlılık metriği) izlenip judge rubriği kalibre edilir.

## Açık sorular / doğrulanamayanlar

- Cold-email reply/meeting-rate için TR-SMB niş özelinde güvenilir bir dış benchmark yok — tüm bulunan kaynaklar (Belkins, Instantly, Apollo, Reachoutly, 2025-2026) ABD-ağırlıklı B2B SaaS outbound verisi; doğrudan aktarılamaz [UNKNOWN].
- LLM-judge ile insan verdict'i arasında ne kadar uyum (κ) yeterli sayılmalı — literatür κ≈0.6+ öneriyor [LIKELY] ama AgencyOS'un düşük hacminde (günde 2 fırsat) istatistiksel anlamlılık için yeterli örnek birikmesi aylar alabilir.
- "Hallucination rate" hedefi hizmet-seçiminde yapısal olarak ~0 olabilir (Offer Matcher deterministik) ama serbest metin kişiselleştirmede ölçüm yöntemi (otomatik claim-extraction mı, yalnız operatör red-flag'i mi) henüz seçilmedi [ASSUMPTION: başlangıçta yalnız operatör red-flag'i yeterli, otomatik claim-extraction V2'ye ertelenir].
- Edit-distance için normalize edilmiş Levenshtein mi, kelime-seviyeli diff yüzdesi mi kullanılacağı belirlenmedi — endüstri standardı yok, mühendislik kararı [ASSUMPTION].
- Agent success rate KPI'sinin `agent_tasks.status='error'` ile mi yoksa ayrı bir `agents` tablosu alanıyla mı tutulacağı netleşmedi; mevcut şemada `agents` tablosunda success_rate kolonu yok, hesaplama runtime agregasyon olmalı [LIKELY].
