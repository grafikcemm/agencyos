---
Doküman: 10-service-and-offer-engine
Dalga: 2 (Motor — Dalga 1 sözleşmelerine referansla)
Tarih: 2026-07-11
Durum: Motor tasarımı (04-domain-model + 07-skill-registry + 09-scoring'e bağlı)
Bağımlılık: 04-domain-model.md (Service/ServiceMatch/PortfolioItem/Proposal entity), 07-skill-registry.md (match-service ★MVP, match-portfolio V1, build-offer V1), 05-event-contracts.md, 16-openrouter-routing.md (agencyos-professional yalnız framing)
Kaynak araştırma: 07-portfolio-and-proof-matching.md, 08-offer-architecture.md
---

# AgencyOS V2 — Service & Offer Engine

## 0. Çerçeve — İKİ AYRI kütüphane, tek yön akış

Bu motorun tek işi şu soruyu deterministik olarak cevaplamak: **"Bu lead'e hangi paketlenmiş teklifi, hangi kanıtla, hangi fiyat mantığıyla, hangi gerçek işimizi göstererek sunarız?"** — ve bunu **hizmet uydurmadan, fiyat uydurmadan, sonuç uydurmadan** yapmak.

İki kavram bilinçli olarak **ayrı** tutulur; karıştırılırsa hem katalog şişer hem fabrikasyon riski girer:

| | **Service Library** (Hizmet Kütüphanesi) | **Offer Library** (Teklif Kütüphanesi) |
|---|---|---|
| **Ne** | Ali Cem'in teslim edebildiği **yetenekler** — "logo", "web sitesi", "AI satış asistanı" | Bir yeteneği belirli bir **problem→çözüm modeline** paketleyen anlatı (ideal müşteri, tetik, kanıt, kapsam sınırı, fiyat mantığı, itiraz cevabı) |
| **Soru** | "Ne yapabiliriz?" | "Bu lead'e nasıl SUNARIZ?" |
| **Kaynak-of-truth** | `service_catalog` (kod: `src/lib/services/catalog.ts` `SERVICE_PACKAGES`, `catalog.ts:47`; DB yalnız fiyat/aktiflik override, mig 032) | Deterministik olarak **runtime'da türetilir** (`offerArchitect.ts`, YENİ); kalıcı `offers` tablosu AÇILMAZ (MVP) |
| **Kararlılık** | Statik, git-versiyonlu, ~40 paket / 13 aile | Lead'e göre değişken; her koşuda `ChairOut` + `ServiceMatch[]`'ten yeniden hesaplanır |
| **Entity (04)** | Service (`service_catalog`), ServiceMatch (`lead_service_matches`) | OfferBrief (DERIVED — tablo YOK), Proposal (`proposals`, mig 049 — bkz. 14) |

**Kilit ilke (08-offer-architecture §2):** Offer Library, Service Library'yi **TÜKETİR ama GENİŞLETMEZ**. `offerArchitect` birincil/destekleyici hizmeti **asla kendi icat etmez** — yalnız `ChairOut.primary_service_slug`/`secondary_service_slug`'ı okur (`offerMatcher.ts:3-4` "hizmet uydurma yapısal olarak imkânsız" garantisinin teklif katmanına taşınması).

**Bu motor NE değil:** yeni bir LLM ajanı değil. `knowledge/PRICING_RULES.md`'de anılan "pricing-offer-agent" hiç kodlanmamıştı (08 §1 doğruladı: `skills/catalog.ts`'de yok); bu motor onun **deterministik** karşılığıdır — saf fonksiyon, LLM'siz, DB yazmayan.

---

## 1. Service Library — mevcut deterministik çekirdek (KORU)

Bugün canlı ve sağlam. Bu motor hiçbirini **değiştirmez**; yalnız tüketir.

