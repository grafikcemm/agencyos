---
Doküman: 14-proposal-engine
Dalga: 2 (Motor — Dalga 1 sözleşmelerine referansla)
Tarih: 2026-07-11
Durum: Motor tasarımı (04-domain-model + 07-skill-registry + 10-service-and-offer'a bağlı)
Bağımlılık: 04-domain-model.md (Proposal entity, mig 049), 07-skill-registry.md (generate-proposal `sales.draft_proposal` llm V1), 10-service-and-offer-engine.md (OfferBrief girdisi), 05-event-contracts.md (proposal.* event), 09-scoring (pipelineGate)
Kaynak araştırma: 15-proposal-engine.md
---

# AgencyOS V2 — Proposal Engine

## 0. Çerçeve — İKİ kopuk üreticiyi TEK kalıcı modelde birleştir

Bugün repoda **iki ayrı "teklif" üretici** var ve birbirinden habersiz çalışıyor (15 §Özet, doğrulandı):

| # | Dosya | Ne yapar | Çağıran | Kalıcılık |
|---|---|---|---|---|
| 1 | `src/lib/proposalGenerator.ts` | 3 kademeli (Lite/Core/Growth) **retainer fiyat + peşinat oranı** stratejisi (anchoring/decoy); `buildProposal({budgetBand, riskScore})` (`proposalGenerator.ts:82`) | `GET /api/leads/[id]/proposal` route | **Yok** — her istekte yeniden hesap; **hiçbir UI çağırmıyor** (ölü strateji brifingi, 15 §1) |
| 2 | `src/lib/proposalBuilder.ts` | **Gerçek teklif metni** — lead+`offerIds`→problem/çözüm/kapsam/fiyat/WhatsApp+e-posta (`buildProposal()` → `Proposal`, `proposalBuilder.ts:122`) | `LeadDrawer.tsx` (`/harita`), client-side | **Yok** — yalnız React state; sayfa kapanınca teklif kaybolur |

**Kalıcı `proposals` tablosu YOK.** Versiyon, PDF, fiyat geçmişi, kabul/ret nedeni öğrenme — hiçbiri yok. Ama `Proposal` TypeScript tipi + `ProposalStatus = 'draft'|'sent'|'accepted'|'rejected'` **zaten tanımlı** (`types.ts:312,314`) — hiçbir migration bunu saklamıyor. Yani bu **"sıfırdan tasarla" değil, "zaten planlanmış tipi gerçek tabloya bağla + iki üreticiyi köprüle"** işi (15 §1 [CERTAIN]).

**Bu motorun işi:** iki üreticiyi **silmeden/bozmadan** (ikisi farklı amaca hizmet ediyor — biri pazarlık stratejisi, diğeri belge içeriği, 15 §1 [LIKELY]) tek `Proposal` veri modeli + kalıcılık + versiyon zinciri + öğrenme etrafında birleştirmek.

**İki motor arası sınır (10 → 14):** Service & Offer Engine (10) **"ne sunulur"** sorusunu `OfferBrief` ile cevaplar (deterministik, LLM'siz). Proposal Engine (14) o brifi **belgeye çevirir**: bloklar, versiyon, kalıcılık, PDF, sonuç öğrenme. `OfferBrief.clientFacing` → teklif blokları; `OfferBrief.internal` → **teklif metnine ASLA girmez** (10 §2 sızıntı kuralı burada da geçerli).

---

## 1. 16 modüler blok — 8 var, 8 eklenecek (şablon-tabanlı)

Vendor kaynakları (PandaDoc/Proposify/Visme/ClientPoint) ile `proposalBuilder.ts` çıktısı eşleştirildi (15 §2). Kod **8/16** bloğu zaten üretiyor:

| # | Blok | Durum | Kaynak |
|---|---|---|---|
| 1 | Context (bağlam) | Kısmen | `lead.why_now` (`types.ts:151`) |
| 2 | Problem statement | **VAR** | `deriveProblem` (`proposalBuilder.ts:23`) |
| 3 | Objectives (hedef) | YOK — problem'e karışık | — |
| 4 | Proposed solution | **VAR** | `buildSolutionText` (`proposalBuilder.ts:31`) |
| 5 | Scope of work | **VAR** | `scope[]` (checklist'ten 2, `proposalBuilder.ts:142-145`) |
| 6 | Deliverables | Kısmen — scope ile birleşik | — |
| 7 | Timeline | **VAR** | `timeline` (max deliveryDays, `proposalBuilder.ts:148`) |
| 8 | Responsibilities (müşteriden beklenen) | YOK | — |
| 9 | Revision policy | YOK | `PRICING_RULES.md` madde 2 |
| 10 | Pricing | **VAR** (tek toplam, kademesiz) | `proposalBuilder.ts:135-136` |
| 11 | Payment terms (peşinat/vade) | Kısmen — `proposalGenerator`'da var ama bağlı DEĞİL | `proposalGenerator.ts:94-104` |
| 12 | Usage rights (telif) | YOK | `PRICING_RULES.md` madde 3 |
| 13 | **Assumptions** (fiyatın dayandığı varsayım) | YOK | — |
| 14 | **Out-of-scope** (net dışarıda) | YOK | — |
| 15 | Optional modules / upsell | Kısmen — `upsellSlugs` katalogda, teklife girmiyor | `services/catalog.ts` |
| 16 | Next step + **Expiry** (geçerlilik) | Kısmen — `nextStep` var, **expiry YOK** | `proposalBuilder.ts:149` |

**En kritik 3 eksik (15 §2 çıkarım): Assumptions + Out-of-scope + Expiry.** İlk ikisi anlaşmazlık önleyici ("müşteri 3. parti API erişimini geç verirse süre uzar"); Expiry fiyat pazarlığında operatörün elini güçlendirir (süresiz teklif zayıf).

**Pazarlıksız kural (15 §5 madde 3):** Assumptions/Out-of-scope/Expiry blokları **şablon-tabanlı** — hizmet paketine göre **sabit metin havuzundan** seçilir, **LLM serbest üretimi DEĞİL**. Aksi halde fabrikasyon riski yeniden içeri girer. Bu, mevcut `salesCopy` anti-fabrikasyon disiplininin (`UNPROVEN_CLAIM_RE` lint) genişletilmesidir.

**Her blok sözleşmesi (brief gereksinimi):** her blok şu 4 özelliği taşır —
- **Kaynak (source):** hangi lead alanı / dosya / şablon (yukarıdaki tablo).
- **İnsan-düzenlenebilir (human-editable):** operatör DB üzerinden düzenleyebilir → yeni versiyon (§3).
- **Versiyonlu (versioned):** `proposals.content jsonb` içinde snapshot'lanır; v1→v2 diff izlenir.
- **Approved-claim-aware:** portföy/sonuç iddiası içeren blok (Context, Solution, Optional) yalnız `portfolio_claims.approved=true` metni taşır (10 §6.2); doğrulanmış kanıt yoksa iddia yok.

---

## 2. CRM verisi → teklif alan eşleme (toplanan veri KULLANILSIN)

| Teklif alanı | Kaynak (Lead alanı) | Bulgu |
|---|---|---|
| Problem | `lead.pain_point` (tekil, `types.ts:138`) **veya** `pain_points[]` (çoğul, `types.ts:143`) | **proposalBuilder yalnız çoğulu okuyor** (`proposalBuilder.ts:24`); tekil discovery girdisi kayboluyor → MVP'de düzelt |
| Context / açılış | `lead.why_now` (`types.ts:151`) | VAR (`proposalBuilder.ts:166`) |
| Karar verici hitabı | `lead.decision_maker` | **Hiç kullanılmıyor** — yalnız `business_name` ile hitap (`proposalBuilder.ts:88`) → MVP'de bağla |
| Bütçe → fiyat/peşinat | `lead.budget_band` → `proposalGenerator.buildProposal()` | **Bağlı değil** → V1 köprü (§4) |
| Önerilen hizmetler | `OfferBrief.primaryServiceSlug`/`supportingServiceSlug` (10 §2) | Council çıktısı |
| Kanıt | `lead.proof_points[]` (`types.ts:153`), `lead_evidence` (mig 033) | `requiredEvidenceKinds` kapısı |
| Risk/peşinat | `lead.risk_score` → `proposalGenerator` | Bağlı değil → V1 |

**Kilit bulgu (15 §4):** `decision_maker` + `budget_band` **discovery gate geçmek için ZORUNLU tutuluyor** (`pipelineGate.ts:14-18`) ama teklif metnine **hiç akmıyor** — klasik "veri topla ama kullanma" kopukluğu. MVP'de kapanır.

---

## 3. Kalıcılık + versiyon zinciri (mig 049, append-only)

**Şu an hiç versiyon yok** (her `buildProposal()` yeni `id` üretir, öncekini geçersiz kılmaz, hiçbir yere yazmaz). Önerilen model repoda **zaten kullanılan** append-only + durum-geçiş desenini taklit eder (`lead_match_feedback`, mig 033; CLAUDE.md immutability, 15 §6).

**`proposals` (mig 049 — 04-domain-model Proposal):** `id`, `lead_id`, `version` (int, 1'den), `parent_proposal_id` (önceki versiyon ref, ilk=null) / `superseded_by`, `status`, `content jsonb` (16 blok snapshot), `price_snapshot jsonb` (`setup`/`monthly`), `evidence_refs[]`, `created_by`, `approved_by`, `created_at`, `expires_at`.

**Kritik — status enum genişletme:** mevcut TS tipi `ProposalStatus = 'draft'|'sent'|'accepted'|'rejected'` (`types.ts:312`) **`superseded` içermiyor**. mig 049 DB CHECK'i `'draft'|'sent'|'accepted'|'rejected'|'superseded'` olmalı VE `types.ts:312` union'ı `superseded` ile genişletilmeli (additive; mevcut alanları KORU — 15 §Entegrasyon). Yeni versiyon oluşunca önceki `status='superseded'` (silinmez — fiyat geçmişi + "neyi değiştirdik" denetimi).

**Append-only zincir:** asla mutasyon; hep yeni satır. "Kabul edilen" versiyon `accepted_version_id` olarak leads'e (veya `projects`'e) yazılır. Bu, `proposals` versiyon zincirinin fiyat geçmişini **örtük** taşıması demek (her versiyonun `price_snapshot`'ı) — ilk-teklif vs kabul-fiyatı farkı (pazarlık indirim oranı) ileride view olarak hesaplanabilir (15 §10, V1+).

**Gate zorlaması (15 §3):** `canEnterProposal(lead)` bugün yalnız `leads.status` geçişini koruyor; **belge üretimini engellemiyor** — biri gate'i atlayıp discovery boşken teklif üretebilir. MVP'de `buildProposal()` çağrısından ÖNCE UI'da `canEnterProposal()` kontrolü (disable/uyarı) → risk hem status hem belge seviyesinde kapanır.

---

## 4. İki üreticiyi köprüle (silme YOK)

`proposalGenerator` (strateji) ile `proposalBuilder` (belge) **ayrı amaçlara hizmet ettiği için silinmez** (15 §1 [LIKELY]). Köprü:

- **Yeni küçük dosya** `src/lib/proposal/mergeProposal.ts` (15 §Entegrasyon): `buildProposal()` (builder) çağrılırken `budget_band`/`risk_score` varsa `proposalGenerator.buildProposal()`'dan `upfrontRate`/`upfrontNote` (`proposalGenerator.ts:73-75`) alıp `Proposal.paymentTerms` (yeni blok 11) alanına yazar. Mevcut iki dosya değişmeden bağlanır.
- `proposalGenerator`'ın 3-kademe çıktısı, `OfferBrief.tier === 'retainer'` olduğunda `content.pricing`'e opsiyonel kademe girdisi olur (10 §3 retainer kuralı). `retainer` değilse tek-toplam fiyat (mevcut builder davranışı).
- `GET /api/leads/[id]/proposal` route'u bugün **hiç çağrılmıyor** (15 §Entegrasyon) — ya silinir ya da gerçek amacına (pazarlık stratejisi / itiraz kütüphanesi paneli) bağlanır. Bu kendi başına bir bulgu.

---

## 5. Fabrikasyon kapısı — fiyat ve problem ASLA AI-uydurma

Repo zaten iki katmanlı disiplin kurdu (15 §5): `salesCopy` `UNPROVEN_CLAIM_RE` lint + `requiredEvidenceKinds` kanıt kapısı. Proposal Engine bunu **miras alır, yeniden icat etmez**:

1. **Fiyat pazarlıksız:** `content.pricing` sayıları yalnız `service_catalog`/`offers.ts` tabanı veya operatör girdisinden (10 §4). LLM **hiçbir zaman fiyat üretmez**; kural yoksa → **fiyat boş + operatör-giriş işareti** (07 §2.16 `sales.draft_proposal`: "fiyat kuralı yok → fiyat boş + operatör-girişi işareti").
2. **Problem asla serbest LLM çıktısı:** `content.problem` ya `lead.pain_point`/`pain_points` (insan girdisi) ya `evidenceEngine` çıktısı (`why_now`/`pain_signals`). Motorun **problem/metrik üretme yetkisi yok**, yalnız toplanmış/doğrulanmış veriyi birleştirme yetkisi (mevcut `proposalBuilder.ts` zaten LLM'siz saf fonksiyon — korunur).
3. **Kanıtsız hizmet bayrağı:** seçilen her hizmetin `requiredEvidenceKinds`'ından ≥1'i `lead_evidence`'da `verified=true` olmalı; yoksa teklif **"kanıtsız hizmet önerisi" kırmızı bayrağı** (üretimi engellemez, operatöre görünür).
4. **Assumptions/Out-of-scope/Expiry şablon-tabanlı** (§1 — LLM serbest üretim YOK).

**LLM'in rolü (07 §2.16 `sales.draft_proposal`, llm V1):** yalnız **blok framing** (var olan doğrulanmış veriyi akıcı Türkçeye çevirme), preset `agencyos-professional`; yüksek değer → `agencyos-premium-deal`. **Onay: Evet (high risk + confidential).** Çekirdek (fiyat, hangi hizmet, hangi kanıt) pure-code.

---

## 6. Kabul/ret nedeni öğrenme (`proposal_outcomes`, mig 049)

`lead_match_feedback` (mig 033) deseninin aynısı — `verdict` + sabit `reason_code` enum + serbest `note` (15 §11). ClientPoint araştırması "karar yok" kayıpların %40-60'ı; AgencyOS'a özgü `guven_eksik` (portföy/proof eksikliği — 10 §6 ile doğrudan ilişkili) eklendi:

```sql
proposal_outcomes (
  id, proposal_id, lead_id,
  outcome TEXT CHECK (outcome IN ('accepted','rejected','no_response','expired')),
  reason_code TEXT CHECK (reason_code IN (
    'fiyat_yuksek','zamanlama_kotu','kapsam_uyumsuz','rakip_secildi',
    'ic_karar_gecikti','butce_iptal','guven_eksik','diger')),
  note TEXT, created_at TIMESTAMPTZ DEFAULT now())
```

Append-only; MVP'de yalnız kayıt. V1'de `lead_match_feedback`→`_v2` view deseni gibi "hangi sektör/bütçe bandında ret oranı yüksek" view'ine temel (15 §11).

**Kullanıcı düzenlemesinden öğrenme (15 §7):** Kopyalanan metni operatör dış kanalda (WhatsApp/Gmail) elle değiştirdiğinde ne değiştirdiği bugün görülmüyor. Gerçek "gönderilen son hâl vs draft" diff'i **Gmail entegrasyonuna bağımlı** (12-gmail-and-followup) → V2. MVP'de yalnız **DB-içi versiyon diff'i** (aynı lead v1→v2 `content` jsonb) izlenebilir — hangi bloğun sık değiştiği (hep fiyat mı, hep timeline mı) şablon iyileştirme sinyali.

---

## 7. PDF/düz-metin MVP, web/interaktif V2

| Kriter | PDF (statik) — **MVP** | Web/interaktif — **V2** |
|---|---|---|
| Üretim maliyeti | Düşük — `emailText`/`whatsappText` zaten düz metin (`proposalBuilder.ts:169-170`), PDF'e çevirmek küçük iş | Yüksek — ayrı render/hosting/link güvenliği |
| Açılma izleme | Yok | Var (Proposify bölüm-bazlı) |
| Çok-paydaş | Zayıf | Güçlü (Proposify: çok-paydaş görüntüleme kapanmayı 2x, 15 §8) |
| AgencyOS uygunluğu | **Doğru MVP** (tek operatör, günde birkaç teklif, HITL) | V2 — "4 ekrana dağılmış" karmaşıklığı büyütür |

**Karar (15 §8 [LIKELY]):** Cem tek kişilik/düşük hacim; paydaş-analytics'in getirisi bu ölçekte küçük. MVP = düz-metin/Markdown → basit PDF export (mevcut `emailText`'ten, **üçüncü parti gönderim YOK, yalnız dosya indirme**). Web/interaktif + bölüm analytics V2.

**E-imza (15 §9 — [LIKELY], hukuki kesinlik iddia edilmez):** 5070 s. kanun e-imzayı **zorunlu değil geçerli** kılar; TBK şekil serbestisi gereği e-posta/WhatsApp açık kabul ("Kabul ediyorum, başlayalım") bağlayıcı. MVP asgari: "Kabul ediyorum" onay metni + tarih + kayıtlı yanıt. Tam e-imza (DocuSign) yalnız yüksek-bütçe/kurumsal segment V2. **Profesyonel hukuk incelemesi önerilir.**

---

## 8. MVP / V1 / V2 (anti-bloat)

**MVP (mig 049):**
1. `proposals` tablosu + versiyon zinciri (`superseded` status; `types.ts:312` union genişletilir).
2. `proposalBuilder.ts`'e **Assumptions + Out-of-scope + Expiry** blokları (şablon, LLM'siz).
3. `pipelineGate` kontrolü UI'da zorunlu (`buildProposal` öncesi).
4. `pain_point` (tekil) + `decision_maker` alanlarını gerçekten teklif metnine bağla.
5. Düz-metin/Markdown → basit PDF export (gönderim YOK).

**V1:**
1. `proposal_outcomes` tablosu + `lead_match_feedback` desenine paralel öğrenme view'ı.
2. `mergeProposal.ts` köprü (kademeli fiyat + peşinat otomatik aksın).
3. Fiyat geçmişi / pazarlık indirim raporu.

**V2:**
1. Web/interaktif proposal + bölüm-bazlı görüntüleme analytics.
2. E-imza (yalnız kurumsal/yüksek-bütçe).
3. Gmail tamamlandıktan sonra gerçek "gönderilen son hâl vs draft" öğrenme (12'ye bağımlı).

**DOKUNULMAZ:** Görev/Alışkanlık/Rutin + LIFE DB (15 §Entegrasyon). Bu motor yalnız satış/CRM tarafı.

---

## 9. Doğrulanamayanlar / açık sorular

- **[UNKNOWN]** `GET /api/leads/[id]/proposal`'ın neden hiç çağrılmadığı — kasıtlı (bağlanmamış) mı, terk mi, repo geçmişinden net değil (15 §Açık sorular).
- **[UNKNOWN]** PDF üretim kütüphanesi — `package.json`'da mevcut PDF kütüphanesi var mı bu araştırmada kontrol edilmedi; implementasyon öncesi doğrula (15 §Açık sorular).
- **[UNKNOWN]** "5.000 TL üstü yazılı sözleşme" eşiği belirli kanun maddesine dayanmıyor (5070 metninde yok); genel pratik tavsiye — kesin cevap için avukat.
- **[ASSUMPTION]** Assumptions/Out-of-scope şablon-tabanlı (LLM'siz) gereği `salesCopy` anti-fabrikasyon mantığından türetildi; kodda yazılı kural değil, tutarlılık tasarım kararı (15 §Açık sorular).
- **[ASSUMPTION]** `ProposalStatus` union'ına `superseded` eklenmesi additive breaking-change değil; mevcut `draft/sent/accepted/rejected` okuyan kod etkilenmez — build'de tsc ile doğrulanmalı.
</content>
