---
Doküman: 08-lead-intelligence-engine
Dalga: 2 (Motor — Dalga 1 sözleşmelerine referansla)
Tarih: 2026-07-11
Durum: Motor spesifikasyonu (kod yazmaz; hedef pipeline mimarisini kilitler)
Bağımlılık: 04-domain-model.md · 05-event-contracts.md · 06-agent-registry.md · 07-skill-registry.md · 16-openrouter-routing.md · 09-scoring-and-qualification.md
Kaynak kalitesi: birincil (repo dosya:satır) + plan §4/K2/K3 + araştırma 01-audit; eksik rapor 04-Discovery & 05-Scoring içeriği burada yeniden inşa edildi
---

# AgencyOS V2 — Lead Intelligence Engine (uçtan uca pipeline)

## 0. Tek cümle + çerçeve

Bu motor, ham internet verisini **asla doğrudan outreach'e** taşımaz: her adım deterministik-önce çalışır, LLM yalnız kanıt-kapılı sentez/çıkarım yapar, ve her iddia bir `evidence_id`'ye bağlanır (`council.ts:196-198` COMMON_RULES: "Kanıt listesinde OLMAYAN hiçbir şeyi iddia etme"). Pipeline **mevcut** iki motoru genişletir; sıfırdan kurmaz:

- **Deterministik çekirdek** (`leads/scan.ts` → `evidenceEngine` → `leadScoringV3` → `highQualityLeadEngine`), LLM'siz, canlı ve olgun (`scan.ts:153-185`).
- **Lead Intelligence v2 kanıt+konsey** (`leadIntel/*`, shadow), evidence-gated multimodal konsey (`council.ts:259-413`).

V2'nin eklediği: (a) **K2** B2B-tech firmografik/teknik sinyal katmanı + rol modeli (mevcut esnaf/KOBİ sinyalleri **korunur**, üstüne katmanlanır); (b) **K3** otonom araştırma — ayrı VM yok, mevcut `agent_tasks` kuyruğu + cron worker + güçlendirilmiş `build-lead-dossier` skill; (c) Contact Research + Outreach Readiness kapısı (yeni son adımlar).

**Anti-bloat kilidi (plan §7):** premium her lead'de çalışmaz — funnel deterministik→ucuz→araştırma→profesyonel sırasıyla daralır (§4). Tek operatör; yeni ajan yok (06 §0); yeni kuyruk yok (04 AgentRun).

---

## 1. Pipeline haritası (13 aşama, deterministik-önce)

Akış yönü tek: **Discovery → normalize → verify → dedup → evidence → signal → ICP → need → score → service → contact → dossier → readiness.** Her aşama tiplenmiş entity üretir; bağ event+entity'dir, ajan-sohbeti değil (06 §2).

```
[1] Source Discovery ──▶ [2] Normalize Company ──▶ [3] Domain Verify ──▶ [4] Dedup
       (Places/Apollo)        (geo/sector)            (DNS/HTTP)          (place_id/email)
                                                                              │
   ┌──────────────────────────────────────────────────────────────────────┘
   ▼
[5] Evidence Collection ──▶ [6] Signal Extraction ──▶ [7] ICP Match ──▶ [8] Need Analysis
    (PSI/HTML/screenshot)     (esnaf + K2 B2B-tech)     (sector/city/role)  (council C1∥C2)
                                                                              │
   ┌──────────────────────────────────────────────────────────────────────┘
   ▼
[9] Lead Score ──▶ [10] Service Match ──▶ [11] Contact Research ──▶ [12] Dossier ──▶ [13] Outreach Readiness
   (V3+Quality)      (offerMatcher C2)     (contacts+role K2)        (aggregate)     (evidence gate → HITL)
```

**Kanıt-kapısı (kırmızı çizgi):** [13] Outreach Readiness geçmeden hiçbir taslak üretilemez. [5]→[13] arası "kanıt yok" her yerde **düşük dataConfidence + düşük skor** demektir, throw değil (`council.ts:8-11` never-throws; `highQualityLeadEngine` disqualify yolu `:86-92`).

---

## 2. Aşama-aşama sözleşme

Her aşama için: **Deterministik mi / AI mı · Araç · Model preset (16) · Cache · Retry · Confidence · İnsan onayı.** Preset adları 16'dan; model ID hardcode YASAK.