| Katman | Dosya | Rol | Offer Engine'e girdi |
|---|---|---|---|
| Katalog | `services/catalog.ts` `SERVICE_PACKAGES` (`catalog.ts:47`) | ~40 paket, 13 aile; her paket: `slug`, `familyId`, `domain`, `defaultSetupPriceTl`/`defaultMonthlyPriceTl` (`catalog.ts:54-55`), `requiredEvidenceKinds` (`catalog.ts:63`), `targetSectors` (`catalog.ts:64`), `upsellSlugs` (`catalog.ts:65`), `salesCopy` | Taban fiyat + kapsam + kanıt kapısı |
| Eşleştirme | `leadIntel/offerMatcher.ts` `matchServices()` (`offerMatcher.ts:37`) | Deterministik, LLM'siz, kanıt-kapılı skorlu `ServiceMatch[]`; kanıt kapısı: paketin `requiredEvidenceKinds`'ından ≥1 **doğrulanmış** (`offerMatcher.ts:51-53`) | Aday hizmet + `evidence_refs` + `reasons` |
| Konsey seçimi | `leadIntel/council.ts` (`ChairOut`) | `ServiceMatch[]`'ten primary+secondary slug + `oversell_warning` + `rationale_evidence_ids` seçer | Seçilmiş 2 hizmet (üçüncü EKLENMEZ) |
| Kategori | `customerCategory.ts` `deriveCustomerCategory()` (`customerCategory.ts:61`) | 7 kategori; **AI SADECE `otomasyon_fit`** (`customerCategory.ts:4-7,102`); `CategoryResult { customer_category, recommended_offer_id }` (`customerCategory.ts:25-27`) | Tasarım-mı/AI-mı kilidi |
| Fiyat tabanı | `offers.ts` `OFFERS` (`offers.ts:6`) | Legacy 30 kayıt; bazı paketlerin TEK fiyat kaynağı (`offerPrice()` sarmalayıcı): `setupPrice`/`monthlyPrice`/`deliveryDays`/`checklist`/`salesPromise` (`offers.ts:14-20`) | Taban TL değerleri |
| Discovery kapısı | `leads/pipelineGate.ts` `canEnterProposal()` (`pipelineGate.ts:35`) | `pain_point`+`decision_maker`+`budget_band` doluluğu (`pipelineGate.ts:14-18`) | Retainer+ seviyeye izin kapısı |

**Değişmez:** `matchServices` yalnız katalog `slug`'ından seçer → halüsinasyon-servis imkânsız (`offerMatcher.ts:82`). `otomasyon_fit` sektör+kanal kuralı AI-önerisini yapısal kilitler (`customerCategory.ts:99-103`). Bu iki kapı **BYPASS EDİLEMEZ** (08 §5).

---

## 2. Offer Architect — deterministik teklif-brifi motoru (YENİ)

**Dosya:** `src/lib/leadIntel/offerArchitect.ts` — **saf fonksiyon, LLM çağrısı YOK, DB YAZMAZ** (08 §2). Pipeline'da `runCouncil()`'den SONRA, teklif/e-posta üretiminden ÖNCE çalışır. Skill kaydı: `sales.build_offer_angle` (composite, V1 — 07 §2.7).

```
GİRDİ                                       ÇIKTI
─────                                       ─────
ChairOut          (council.ts)         ┐
ServiceMatch[]    (offerMatcher.ts)    �│
CategoryResult    (customerCategory)   ├─► offerArchitect.buildOfferBrief()  ─► OfferBrief
DiscoveryFields   (pipelineGate.ts)    �│        (saf · deterministik)          { internal, clientFacing }
evidenceEngine    (why_now/pain/value) ┘
```

