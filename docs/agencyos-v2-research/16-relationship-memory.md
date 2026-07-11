---
Doküman: 16-relationship-memory
Tarih: 2026-07-11
Kaynak kalitesi: karışık (akademik/vendor blog birincil, repo denetimi birincil)
Güven: orta
AgencyOS'a etki: `agent_memory` (mig 044) + `governance.ts`'e scope/layer/supersession kolonları eklenerek lead-bazlı ilişki hafızası inşa edilir; yeni tablo YOK, mevcut şema genişler
---

## Özet

AgencyOS'ta zaten bir hafıza *çekirdeği* var: `agent_memory` tablosu (mig 044) + `src/lib/memory/governance.ts` (quarantine→active promosyon, confidence, retention). Ama bu çekirdek **kapsamsız (scope'suz)**: `memory_key`/`content` global bir anahtar-değer deposu, hangi lead'e ait olduğunu bilmiyor. Kodda `agent_memory` adına tek referans migration dosyasının kendisi — [CERTAIN] hiçbir TS dosyası bu tabloya okuma/yazma yapmıyor (repo geneli grep doğrulandı). Yani hafıza *mantığı* var, hafıza *kullanımı* yok.

Bu doküman beş hafıza katmanını (Contact/Company/Outreach/Offer/Preference) tanımlar, her birinin AgencyOS'ta hangi mevcut tabloya karşılık geldiğini / hangi gerçek boşluğu doldurduğunu çıkarır, ve `agent_memory`'yi **yeniden yazmadan** scope+layer+supersession kolonlarıyla genişletmenin somut planını verir. Ana bulgu (endüstri araştırmasından): (1) izolasyon "retrieval'dan ÖNCE filtrele, sonra değil" ilkesiyle sağlanır — LLM'e güvenme; (2) çelişen gerçekler SİLİNMEZ, geçersiz kılınır (bi-temporal/supersession) — mevcut `archived` durumu bu semantiğe zaten uygun; (3) confidence zamanla bozunur (decay) — mevcut `confidenceFromOccurrences` tek yönlü artıyor, zaman-bazlı düşüş eksik.

## Beş hafıza katmanı — mevcut karşılık ve gerçek boşluk

| Katman | Ne saklar | AgencyOS'ta mevcut karşılık | Gerçek boşluk |
|---|---|---|---|
| **Contact** | kim/rol/iletişim tercihi/geçmiş yanıt biçimi/son+sonraki temas | `person_leads` (mig 027: title, seniority, email_status) + `leads.last_contact_at`/`next_follow_up_at` (mig 004) | Kişi-özel *öğrenilen* tercih yok ("telefonu açmıyor, WhatsApp'a hızlı dönüyor" gibi kalıcı gözlem hiçbir yerde birikmiyor) |
| **Company** | firma bilgisi/ihtiyaç/geçmiş fırsat/kayıp nedeni/teklifler/ilişki durumu | `leads.pain_point`/`decision_maker`/`budget_band` (mig 020, tek mutable alan) + `leads.notes` + `projects` (mig 001) | Bu alanlar **tek değerli** — geçmiş sürüm yok. Karar verici değişirse eski isim sessizce kaybolur; "6 ay önce X sebebiyle kaybettik" hafızası yok |
| **Outreach** | angle/gönderilen/follow-up/yanıt/sonuç | `outreach_messages` + `follow_up_sequences` (mig 010) — zaten lead_id scoped, iyi durumda | Küçük: "bu lead'de hangi açı (mini_audit/launch/hiring/before_after, bkz. `coldEmailTemplates.ts`) işe yaradı" özet-hafızası yok, ham mesaj geçmişi var ama örüntü çıkarımı yok |
| **Offer** | hizmet/fiyat/kapsam/itiraz/revizyon/sonuç | `proposalGenerator.ts` (`buildProposal`, tier: lite/core/growth) + `service_catalog` (mig 032) — **stateless üretici**, geçmişi saklamaz | Tam boşluk: hangi teklif hangi lead'e ne zaman verildi, hangi itiraz geldi, revize edildi mi — hiçbir yerde kayıt yok |
| **Preference** | Cem'in düzeltmeleri/onayladığı ton/reddettiği ifade/CTA tercihi/fiyat yaklaşımı | `agent_memory` (mig 044) tam olarak bu iş için tasarlanmış görünüyor (global memory_key/content) | Şema hazır ama **hiç kullanılmıyor** — hiçbir agent akışı buraya yazmıyor |