### [1] Source Discovery — keşif havuzu
| Alan | Değer |
|---|---|
| Tür | **Deterministik** (tamamı) |
| Ne yapar | Google Places Text Search (`scan.ts:62-117`, MAX_PAGES=3, 60 sonuç) + Apollo People Search (`personLeads/*`) + city×sector rotasyon planı (`sectorRotation.ts`+`cityTargeting.ts`) |
| Araç | Google Places API, Apollo API (SSRF-guard mevcut `jobs/*` deseni) |
| Preset | **Yok** (LLM yok) |
| Cache | `google_place_id` mevcut → skip; scan_runs geçmişi (`scan.ts:298`) |
| Retry | Places `next_page_token` hazır-değil → 1 kısa retry (`scan.ts:92-99`) |
| Confidence | N/A (ham keşif) |
| İnsan onayı | Hayır — okuma; ama **ToolCost** (`mig 052`) Places/Apollo çağrısını loglar (gerçek maliyet riski LLM değil tool, 04 ToolCost) |
| Not | Kariyer/ATS motoru (`jobs/*`) bu suit DIŞI — operatöre çalışır, CRM'e değil (01-audit §4) |

### [2] Normalize Company — firma normalizasyonu
| Alan | Değer |
|---|---|
| Tür | **Deterministik** |
| Ne yapar | `normalizeLocation`+`normalizeSector` (`scan.ts:54-56`); şehir slug (İ→i doğru, `leadScoringV3.ts:150-159`); telefon/website/rating parse (`scan.ts:146-159`) |
| Araç | Places Place Details (`scan.ts:146`) |
| Preset | Yok |
| Cache | Details response tek çağrı/place |
| Retry | 0 |
| Confidence | `confidence_score` temeli (website+rating+review+phone varlığı, `highQualityLeadEngine.ts:140-145`) |
| İnsan onayı | Hayır |
| Not | Firma=lead **aynı satır** (`leads`, ayrı `companies` yok — 04 Company). Telefonsuz kayıt burada elenir (`scan.ts:151` skip) |

### [3] Domain Verify — alan/varlık doğrulama
| Alan | Değer |
|---|---|
| Tür | **Deterministik** (çekirdek); LLM opsiyonel (yalnız belirsiz isim eşleme) |
| Ne yapar | Domain DNS/HTTP canlılık + sektör-tutarlılık heuristiği; hayalet kayıt eleme (`verify-company` skill, 07 §2.1) |
| Araç | DNS, HTTP HEAD (SSRF-guard) |
| Preset | `agencyos-research` — **yalnız** belirsiz isim eşlemede; çoğu pure-code (16: Tier 2) |
| Cache | domain-cache TTL (07 §2.1 idempotency) |
| Retry | DNS timeout → `verified:false` + düşük confidence, throw yok |
| Confidence | `{ verified, domainLive, confidence }` çıktısı |
| İnsan onayı | Hayır (read) |
| Not | **Skill:** `lead.verify_company` (V1, MVP-sonrası). MVP'de `has_real_website`/`is_slow_or_dead` (evidenceEngine) yeterli doğrulama sağlar |

### [4] Dedup — tekilleştirme
| Alan | Değer |
|---|---|
| Tür | **Deterministik** (mutlak — LLM YASAK, 07 §0: dedup = pure-code) |
| Ne yapar | `UNIQUE(google_place_id)` upsert (`scan.ts:273-275`); mevcut e-posta korunur (`scan.ts:269`); Contact katmanında `UNIQUE(lower(email))` (04 Contact, `assumption:`) |
| Araç | Postgres upsert `onConflict` |
| Preset | Yok |
| Cache | pre-check existing rows (`scan.ts:131-138`) → gerçek insert vs update sayımı |
| Retry | eksik-kolon `PGRST204` → strip-retry (`scan.ts:278-284`) |
| Confidence | N/A |
| İnsan onayı | Hayır |
| Not | Apollo `person_leads` ayrı sistem; Contact köprüsü `mig 045` soft-ref (hard FK yok, iki lead sistemi ayrık) |