**Kritik tasarım kararı — internal vs clientFacing ayrımı (08 §4):** Değer-bazlı fiyat gerekçesi (`expected_monthly_value_tl`, `types.ts:181`) **asla müşteriye "şu kadar ROI getireceğiz" diye söylenemez** (mevcut `catalog.test.ts` `UNPROVEN_CLAIM_RE` lint'i ölçülmemiş %/ROI/kat vaadini zaten engelliyor). Bu yüzden `OfferBrief` şema düzeyinde **iki alt-nesneye bölünür** — aksi halde bir geliştirici iç gerekçeyi yanlışlıkla e-posta taslağına sızdırabilir:

```typescript
// src/lib/types.ts'e eklenecek (types.ts stilinde) — assumption: alan adları öneri
export interface OfferBrief {
  tier: OfferTier                       // §3
  primaryServiceSlug: string            // = ChairOut.primary_service_slug (ASLA icat edilmez)
  supportingServiceSlug: string | null  // = ChairOut.secondary_service_slug
  clientFacing: {                       // ← YALNIZ bunlar outreach/teklif metnine girer
    needHypothesis: string              // evidenceEngine why_now + pain birleşimi (yeni iddia YOK)
    whyNow: string                      // lead.why_now (types.ts:151) + rationale_evidence_ids
    whyUs: string                       // 2-3 SABİT doğrulanabilir farklılaştırıcı (§5)
    entryOffer: string                  // giriş noktası (tier'a göre)
    scope: string[]                     // paket checklist'inden (offers.ts:20)
    scopeBoundaries: string[]           // net "dahil değil" (fabrikasyon önleyici)
    pricingApproach: string             // "kurulum X + aylık Y" — SAYI price-rules'tan
    nextStep: string
    portfolioProof: PortfolioMatch[] | null  // §6 — boş = geçerli durum, uydurma YOK
    objectionHooks: string[]            // itiraz cevabı çengelleri (şablon)
  }
  internal: {                           // ← OPERATÖRE görünür, müşteriye ASLA
    expectedMonthlyValueTl: number | null   // types.ts:181 — iç fiyat çapası
    internalPriceRationale: string          // "değerin ~%10-15'i" sağlık kontrolü (08 §4)
    oversellWarning: boolean                // ChairOut.oversell_warning
    missingDiscoveryFields: string[]        // pipelineGate.missingProposalFields()
    retainerPotential: 'low' | 'medium' | 'high'  // §7 upsell sinyali
  }
}
```

**Deterministik davranış:**
- `buildOfferBrief` girdisi değişmezse çıktısı **birebir aynı** (saf) → eval parity mümkün.
- LLM yalnız **opsiyonel framing rationale** için (07 §2.7: preset `agencyos-professional`, "yalnız framing"); çekirdek karar (tier seçimi, hangi hizmet, hangi fiyat) **%100 pure-code**.
- Eşleşme/kanıt yoksa güvenli fallback (§3 `micro`/`audit`), boş `portfolioProof`, boş fiyat + operatör-giriş işareti — **hiçbir zaman dolgu metin**.

---

## 3. Yedi teklif seviyesi (Offer Tier) — tanım + kataloğa haritalama

`OfferTier = 'micro' | 'audit' | 'project' | 'retainer' | 'ai_system' | 'pilot' | 'workshop'`. Kaynak: 08 §3.

| Seviye | İdeal müşteri / tetik | Kanıt eşiği | Mevcut karşılık | Durum |
|---|---|---|---|---|
| **micro** | Tek teslim, düşük taahhüt, kanıt zayıf/orta | düşük | `rakip-analizi`, `instagram-profil-optimizasyonu`, `sosyal-medya-sablon-seti` | **VAR** — kataloğun alt ucu |
| **audit** | İlk temas, güven kurulmadı, karar verici belirsiz | düşük | En yakın `rakip-analizi`; ayrı ücretli "Dijital Varlık Denetimi" SKU YOK | **KISMİ GAP** (V1: SKU ekle) |
| **project** | Tek seferlik teslim, net bitiş | orta | `logo-marka-kimligi`, `kurumsal-kimlik`, `web-sitesi` | **VAR** |
| **retainer** | Aylık tekrarlayan üretim/yönetim | yüksek (gate!) | `sosyal-medya-paketi` + `proposalGenerator.ts` 3-kademe (lite/core/growth) | **VAR** |
| **ai_system** | Tasarım+AI hibrit; **yalnız** `otomasyon_fit` | yüksek | `ai-satis-asistani`, `ai-kreatif-lab` (hibrit aile) | **KISMİ** — kurumsal "AI sistemi" SKU yok |
| **pilot** | Riskli/yeni müşteri, süre-sınırlı deneme fiyatı | orta | — | **TAM GAP** |
| **workshop** | Eğitim/danışmanlık (ör. "AI ile tasarım atölyesi") | — | — | **TAM GAP**, düşük öncelik (tek operatör kapasitesi) |

**Tier seçim kuralı (deterministik, anti-pattern kapıları — 08 §5):**
- **Varsayılan her zaman `micro`/`project`** (veya kanıt çok zayıfsa `audit`). "Her lead'e retainer/ücretsiz önerme" yasağı.
- `retainer`/`ai_system` yalnız: `canEnterProposal(lead)` **true** VE `budget_band` ≥ `20-40k` (`pipelineGate.ts:35` doğrudan tekrar kullanımı).
- `ai_system` ek şart: `customer_category === 'otomasyon_fit'` (aksi halde AI önerisi yapısal yasak, `customerCategory.ts:99-103`).
- İkiden fazla hizmet EKLENMEZ (`ChairOut` zaten primary+secondary ile sınırlar).

**assumption:** `pilot` ve `workshop` MVP kapsamı DIŞI (08 §3: düşük öncelik, tek operatör). Şema `OfferTier` union'ında yer tutar ama `buildOfferBrief` MVP'de bunları üretmez → V2. Bu, "enterprise şişkinliği yok" ilkesine uyum.

---

## 4. Fiyat mantığı — çarpan modeli, AMA sayı ASLA AI-uydurma

**Pazarlıksız kural (07 §Özet + 08 §4 + 14 §5):** Fiyat yalnız (a) `service_catalog`/`offers.ts` taban değerleri veya (b) operatör girdisinden gelir. LLM **hiçbir zaman fiyat sayısı üretmez**. Fiyat kuralı yoksa → **fiyat boş + operatör-giriş işareti** (07 §2.16 draft-proposal davranışıyla aynı disiplin).

Brief'in istediği çarpan sırası ve repo karşılığı (08 §4):

| Faktör | Kaynak / durum |
|---|---|
| Sabit hizmet aralığı | `services/catalog.ts` `defaultSetupPriceTl`/`defaultMonthlyPriceTl` + DB override (mig 032) — **DOKUNMA, tek fiyat kaynağı** |
| İş yükü (platform/asset adedi) | `proposalGenerator.ts` `TIER_BASE.includes` zaten kodlu ("1 platform"/"2 platform", `proposalGenerator.ts:29,37`) |
| Kullanım hakkı (ticari/kişisel) | `PRICING_RULES.md` madde 3 ZORUNLU; kodda yapılandırılmış alan YOK → **V1: `ServicePackage`'a opsiyonel alan** (MVP'de `salesCopy.checklist` serbest metni yeter) |
| Revizyon turu | `PRICING_RULES.md` madde 2; kodda yok → V1 |
| Strateji seviyesi (uygulama vs danışmanlık) | Yeni boyut → V1+ |
| Hız (rush/expedite) | Repo'da yok → V2 |
| AI maliyeti | `ai_cost_logs` + `ai/caps.ts` gerçek maliyeti kaydeder; `ai_otomasyon` retainer fiyatı bu maliyetin ALTINA düşmemeli (taban marj kilidi) |
| Müşteri değeri | `expected_monthly_value_tl` (`types.ts:181`) → **YALNIZ `internal.internalPriceRationale`**, clientFacing'e ASLA |

