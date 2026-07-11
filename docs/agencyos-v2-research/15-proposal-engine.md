---
Doküman: 15-proposal-engine
Tarih: 2026-07-11
Kaynak kalitesi: karışık (repo denetimi birincil; teklif-içeriği/e-imza/versiyonlama bulguları ikincil — pazarlama-teknoloji vendor raporları + genel hukuk bilgisi)
Güven: orta
AgencyOS'a etki: mevcut iki ayrı "teklif" üretici (proposalGenerator.ts + proposalBuilder.ts) kalıcılık/versiyon/PDF/e-imza/öğrenme katmanı olmadan yaşıyor — bu doküman onları tek bir Proposal veri modeli etrafında birleştirip üstüne inşa edilecek somut bir MVP/V1/V2 planı çıkarır.
---

## Özet

AgencyOS'ta bugün İKİ farklı "teklif" üretici kod var ve birbirinden habersiz çalışıyor:

1. **`src/lib/proposalGenerator.ts`** — bütçe bandı + risk skoruna göre 3 kademeli (Lite/Core/Growth) sabit retainer fiyatlaması üretir (anchoring/decoy psikolojisi). `GET /api/leads/[id]/proposal` route'u bunu objection library + persuasion trigger'larla birlikte döner. **Hiçbir UI bileşeni bu route'u çağırmıyor** (grep doğrulandı) — yani bu endpoint şu an ölü kod / kullanılmayan bir "strateji brifingi".
2. **`src/lib/proposalBuilder.ts`** — gerçek teklif metnini üretir: seçilen `offerIds` + lead verisinden problem/çözüm/kapsam/fiyat/WhatsApp+e-posta metni kurar. Bunu çağıran tek yer **`src/components/map/LeadDrawer.tsx`** (`/harita` sayfası) — tamamen client-side, state'te tutulur, hiçbir yere **persist edilmez**. Sayfa kapanınca teklif kaybolur.

Kalıcı bir `proposals` tablosu YOK. Versiyon, PDF, e-imza, fiyat geçmişi, kabul/ret nedeni öğrenme — hiçbiri mevcut değil. Bu doküman, mevcut iki üreticiyi bozmadan/silmeden, üstüne modüler bir içerik modeli + kalıcılık + öğrenme katmanı önerir.

## 1. Mevcut durum — dosya dosya