### [5] Evidence Collection — kanıt toplama
| Alan | Değer |
|---|---|
| Tür | **Deterministik** (fetch tamamı — 07 §2.2: "PSI/HTML/Places fetch = pure-code") |
| Ne yapar | evidenceEngine website sinyalleri (`scan.ts:153`) + Lead Intel v2 top-4: PageSpeed + HTML fetch + Places + screenshot (private `lead-evidence` bucket, `mig 032`); her parça `lead_evidence` satırı, `verified` bayraklı (04 SourceEvidence) |
| Araç | PageSpeed API, HTML fetch, Places, screenshot; SSRF-guard |
| Preset | Yok (fetch); tüketici konsey adımı [8]'de |
| Cache | `forceRefresh` yoksa mevcut dossier reuse (07 §2.2); screenshot retention cron |
| Retry | fetch fail → `fetch_failed` payload (kanıt olarak sayılır, `council.ts:76-78`), throw yok |
| Confidence | her evidence satırında `confidence`+`verified` |
| İnsan onayı | Hayır |
| Not | **Kırmızı çizgi:** ham HTML asla ajana girmez — yalnız `buildEvidenceDigest` özeti (`council.ts:130-141`). Kanıt id'li digest = injection yüzeyini keser |

### [6] Signal Extraction — sinyal çıkarımı (K2 katmanı)
| Alan | Değer |
|---|---|
| Tür | **Hibrit** — tech-stack fingerprint deterministik ön-filtre; rol-bağlamlı yorum LLM (07 §2.3) |
| Ne yapar | **Mevcut (KORUNUR):** boolean kolonlar `has_ads_signal`/`has_job_signal`/`instagram_as_site`/`has_whatsapp`/`has_form`/`has_online_booking` (`scan.ts:222-228`). **K2 EK (katmanlı):** `signals` tablosu (`mig 053` ops.) — `tech_stack`, `hiring`, `team_size`, `funding` + `roleSignals{owner,cto,cfo,marketing}` |
| Araç | HTML header/pattern fingerprint (pure-code); dossier girdisi (LLM) |
| Preset | `agencyos-fast-extract` (signal-tag, JSON — 16: Tier 1, qwen3.6-flash) |
| Cache | dossier+versiyon başına saf |
| Retry | 1 (fast-extract preset) |
| Confidence | kanıtsız sinyal **reddedilir**; her sinyal `evidence_id` + `confidence` (04 Signal) |
| İnsan onayı | Hayır (read) |
| Not | **K2 layering ilkesi:** esnaf sinyalleri (WhatsApp/randevu yok → `otomasyon_fit`) SİLİNMEZ; B2B-tech sinyalleri (tech-stack/hiring/ekip) **üzerine** eklenir. `extract-signals` (`lead.extract_signals`, MVP) rol-farkındalığı burada başlatır; Outreach [personalizasyon] bunu tüketir |

### [7] ICP Match — ideal müşteri profili eşleşmesi
| Alan | Değer |
|---|---|
| Tür | **Deterministik** |
| Ne yapar | `matchSectorProfile` (sektör önceliği/dalga/painLevel/ticketBand, `leadScoringV3.ts:163`) + city bonus (`:150-159`, 20 şehir) + `deriveCustomerCategory` 7 kategori (`customerCategory.ts:61-107`) + **K2 rol** (Contact.role owner/cto/cfo/marketing, 04 Role) |
| Araç | Yok (pure-code) |
| Preset | Yok |
| Cache | saf fonksiyon |
| Retry | 0 |
| Confidence | `fit_score` (sektör+şehir, `leadScoringV3.ts:196-202`); ICP Fit skoru (09) |
| İnsan onayı | Hayır |
| Not | ICP genişlemesi (K2): mevcut TR-KOBİ/tasarım profili **korunur**; B2B-tech firmografi (ekip yapısı/tech-stack) yeni bir eşleşme boyutu ekler — `deriveCustomerCategory` öncelik sırası bozulmaz (web_yok → ... → otomasyon_fit → genel_tasarim, AI en sona, `customerCategory.ts:6-7`) |