**Değer çapası (08 §4):** değerin ~%10-20'si çapalama Batı danışmanlık konvansiyonu; Cem'in bandında (birkaç bin–birkaç on bin TL) **formül girdisi değil, yalnız operatöre iç sağlık kontrolü** — `assumption:` (nihai karar operatöre ait, 08 §Açık sorular).

---

## 5. "Neden şimdi / Neden Cem" bileşenleri

- **Neden şimdi (VAR):** `evidenceEngine.ts` `why_now` (`types.ts:151`) + Chair'in `rationale_evidence_ids`'i **BİRLEŞTİRİLİR**, yeni iddia üretilmez.
- **Neden Cem (GAP — 08 §6):** Kodda yapılandırılmış "neden biz" alanı yok; yalnız `knowledge/GRAFIKCEM_BRAND.md` marka konumlandırması var. MVP: **2-3 SABİT, doğrulanabilir farklılaştırıcı** kod içinde sabit metin (AI-native üretim hızı, tek elden tasarım+otomasyon, Türkçe yerel pazar bilgisi). **ASLA** "X müşteri için Y sonuç aldık" gibi doğrulanamaz iddia — o iş portföy kanıtına aittir (§6), uydurma metne değil.

---

## 6. Portfolio proof matching — Cem'in GERÇEK işleri (YENİ, mig 048)

### 6.1 İsim çakışması — ÖNCE çöz (07 §Terim çakışması)

Repoda "portföy" **zaten başka bir şey**: emlak müşterisinin sattığı mülk stoğu — `catalog.ts:580` `portfoy-eslestirme` paketi + `offers.ts:323` `portfolio_matching` id + `sectorPriority.ts:100,111`. Bu, Cem'in **SATTIĞI bir hizmet**, kendi işleri DEĞİL. **İLGİSİZ.**

Cem'in kendi işleri için yeni ad: **`portfolio_items` / `case_study` / `PortfolioItem`** (07 §22). Kural: iki kavram **aynı dosyada asla yan yana gelmez**; kod yorumlarında emlak paketine atıf yapılmaz. (`skills/catalog.ts:287` `career.portfolio_gap` skill'i zaten `PortfolioItem[]` tipini bekliyor — isim düzeyinde örtüşür, handler'sız.)