| Dosya | Ne yapıyor | Kim çağırıyor | Kalıcılık |
|---|---|---|---|
| `src/lib/proposalGenerator.ts` | 3 kademeli fiyat + peşinat oranı (saf fonksiyon, test edilebilir) | `src/app/api/leads/[id]/proposal/route.ts` (GET) | Yok — her istekte yeniden hesaplanır |
| `src/lib/proposalBuilder.ts` | Lead + offerIds → problem/çözüm/kapsam/fiyat/WhatsApp+e-posta metni (`Proposal` tipi, `src/lib/types.ts:314`) | `src/components/map/LeadDrawer.tsx:226` (`handleBuildProposal`) | Yok — yalnız React state (`useState<Proposal|null>`) |
| `src/lib/types.ts:312-332` | `ProposalStatus = 'draft'|'sent'|'accepted'|'rejected'` + `Proposal` interface zaten tanımlı ama hiçbir DB tablosu bu status'ü saklamıyor | — | — |
| `src/lib/leads/pipelineGate.ts` | `canEnterProposal()` — pain_point + decision_maker + budget_band doluluğu | `leads.status = 'proposal'` geçişinde kullanılmalı (LeadModal.tsx'te discovery paneli var) | leads tablosu kolonları (mig 020) |

**[CERTAIN]** `Proposal` TypeScript tipi zaten `status: ProposalStatus` alanı taşıyor — yani veri modeli tasarımı kısmen düşünülmüş ama hiç bir migration'da karşılığı yok. Bu, "sıfırdan tasarla" değil "zaten planlanmış tipi gerçek tabloya bağla" işi.

**[LIKELY]** İki üreticinin birleşmemiş olması bilinçli bir ayrım değil, zamanla farklı ihtiyaçlar için yazılıp entegre edilmemiş iki parça — biri (`proposalGenerator`) pazarlık/ikna stratejisi katmanı, diğeri (`proposalBuilder`) somut belge içeriği katmanı. İkisi farklı amaçlara hizmet ettiği için **silinmemeli**, ama `proposalGenerator`'ın 3-kademe çıktısı `proposalBuilder`'ın `services` listesine opsiyonel bir girdi olarak bağlanabilir (bkz. §7 MVP).

## 2. Teklif içerik modeli — 16 modüler blok

Araştırılan vendor kaynakları (PandaDoc, Proposify, Visme, ClientPoint — bkz. kaynaklar) ile mevcut `proposalBuilder.ts`'nin ürettiği alanları eşleştirdim. Kod zaten 8/16 bloğu üretiyor; kalan 8'i modüler ek olarak eklenmeli.

| # | Blok | Durum | Kaynak (varsa) |
|---|---|---|---|
| 1 | Context (bağlam — nasıl tanıştık, ne konuşuldu) | Kısmen var (`whyNow` alanı, evidence'tan) | `lead.why_now` (evidenceEngine) |
| 2 | Problem statement | VAR (`deriveProblem`, `pain_points` veya sektör profili fallback) | proposalBuilder.ts:23 |
| 3 | Objectives (müşterinin hedefi) | YOK — problem ile karışık yazılıyor, ayrı blok değil | — |
| 4 | Proposed solution | VAR (`buildSolutionText`) | proposalBuilder.ts:31 |
| 5 | Scope of work | VAR (`scope[]`, her offer'ın checklist'inden 2 madde) | proposalBuilder.ts:142-145 |
| 6 | Deliverables | Kısmen — scope ile birleşik, ayrı "teslim edilecekler" listesi yok | — |
| 7 | Timeline | VAR (`timeline`, en uzun `deliveryDays`) | proposalBuilder.ts:148 |
| 8 | Responsibilities (müşteriden beklenen: erişim, içerik, onay SLA) | YOK | — |
| 9 | Revision policy (kaç revizyon dahil, sonrası ücret) | YOK | — |
| 10 | Pricing | VAR (`setupPrice`, `monthlyPrice`) — ama tek toplam, kademeli değil | proposalBuilder.ts:135-136 |
| 11 | Payment terms (peşinat %, vade) | Kısmen — `proposalGenerator.ts`'te var ama `proposalBuilder`'a bağlı değil | proposalGenerator.ts:94-104 |
| 12 | Usage rights (kaynak dosya/telif kime ait) | YOK | — |
| 13 | Assumptions (fiyatın dayandığı varsayımlar) | YOK | — |
| 14 | Out-of-scope (net olarak dışarıda bırakılan) | YOK | — |
| 15 | Optional modules / upsell | Kısmen — `upsellSlugs` katalogda var ama teklife dahil edilmiyor | services/catalog.ts |
| 16 | Next step + expiry (geçerlilik tarihi) | Kısmen — `nextStep` var, **expiry YOK** | proposalBuilder.ts:149 |

**Çıkarım:** En kritik iki eksik **Assumptions** ve **Out-of-scope** — ikisi de anlaşmazlık önleyici bloklar ve tasarım/otomasyon işlerinde ("müşteri 3. parti API erişimini geç verirse süre uzar" gibi) somut anlaşmazlık kaynaklarını önceden kapatıyor. **Expiry (geçerlilik tarihi)** de eksik: fiyat teklifleri süresiz görünüyor, bu da fiyat pazarlığında operatörün elini zayıflatıyor.

## 3. Pipeline aşaması ile ilişki

`src/lib/leads/pipelineGate.ts` zaten "teklif" aşamasına geçiş kapısını tanımlıyor: `pain_point` + `decision_maker` + `budget_band` üçü de dolu olmadan `canEnterProposal()` false döner. **[CERTAIN]** Bu kapı bugün yalnız `leads.status` geçişini korumak için var; teklif belgesinin ÜRETİLMESİNİ engellemiyor — yani teorik olarak biri gate'i atlayıp LeadDrawer'dan discovery alanları boşken de teklif üretebilir.

**Öneri:** Teklif üretim fonksiyonunun kendisi de aynı gate'i çağırmalı (`canEnterProposal(lead)` kontrolü `buildProposal()` çağrısından önce UI'da disable/uyarı olarak eklenmeli) — böylece "nitelenmemiş lead'e teklif" riski hem status hem belge seviyesinde kapanır.

## 4. CRM verisi → teklif alan eşleme

| Teklif alanı | Kaynak (Lead alanı / dosya) |
|---|---|
| Problem statement | `lead.pain_point` (mig 020, tekil) veya `lead.pain_points[]` (evidenceEngine, çoğul) — **iki farklı alan var, proposalBuilder yalnız çoğulu okuyor, tekili okumuyor** |
| Context / açılış cümlesi | `lead.why_now` |
| Karar verici hitabı | `lead.decision_maker` — **şu an hiç kullanılmıyor**, proposalBuilder yalnız `business_name` ile hitap ediyor |
| Bütçe bandı → fiyat/peşinat | `lead.budget_band` → `proposalGenerator.buildProposal()` (bağlı değil) |
| Önerilen hizmetler | `lead.recommended_offers[]` (Lead Intelligence v2 council çıktısı) → `offerIds` |
| Kanıt/somut gözlem | `lead.proof_points[]`, `lead_evidence` tablosu (mig 033) |
| Sektör bağlamı | `lead.sector` → `matchSectorProfile()` (sectorPriority.ts) |
| Risk/peşinat oranı | `lead.risk_score` → `proposalGenerator` (bağlı değil) |

**Bulgu:** `decision_maker` ve `budget_band` alanları discovery gate'i geçmek için ZORUNLU tutuluyor ama teklif METNİNE hiç akmıyor — toplanan veri kullanılmıyor. Bu, "veri topla ama kullanma" tipik bir kopukluk; MVP'de düzeltilmeli (§8).

## 5. Uydurma problem/metrik engeli (fabrication guard)

Repo zaten iki katmanlı bir anti-fabrikasyon disiplini kurmuş:

- `services/catalog.ts`: `salesCopy` alanlarında kanıtsız %/ROI/kat vaadi **regex ile lint'leniyor** (`catalog.test.ts`, `UNPROVEN_CLAIM_RE`).
- Her `ServicePackage.requiredEvidenceKinds[]` — bir hizmetin önerilebilmesi için hangi kanıt türlerinden en az biri doğrulanmış olmalı.

Teklif motoru bu disiplini **miras almalı, yeniden icat etmemeli**:

1. `buildProposal()` çağrılırken, seçilen her `offerId`'nin karşılık geldiği `ServicePackage.requiredEvidenceKinds`'ından en az biri lead'in `lead_evidence` kayıtlarında `verified=true` olarak bulunmalı — yoksa teklif "kanıtsız hizmet önerisi" uyarısıyla işaretlenmeli (üretimi engellemez, ama operatöre görünür kırmızı bayrak).
2. `problem` alanı asla serbest metin LLM çıktısı olmamalı — ya `lead.pain_point`/`pain_points` (insan girdisi) ya da `evidenceEngine` çıktısı (`why_now`, `pain_signals`) olmalı. Yani **teklif motorunun problem/metrik üretme yetkisi yok, yalnız zaten toplanmış/doğrulanmış veriyi birleştirme yetkisi var** — mevcut `proposalBuilder.ts` zaten bu ilkeye uyuyor (LLM çağrısı yok, saf fonksiyon), bu korunmalı.
3. Yeni eklenecek "Assumptions" ve "Out-of-scope" blokları da şablon-tabanlı (hizmet paketine göre sabit metin havuzundan seçilir) olmalı, LLM serbest üretimi DEĞİL — aksi halde fabrikasyon riski yeniden içeri girer.

## 6. Versiyonlama modeli

Şu an hiç versiyon kavramı yok (her `buildProposal()` çağrısı yeni bir `id` üretir, öncekini geçersiz kılmaz, hiçbir yere yazılmaz). Önerilen model — repoda zaten kullanılan append-only + durum-geçiş desenini (`lead_match_feedback`, mig 033) taklit eder:

- `proposals` tablosu: her satır bir **versiyon**. `lead_id`, `version` (int, 1'den başlar), `parent_proposal_id` (önceki versiyona referans, ilk versiyonda null), `status` (`draft|sent|accepted|rejected|superseded`), `content` (JSONB — 16 blok), `setup_price`, `monthly_price`, `created_at`, `expires_at`.
- Yeni versiyon oluşturulunca önceki versiyon `status='superseded'` olur (silinmez — fiyat geçmişi ve "neyi değiştirdik" denetimi için).
- "Kabul edilen" versiyon `accepted_version_id` olarak `leads` tablosuna (veya ayrı `deals`/`projects` tablosuna) yazılır.

Bu, repo'nun zaten benimsediği "asla mutasyon yok, hep yeni satır" ilkesiyle (CLAUDE.md immutability kuralı) birebir örtüşüyor.

## 7. Kullanıcı düzenlemelerinden öğrenme

Bugün hiç mekanizma yok — WhatsApp/e-posta metni panoya kopyalanıyor (`copyText`), operatör kopyaladıktan sonra ne değiştirdiği hiç görülmüyor. Önerilen MVP-sonrası (V1) yaklaşım:

1. Kopyalama anında `content` snapshot'ı `proposals.content` olarak DB'ye yazılır (draft).
2. Gerçekten gönderilen metin (operatör WhatsApp/e-postaya yapıştırmadan önce elle düzenlemiş olabilir) — bu düzenlenmiş hâli geri yakalamanın pratik yolu yok (dış kanal, Gmail entegrasyonu henüz yok — bkz. bağlam brifi eksik #1). Bu yüzden V1'de "öğrenme" **yalnız operatörün proposals tablosunda DB üzerinden yaptığı düzenlemelerle** sınırlı tutulmalı (ör. bir "Teklifi Düzenle" formu eklenirse).
3. **[UNKNOWN]** Gmail entegrasyonu (gerçek gönderim + okuma) gelmeden, "kullanıcı ne değiştirdi" verisi güvenilir toplanamaz — bu blok Gmail entegrasyonuna (ayrı araştırma dokümanı, #1/#2 eksik) bağımlı. Şimdilik yalnız DB-içi versiyon diff'i (aynı lead'in v1→v2 arası `content` JSONB diff'i) izlenebilir; bu bile hangi bloğun sık değiştiğini (ör. hep fiyat mı, hep timeline mı) gösterir ve şablonu iyileştirmek için sinyal olur.

## 8. PDF vs web proposal karşılaştırma

| Kriter | PDF (statik) | Web/interaktif proposal |
|---|---|---|
| Üretim maliyeti | Düşük — mevcut `emailText`/`whatsappText` zaten düz metin, PDF'e çevirmek küçük ek iş | Yüksek — ayrı render sayfası, hosting, link güvenliği |
| İzleme (kim ne zaman açtı, hangi bölümde durdu) | YOK | VAR — Proposify/PandaDoc verisine göre bölüm-bazlı görüntüleme takibi takip stratejisini kişiselleştiriyor |
| Çok-kişili karar (birden fazla paydaş) | Zayıf — tek doğrusal okuma | Güçlü — paydaşlar bağımsız erişip inceleyebilir; Proposify 2025 raporu: birden fazla paydaş görüntülediğinde kapanma oranı 2 kat artıyor [ikincil, orta güven] |
| Kademeli fiyat tablosu etkileşimi (checkbox ile modül seç) | YOK (statik) | VAR — etkileşimli fiyat tabloları %54 daha yüksek dönüşüm gösteriyor (Proposify 2025) [ikincil, orta güven] |
| AgencyOS'a uygunluk (tek operatör, düşük hacim, HITL) | **MVP için doğru seçim** — mevcut altyapı (metin üretimi hazır, sadece PDF render eksik) | V2 işi — ayrı sayfa/route + auth/link güvenliği + analytics tablosu gerektirir, şimdiki "4 ekrana dağılmış" karmaşıklığı büyütür |

**Karar gerekçesi [LIKELY]:** Cem tek kişilik, düşük hacimli (günde birkaç teklif) bir operasyon yürütüyor; paydaş-bazlı analytics'in getirisi (Proposify verisi orta-büyük satış ekipleri için toplanmış) bu ölçekte küçük, MVP'de PDF/düz-metin yeterli. Web/interaktif proposal V2'ye ertelenmeli.

## 9. E-imza gerekli mi

**[LIKELY, hukuki kesinlik iddia edilmez — profesyonel hukuk incelemesi önerilir]** 5070 sayılı Elektronik İmza Kanunu'na göre güvenli elektronik imza, ıslak imza ile aynı hukuki sonucu doğurur — ancak kanun e-imzayı **zorunlu kılmaz**, yalnızca **geçerli** kılar. Türk Borçlar Kanunu'nun şekil serbestisi ilkesi gereği hizmet/eser sözleşmeleri genel olarak özel bir şekle tabi değildir; kısa metinli bir e-posta/WhatsApp üzerinden açık kabul beyanı ("Kabul ediyorum, başlayabiliriz") hukuken bağlayıcı kabul edilir, ancak ihtilaf hâlinde yazılı/imzalı sözleşme çok daha güçlü delildir.

**Sonuç:** AgencyOS'un mevcut "draft-only, insan onaylı" felsefesiyle uyumlu asgari çözüm: teklif belgesine "Kabul ediyorum" onay metni + tarih + gönderenin e-posta/WhatsApp yanıtı (kayıt altına alınmış) yeterli asgari kanıt sayılabilir; tam e-imza entegrasyonu (DocuSign/Adobe Sign vb. üçüncü parti) yalnız yüksek bütçeli/kurumsal müşteri (`budget_band: '80k+'`) veya kurumsal ton (`tone: 'kurumsal'`) segmentinde V2 opsiyonu olarak düşünülmeli — MVP'de gereksiz karmaşıklık ve maliyet.

## 10. Fiyat geçmişi

`proposals` tablosunun versiyon zinciri (§6) zaten fiyat geçmişini örtük olarak taşır (her versiyonun `setup_price`/`monthly_price` alanı). Ayrıca lead bazında "ilk teklif fiyatı vs kabul edilen fiyat" farkı (pazarlık indirim oranı) hesaplanabilir bir view olarak eklenebilir — bu, `sectorRotation.ts`/`cityTargeting.ts`'teki "öğrenen görünüm" desenine (yalnız gerçek satış sinyali sayılır) paralel: hangi sektörde/bütçe bandında ne kadar indirim isteniyor sorusuna gelecekte veri sağlar.

## 11. Kabul/ret nedeni öğrenme

`lead_match_feedback` (mig 033) ile bugün zaten kanıtlanmış bir desen var: `verdict` (enum) + `reason_code` (sabit enum liste) + serbest `note`. Aynı desen teklif sonuçları için önerilir:

```
proposal_outcomes (
  id, proposal_id, lead_id,
  outcome TEXT CHECK (outcome IN ('accepted','rejected','no_response','expired')),
  reason_code TEXT CHECK (reason_code IN (
    'fiyat_yuksek', 'zamanlama_kotu', 'kapsam_uyumsuz', 'rakip_secildi',
    'ic_karar_gecikti', 'butce_iptal', 'guven_eksik', 'diger'
  )),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
)
```

Vendor araştırması (ClientPoint) genel B2B kayıp nedenlerini şöyle sınıflıyor: fiyat/paketleme, "karar yok" (%40-60 kayıp anlaşmanın asıl nedeni), ROI'nin net hesaplanamaması, kapsamın müşteri ihtiyacına gevşek oturması. **[çıkarım]** Bu kategoriler yukarıdaki `reason_code` enum'una zaten yansıtıldı; AgencyOS'a özgü ek kategori `guven_eksik` (portföy/proof eksikliği — bağlam brifindeki eksik #5 "portfolyo/proof matching yok" ile doğrudan ilişkili) eklendi.

Bu tablo, `lead_match_feedback`'in beslediği `_v2` öğrenme view'larına (mig 035 deseni) benzer şekilde ileride "hangi sektörde/hangi fiyat bandında ret oranı yüksek" sorusuna cevap verecek bir view'e temel olur — ama bu V2 işi, MVP'de yalnız append-only kayıt yeterli.

## AgencyOS'a entegrasyon

- **Yeni migration (öneri: `045_proposals.sql`)** — `proposals` (versiyon zinciri) + `proposal_outcomes` (kabul/ret) tabloları. Mevcut en yüksek migration `044_trace_memory_governance.sql`; 045 sıradaki boş numara. Elle SQL Editor'dan uygulanmalı (repo kuralı).
- **`src/lib/proposalBuilder.ts`** üstüne ekleme: `problem` çözümünde `lead.pain_point` (tekil, mig 020) alanını da fallback olarak oku (şu an yalnız `pain_points[]` okunuyor — CRM'e girilen tekil discovery alanı kayboluyor). `decision_maker` alanını hitapta kullan.
- **`src/lib/proposalGenerator.ts`** ile **`proposalBuilder.ts`** arasında köprü: `buildProposal()` (builder) çağrılırken `budgetBand`/`riskScore` varsa `proposalGenerator.buildProposal()`'dan `upfrontRate`/`upfrontNote` alıp `Proposal.paymentTerms` yeni alanına yazan ince bir birleştirme fonksiyonu (`src/lib/proposal/mergeProposal.ts` gibi yeni, küçük dosya) — mevcut iki dosyayı silmeden bağlar.
- **`src/lib/leads/pipelineGate.ts`**: `canEnterProposal()` zaten var — `LeadDrawer.tsx handleBuildProposal()` çağrısından önce bu kontrolü ekle, gate'i UI'da da zorunlu kıl.
- **`src/lib/types.ts:314` `Proposal` interface**: yeni bloklar için alan ekle (`objectives`, `deliverables`, `responsibilities`, `revisionPolicy`, `assumptions`, `outOfScope`, `optionalModules`, `expiresAt`) — mevcut alanları KORU, yalnız genişlet (breaking change yok, hepsi opsiyonel).
- **`src/app/api/leads/[id]/proposal/route.ts`**: bugün kullanılmayan bu route ya silinmeli ya da gerçek amacına (pazarlık stratejisi brifingi, LeadModal/LeadDrawer'a "İtiraz kütüphanesi" paneli olarak) bağlanmalı — şu an "yazılmış ama hiç çağrılmayan" durumda, bu kendi başına bir bulgu.
- **Görev/Alışkanlık modülüne dokunulmaz** — bu doküman yalnız satış/CRM tarafını kapsıyor.

## MVP / V1 / V2

- **MVP**: (1) `proposals` tablosu + versiyon zinciri (mig 045); (2) `proposalBuilder.ts`'e Assumptions + Out-of-scope + Expiry blokları (şablon-tabanlı, LLM yok); (3) `pipelineGate` kontrolünü UI'da zorunlu kıl; (4) `pain_point`/`decision_maker` alanlarını gerçekten teklif metnine bağla; (5) düz-metin/Markdown → basit PDF export (mevcut `emailText` içeriğinden, üçüncü parti gönderim YOK, yalnız dosya indirme).
- **V1**: (1) `proposal_outcomes` tablosu + `lead_match_feedback` desenine paralel öğrenme view'ı; (2) `proposalGenerator` + `proposalBuilder` birleştirme köprüsü (kademeli fiyat + peşinat teklife otomatik aksın); (3) fiyat geçmişi/pazarlık indirim raporu.
- **V2**: (1) web/interaktif proposal sayfası + bölüm-bazlı görüntüleme analytics; (2) e-imza/DocuSign entegrasyonu (yalnız kurumsal/yüksek-bütçe segment); (3) Gmail entegrasyonu tamamlandıktan sonra gerçek "kullanıcı düzenlemesinden öğrenme" (gönderilen son hâl ile draft diff'i).

## Açık sorular / doğrulanamayanlar

- **[UNKNOWN]** 5.000 TL üstü işlerde "yazılı sözleşme önerilir" eşiği belirli bir kanun maddesine dayanmıyor — genel pratik tavsiye olarak WebSearch sonucunda sentezlendi, birincil kaynakta (5070 sayılı kanun metni) böyle bir tutar eşiği yok. Kesin hukuki cevap için avukat görüşü gerekir.
- **[UNKNOWN]** `src/app/api/leads/[id]/proposal/route.ts`'nin neden hiçbir UI'dan çağrılmadığı — kasıtlı mı (henüz bağlanmamış özellik) yoksa terk edilmiş kod mu, repo geçmişinden net değil.
- **[UNKNOWN]** PDF üretimi için hangi kütüphane kullanılacağı (repo `package.json`'da mevcut bir PDF kütüphanesi var mı) bu araştırmada kontrol edilmedi — implementasyon öncesi ayrıca doğrulanmalı.
- **[ASSUMPTION]** "Assumptions" ve "Out-of-scope" bloklarının şablon-tabanlı (LLM'siz) üretilmesi gerektiği varsayımı, mevcut `salesCopy` anti-fabrikasyon disiplinini genişletme mantığından çıkarıldı — kod incelemesinde doğrudan yazılı bir kural değil, tutarlılık için önerilen bir tasarım kararı.

## Kaynaklar

- [Proposify — State of Proposals 2025](https://www.proposify.com/state-of-proposals)
- [PandaDoc — Sales Proposal Software](https://www.pandadoc.com/proposal-software/)
- [PandaDoc — How to write a business proposal](https://www.pandadoc.com/blog/how-to-write-a-proposal/)
- [Visme — How to Write a Business Proposal in 2025](https://visme.co/blog/business-proposal/)
- [ClientPoint — 20 Reasons Why B2B Companies Reject Your Proposal](https://www.clientpoint.net/blog/20-reject-business-proposal)
- [ClientPoint — Why 72% of Lost Deals Have Nothing to Do With Your Price](https://www.clientpoint.net/blog/why-72-of-lost-deals-have-nothing-to-do-with-your-proposal)
- [Zoomforth — 10 interactive proposal examples](https://www.zoomforth.com/blog/interactive-proposal-examples/)
- [Sifthub — Structure of a proposal](https://www.sifthub.io/blog/structure-of-a-proposal)
- [5070 Sayılı Elektronik İmza Kanunu — mevzuat.gov.tr](https://www.mevzuat.gov.tr/mevzuatmetin/1.5.5070.pdf)
- [Loginoffice — Freelancer Sözleşme Örneği](https://www.loginoffice.com.tr/freelancer-sozlesme-sablonu/)
