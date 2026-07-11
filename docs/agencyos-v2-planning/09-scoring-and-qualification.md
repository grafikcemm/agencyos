---
Doküman: 09-scoring-and-qualification
Dalga: 2 (Motor — Dalga 1 sözleşmelerine referansla)
Tarih: 2026-07-11
Durum: Motor spesifikasyonu (kod yazmaz; açıklanabilir skor kartını kilitler)
Bağımlılık: 04-domain-model.md · 06-agent-registry.md · 07-skill-registry.md · 08-lead-intelligence-engine.md · 16-openrouter-routing.md
Kaynak kalitesi: birincil (repo dosya:satır — leadScoringV3, highQualityLeadEngine, offerMatcher, personLeads/scoring) + plan §4/§5; eksik rapor 05-Scoring içeriği burada yeniden inşa edildi
---

# AgencyOS V2 — Scoring & Qualification (açıklanabilir skor kartı)

## 0. İlke: tek sayı DEĞİL, açıklanabilir kart

Bugün lead tek `potential_score` (0-100) + `lead_tier` (A-D) ile özetleniyor (`leadScoringV3.ts:48`, `highQualityLeadEngine.ts:181-195`). V2 bunu **silmez** — **açıklanabilir 11-boyutlu skor kartına** genişletir. Her boyut kendi aralığı, kuralı, kanıt kaynağı, eksik-veri davranışı ve güven düzeyiyle gelir; hiçbiri "kara kutu" değil. Kritik: **skorlama neredeyse tamamen deterministik** — LLM etkisi yok denecek kadar az (yalnız council design/ai skoru kanıt-kapılı, `council.ts:53-126` deterministik düşüş yolu her zaman var).

**Yeniden kullan, yeniden inşa etme (plan §7 anti-bloat):** Kart, mevcut iki motorun çıktılarını **yeni tablo açmadan** kompoze eder:
- **leadScoringV3** — 5 alt-skor + risk + route (`leadScoringV3.ts:38-54`).
- **highQualityLeadEngine** — 8 alt-skor + tier + conversion_probability (`highQualityLeadEngine.ts:14-43`).
- **offerMatcher/council** — service match score + design/ai skoru (`offerMatcher.ts:14-21`, `council.ts:53`).

**MVP'de yeni `lead_scores` tablosu AÇILMAZ** (04 LeadScore): açıklanabilirlik mevcut `score_reasons[]`/`risk_reasons[]`/`category_reasons[]` + `lead_assessments` ile taşınır. Human override → **FeedbackEvent** (`lead_match_feedback`, `mig 033`; skoru değiştirmez, öğrenmeyi besler).

---

## 1. Skor kartı — 11 boyut (özet matris)

Aralık her boyut 0-100 (aksi belirtilmedikçe). "LLM etkisi" sütunu ilkeyi gösterir: **çoğu None (deterministik)**.