### 6.2 Veri modeli (04-domain-model PortfolioItem, mig 048)

`portfolio_items` (`slug` PK, `title`, `service_slugs[]`, `sector_tags[]`, `proof_url`, `metrics jsonb`, `confidentiality` `public`/`anonymized`/`private_nda`) + `portfolio_claims` (`item_id`, `claim`, `approved`).

**Approved-only claim gate (07 §Gizlilik — pazarlıksız):** Portföy iddiaları otomatik doğrulanamaz (Cem'in öz-bildirimi); tek güven kapısı **insan onayı**. `portfolio_claims.approved` varsayılan `false`; eşleştirme motoru ve **tüm** outreach/teklif üretimi **yalnız `approved=true`** claim okur. `confidentiality='private_nda'` öğe skorlamaya girebilir (Cem'e "bu sektörde iş yaptım" iç bağlamı) ama gerçek ad/link/görsel outreach metnine **asla enjekte edilmez**.

### 6.3 portfolioMatcher.ts — offerMatcher'ın kardeşi (YENİ, deterministik)

**Dosya:** `src/lib/leadIntel/portfolioMatcher.ts` — `offerMatcher.ts` desenini **birebir** aynalar (07 §Eşleştirme motoru): LLM'siz, saf kod, skorlu, açıklanabilir (`reasons[]`). Skill: `sales.match_portfolio` (deterministic, V1 — 07 §2.6).

```typescript
export interface PortfolioMatchInput {
  sector: string
  matchedServiceSlugs: string[]   // ChairOut/ServiceMatch çıktısı
  leadTags: string[]              // opsiyonel evidence etiketleri
  portfolio: PortfolioItem[]      // yalnız active + approved claim'li
  maxMatches?: number
}
export interface PortfolioMatch {
  portfolio_slug: string
  score: number
  reasons: string[]
  displayClientLabel: string | null  // private_nda ise null
  displayUrl: string | null          // private_nda ise null
  approvedClaims: string[]           // YALNIZ approved=true metinleri
}
```

Skorlama = `matchServices` mantığının aynısı: sektör uyumu bonusu + `service_slugs ∩ matchedServiceSlugs` bonusu + etiket kesişimi. **Eşleşme yoksa boş dizi döner — asla "en yakın" diye zorla öğe seçilmez** (07 §Eşleştirme: boş sonuç = geçerli durum). Üretim katmanı (`coldEmail`/`proposal`) bunu "örnek yok" olarak ele almalı, **dolgu metinle kapatmamalı**. Council'e girerse Chair **portföy metnini uydurmaz** — yalnız `approvedClaims` dizisinden seçer (offerMatcher'ın "uydurma yapısal imkânsız" disiplini).

**Sektör taksonomisi çakışması (07 §Sektör taksonomisi — ön koşul):** Repoda iki vokabüler var (`sectorRotation.ts` Türkçe `emlak`/`guzellik` ↔ `catalog.ts`/`council.ts` İngilizce `real_estate`/`beauty`). `PortfolioItem.sector_tags` **canlı lead değerlendirmesiyle aynı taksonomiyi** (İngilizce token) kullanmalı çünkü matcher onu okur. Bu doküman o tutarsızlığı **çözmez**, ön koşul olarak işaretler.

---

## 7. Offer başına tam sözleşme (per-offer contract)

Her `OfferBrief` operatöre sunulmadan önce şu alanları taşır (08 §Kavramsal model + brief gereksinimi):

| Alan | Kaynak | Fabrikasyon kapısı |
|---|---|---|
| **İdeal müşteri / tetik** | tier kuralı (§3) + `customer_category` | deterministik |
| **Kanıt** | `ServiceMatch.evidence_refs` (doğrulanmış) | `requiredEvidenceKinds` kapısı (`offerMatcher.ts:52`) |
| **Teslimatlar (deliverables)** | `offers.ts` `checklist` (`offers.ts:20`) | statik katalog |
| **Fiyat mantığı** | price-rules/operatör (§4) | **LLM sayı üretmez**; yoksa boş+işaret |
| **Kapsam sınırları (scope boundaries)** | şablon (paket ailesine göre) | "dahil değil" net; anlaşmazlık önleyici |
| **Portföy kanıtı** | `portfolioMatcher` (§6) | boş = geçerli; approved-only |
| **İtiraz çengelleri** | şablon havuzu | statik |
| **Pilot opsiyonu** | tier=`pilot` (V2) | assumption: MVP dışı |
| **Retainer potansiyeli** | `internal.retainerPotential` | iç sinyal; upsell için |