[CERTAIN] Outreach katmanı zaten en olgun altyapıya sahip — yeniden inşa gerekmiyor, sadece üzerine özet-hafıza eklenir.
[CERTAIN] Offer katmanı tam boşluk — `proposalGenerator.ts` çıktısı hiçbir yerde kalıcılaşmıyor (grep doğrulandı: fonksiyon saf/stateless).

## Kayıt şeması — zorunlu alanlar

Brief'in istediği alan seti (scope/source/confidence/created/last-verified/expiry/human-approved/sensitivity/provenance), mevcut `agent_memory` kolonlarıyla eşlenir:

| Zorunlu alan | Mevcut karşılık (mig 044) | Durum |
|---|---|---|
| source | `source_run_id`, `source_step_id`, `source_tool` | var, yeterli |
| confidence | `confidence NUMERIC(4,3)` | var, `confidenceFromOccurrences()` besliyor |
| created | `created_at` | var |
| expiry | `retention_until` + `isRetentionExpired()` | var |
| human-approved | — | **YOK** — `promotionDecision()` bunu ephemeral input olarak alıyor ama kalıcı sütun yok |
| last-verified | — | **YOK** — decay/staleness hesaplanamıyor |
| scope | — | **YOK** — tam gerçek boşluk, bu doküman merkezi |
| sensitivity | — | **YOK** — ama mig 043 `approval_requests.data_sensitivity` zaten `('public','internal','confidential','secret')` enum'unu tanımlamış, aynen tekrar kullanılmalı |
| provenance (zincir) | `source_*` üçlüsü var ama kanıt zincirine (mig 033 `lead_evidence`) bağlı değil | kısmen var, genişletilmeli |

Önerilen ek kolonlar (additive `ALTER TABLE`, mevcut repo idiomuyla aynı — bkz. mig 005/024/034):

```sql
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS scope_type TEXT NOT NULL DEFAULT 'global'
  CHECK (scope_type IN ('lead', 'person', 'global'));
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS scope_id UUID;   -- soft ref (bkz. aşağı)
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS layer TEXT NOT NULL DEFAULT 'preference'
  CHECK (layer IN ('contact', 'company', 'outreach', 'offer', 'preference'));
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS sensitivity TEXT NOT NULL DEFAULT 'internal'
  CHECK (sensitivity IN ('public', 'internal', 'confidential', 'secret'));  -- mig 043 ile AYNI enum
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS supersedes_id UUID REFERENCES agent_memory(id) ON DELETE SET NULL;
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS source_evidence_id UUID;  -- lead_evidence.id'ye soft ref
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS human_approved BOOLEAN NOT NULL DEFAULT FALSE;
-- Bütünlük: lead/person scope zorunlu scope_id ister, global zorunlu NULL ister.
ALTER TABLE agent_memory ADD CONSTRAINT agent_memory_scope_consistency
  CHECK (
    (scope_type = 'global' AND scope_id IS NULL) OR
    (scope_type IN ('lead','person') AND scope_id IS NOT NULL)
  );
CREATE INDEX IF NOT EXISTS idx_agent_memory_scope ON agent_memory(scope_type, scope_id, layer);
```

**`scope_id` neden hard FK değil**: `leads` ve `person_leads` iki ayrı tablo (mig 027 yorumu: "leads tablosundan AYRI"), tek kolon her ikisine de işaret edebilmeli. Repo zaten bu deseni kullanıyor — `lead_service_matches.lead_id` (mig 033) de bilerek FK değil ("FK değil: kod validate eder" yorumu). Aynı yaklaşım burada tekrarlanır: `scope_type='lead'` → `leads.id`, `scope_type='person'` → `person_leads.id`, doğrulama uygulama katmanında.