| # | Boyut | Aralık | Deterministik kaynak (repo) | LLM etkisi | Eksik-veri davranışı |
|---|---|---|---|---|---|
| 1 | **ICP Fit** | 0-100 | `fit_score` (sektör priority+city bonus, `leadScoringV3.ts:196-202`) + `agency_fit_score` (`highQualityLeadEngine.ts:122`) | None | sektör=`other`→düşük; şehir yok→bonus 0 |
| 2 | **Need** | 0-100 | `evidence_score`+`pain_intensity_score` (`leadScoringV3.ts:166-193`, `highQualityLeadEngine.ts:103-119`) + council design/ai | Düşük (council, kanıt-kapılı) | kanıt yok→taban 40, düşük |
| 3 | **Timing** | 0-100 | `urgency_score` (ads/job sinyali+sektör, `leadScoringV3.ts:205-222`) | None | sinyal yok→taban 30 |
| 4 | **Data Confidence** | 0-100 | `confidence_score` (`highQualityLeadEngine.ts:140-145`) + evidence `verified` sayısı | None | alan yok→her eksik alan −20 |
| 5 | **Contactability** | 0-100 | `contactability_score` (phone/whatsapp/site, `leadScoringV3.ts:233-246`) | None | phone yok→−40 (disqualify sinyali) |
| 6 | **Service Fit** | 0-100 | `ServiceMatch.score` (offerMatcher, `offerMatcher.ts:56-82`) | None | eşleşme yok→0 (boş dizi) |
| 7 | **Portfolio Fit** | 0-100 | `match-portfolio` (gerçek işler ∩ sektör, `mig 048`) | None | portföy seed yok→0 |
| 8 | **Opportunity Value** | ₺ (+0-100 norm) | `expected_offer_value_tl`+`expected_monthly_value_tl` (`highQualityLeadEngine.ts:60-71,215-217`) | None | sektör yok→fallback {7000,9000} |
| 9 | **Effort** | 0-100 (düşük=iyi) | `difficulty_score` deseni (`personLeads/scoring.ts:73-76`) + kanal/erişim | None | email yok→+friction |
| 10 | **Risk** | 0-100 (düşük=iyi) | `risk_score` (davranışsal+freemail, `leadScoringV3.ts:71-99`) | None | flag yok→0 (nötr) |
| 11 | **Outreach Readiness** | bool + 0-100 | 08 [13] gate (≥2 kanıt+max(design,ai)≥70+kanal+suppression+consent) | None | kanıt/kanal eksik→`ready:false`+blockers |

---

## 2. Boyut-boyut sözleşme

Her boyut: **Aralık · Ağırlıklı kural · Kanıt kaynağı · Eksik-veri · Confidence · LLM etkisi · Human override.**

### 2.1 ICP Fit
- **Aralık:** 0-100. **Kural:** `profile.priority` (sektör dalga önceliği) + `getCityBonus` (İstanbul +15 … Şanlıurfa +2, `leadScoringV3.ts:142-159`), clamp. **K2:** B2B-tech firmografi (ekip yapısı/tech-stack) ikinci eşleşme boyutu — mevcut TR-KOBİ profili korunur.
- **Kanıt:** sektör string + city slug (Places). **Eksik-veri:** sektör tanınmaz (`other`, wave 3) → disqualify sinyali (`highQualityLeadEngine.ts:90-92`); şehir eşleşmez → bonus 0.
- **Confidence:** yüksek (deterministik tablo). **LLM etkisi:** None. **Override:** operatör "sektör yanlış" → FeedbackEvent `reason_code`, sektör öğrenme (`lead_match_feedback`, mig 033 → sektör rotasyonu).

### 2.2 Need (ihtiyaç yoğunluğu)
- **Aralık:** 0-100. **Kural:** `evidence_score` (site yok +20/+25, WhatsApp yok +10, form yok +8, yavaş +8, düşük puan +10, `leadScoringV3.ts:166-193`) ∪ `pain_intensity_score` (`highQualityLeadEngine.ts:103-119`) ∪ council `design_score`/`ai_score` (kanıt-kapılı).
- **Kanıt:** evidenceEngine sinyalleri + `lead_evidence` (PSI/HTML/screenshot). **Eksik-veri:** kanıt yok → taban 40, düşük Need. **Confidence:** council `oversell_warning`+`droppedCount` (kanıtsız bulgu, `council.ts:311`).
- **LLM etkisi:** Düşük — council LLM skor önerebilir ama deterministik `computeDeterministicScores` her zaman fallback (`council.ts:315-316`); LLM iddiası `evidence_id`'siz **reddedilir** (`council.ts:198`). **Override:** operatör "ihtiyaç abartılı" → FeedbackEvent.