**Riskler + sonraki adım (08 §8):** `ChairOut.oversell_warning` (deterministik düşüşte her zaman true) + Skeptic reddettiği iddialar + `pipelineGate.missingProposalFields()` → operatöre **kontrol listesi**. `canEnterProposal()` **false** ise sonraki adım fiyat teklifi DEĞİL, eksik discovery'i kapatan soru/görüşme (`proposalGateMessage()` zaten TR üretir, `pipelineGate.ts:40`). **true** ise Proposal Engine'e (14) devreder — hiçbir şey explicit onay olmadan gitmez.

---

## 8. MVP / V1 / V2 (anti-bloat, tek operatör)

**MVP** (sıfır yeni LLM, sıfır fiyat sabiti):
- `offerArchitect.ts` saf fonksiyon; `ChairOut`+`ServiceMatch[]`+`customerCategory`+discovery+evidenceEngine → `OfferBrief` derler; `internal`/`clientFacing` ayrımı **şemada zorunlu**.
- Varsayılan tier `micro`/`project`/`audit`; `retainer`/`ai_system` yalnız gate geçince.
- Portföy: `portfolio_items`+`portfolio_claims` (mig 048) + operatörün 10-20 gerçek işini elle girdiği **tek admin form** (mevcut hizmet fiyat editörü deseni — yeni dashboard sekmesi DEĞİL, 07 §MVP). `portfolioMatcher.ts` yalnız sektör+`service_slugs` kesişim skoru (embedding YOK, LLM YOK, sıfır maliyet). Seed yoksa `portfolioProof=null` → **kabul edilebilir eksik durum, hata değil** (08 §7).

**V1:**
- Ayrı ücretli "Dijital Varlık Denetimi" (`audit`) SKU'su kataloğa.
- `PortfolioItem` etiket/stil kesişim skoru (hâlâ deterministik).
- Kullanım hakkı/revizyon alanları `ServicePackage`'a taşınır.
- `career.portfolio_gap` skill'ine gerçek handler (aynı `portfolio_items` tablosu, **farklı** scope — `career:read` vs `lead:read`, 07 §Açık sorular).

**V2:**
- `pilot` + `workshop` seviyeleri.
- `portfolio_embeddings` (768d, mig 042 EXACT-FIRST deseni — ANN yok, yalnız ölçümle gerekçelenirse).
- `ai_cost_logs`'tan canlı AI taban-marj; rush fiyatlandırma.

**DOKUNULMAZ:** Bu motor `/gorevler`/`/aliskanliklar`/LIFE DB scope'u talep etmez; `service_catalog`/`offerMatcher`/`customerCategory`/`pipelineGate` **değiştirilmez, yalnız tüketilir**.

---

## 9. Doğrulanamayanlar / açık sorular

- **[UNKNOWN]** TR Reklam Kurulu/TTK'nın "kanıtsız sonuç iddiası" için FTC benzeri somut karşılığı bu oturumda doğrulanmadı (07 §Açık sorular) — gerçek dış müşteriye giden metin öncesi profesyonel hukuk incelemesi. Mevcut `UNPROVEN_CLAIM_RE` lint'i teknik kapı; hukuki görüş değil.
- **[UNKNOWN]** Portföy verisinin kaynağı (Behance/Notion'da hazır liste var mı, sıfırdan mı) repo içinden çıkarılamaz (07/08 §Açık sorular) — MVP **elle giriş** üzerinden ilerler; Behance auto-import doğrulanmamış varsayım (V2).
- **[ASSUMPTION]** `OfferBrief` alan adları öneri; `types.ts` `internal`/`clientFacing` ayrımı 08 §4'ten türetildi (kod incelemesinde yazılı kural değil, sızıntı-önleyici tasarım kararı).
- **[UNKNOWN]** `PRICING_RULES.md`'nin `services/catalog.ts:442` iç yorumundaki bandla ("Starter retainer 15-25k/ay") 08'in dış rakamları (audit $5k-15k vb.) arasında tutarlılık kontrolü ayrıca yapılmalı — bu doküman yapmadı.
</content>
</invoke>
