---
Doküman: 08-offer-architecture.md
Tarih: 2026-07-11
Kaynak kalitesi: karışık (repo birincil, dış pazarlama-blog ikincil)
Güven: orta
AgencyOS'a etki: leadIntel/offerMatcher.ts + council.ts çıktısını, teklif diline çeviren yeni deterministik katman (offerArchitect.ts) için tasarım referansı
---

## Özet

AgencyOS zaten "hangi hizmeti satalım" sorusunu deterministik olarak cevaplıyor: `offerMatcher.ts` (C2) kanıt-kapılı skorlu eşleşmeler üretiyor, `council.ts` (C4/Chair) bunlardan birincil+ikincil hizmeti seçiyor, `customerCategory.ts` tasarım-mı/AI-mi ayrımını sektör+kanıt kuralıyla kilitliyor. Eksik olan katman "bu eşleşmeyi nasıl bir TEKLİF ANLATISINA çeviririz" — yani lead'in gerçek ihtiyacı, neden şimdi, neden Cem, hangi giriş noktası, hangi kapsam/süre/fiyat yaklaşımı, sonraki adım ve riskler. Bu doküman mevcut üç kod katmanının (`offerMatcher.ts`, `offers.ts`, `services/catalog.ts`) ÜSTÜNE, onları değiştirmeden tüketen yeni bir saf fonksiyon modülü (`offerArchitect.ts`) önerir. Yedi teklif seviyesi tanımlanır (micro / audit-keşif / project / retainer / ai-system / pilot / workshop); bunlardan üçü (micro, project, retainer) zaten katalogda karşılık buluyor, ikisi (audit-keşif, ai-system) kısmi karşılık buluyor, ikisi (pilot, workshop) tam gap. Fiyat mantığı, mevcut `defaultSetupPriceTl`/`defaultMonthlyPriceTl` taban değerlerini bozmadan üstüne çarpan katmanı ekler. En büyük yapısal boşluk portfolyo/kanıt eşleştirmesi: `career.portfolio_gap` skill'i kayıtlı ama handler'sız, ve repoda hiçbir portföy/case-study veri kaynağı yok — bu MVP'de fabrikasyon riskini önlemek için açıkça "veri yok" olarak işaretlenmeli.

## 1. Mevcut Mimari — Üstüne İnşa Edilecek Katmanlar