### 2.3 Timing (aciliyet)
- **Aralık:** 0-100. **Kural:** taban 30 + aktif reklam +30 + işe-alım sinyali +20 + hızlı-dönüş sektörü +15 + sektörel dijital açık (painLevel×0.15) (`leadScoringV3.ts:205-222`).
- **Kanıt:** `has_ads_signal`/`has_job_signal` (evidenceEngine boolean); `mig 053` `signals.hiring`/`funding` (K2). **Eksik-veri:** sinyal yok → taban 30 (nötr).
- **Confidence:** orta (ads sinyali scan'de sınırlı hesaplanıyor, `customerCategory.ts:83-84` notu). **LLM etkisi:** None. **Override:** manuel timing flag → FeedbackEvent.

### 2.4 Data Confidence (veri güveni)
- **Aralık:** 0-100. **Kural:** taban 20 + website +20 + rating +20 + review>0 +20 + phone +20 (`highQualityLeadEngine.ts:140-145`); + `lead_evidence` doğrulanmış sayısı.
- **Kanıt:** kayıt tamlığı + evidence `verified`. **Eksik-veri:** her eksik alan skor düşürür (kendi kendini raporlar). **Confidence:** meta-boyut (diğerlerinin güveni). **LLM etkisi:** None. **Override:** yok (nesnel tamlık ölçüsü).

### 2.5 Contactability
- **Aralık:** 0-100. **Kural:** taban 20 + phone +40 (yoksa −40) + çalışan site +15 + WhatsApp +15 (`leadScoringV3.ts:233-246`); Quality: phone +50/whatsapp +25/site +15/email +10 (`highQualityLeadEngine.ts:95-100`).
- **Kanıt:** Places phone + evidence kanalları + Contact (`mig 045`). **Eksik-veri:** phone yok → −40 + disqualify (`highQualityLeadEngine.ts:86`, conversion=0 `:158`). **Confidence:** yüksek. **LLM etkisi:** None. **Override:** operatör kanal ekler → Contact güncelleme (skor yeniden hesaplanır, `rescoreWithRisk` deseni).

### 2.6 Service Fit
- **Aralık:** 0-100. **Kural:** `offerMatcher` — domain skoru (design/ai/hibrit ortalama) + sektör uyumu (+10/−15) + kanıt kapsamı (+4/tür, cap 12), clamp (`offerMatcher.ts:56-82`).
- **Kanıt:** `evidence_refs` (doğrulanmış kanıt ∩ `requiredEvidenceKinds`, `offerMatcher.ts:52`). **Eksik-veri:** eşleşme yok → **boş dizi** (asla hayali hizmet). **Confidence:** yüksek (katalog slug'ından seçim, uydurma imkânsız). **LLM etkisi:** None (match); `build-offer` framing yalnız rationale (07 §2.7). **Override:** operatör "yanlış hizmet" → FeedbackEvent `uygun_degil` (mig 033).

### 2.7 Portfolio Fit
- **Aralık:** 0-100. **Kural:** `portfolio_items` (Ali Cem'in gerçek işleri, `mig 048`) ∩ lead sektör/kanıt-türü; offerMatcher deseni. **Claim-gate:** yalnız `portfolio_claims.approved=true` dışa çıkar.
- **Kanıt:** `portfolio_items.sector_tags`/`service_slugs`. **Eksik-veri:** portföy seed yok → 0, boş (`assumption:` seed operatör girişi, 07 §2.6). **Confidence:** yüksek (gerçek tablo). **LLM etkisi:** None. **Override:** yok (nesnel eşleşme).

### 2.8 Opportunity Value (fırsat değeri)
- **Aralık:** ₺ (setup + monthly) + normalize 0-100. **Kural:** `SECTOR_OFFER_VALUES` (`highQualityLeadEngine.ts:60-71`) + şube ≥3 → +10 (`:227`); `money_score` bandBase×multiplier (`highQualityLeadEngine.ts:125-129`); kişi-lead `MONTHLY_VALUE_BY_BUCKET` (`personLeads/scoring.ts:49-54`).
- **Kanıt:** sektör + şube sayısı + firmografi. **Eksik-veri:** sektör tanınmaz → fallback {setup:7000, monthly:9000}. **Confidence:** orta (tahmin). **LLM etkisi:** None — **fiyat AI-uydurmaz** (price rules, 07 §2.16). **Override:** operatör fiyat girer → Proposal price_snapshot (mig 049).

### 2.9 Effort (çaba — düşük=iyi)
- **Aralık:** 0-100 (düşük iyi). **Kural:** `difficulty_score` deseni (`personLeads/scoring.ts:73-76`) — küçük şirket sahip/kurucu = düşük friction; büyük kurumsal C-suite = yüksek; email biliniyor → −10. Firma-lead için: kanal varlığı + coğrafya.
- **Kanıt:** Contact seniority/company_size + kanal. **Eksik-veri:** email yok → +friction. **Confidence:** orta. **LLM etkisi:** None. **Override:** yok.

### 2.10 Risk (düşük=iyi)
- **Aralık:** 0-100 (tipik 0-30, düşük iyi). **Kural:** freemail +6, kurumsal e-posta/site yok +5, ücretsiz örnek istedi +10, tüzel kişilik teyitsiz +8, uzun ödeme vadesi +8, scope creep +6, pazarlık +5 (`leadScoringV3.ts:71-99`). `potential_score = base − risk` (`:261`).
- **Kanıt:** email domain + **operatör-işaretli davranışsal flag** (`BehavioralFlags`, `leadScoringV3.ts:10-16`; MERSİS/Findeks YOK, yalnız gözlem). **Eksik-veri:** flag yok → risk 0 (nötr, `potential_score` değişmez). **Confidence:** yüksek (nesnel kurallar). **LLM etkisi:** None. **Override:** operatör flag ekler/kaldırır → `rescoreWithRisk` (`:120-133`, tam yeniden tarama gerektirmez) → FeedbackEvent.

### 2.11 Outreach Readiness
- **Aralık:** bool + 0-100. **Kural:** 08 [13] gate — (a) ≥2 doğrulanmış kanıt, (b) `max(design,ai)≥70`, (c) bilinen kanal, (d) suppression'da değil (`mig 047`), (e) consent uygun (`mig 047`). Hepsi geçerse `ready:true`.
- **Kanıt:** `lead_evidence` + Contact kanal + `suppression_list`/`consent_records`. **Eksik-veri:** herhangi biri eksik → `ready:false` + `blockers[]`. **Confidence:** yüksek (gate). **LLM etkisi:** None. **Override:** operatör manuel "gönder" → yine suppression/consent kapısı geçilmez (KVKK/İYS pazarlıksız, 06 §3.11).

---

## 3. Composite priority formülü (açıklanabilir)

Kart 11 boyut gösterir ama operatörün "bugün kimi ara" kararı için **tek sıralama** gerekir. Mevcut `potential_score` (V3) + `quality_score` (Quality) bu rolü zaten görüyor; V2 formülü **onları korur** ve kart boyutlarıyla açıklar.

**Mevcut ağırlıklar (KORUNUR — parity-guard, 06 §4):**

`base_score` (V3, `leadScoringV3.ts:248-254`):
```
base = evidence×0.25 + fit×0.25 + urgency×0.10 + money×0.20 + contactability×0.20
potential = clamp(base − risk)          // risk boyutu düşülür
```

`quality_score` (Quality, `highQualityLeadEngine.ts:148-154`):
```
quality = pain×0.28 + agency_fit×0.22 + money×0.20 + contactability×0.18 + urgency×0.12
```

**Composite priority (V2 — türetilmiş, yeni ağırlık İCAT ETMEZ):**
```
priority_score = potential_score                    // V3 kompozit (base − risk), 0-100
tier            = quality_engine tier (A-D)          // A: quality≥70 + A-tier eligible
gate            = Outreach Readiness (bool)          // ready değilse sıraya girmez
route           = routeForScore(potential)           // ≥75 manuel-hiper, ≥60 sekans, ≥45 nurture, <45 skip
```
- **Sıralama kuralı:** `gate=true` olanlar arasında `tier` (A>B>C) → `priority_score` desc → `Opportunity Value` desc. `gate=false` → "kanıt/kanal topla" kuyruğu (outreach değil).
- **Neden yeni tek-ağırlık yok:** V3 ve Quality ağırlıkları eval parity ile kilitli (`councilParity` deseni, 06 §4); yeni composite ağırlık icat etmek regresyon riski + açıklanabilirliği azaltır. Kart, mevcut iki kompoziti **yan yana** gösterip her alt-skoru `score_reasons[]` ile açar — bu zaten açıklanabilirlik.
- **`assumption:`** tier-önce mi score-önce mi sıralama, operatör tercihine göre UI toggle (Bugün kokpiti); varsayılan tier-önce (A-tier call_now, `highQualityLeadEngine.ts:201`).

---

## 4. Qualification gate + human override → feedback

### 4.1 Qualification (deterministik FSM)
- **Kapı:** proposal aşamasına terfi `pain_point`+`decision_maker`+`budget_band` zorunlu (`pipelineGate.ts`, `mig 020`; yoksa 422). **LLM YOK** (06 §3.2).
- **Tier→aksiyon:** A-tier `call_now`, B-tier `send_audit`, C `warm_up`, disqualify `discard` (`highQualityLeadEngine.ts:197-209`).
- **Disqualify:** phone yok / kamu-zincir-franchise / uygunsuz sektör (`highQualityLeadEngine.ts:73-92`) → tier D, conversion≤10.

### 4.2 Human override → FeedbackEvent (skoru değiştirmez)
Operatör bir skoru/kategoriyi/hizmeti "yanlış" işaretlerse:
- **Kayıt:** `lead_match_feedback` satırı — `verdict` (`uygun`/`uygun_degil`), `reason_code` (7 enum), `note` (`mig 033:82-85`, 04 FeedbackEvent).
- **Etki:** skoru **anlık değiştirmez** (deterministik motor kaynak-of-truth); sektör/scoring **öğrenmesini** besler (sektör rotasyonu, `mig 033` → learned rotation). İstisna: davranışsal Risk flag → `rescoreWithRisk` anlık yeniden hesaplar (`leadScoringV3.ts:120-133`, tam tarama gerektirmez).
- **Neden feedback, doğrudan-yaz değil:** deterministik skorun tek kaynağı korunur → parity/eval bozulmaz; override append-only öğrenme sinyali (04 FeedbackEvent). Migration referansları: FeedbackEvent `mig 033`; skor write-back `leads` kolonları (08 [9]); yeni tablo AÇILMAZ (04 LeadScore, plan §5).

---

## 5. Grounding & açık noktalar

- **Repo atıfları:** `leadScoringV3.ts:38-280` (5 alt-skor+risk+route+rescoreWithRisk), `highQualityLeadEngine.ts:14-296` (8 alt-skor+tier+conversion+category+disqualify), `leadIntel/offerMatcher.ts:37-88` (Service Fit skoru), `leadIntel/council.ts:53-126` (deterministik design/ai skor), `customerCategory.ts:61-107` (kategori), `personLeads/scoring.ts:60-111` (difficulty/market/earning kompozit — Effort/Value deseni), `pipelineGate.ts` (qualification gate, mig 020).
- **Yeniden inşa (eksik rapor 05-Scoring):** 11-boyutlu kart mevcut kod alt-skorlarının açıklanabilir kompozisyonu; yeni ağırlık icat edilmedi (mevcut V3/Quality ağırlıkları parity-korumalı).
- **`assumption:`** Portfolio Fit seed operatör girişine bağlı (07 §2.6); sıralama tier-önce/score-önce UI toggle; Effort firma-lead için Contact-türetilmiş (kişi-lead `difficulty_score` deseninden uyarlanır).
- **Cross-refs:** 08 (pipeline [9]/[13]) · 06 §3.2/§3.11 (Qualification/Compliance) · 04 LeadScore/FeedbackEvent · 16 (council preset) · 12-gmail (readiness→HITL).
- **DOKUNULMAZ:** skorlama LIFE DB'ye (habits/tasks) dokunmaz; hiçbir boyut `/gorevler`/`/aliskanliklar` verisi okumaz (04 §E).