[ASSUMPTION] `scope_type='person'` (Contact Memory) yalnızca `person_leads` satırı olan lead'ler için kullanılabilir; çoğu Google-Places kaynaklı lead'de ayrı kişi satırı yok — o durumda Contact Memory `scope_type='lead'` + `layer='contact'` olarak firma satırına düşer. Bu, iki lead sisteminin (Places-based `leads` vs Apollo-based `person_leads`) bugüne kadar birleştirilmemiş olmasının doğal bir sonucu; bu doküman bu birleşmeyi ÖNERMİYOR, sadece mevcut ayrımı hafıza şemasına yansıtıyor.

## İzolasyon — bir lead'in verisi başka lead'e sızmamalı

Araştırma (multi-tenant RAG izolasyonu, 2026 — Truto/Blaxel/AWS kaynakları) tek bir ilkeye indirgeniyor: **"retrieval'dan önce filtrele, sonra değil"**. LLM'e veya post-hoc filtrelemeye güvenmek anti-pattern sayılıyor; dört-kiracılı bir test corpus'unda "organik varlık bağlantıları" yüzünden zararsız sorguların %95'i kiracılar-arası sızıntı tetiklemiş (adversarial değil, sıradan retrieval davranışı).

AgencyOS'ta tehdit modeli farklı ama mekanizma aynı gerekçeyle geçerli: burada tek kiracı (Cem) var, riziko "yetkisiz erişim" değil **karışıklık** — asistanın Lead A'ya söylenen bir şeyi Lead B'nin dosyasına yazması/hatırlaması. Aynı ucuz düzeltme işe yarıyor:

1. Her okuma fonksiyonu `WHERE scope_type = 'global' OR (scope_type IN ('lead','person') AND scope_id = $1)` filtresini SQL seviyesinde zorunlu tutar — bu filtre asla LLM prompt'una veya post-processing'e bırakılmaz.
2. V2'de pgvector semantik arama eklenirse (bkz. mevcut `memory_embeddings`, mig 042), aynı `scope_id` kolonu embedding tablosuna da denormalize edilir ve ANN/cosine sorgusunun `WHERE` kısmında (üst-k alındıktan SONRA değil, `ORDER BY` ile AYNI sorguda) uygulanır.
3. `scope_type='global'` (Preference katmanı) tek istisna — kasıtlı olarak TÜM lead'lere görünür, çünkü bu Cem'in kendi tercihidir, bir lead'in sırrı değildir.

## Çelişki çözümü — gerçekler silinmez, geçersiz kılınır

Şirket hafızası zamanla değişir (karar verici işten ayrılır, bütçe bandı güncellenir, ilişki durumu "soğuk"tan "sıcak"a döner). Araştırma (Zep/Graphiti bi-temporal mimari, arXiv 2501.13956, 2026 güncel) net bir kural veriyor: **eski gerçek asla hard-delete edilmez, geçersiz kılınır (invalidate) ve `supersedes` zinciriyle yeni gerçeğe bağlanır** — böylece "şu tarihte ne biliyorduk" sorgusu hâlâ cevaplanabilir.

AgencyOS'ta bu, `governance.ts`'in zaten sahip olduğu `archived` durumuyla bedavaya geliyor — yeniden icat gerekmiyor:

