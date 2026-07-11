---
Doküman: 07-portfolio-and-proof-matching
Tarih: 2026-07-11
Kaynak kalitesi: karışık
Güven: orta
AgencyOS'a etki: Cem'in kendi geçmiş işlerini (portföy) yapısal bir varlık modeline dönüştürüp lead'e göre otomatik, kanıt-onaylı eşleştirme sağlar — outreach/teklif metinlerine "uydurma sonuç" değil gerçek referans girer.
---

## Kısa özet

AgencyOS'ta şu an Cem'in **kendi geçmiş çalışmalarını** (case study/portföy) temsil eden hiçbir veri modeli yok. Tek iz: soğuk e-posta imzasındaki statik `signature_behance` linki (`src/lib/coldEmail.ts:39`). Bu doküman, lead'e göre otomatik portföy eşleştirmesi için (1) bir `PortfolioItem` varlık modeli, (2) gizlilik durumu + yalnız-onaylı-iddia mekanizması, (3) mevcut `offerMatcher.ts` desenini tekrar kullanan deterministik bir eşleştirme motoru öneriyor. Kritik bulgu: kod tabanında zaten **"portföy" kelimesi başka bir anlamda kullanılıyor** — emlak müşterisinin mülk stoku (bkz. aşağıdaki "Terim çakışması"). Bu ayrım netleştirilmeden ilerlemek isim çakışmasına yol açar.