| Dosya | Rol | Offer Architect'e girdi |
|---|---|---|
| `src/lib/leadIntel/offerMatcher.ts` | C2 — deterministik, LLM yok, kanıt-kapılı skorlu hizmet eşleşmesi (`ServiceMatch[]`) | Aday hizmet listesi + `evidence_refs` + `reasons` |
| `src/lib/leadIntel/council.ts` | C1-C4 orkestrasyon; `computeDeterministicScores`, `deterministicChair`, `runCouncil` | `ChairOut` (primary/secondary slug, final skorlar, `oversell_warning`, `rationale_evidence_ids`) |
| `src/lib/customerCategory.ts` | 7 kategori (`web_yok`→`otomasyon_fit`→`genel_tasarim`), öncelik sıralı, AI SADECE `otomasyon_fit`'te | `customer_category`, `recommended_offer_id`, `category_reasons` |
| `src/lib/services/catalog.ts` | ~40 kanonik paket, 13 aile, `salesCopy` (anti-ROI lint'li), `requiredEvidenceKinds`, `targetSectors`, `upsellSlugs` | Taban fiyat/kapsam/checklist |
| `src/lib/offers.ts` | Legacy 30 kayıt — bazı `services/catalog.ts` paketlerinin TEK fiyat kaynağı (`offerPrice()` sarmalayıcı) | Taban TL değerleri |
| `src/lib/proposalGenerator.ts` | 3 kademeli RETAINER üreticisi (lite/core/growth), çıpalama+decoy, bütçe bandı/risk skoruna göre peşinat oranı | Kademe iskeleti, peşinat mantığı örneği |
| `src/lib/leads/pipelineGate.ts` | `pain_point`+`decision_maker`+`budget_band` doluymadan `proposal` aşamasına giriş yok | Discovery tamlık kontrolü |
| `src/lib/evidenceEngine.ts` | Tarama anında deterministik `why_now`, `pain_signals`, `proof_points`, `recommended_offer_id` üretir | Hazır "neden şimdi" ham malzemesi |
| `src/lib/coldEmail.ts` / `coldEmailTemplates.ts` | `why_now`, `why_this_will_convert`, `pain_signals`, `proof_points` alanlarını tüketen 4 açılı taslak üretici | Aynı alanları e-posta diline çeviren örnek tüketici |
| `knowledge/PRICING_RULES.md` | Kapsam/teslim süresi/revizyon/kullanım hakkı/ödeme koşulu her teklifte ZORUNLU; "pricing-offer-agent" kavramından bahsediyor | İş kuralları — ama bu ajan **koda hiç yazılmamış** (doğrulandı: `skills/catalog.ts`'de yok) |
| `knowledge/SALES_FRAMEWORK.md` | 9 adımlık teşhis-satış çerçevesi (rapport→mevcut durum→arzulanan durum→teşhis→acıyı deş→görselleştir→kişiselleştir→fiyat→itiraz) | Anlatı sırası — Offer Architect bu sırayı üretmeli, yeniden icat etmemeli |
| `src/lib/skills/catalog.ts` (satır ~287) | `career.portfolio_gap` slug kayıtlı, `handlerKey: null` | Portfolyo eşleştirmenin **henüz kodlanmadığının** kanıtı |

**Çıkarım:** `knowledge/PRICING_RULES.md`'de anılan "pricing-offer-agent" hiçbir zaman implement edilmemiş — bu doküman aslında o boşluğun somut karşılığını tarif ediyor. Yeni bir LLM ajanı DEĞİL, deterministik bir modül olarak önerilir (bkz. §4, §9).

## 2. Offer Architect Motoru — Kavramsal Model

Önerilen modül: `src/lib/leadIntel/offerArchitect.ts` — **saf fonksiyon, LLM çağrısı yok, DB yazmaz.** Pipeline'da `runCouncil()`'den SONRA, teklif/e-posta üretiminden ÖNCE çalışır:

```
Lead + DiscoveryFields          ChairOut + ServiceMatch[]
(pipelineGate.ts alanları)   +  (council.ts çıktısı)
customerCategory sonucu      +  evidenceEngine alanları (why_now, pain_signals,
                                 proof_points, expected_monthly_value_tl)
        │
        ▼
   offerArchitect.buildOfferBrief()   ← YENİ, saf, deterministik
        │
        ▼
   OfferBrief { tier, primaryService, supportingService, needHypothesis,
                whyNow, whyUs, entryOffer, scope, pricingApproach,
                nextStep, risks, internalPriceRationale (client-facing DEĞİL) }
        │
        ├──► proposalGenerator.ts (retainer kademeleri için mevcut)
        └──► coldEmail.ts / route katmanı (operatör HITL onayına sunulur)
```

Kritik tasarım kararı: `OfferBrief` **birincil/destekleyici hizmeti asla kendi icat etmez** — yalnızca `ChairOut.primary_service_slug` / `secondary_service_slug`'ı tüketir. Bu, "hizmet uydurma yapısal olarak imkânsız" garantisinin (offerMatcher.ts satır 3-4 yorumu) teklif katmanına da taşınması demektir.

## 3. Teklif Seviyeleri — Tanım ve Mevcut Kataloğa Haritalama

| Seviye | Tetikleyici | Mevcut karşılığı | Durum |
|---|---|---|---|
| **micro** | Tek teslim, düşük taahhüt, kanıt zayıf/orta | `rakip-analizi` (3000₺), `instagram-profil-optimizasyonu` (2500₺), `sosyal-medya-sablon-seti` (3500₺) | **VAR** — kataloğun alt ucu zaten bu işlevi görüyor |
| **audit-keşif** | İlk temas, güven henüz kurulmadı, karar verici belirsiz | En yakını `rakip-analizi` — ama "dijital varlık denetimi" adıyla ayrı, ücretli bir keşif SKU'su yok | **KISMİ GAP** |
| **project** | Tek seferlik teslim, net bitiş | `logo-marka-kimligi`, `kurumsal-kimlik`, `web-sitesi` | **VAR** |
| **retainer** | Aylık tekrarlayan üretim/yönetim | `sosyal-medya-paketi`, `ai-satis-asistani`, `reklam-optimizasyonu` + `proposalGenerator.ts` 3-kademe (lite/core/growth) | **VAR** |
| **ai-system** | Tasarım+AI hibrit, orta-üst bütçe | `ai-kreatif-lab`, `guzellik-dijital-paketi`, `kafe-restoran-dijital-paketi` (hibrit aile) | **KISMİ** — büyük/kurumsal ölçekte özel "AI sistemi" SKU'su yok |
| **pilot** | Riskli/yeni müşteri, süre-sınırlı deneme fiyatı | Yok | **TAM GAP** |
| **workshop** | Eğitim/danışmanlık (ör. "AI ile tasarım atölyesi") | Yok | **TAM GAP**, düşük öncelik (tek operatör kapasitesi) |

Çıkarım (ikincil kaynak, orta güven): ABD pazarında "AI Readiness Audit / Automation Roadmap" tipi keşif teklifleri 2-4 haftalık kapsamla $5.000-$15.000 bandında, pilot-dan-retainera dönüşüm oranı bildirilen aralık %70-85 [Assembly, "The Complete Guide To Productized Services", 2026, https://assembly.com/blog/productized-services]. Bu rakamlar TR KOBİ pazarına DOĞRUDAN taşınamaz (para birimi, satın alma gücü, Cem'in mevcut fiyat bandı 2.500-25.000₺ arası) — yalnızca "audit ayrı, ücretli, düşük-sürtünmeli bir kapı olmalı" ilkesini destekler; rakamsal bir hedef değil.

## 4. Fiyat Mantığı — Çarpan Modeli

Brief'te istenen sıra: *sabit hizmet aralıkları × iş yükü × kullanım hakkı × revizyon × strateji seviyesi × hız × AI maliyeti × müşteri değeri.* Her faktörün repo'daki karşılığı:

| Faktör | Kaynak / durum |
|---|---|
| Sabit hizmet aralığı | `services/catalog.ts` `defaultSetupPriceTl`/`defaultMonthlyPriceTl` + `service_catalog` DB override (mig 032) — **DOKUNMA, tek fiyat kaynağı zaten bu** |
| İş yükü (platform sayısı, aylık asset adedi) | `proposalGenerator.ts` TIER_BASE.includes alanında zaten kodlu (1 platform / 2 platform / 2-3 platform) — genelleştirilebilir |
| Kullanım hakkı (ticari/kişisel, süre sınırı) | `PRICING_RULES.md` madde 3 ZORUNLU kılıyor ama kodda yapılandırılmış alan YOK — **eklenmeli** |
| Revizyon turu | Aynı şekilde `PRICING_RULES.md` madde 2 — kodda yok, `salesCopy.checklist` serbest metin içinde kayboluyor |
| Strateji seviyesi (yalnız uygulama vs. danışmanlık dahil) | Yeni boyut — mevcut pakette ayrım yok |
| Hız (rush/expedite) | Yeni boyut — repo'da hiç yok, endüstri pratiği olarak eklenmesi önerilir |
| AI maliyeti | `ai_cost_logs` + `src/lib/ai/caps.ts` zaten gerçek/ tahmini maliyeti kayıt altına alıyor — AI ailesi (`ai_otomasyon`) retainer fiyatı bu maliyetin ALTINA düşmemeli (taban marj kilidi olarak kullanılabilir) |
| Müşteri değeri | `expected_monthly_value_tl` alanı zaten leads şemasında var, `SALES_FRAMEWORK.md` adım 5'te "acıyı deş" çapası olarak kullanılıyor |

**Kritik ayrım — iç mantık vs. müşteriye söylenen:** Değer-bazlı fiyatlandırma pratiği, fiyatı elde edilecek değerin bir kesri olarak çapalamayı önerir — sık anılan (ikincil kaynak, orta güven) aralık değerin %10-20'si [Umbrex, "Value-Based Pricing", 2026, https://umbrex.com/resources/frameworks/pricing-frameworks/value-based-pricing/]. AgencyOS'ta bu **asla müşteriye "şu kadar ROI getireceğiz" diye söylenemez** — proje kuralı zaten `catalog.test.ts`'in `UNPROVEN_CLAIM_RE` lint'iyle ölçülmemiş %/ROI/kat vaadini engelliyor. Bu nedenle `expected_monthly_value_tl` yalnızca **operatöre gösterilen iç fiyat gerekçesi** (`internal_price_rationale`) alanında kullanılabilir; `OfferBrief`'in müşteriye giden alanlarından (whyNow, checklist, salesCopy) tamamen ayrı tutulmalı. Bu ayrım şema seviyesinde zorlanmazsa, ileride bir geliştirici bu iç gerekçeyi yanlışlıkla e-posta taslağına sızdırabilir — bu yüzden `OfferBrief` tipinin `internal` ve `clientFacing` olarak iki alt-nesneye bölünmesi önerilir.

## 5. Anti-Pattern Kuralları → Somut Kod Kapıları

Brief'in yasakları zaten kısmen kodda var; Offer Architect bunları GENİŞLETMEDEN devralmalı:

- **"Her lead'e retainer/ücretsiz önerme" yasağı** → varsayılan seviye her zaman `micro`/`project`'tir; `retainer` veya üstü yalnızca `pipelineGate.canEnterProposal()` true VE `budget_band` ≥ `20-40k` olduğunda önerilebilir. Bu, mevcut `pipelineGate.ts` kapısının doğrudan tekrar kullanımıdır.
- **"Aynı şirkete hizmet yığma" yasağı** → `ChairOut` zaten `primary_service_slug` + `secondary_service_slug` ile ikiyle sınırlıyor (council.ts satır 243, `deterministicChair`); Offer Architect üçüncü bir hizmet EKLEMEZ, yalnızca bu ikisini anlatıya döker.
- **"Kanıtsız otomasyon ihtiyacı uydurma" yasağı** → `offerMatcher.ts`'in `requiredEvidenceKinds` kesişim kapısı (satır 52-53) ve `customerCategory.ts`'in `otomasyon_fit` sektör+kanal kuralı (satır 99-103) zaten bunu yapısal olarak imkânsız kılıyor — Offer Architect bu iki kapıyı BYPASS EDEMEZ, yalnızca `ChairOut`'tan gelen slug'ı kabul eder.

## 6. "Neden Şimdi / Neden Cem" Bileşen Haritası

- **Neden şimdi:** `evidenceEngine.ts`'in ürettiği `why_now` alanı + Chair'in `rationale_evidence_ids`'i zaten mevcut — Offer Architect bunları BİRLEŞTİRİR, yeni iddia üretmez.
- **Neden Cem (farklılaştırıcı):** **GAP.** Kodda yapılandırılmış bir "neden biz" alanı yok; yalnızca `knowledge/GRAFIKCEM_BRAND.md`'de marka konumlandırması (AI destekli tasarım, Türkiye+global) var. MVP önerisi: 2-3 sabit, doğrulanabilir farklılaştırıcı (AI-native üretim hızı, tek elden tasarım+otomasyon, Türkçe yerel pazar bilgisi) kod içinde sabit metin olarak tutulur — **asla** "X müşteri için Y sonuç aldık" gibi doğrulanamaz bir iddia üretilmez.

## 7. Portfolyo/Kanıt Eşleştirme — En Büyük Yapısal Boşluk

`src/lib/skills/catalog.ts` satır 287-292'de `career.portfolio_gap` slug'ı kayıtlı ama `handlerKey: null` — yani hiç çalışmıyor. Daha önemlisi: repoda (kod veya `knowledge/*.md`) **hiçbir yapılandırılmış portföy/case-study veri kaynağı yok.** `GRAFIKCEM_BRAND.md` yalnızca marka sesi/konumlandırma içeriyor, örnek iş listesi değil.

Bu nedenle `OfferBrief.portfolioProof` alanı **null-yapılabilir** olmalı ve boşken UI'da "portföy kanıtı eksik — 3-5 örnek iş eklenmeli" şeklinde açıkça işaretlenmeli. Sahte/uydurma bir "benzer projede %X artış sağladık" cümlesi üretmek hem kural ihlali hem güven riskidir.

- **V1 önerisi:** Cem'in elle dolduracağı minimal `portfolio_items` tablosu (sektör etiketi, hizmet ailesi etiketi, önce/sonra linki, 1 cümle sonuç — yalnızca gerçek işler). Eşleştirme basit slug/sektör kesişimi.
- **V2 önerisi:** Mevcut embedding altyapısı (assistant hafızası için zaten kurulu `gemini-embedding-001`, bkz. `agent-memory` notları) portföy aramasına da uyarlanabilir.

## 8. Riskler ve Sonraki Adım Bileşenleri

- **Riskler:** `ChairOut.oversell_warning`/`oversell_note` (zaten var, deterministik düşüşte HER ZAMAN true) + Skeptic'in reddettiği iddialar + `pipelineGate.missingProposalFields()` çıktısı → operatöre gönderilmeden önce kontrol listesi olarak sunulur.
- **Sonraki adım:** `pipelineGate.canEnterProposal()` false ise sonraki adım bir fiyat teklifi DEĞİL, eksik discovery alanlarını kapatacak bir soru/görüşme önerisidir (`proposalGateMessage()` zaten TR mesaj üretiyor). True ise `proposalGenerator.buildProposal()` çağrılır ve `PRICING_RULES.md`'nin "Teklif Gönderim Kuralı" gereği **explicit onay olmadan hiçbir şey gönderilmez.**

## AgencyOS'a Entegrasyon

- Yeni dosya: `src/lib/leadIntel/offerArchitect.ts` — girdi: `CouncilResult` (council.ts) + `DiscoveryFields` (pipelineGate.ts) + `CategoryResult` (customerCategory.ts) + evidenceEngine alanları; çıktı: yeni `OfferBrief` tipi (`src/lib/types.ts`'e eklenir, `internal`/`clientFacing` ayrımıyla).
- Fiyat tabanları `services/catalog.ts` + `offers.ts`'ten OKUNUR, hiçbir yeni fiyat sabiti buraya YAZILMAZ.
- Kullanım hakkı/revizyon alanları eksikse `ServicePackage` tipine (types.ts) opsiyonel alan eklenmesi V1 kapsamı — MVP'de serbest metin (`salesCopy.checklist`) yeterli.
- `proposalGenerator.ts` retainer kademe mantığı DEĞİŞTİRİLMEZ; `OfferBrief.tier === 'retainer'` olduğunda bu fonksiyon çağrılır.
- Portfolyo: `career.portfolio_gap` skill'i (skills/catalog.ts) handler kazanana kadar `OfferBrief.portfolioProof = null` döner — bu **beklenen, kabul edilebilir bir eksik durumdur**, hata değildir.

## MVP / V1 / V2

- **MVP:** Sıfır yeni DB şeması, sıfır yeni LLM çağrısı. `offerArchitect.ts` saf fonksiyon; mevcut `ChairOut` + `ServiceMatch[]` + `customerCategory` + discovery alanlarından `OfferBrief` derler. Varsayılan seviye `micro`/`project`; `retainer` yalnız gate geçtiğinde. Teklif rotasında salt-okunur gösterim.
- **V1:** Minimal `portfolio_items` tablosu (elle doldurulan 5-10 kayıt) + kataloğa ayrı fiyatlı "Dijital Varlık Denetimi" (audit-keşif) SKU'su eklenir + `internal`/`clientFacing` şema ayrımı zorunlu kılınır + kullanım hakkı/revizyon alanları `ServicePackage`'a taşınır.
- **V2:** `pilot` (süre-sınırlı deneme fiyatı) ve `workshop` seviyeleri, embedding-tabanlı portföy eşleştirme, `ai_cost_logs`'tan canlı okunan AI maliyet taban marjı, `proposalGenerator.ts` UI'ında hız/rush fiyatlandırması.

## Açık Sorular / Doğrulanamayanlar

- Dış araştırmadaki fiyat aralıkları (audit $5k-$15k, pilot-retainer dönüşüm %70-85, retainer $1.500-$5.000/ay) tamamı ABD pazarlama-blog kaynaklı (ikincil, orta/düşük güven) — TR KOBİ pazarına doğrudan uygulanamaz; `services/catalog.ts` satır 442'deki mevcut iç yorum ("2026 TR piyasa araştırması: Starter retainer bandı 15-25k/ay") ile bu yeni dış rakamlar arasında tutarlılık kontrolü AYRICA yapılmalı — bu doküman o kontrolü yapmadı.
- Değer-bazlı "%10-20 çapası" Batı danışmanlık pazarı konvansiyonu; Cem'in fiyat bandında (birkaç bin - birkaç on bin TL) doğrudan formül girdisi olarak mı, yoksa yalnızca yön-gösterici sağlık kontrolü olarak mı kullanılacağı [ASSUMPTION]: bu doküman ikincisini önerir, ama nihai karar Cem'e ait.
- Portföy verisinin kaynağı: Cem'in Behance/Notion gibi bir yerde mevcut iş listesi var mı, yoksa sıfırdan mı derlenecek? [UNKNOWN] — repo içinden çıkarılamaz, Cem'e sorulmalı.
- "pricing-offer-agent" (PRICING_RULES.md'de anılan) yeni bir DB `agents` kaydı mı olmalı yoksa bu saf modül mü yeterli? [LIKELY]: saf modül yeterli — LLM çağrısı gerektirmiyor, deterministik.