- Aynı `(scope_id, layer, memory_key)` için yeni bir gözlem geldiğinde: eski satır `status='archived'` olur (silinmez), yeni satır `supersedes_id = <eski_id>` ile eklenir.
- `promotionDecision()` (governance.ts satır 25-33) DEĞİŞMEDEN kullanılır — sadece çağrı yerinde "bu key zaten var mı" kontrolü `scope_id + layer + memory_key` üçlüsüne göre yapılır (şu an `mentor_memory`'nin `(kind,key)` aramasıyla aynı desen, bkz. `assistant/memory.ts` satır 126-131).
- Zincir traversali basit bir recursive CTE ile "bu firma hakkında zaman içinde ne öğrendik" görünümü üretir — V2 kapsamı.

## Confidence bozunumu (decay) — mevcut mantığa eklenecek tek şey

`confidenceFromOccurrences()` (governance.ts satır 37-41) yalnız **tekrar arttıkça** güveni yükseltiyor — zamanla düşüş yok. Araştırma (memory decay/half-life, 2026) bunun tek başına yetersiz olduğunu gösteriyor: "gerçek dünya testlerinde saklanan gerçeklerin üçte birinden fazlası 3 ay içinde yanlış çıktı" ve tipik üretim politikası yarı-ömür (half-life, sık kullanılan varsayılan 30 gün) + doğrulanmadan-geçen-süre cezası içeriyor.

Önerilen ek (yeni dosya değil, `governance.ts`'e saf fonksiyon eklenir):

```ts
// confidence, last_verified_at'ten bu yana geçen süreyle katlanarak azalır.
// halfLifeDays sonra confidence yarıya iner; hiç doğrulanmamışsa (last_verified_at=null) etkisiz.
export function decayConfidence(confidence: number, daysSinceVerified: number, halfLifeDays = 30): number {
  if (daysSinceVerified <= 0) return confidence
  const factor = Math.pow(0.5, daysSinceVerified / halfLifeDays)
  return Number((confidence * factor).toFixed(3))
}
```

Bu, mevcut `confidenceWeightedScore()` ile aynı aileden saf bir fonksiyon — test edilebilir, DB'ye dokunmaz, çağrı yeri retrieval anında veya haftalık cron'da olabilir.

## AgencyOS'a entegrasyon (somut)

1. **Migration**: yukarıdaki `ALTER TABLE agent_memory ...` bloğu yeni bir `045_relationship_memory_scope.sql` dosyasına eklenir — mevcut 034/037 gibi "SQL Editor'da elle uygulanır" notuyla. Tablo silinmez/yeniden yaratılmaz, sadece genişler.
2. **Data-access katmanı**: `src/lib/memory/governance.ts` (saf mantık) DEĞİŞMEZ dışında `decayConfidence()` eklenir. Yeni bir ince katman `src/lib/memory/relationshipMemory.ts` (best-effort try/catch deseni, `assistant/memory.ts`'teki `recordMemory`/`getTopMemories` ile AYNI şekil) şu fonksiyonları taşır: `recordScopedMemory({scopeType, scopeId, layer, key, value, source, evidenceId?})`, `getMemoryForScope(scopeType, scopeId, layer?)` (scope filtresi SQL'de, asla sonradan), `supersede(oldId, newValue)`.
3. **Offer Memory'nin yazma noktası**: `proposalGenerator.ts`'in `buildProposal()` çıktısı stateless kalır (değiştirilmez — üretici fonksiyon saf kalmalı), ama teklif operatöre sunulduğunda/onaylandığında çağıran kod (`ProposalResult` + lead context) `recordScopedMemory({layer:'offer', ...})` ile bir satır yazar. Bu, mevcut hiçbir üretici mantığı bozmadan sadece çağıran taraf sorumluluğu.
4. **Outreach Memory özeti**: `outreach_messages`/`follow_up_sequences` yeniden yapılandırılmaz; bunun yerine bir işlem sonrası (yanıt geldiğinde/sequence bittiğinde) `recordScopedMemory({layer:'outreach', key:'winning_angle', ...})` gibi TÜRETİLMİŞ özet-satırlar yazılır. Ham log kalır, hafıza sadece "bundan ne öğrendik" katmanını ekler.
5. **Hassas gerçekler → HITL**: `sensitivity IN ('confidential','secret')` olarak işaretlenen kayıtlar (ör. bir kişinin kişisel telefonu, bir görüşmede geçen özel bilgi) `human_approved=false` iken retrieval'da varsayılan olarak GİZLENİR — `promotionDecision()`'daki `operatorApproved` yolu zaten var, sadece kalıcı kolona bağlanır. Mevcut `approval_requests` (mig 043) akışıyla aynı `data_sensitivity` sözlüğü kullanıldığı için ayrı bir onay UI'ı gerekmez, mevcut HITL yüzeyine eklenebilir.
6. **Decay cron**: yeni bir cron endpoint AÇILMAZ — mevcut `/api/cron/weekly-retro` (vercel.json'da zaten haftalık) içine ek bir adım olarak `decayConfidence()` toplu güncellemesi + `last_verified_at` üzerinden 30+ gün doğrulanmamış kayıtları `confidence` düşür + operatöre "gözden geçir" listesi olarak yüzeyle.
7. **V2 semantik retrieval**: mevcut `memory_embeddings` (mig 042, şu an ANN indexsiz, exact cosine — 487 satırda yeterli) tablosuna `scope_type`/`scope_id` kolonları denormalize edilir; sorgu SADECE ilgili scope içinde cosine hesaplar.

## MVP / V1 / V2

- **MVP**: `agent_memory`'ye scope/layer/sensitivity/supersedes/last_verified/human_approved kolonlarını ekleyen tek migration + `relationshipMemory.ts`'te `recordScopedMemory`/`getMemoryForScope` (scope filtresi SQL'de zorunlu). Hiçbir mevcut akış bozulmaz çünkü tüm yeni kolonlar `DEFAULT` değerli ve mevcut satır yok (tablo hiç kullanılmıyor). Preference katmanı (global) ilk gerçek kullanıcı olur: operatörün düzelttiği ton/reddedilen ifade örnekleri buraya yazılmaya başlanır.
- **V1**: Offer Memory yazma noktası (proposalGenerator çağıran taraf), Outreach Memory özet-satırları (yanıt/sequence sonu tetiklemesi), decay job'ın `weekly-retro`'ya eklenmesi, hassas kayıtlar için HITL bağlantısı.
- **V2**: `memory_embeddings` scope-farkında semantik retrieval (asistan "bu lead'le daha önce ne konuşmuştuk" sorusunu cevaplayabilir), supersession zincirinin recursive CTE ile "zaman içinde ne öğrendik" görünümü, Contact/Company Memory'nin `/harita`, `/firsatlar`, `/pipeline` ekranlarına salt-okunur "hafıza" paneli olarak yüzeylenmesi (brief'teki "tek günlük satış merkezi yok" boşluğuyla kesişir ama bu doküman o birleştirmeyi önermez, sadece veri katmanını hazırlar).

## Açık sorular / doğrulanamayanlar

- [UNKNOWN] Migration 044 (`agent_memory`, `run_spans`, `eval_datasets`) prod app DB'sinde fiilen uygulanmış mı? Repo konvansiyonu (034/037/041 yorumları) çoğu migration'ın "SQL Editor'da elle uygulanır" olduğunu gösteriyor; bu doküman kapsamında canlı DB sorgusu çalıştırılmadı (görev talimatı: kod değiştirme/migration yok). Uygulama öncesi `list_tables`/`list_migrations` ile doğrulanmalı.
- [UNKNOWN] `scope_type='person'` için `person_leads` tablosunun gelecekte `leads` ile birleştirilip birleştirilmeyeceği (iki ayrı lead sistemi hâlâ ayrık, mig 027 kasıtlı tasarım). Bu doküman birleşmeyi varsaymadı.
- [ASSUMPTION] Half-life=30 gün varsayılan makul çıkış noktası (araştırma kaynaklarında yaygın varsayılan) ama AgencyOS'un gerçek satış döngüsü (haftalar/aylar) için kalibre edilmedi — ilk üretim verisiyle ayarlanmalı.
- Çıkarım: Offer Memory'nin en yüksek ticari değeri taşıyan katman olduğu (itiraz/revizyon geçmişi olmadan aynı hataları tekrarlama riski) — bu doğrudan kaynaklanmadı, repo denetiminden (proposalGenerator'ın stateless olduğu gözlemi) çıkarıldı.