### [8] Need Analysis — ihtiyaç analizi (council C1∥C2→C3→C4)
| Alan | Değer |
|---|---|
| Tür | **Hibrit** — multimodal konsey (LLM) + deterministik düşüş yolu |
| Ne yapar | C1 Design Critic (screenshot image_url) ∥ Automation Analyst (paralel, `council.ts:284-307`) → C2 deterministik offerMatcher → C3 Skeptic (kanıtsız iddia reddi) → C4 Chair; **her aşama budget-cap'li** ($0.40/gün, `council.ts:158-161`), aşımda deterministik |
| Araç | screenshot signed URL (multimodal); evidence digest |
| Preset | `agencyos-fast-extract` (C1/C3, vision — 16: zincirdeki 3 model de vision) + `agencyos-professional` (C4 Chair `lead_intel_chair`) |
| Cache | assessment koşu-başına (`lead_assessments.run_date`) |
| Retry | hata-ekli 1 retry, sonra deterministik (`council.ts:171-183`) |
| Confidence | `oversell_warning` + `droppedCount` (kanıtsız bulgu sayısı, `council.ts:311-312`) |
| İnsan onayı | Hayır (read; council never-throws) |
| Not | **Halüsinasyon-servis imkânsız:** Chair yalnız `allowedSlugs`'tan seçer (`council.ts:368,395`). C2 offerMatcher katalog `slug`'ından seçer (`offerMatcher.ts:48-52` kanıt-kapısı). Yüzde/ROI kanıtsız YASAK (`council.ts:198`) |