Dış araştırma iki eksene odaklandı: (a) sahte/abartılı sonuç iddialarının hukuki riski (ABD FTC Endorsement Guides — Cem'in Türkiye merkezli ama uluslararası müşterisi de olabilen bir stüdyo olması nedeniyle profesyonel-etik referans olarak alınıyor, TR hukuku için ayrı doğrulama gerekir), (b) gizli/NDA'lı müşteri işlerinin portföyde nasıl gösterileceğine dair pratik desenler.

## Terim çakışması: "Portföy" iki farklı şey

| | Mevcut kod karşılığı | Anlamı | Bu dokümanla ilişkisi |
|---|---|---|---|
| **Emlak portföyü** | `src/lib/services/catalog.ts:579-598` (`portfoy-eslestirme` paketi), `src/lib/offers.ts` (`portfolio_matching` id), `src/lib/sectorPriority.ts:100,111` | Cem'in **emlak sektöründeki müşterisinin** sattığı mülk stoku ↔ alıcı lead eşleştirmesi. Cem'in SATTIĞI bir hizmet paketi. | **İLGİSİZ.** İsim benzerliği tesadüfi; karıştırılmamalı. |
| **Cem'in kendi işleri** | Yok (yalnızca `career.portfolio_gap` skill kaydı, handler'sız — `src/lib/skills/catalog.ts:287-293`) ve `careerRoadmap.ts:1054-1057` (Cem'in "vaka anlatımı yazma" beceri hedefi) | Cem'in geçmiş proje/case study'leri — bu dokümanın konusu. | **BU DOKÜMAN.** |

Öneri: yeni tablo/tip adlarında "portföy" yerine **`portfolio_item` / `case_study`** gibi net bir isim kullanılmalı (örn. `portfolio_items` tablosu, `PortfolioItem` tipi) ve kod yorumlarında emlak paketine açıkça atıf yapılmamalı — iki kavram aynı dosyada asla yan yana gelmemeli.

## Dış araştırma bulguları

| Konu | Bulgu | Kaynak | Tarih | Güven |
|---|---|---|---|---|
| Sahte/abartılı sonuç iddiaları | ABD FTC, Temmuz 2023'te Endorsement Guides'ı (16 CFR Part 255) güncelledi: sahte/yanıltıcı referans-testimonial ÜRETMEK yasak; bir case study'deki sonuç genel müşteri deneyimini yansıtmıyorsa "genel olarak beklenen performans" açıkça belirtilmeli; iddialar için "yeterli kanıt" (adequate substantiation) şartı var. | FTC.gov / eCFR 16 CFR Part 255 (resmi) | 26 Temmuz 2023 (yürürlük) | Yüksek (birincil, ABD hukuku) |
| Türkiye'de eşdeğer | Türkiye'de reklam/pazarlama iddiaları Reklam Kurulu (Ticaret Bakanlığı) ve haksız rekabet hükümleri (TTK) kapsamında denetleniyor; "kanıtsız iddia yasak" ilkesi benzer ama AgencyOS'un mevcut kuralı (salesCopy'de %/ROI vaadi lint'i, `catalog.test.ts`) zaten bu riski karşılıyor. | çıkarım — doğrudan resmi TR kaynağı bu oturumda taranmadı | — | Düşük — **doğrulanamadı, hukuk incelemesi flag'lendi** |
| Gizli/NDA'lı müşteri işlerinin gösterimi | Yaygın pratik: (1) müşteri adı/logosu yerine jenerik tanım ("İstanbul'da bir emlak ofisi"), (2) somut sayı/isim yerine süreç ve karar anlatımı, (3) şifre korumalı/yalnız ciddi lead'e gösterilen bölüm, (4) yayın öncesi müşteriden yazılı onay. Anonimleştirmede dikkat: logo/görsel imzası/URL parçası gibi dolaylı ipuçları da müşteriyi ele verebilir. | UX/portföy pratiği makaleleri (IxDF, Wonderlist, Harlow, Medium — ikincil) | 2024-2026 arası çeşitli | Orta (ikincil ama tutarlı, çok kaynaklı) |
| Case study içerik modeli emsali | Yaygın CMS "case study" şeması: başlık, açıklama, öne çıkan görsel, müşteri/kişi ilişkisi, istatistik blokları, testimonial bloğu, SEO alanları, slug. Bu, aşağıdaki `PortfolioItem` alan setiyle büyük ölçüde örtüşüyor. | DatoCMS "Case Study" şema tarifi (vendor dokümantasyonu) | erişim 2026-07-11 | Orta (ikincil, satıcı dokümantasyonu ama somut şema) |

Bu bulgular kararı değiştirmiyor (zaten planlanan model bu prensiplerle uyumlu) ama iki kuralı güçlendiriyor: **(a) onaysız sonuç iddiası asla dışarı çıkmasın**, **(b) gizli müşteri işleri için anonimleştirme alanı yapısal olarak var olsun** (sonradan eklenecek bir şey değil).

## Cem'in portföy varlık modeli — `PortfolioItem`

Brief'te istenen alanlar + gizlilik/onay katmanı ile önerilen model (mevcut kod idiomlarına uyumlu — `src/lib/types.ts` stilinde):

```typescript
// Yeni dosya önerisi: src/lib/portfolio/types.ts

export type ConfidentialityLevel = 'public' | 'anonymized' | 'private_nda'
// public       = müşteri adı + link herkese açık gösterilebilir
// anonymized   = müşteri adı gizli, jenerik tanımla (clientLabel) gösterilir
// private_nda  = dışarı hiç çıkmaz; yalnız Cem'in İÇ karar desteği (örn. "bu sektörde deneyimim var")

export interface PortfolioClaim {
  id: string
  text: string                    // "Google puanı 3.2 → 4.6" gibi somut iddia
  approved: boolean                // Cem onaylamadan outreach/teklife giremez (HITL kapısı)
  approvedAt: string | null
  evidenceUrl: string | null       // varsa ekran görüntüsü/rapor linki (opsiyonel — yoksa uydurma yapılmaz)
}

export interface PortfolioItem {
  slug: string                     // kanonik, kebab-case, PK
  projectName: string
  clientLabel: string               // confidentiality='public' → gerçek isim; değilse anonim tanım
  sector: string                    // AŞAĞIDAKİ "taksonomi çakışması" bölümüne bak
  problem: string                   // müşterinin başlangıç sorunu (kısa, somut)
  deliverables: string[]            // "logo", "web sitesi", "sosyal medya şablonu" ...
  styleTags: string[]               // görsel stil: "minimal", "kurumsal", "canlı/renkli", "lüks" ...
  result: PortfolioClaim[]          // yalnız approved=true olanlar dış metne girer
  tools: string[]                   // "Figma", "Framer", "n8n" ...
  similarServices: string[]         // services/catalog.ts SERVICE_PACKAGES[].slug referansı
  publicUrl: string | null          // Behance/canlı site linki (varsa)
  confidentiality: ConfidentialityLevel
  visualAssetUrls: string[]         // Storage path — screenshot deseniyle aynı (bkz. EvidenceItem.screenshot)
  relevanceTags: string[]           // serbest etiket havuzu — eşleştirme girdisi (örn. "az-bütçe", "hızlı-teslim")
  active: boolean                   // vitrin dışına alma (silmeden)
  createdAt: string
  archivedAt: string | null
}
```

Bu tip, `src/lib/skills/catalog.ts:287-293`'teki `career.portfolio_gap` skill'inin `inputSchema.portfolio: 'PortfolioItem[]'` referansıyla **isim düzeyinde zaten örtüşüyor** — o skill şu an handler'sız (`handlerKey: null`) ama tip beklentisi burada karşılanmış olur.

## Gizlilik + onaylı iddia mekanizması (HITL)

Lead kanıt motorunda (`src/lib/leadIntel/*`) "kanıt" otomatik toplanıp `verified` bayrağıyla doğrulanıyor (PageSpeed, Places API vb. — `EvidenceItem.verified`, `src/lib/types.ts:266-277`). **Portföy iddiaları için bu otomatik doğrulama mümkün değil** — bunlar Cem'in kendi geçmişine dair öz-bildirimler. Bu yüzden tek güven kapısı **insan onayı**dır, otomatik kanıt değil.

Önerilen mekanizma, mevcut `src/lib/memory/governance.ts`'teki quarantine→active desenine paralel ama basitleştirilmiş:
- Yeni eklenen her `PortfolioClaim.approved` varsayılan `false`.
- Admin arayüzünde (mevcut hizmet fiyat editörüne benzer basit bir CRUD ekranı — bkz. MVP notu) Cem tek tıkla onaylar → `approved: true, approvedAt: now()`.
- Eşleştirme motoru ve tüm outreach/teklif üretimi **yalnız `approved=true` claim'leri** okur; onaysız claim var olabilir (taslak/hazırlık) ama asla dışarı sızmaz.
- `confidentiality='private_nda'` öğeler eşleştirme motorunun skorlamasına dahil olabilir (Cem'e "bu sektörde iş yaptım" iç bağlamı verir) ama `publicUrl`/`visualAssetUrls`/`clientLabel` gerçek adı **outreach metnine asla enjekte edilmez** — yalnız `confidentiality != 'private_nda'` öğelerin referans/link alanları dışa yazılabilir.

## Eşleştirme motoru — mevcut deterministik deseni tekrar kullan

`src/lib/leadIntel/offerMatcher.ts` zaten tam ihtiyaç duyulan deseni uyguluyor: LLM'siz, saf kod, skorlu, açıklanabilir (`reasons: string[]`) eşleştirme. Portföy eşleştirmesi bunun bir kardeşi olmalı, aynı dosyada değil ama aynı imzada:

```typescript
// Öneri: src/lib/leadIntel/portfolioMatcher.ts

export interface PortfolioMatchInput {
  sector: string
  matchedServiceSlugs: string[]   // council.ts'in ServiceMatch[].service_slug çıktısı
  leadTags: string[]              // opsiyonel — evidence'tan türetilen serbest etiketler
  portfolio: PortfolioItem[]
  maxMatches?: number
}

export interface PortfolioMatch {
  portfolio_slug: string
  score: number
  reasons: string[]
  // Yalnız outreach'e YAZILABİLİR alanlar (private_nda ise null):
  displayClientLabel: string | null
  displayUrl: string | null
  approvedClaims: string[]        // yalnız approved=true metinleri
}
```

Skorlama mantığı `matchServices`'in aynısı: sektör uyumu bonusu + `similarServices ∩ matchedServiceSlugs` bonusu + `relevanceTags`/`styleTags` kesişim bonusu. **Eşleşme yoksa boş dizi döner — hiçbir zaman "en yakın" diye zorla bir öğe seçilmez.** Bu, kuraldaki "portföy bağlantısı yoksa uydurma" ilkesinin doğrudan kod karşılığıdır: boş sonuç = geçerli bir durum, üretim katmanı (coldEmail/proposal) bunu "örnek yok" olarak ele almalı, asla dolgu metinle kapatmamalı.

Bu motor `registry.ts`'teki `SKILL_HANDLERS` allowlist desenine yeni bir deterministik giriş olarak eklenebilir (örn. `lead.portfolio_match`), tıpkı bugün wired olan `lead.match_services` gibi — LLM konseyi (`council.ts`) bu çıktıyı `matches` ile birlikte `Chair`'e girdi olarak verebilir, ama **Chair portföy metnini kendi kelimeleriyle uydurmaz** — yalnız `approvedClaims` dizisinden seçim yapar (offerMatcher'ın "hizmet uydurma yapısal olarak imkânsız" ilkesiyle birebir aynı disiplin).

## Veri modeli (DB) — taslak, migration numarası atanmadı

Mevcut migration desenlerine (additive, idempotent, RLS default-deny + service-role bypass, `REVOKE ALL ... FROM anon, authenticated`) uygun:

```sql
-- Öneri: sonraki serbest migration numarası (bu doküman migration UYGULAMAZ)
CREATE TABLE IF NOT EXISTS portfolio_items (
  slug              TEXT PRIMARY KEY,
  project_name      TEXT NOT NULL,
  client_label      TEXT NOT NULL,
  sector            TEXT NOT NULL,
  problem           TEXT NOT NULL,
  deliverables      TEXT[] NOT NULL DEFAULT '{}',
  style_tags        TEXT[] NOT NULL DEFAULT '{}',
  tools             TEXT[] NOT NULL DEFAULT '{}',
  similar_services  TEXT[] NOT NULL DEFAULT '{}',
  public_url        TEXT,
  confidentiality   TEXT NOT NULL DEFAULT 'anonymized'
                      CHECK (confidentiality IN ('public','anonymized','private_nda')),
  visual_asset_urls TEXT[] NOT NULL DEFAULT '{}',
  relevance_tags    TEXT[] NOT NULL DEFAULT '{}',
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  archived_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS portfolio_claims (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_slug TEXT NOT NULL REFERENCES portfolio_items(slug) ON DELETE CASCADE,
  text          TEXT NOT NULL,
  approved      BOOLEAN NOT NULL DEFAULT false,
  approved_at   TIMESTAMPTZ,
  evidence_url  TEXT
);

ALTER TABLE portfolio_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON portfolio_items FROM anon, authenticated;
REVOKE ALL ON portfolio_claims FROM anon, authenticated;
```

V1/V2 için opsiyonel semantik katman, `supabase/migrations/042_pgvector_embeddings.sql`'deki **EXACT-FIRST** desenle birebir aynı (768-dim, ANN index YOK, yalnız ölçümle gerekçelenirse eklenir):

```sql
CREATE TABLE IF NOT EXISTS portfolio_embeddings (
  portfolio_slug  TEXT PRIMARY KEY REFERENCES portfolio_items(slug) ON DELETE CASCADE,
  embedding       vector(768),
  embedding_model TEXT NOT NULL DEFAULT 'gemini-embedding-001',
  source_hash     TEXT NOT NULL,
  indexed_at      TIMESTAMPTZ DEFAULT now()
);
```

## Entegrasyon noktaları (mevcut dosyalar)

| Dosya | Bugünkü durum | Önerilen ek |
|---|---|---|
| `src/lib/coldEmail.ts:7-24` (`ColdEmailLead`) | `proof_points: string[] \| null` alanı VAR ama bu lead'in KENDİ güçlü yanları, Cem'in portföyü değil | Ayrı, opsiyonel `relevantPortfolio?: PortfolioMatch[]` parametresi builder fonksiyonuna eklenir; eşleşme yoksa alan atlanır (mevcut boş-durum davranışıyla tutarlı) |
| `src/lib/proposalGenerator.ts:9-20` (`ProposalTier`) | `includes: string[]` statik liste | Her kademeye opsiyonel `exampleRef?: string` (portfolio slug) eklenebilir — V1, zorunlu değil |
| `src/lib/leadIntel/council.ts` (`CouncilResult.matches`) | Yalnız hizmet eşleşmesi (`ServiceMatch[]`) | Aynı seviyede paralel `portfolioMatches?: PortfolioMatch[]` alanı — Chair şeması genişletilmeden önce ayrı test edilmeli |
| `src/lib/skills/catalog.ts:287-293` (`career.portfolio_gap`) | Handler yok; Cem'in KENDİ kariyer/beceri boşluğunu portföyüne göre analiz eder (iş bulma amaçlı, farklı tüketici) | Aynı `portfolio_items` tablosunu OKUYABİLİR ama farklı bir handler/sorgu — bu doküman o skill'i uygulamayı KAPSAMAZ, yalnız aynı tabloyu paylaşabileceğini not eder |
| `src/data/careerRoadmap.ts:1054-1057,1802` | "Portfolyo & Vaka Anlatımı" — Cem'in yazma BECERİSİNİ geliştirme hedefi | İlgisiz ama bitişik: bu beceri geliştikçe `PortfolioClaim.text` kalitesi artar — dolaylı ilişki, kod bağlantısı yok |
| `src/lib/services/catalog.ts` (`ServicePackage.slug`) | `similarServices` alanının referans hedefi | `PortfolioItem.similarServices[]` bu slug'lara işaret etmeli — foreign-key değil ama test-time doğrulanabilir (mevcut `catalog.test.ts` desenine benzer bir "geçersiz slug" testi eklenebilir) |

## Sektör taksonomisi çakışması — önemli ön koşul

Kod tabanında **iki farklı sektör kelime dağarcığı** var: `src/lib/sectorRotation.ts` Türkçe id'ler kullanıyor (`emlak`, `guzellik`, `dis_klinigi`...), `src/lib/services/catalog.ts`'teki `targetSectors` ve `council.ts`'in canlı `sector` alanı İngilizce token kullanıyor (`real_estate`, `beauty`, `health_clinic`...). `PortfolioItem.sector` hangi eşleştirme motoruyla konuşacaksa (öneri: canlı lead değerlendirmesiyle aynı taksonomi, yani **İngilizce token seti**, çünkü `offerMatcher.ts`/`council.ts` bunu kullanıyor) o vokabülerle doldurulmalı. Bu, bu dokümanın çözdüğü bir sorun değil, var olan bir tutarsızlık — entegrasyon öncesi hangi tabloyla eşleşeceği netleştirilmeli.

## MVP / V1 / V2 ayrımı

**MVP** (kod yok, yalnız veri girişi + basit sorgu):
- `portfolio_items` + `portfolio_claims` migration'ı (ayrı onay bekleyen dosya, bu doküman UYGULAMAZ).
- Cem'in en iyi 10-20 projesini elle giren minimal bir admin ekranı (mevcut hizmet fiyat editörüne benzer basit bir form — yeni bir dashboard sekmesi DEĞİL, mevcut admin yapısına eklenen tek sayfa).
- `portfolioMatcher.ts`: yalnız sektör + `similarServices` kesişimiyle skor (embedding yok, LLM yok — sıfır maliyet).
- `coldEmail.ts`'e opsiyonel tek satır entegrasyon: eşleşme varsa 1 onaylı iddia eklenir, yoksa hiçbir şey eklenmez.

**V1**:
- `relevanceTags`/`styleTags` kesişim skoru eklenir (hâlâ deterministik).
- `career.portfolio_gap` skill'ine gerçek handler — aynı `portfolio_items` tablosunu farklı bir sorguyla kullanır.
- `proposalGenerator.ts` kademelerine `exampleRef` bağlanır.

**V2**:
- `portfolio_embeddings` (768-dim, migration 042 deseniyle) — semantik benzerlik (`relevanceTags` yetersiz kaldığında).
- Council'e `portfolioMatches` alanı eklenir, Chair yalnız onaylı referanslar arasından seçer (LLM'e serbest metin üretim yetkisi YOK, yalnız seçim).
- Confidentiality='private_nda' öğeler için "iç sinyal, dış görünmez" ayrımı UI'da görsel olarak vurgulanır (kilit ikonu vb.).

## Açık sorular / doğrulanamayanlar

- [UNKNOWN] Türkiye'de "kanıtsız sonuç iddiası"na dair Reklam Kurulu/TTK hükümlerinin FTC benzeri somut bir karşılığı bu oturumda doğrulanmadı — gerçek bir dış müşteriye gönderilecek metin öncesi profesyonel hukuk incelemesi önerilir.
- [ASSUMPTION] `PortfolioItem.sector` alanının `services/catalog.ts`/`council.ts` İngilizce taksonomisiyle doldurulacağı varsayıldı (sectorRotation.ts'in Türkçe id'leri değil) — bu, iki taksonomi arasında AgencyOS'un genelinde zaten var olan bir tutarsızlığın bir yansıması; bu doküman o tutarsızlığı ÇÖZMÜYOR.
- [UNKNOWN] Behance'ın genel API'sinin (otomatik proje içe aktarımı için) 2026 itibarıyla yeni entegrasyonlara açık olup olmadığı bu oturumda doğrulanmadı — V2 "Behance'tan otomatik içe aktarım" fikri **doğrulanmamış varsayım**, MVP elle giriş üzerinden ilerlemeli.
- [LIKELY] `career.portfolio_gap` ve önerilen `lead.portfolio_match` aynı `portfolio_items` tablosunu güvenle paylaşabilir çünkü ikisi de salt-okunur tüketici; ancak iki skill'in `permissionScopes`'u farklı (`career:read` vs muhtemelen `lead:read`) — registry.ts'e eklenirken scope ayrımı korunmalı.
- Açık soru: `portfolio_claims.evidence_url` boş olan (yalnız Cem'in sözlü/hafıza onayına dayanan) iddialar için onay eşiği tek kişilik operatör onayından daha katı bir şey gerekiyor mu (örn. müşteriden yazılı onay alma zorunluluğu)? Bu ürün kararı, bu dokümanın kapsamı dışında — Cem'in kendisi karar vermeli.