### [9] Lead Score — açıklanabilir skorlama
| Alan | Değer |
|---|---|
| Tür | **Deterministik** (mutlak — `computeDeterministicScores` LLM'siz, `council.ts:53-126`) |
| Ne yapar | V3 5 alt-skor + risk (`leadScoringV3.ts:161-280`) + Quality tier A-D (`highQualityLeadEngine.ts:79-296`) + council design/ai skoru → **açıklanabilir skor kartı** (detay 09) |
| Araç | Yok |
| Preset | **Yok** — halüsinasyon-skor imkânsız (07 §2.4) |
| Cache | saf fonksiyon; write-back `leads` kolonları (`scan.ts:208-262`) |
| Retry | 0 |
| Confidence | `score_reasons[]` + `risk_reasons[]` (`leadScoringV3.ts:52-53`) her puanı gerekçelendirir |
| İnsan onayı | Hayır — ama **operatör override → FeedbackEvent** (09; skoru değiştirmez, öğrenmeyi besler) |
| Not | Detaylı skor kartı → **09-scoring-and-qualification.md** |

### [10] Service Match — hizmet eşleştirme
| Alan | Değer |
|---|---|
| Tür | **Deterministik** (offerMatcher C2) |
| Ne yapar | Doğrulanmış kanıt ∩ `service_catalog` → skorlu `ServiceMatch[]` + `evidence_refs` (`offerMatcher.ts:37-88`); Portfolio eşleşmesi `match-portfolio` (Ali Cem'in gerçek işleri, `mig 048`, claim-gate approved-only) |
| Araç | Yok |
| Preset | Yok (match); `agencyos-professional` yalnız `build-offer` framing rationale (07 §2.7) |
| Cache | saf |
| Retry | 0 |
| Confidence | `score` + `reasons[]` (`offerMatcher.ts:56-79`) |
| İnsan onayı | Hayır |
| Not | Eşleşme yok → **boş dizi** (asla hayali hizmet, `offerMatcher.ts:52`); kanıt yok → `mini_audit` en güvenli açı (07 §2.7) |

### [11] Contact Research — kişi/rol araştırma (K2)
| Alan | Değer |
|---|---|
| Tür | **Hibrit** — enrichment fetch deterministik; rol/seniority çıkarımı hafif LLM |
| Ne yapar | `contacts` (`mig 045`) — full_name/email/phone/role/title/seniority; `leads`↔`person_leads` köprü; Apollo seniority→power haritası mevcut (`personLeads/scoring.ts:24-36`) |
| Araç | Apollo enrichment; DNS/HTTP; SSRF-guard |
| Preset | `agencyos-fast-extract` (rol/unvan sınıflama, JSON) — çoğu deterministik |
| Cache | contact upsert; `verified` bayrağı |
| Retry | 1 (fast-extract) |
| Confidence | `contacts.verified` + `source` provenance (04 Contact) |
| İnsan onayı | Hayır (read); **PII (C9):** email/phone/full_name sensitive, RLS default-deny |
| Not | Rol modeli (K2) — CTO→verimlilik, CFO→maliyet, sahip→büyüme (plan §1). Enum kolon yeter (ayrı `roles` tablosu MVP-fazlası, 04 Role). Contact yoksa firma-genel açı; personalizasyon graceful düşer |

### [12] Dossier — dosya kompozisyonu (K3 çekirdeği)
| Alan | Değer |
|---|---|
| Tür | **Hibrit** — aggregate deterministik; assessment sentezi LLM |
| Ne yapar | `build-lead-dossier` (`lead.build_dossier`, MVP) — lead + contacts + signals + lead_evidence + lead_service_matches + Company Memory birleşimi, read-time kompoze (04 LeadDossier); her iddia `evidence_id`'li |
| Araç | PageSpeed/HTML/Places/screenshot (`lead.audit_website` sarar, 07 §2.2) |
| Preset | `agencyos-research` (dossier ön-taslak — 16: Tier 2, gemini-3.1-flash-lite→gpt-5.6-luna) |
| Cache | `forceRefresh` yoksa reuse; persist `lead_assessments.chair_verdict jsonb` |
| Retry | 1 |
| Confidence | `dataConfidence` çıktısı; kanıt eksik → düşük (never-throws) |
| İnsan onayı | Hayır (read + internal write) |
| Not | **MVP'de yeni `dossiers` tablosu AÇILMAZ** — mevcut `lead_assessments` + read-model yeter (04 LeadDossier). Otonom araştırma ajanının çekirdeği (K3, §3) |

### [13] Outreach Readiness — outreach hazırlık kapısı (yeni)
| Alan | Değer |
|---|---|
| Tür | **Deterministik gate** |
| Ne yapar | Taslak üretiminden ÖNCE zorunlu kapı: (a) ≥2 doğrulanmış kanıt, (b) `max(design,ai)≥70` (Lead Intel selection eşiği), (c) bilinen kanal (phone/email/whatsapp), (d) suppression'da değil (`mig 047`), (e) consent uygun (`mig 047`) |
| Araç | Yok (pure-code kontroller) |
| Preset | Yok |
| Cache | saf |
| Retry | 0 |
| Confidence | `ready:boolean` + `blockers[]` |
| İnsan onayı | Hayır (gate); ama sonuç Outreach [rol-aware taslak] → **HITL onay** (12-gmail) |
| Not | **Bu adım kırmızı çizgidir:** ham internet verisi buradan geçmeden outreach yok. Selection kriteri mevcut (`leadIntel/selection.ts`: ≥2 kanıt + max(design,ai)≥70 + bilinen kanal, 01-audit §5) — bu kapı onu outreach-öncesine taşır |

---

## 3. K3 — Otonom araştırma ajanı (ayrı VM YOK)

**Kilit karar (plan K3):** Otonom "internette gezip şirketi analiz eden, sinyal çıkaran, CRM'i otomatik güncelleyip puanlayan" ajan = **mevcut worker + skill**, ayrı süreç/VM değil.

**Mimari (04 AgentRun + 06 §0):**
1. **Kuyruk:** `agent_tasks` (Postgres-as-queue, lease/retry, `mig 038` ADR-001) — yeni kuyruk kurulmaz. Adım `status`: `queued/working/done/error/blocked_on_approval` (`mig 043:16`).
2. **Worker:** mevcut `agent-tick` cron (09:00, 5 task/tick + stale reclaim, 01-audit §11) — `build-lead-dossier`'ı çalıştırır. Atomik claim (`runner.ts:41-55`) çift-yürütmeyi engeller.
3. **Skill:** güçlendirilmiş `build-lead-dossier` (`lead.build_dossier`) — [5]-[12] aşamalarını tek autonomous koşuda yürütür.

**Autonomous döngü (araştır→sinyal→CRM auto-update→skor):**
```
cron agent-tick ──▶ agent_tasks claim ──▶ build-lead-dossier
   ▼                                            │
[5] evidence ─▶ [6] signals ─▶ [8] need ─▶ [9] score
   ▼                                            │
CRM auto-update: leads write-back (scan.ts:208-262 deseni)
   ▼
auto-score write-back: potential_score/lead_tier/customer_category
   ▼
run_spans trace (redacted) + ai_cost_logs (per-lead cost attribution)
```

- **CRM auto-update:** `leads` kolonlarına write-back — mevcut `scan.ts` upsert deseni birebir (`scan.ts:208-262`). Provenance `evidence_id`'li; write perms `leads:write` yalnız dossier/evidence/score alanları (06 §3.1).
- **auto-score write-back:** deterministik skorlar (`computeDeterministicScores`, V3, Quality) — LLM'siz, halüsinasyon-skor imkânsız.
- **İzolasyon:** Lead Intelligence rolü memory'ye **write yapmaz** (yalnız governed read, scope `lead:<id>`, 06 §3.1). Relationship Memory ayrı adımda quarantine-write (lethal-trifecta ayrımı, 06 §5).
- **Cost funnel (plan §4):** her lead premium'a gitmez — cheap prefilter (top 6) → evidence (top 4) → council yalnız seçilenler → `selection` 2/gün (01-audit §5). Gerçek maliyet riski **Google Places** → `tool_cost_logs` (`mig 052`).

**`assumption:`** agent-tick'in 5/tick kapasitesi lead hacmine göre kalibre edilecek (mevcut değer, 01-audit §11); hacim artarsa tick sıklığı/batch ayarı `19-data-and-worker-architecture.md` kararı.

---

## 4. Cost funnel + kanıt-kapısı (anti-bloat)

Premium her lead'de çalışmaz. Funnel daralması (16 §preset tier + plan §4):

| Katman | İşlem | Preset/maliyet | Kaç lead |
|---|---|---|---|
| 0 | Normalize + dedup + ICP + deterministik skor | **$0** (LLM yok) | tümü |
| 1 | Signal extract + reply-prefilter | `agencyos-fast-extract` ~$0.01 | tümü (ucuz) |
| 2 | Dossier ön-taslak + company research | `agencyos-research` ~$0.10-0.15 | prefilter top-6 |
| 3 | Need analysis (council C1∥C2→C3→C4) | `fast-extract`+`professional` (budget-cap $0.40/gün) | top-4 |
| 4 | Outreach/proposal (yalnız qualified) | `agencyos-professional` ~$0.05 | qualified |
| 5 | Premium escalation | `agencyos-premium-deal` ~$0.20 | 1-2/gün, HITL |

**Kanıt-kapısı özeti:** [5]→[13] boyunca kanıt eksikliği = düşük skor/confidence, throw değil; [13] geçmeden outreach yok; ham veri asla ajana ham girmez (digest özeti); her LLM iddiası `evidence_id`'li. Bu, "raw internet data NEVER straight to outreach" ilkesinin yapısal (mimari) uygulamasıdır — bir tercih değil, mevcut evidence engine + council + gate zinciriyle **zorunlu**.

---

## 5. Grounding & açık noktalar

- **Repo atıfları:** `leads/scan.ts:44-319` (Places→evidence→score→upsert pipeline), `leadScoringV3.ts:161-280` (5 alt-skor+risk), `highQualityLeadEngine.ts:79-296` (tier A-D+category), `customerCategory.ts:61-107` (7 kategori öncelik), `leadIntel/council.ts:53-413` (deterministik skor + C1-C4 konsey), `leadIntel/offerMatcher.ts:37-88` (kanıt-kapılı hizmet eşleşme), `personLeads/scoring.ts:24-111` (seniority→power, kişi skoru).
- **Yeniden inşa (eksik raporlar):** 04-Discovery = §2 [1]-[4]; 05-Scoring = §2 [9] + tam kart 09'da. İçerik mevcut kod + plan §4'ten türetildi (`assumption:` işaretli yerler hariç doğrulanmış).
- **`assumption:`** [3] verify-company MVP-sonrası (evidenceEngine MVP'de yeter); Contact `UNIQUE(lower(email))` (04); agent-tick batch kalibrasyonu (19).
- **Cross-refs:** 09 (skor kartı) · 06 §3.1/§5 (Lead Intelligence rolü + trifecta) · 07 §2.1-2.6 (skill spec) · 16 (preset) · 12-gmail (readiness→HITL) · 21-security (injection/evidence-gate).
- **DOKUNULMAZ:** hiçbir aşama `/gorevler`/`/aliskanliklar`/LIFE DB scope talep etmez (04 §E).
