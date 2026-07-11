# 15 — Memory Architecture (İlişki Hafızası, 5 Katman, Scoped)

> Dalga 2 / motor dokümanı. Bu doküman satış döngüsünün **kalıcı öğrenme** katmanını tanımlar: her lead/şirket/kişi hakkında zamanla ne öğrenildiğini, Ali Cem'in **sesini/tercihlerini** (Voice DNA, K4), ve teklif/itiraz geçmişini — hepsi **scoped**, izole, çürüyen (decay) ve **tek düzenlemenin asla kalıcı kural olmadığı** bir yazma politikasıyla.
>
> **Kaynak zinciri:** onaylı plan §3 (memory izolasyon ruling = HER İKİSİ), §4 (`agencyos-memory` preset), §5 (mig 050 kolonları) · araştırma raporu `16-relationship-memory.md` · repo `src/lib/memory/governance.ts` (SAF çekirdek), `src/lib/assistant/memory.ts` (mentor memory deseni, LIFE DB), `src/lib/assistant/embeddings.ts`, `src/lib/assistant/knowledgeRetrieval.ts` · sibling `04-domain-model.md` (MemoryItem), `05-event-contracts.md` (`memory.proposed`/`memory.approved`), `07-skill-registry.md` (`extract-memory`), `16-openrouter-routing.md` (`agencyos-memory`).
>
> **Bu doküman kod yazmaz** — hedef mimariyi ve sözleşmeyi tanımlar. Kodlama Sprint sonrası, ayrı temiz context'te.

---

## 1. Mevcut durum — hafıza *mantığı* var, hafıza *kullanımı* SIFIR

AgencyOS'ta bir hafıza çekirdeği zaten kodlanmış ama **hiçbir yerden çağrılmıyor**:

- `src/lib/memory/governance.ts` — SAF/deterministik çekirdek: `promotionDecision` (quarantine→active yalnız occurrence≥3 VEYA operatör onayı, `:25-33`), `confidenceFromOccurrences` (asimptotik 1'e, `:37-41`), `mergeOccurrence` (`:58-61`), `retentionUntilMs`/`isRetentionExpired` (`:43-50`), `confidenceWeightedScore` (`:64-66`). Bu dosya tek kötü turun uzun-süreli hafızayı **zehirlemesini** yapısal olarak engelliyor (dosya başı yorum, `:1-3`).
- `agent_memory` tablosu (`mig 044`) — `memory_key`/`content`/`status`/`confidence`/`occurrences`/`source_*`/`retention_until` kolonları var.

**[CERTAIN]** Repo-geneli grep: `agent_memory` adına tek TS referansı migration dosyasının kendisi — **hiçbir TS dosyası bu tabloya okuma/yazma yapmıyor** (`16-relationship-memory` doğruladı, governance.ts hiçbir yerden import edilmiyor). Yani hafıza *mantığı* hazır, *kullanımı* nil. Bu doküman o boşluğu doldurur — **çekirdeği yeniden yazmadan**.

İkinci referans deseni: `src/lib/assistant/memory.ts` — LIFE DB'de (`lifeSupabaseAdmin`) çalışan **mentor_memory** (mentor asistanı için: `recordMemory` occurrence++/confidence artışı `:115-159`, `getTopMemories` `:181-194`, best-effort try/catch). Bu **çalışan** desen (kind/key/value/confidence/occurrences) satış hafızasının şekil-şablonudur — ama **App DB'ye** taşınır, LIFE'a dokunulmaz (plan §2: "Tüm yeni satış tabloları App DB'ye; LIFE'a dokunulmaz").

---

## 2. Beş hafıza katmanı — scoped

Beş katman, her biri mig 050'nin `layer` enum değerine maplenir. Ürün-adı (bu doküman) ↔ DB-`layer` değeri (`04-domain-model.md:177`, suite-kanonik enum) eşlemesi **kilitlidir**:

| # | Katman (ürün adı) | DB `layer` | `scope_type` | Ne saklar | Doldurduğu gerçek boşluk |
|---|---|---|---|---|---|
| L1 | **User Voice / Preference** | `preference` | `global` | Cem'in onayladığı ton, reddettiği ifade, CTA tercihi, fiyat yaklaşımı, **Voice DNA** (`voice_pattern`, K4) | `agent_memory` tam bu iş için tasarlanmış ama hiç kullanılmıyor |
| L2 | **Company** | `company` | `lead` | Firma ihtiyacı, karar-verici, bütçe bandı, kayıp nedeni, ilişki durumu | `leads.pain_point`/`decision_maker`/`budget_band` (`mig 020`) **tek-değerli** — geçmiş sürüm yok; "6 ay önce X sebebiyle kaybettik" hafızası yok |
| L3 | **Contact** | `contact` | `person`\* | Kişi-özel öğrenilen tercih ("telefon açmıyor, WhatsApp'a hızlı döner"), yanıt biçimi | Kişi-özel *öğrenilen* tercih hiçbir yerde birikmiyor |
| L4 | **Outreach** | `outreach` | `lead` | Hangi açı işe yaradı (mini_audit/launch/hiring/before_after), yanıt örüntüsü — **türetilmiş özet** | `outreach_messages`/`follow_up_sequences` ham log tutuyor ama örüntü çıkarımı yok |
| L5 | **Sales-Learning** | `offer` | `lead` | Hangi teklif verildi, itiraz geldi mi, revize edildi mi, kazanıldı/kaybedildi — **en yüksek ticari değer** | `proposalGenerator.ts` stateless — teklif geçmişi hiçbir yerde kalıcılaşmıyor (tam boşluk) |

\* **[ASSUMPTION]** `scope_type='person'` yalnız `person_leads` satırı olan lead'lerde kullanılır (Apollo-kaynaklı). Google-Places lead'lerinde ayrı kişi satırı yoksa Contact hafızası `scope_type='lead'` + `layer='contact'` olarak firma satırına düşer. Bu, iki lead sisteminin (Places `leads` vs Apollo `person_leads`) ayrık olmasının doğal sonucu — bu doküman **birleşme önermez**, sadece mevcut ayrımı şemaya yansıtır (`16-relationship-memory`, `04-domain-model.md:104` soft-ref deseni).

**Olgunluk sırası:** L4 (Outreach) en olgun altyapıya sahip — yeniden inşa gerekmez, sadece özet-satır eklenir. L5 (Sales-Learning) tam boşluk ve en yüksek değer (itiraz/revizyon geçmişi olmadan aynı hataları tekrarlama riski). L1 (Voice/Preference) MVP'nin ilk gerçek yazarı olur (K4 edit-delta).

---

## 3. Şema genişletme — `agent_memory` + mig 050 (additive, tablo silinmez)

`04-domain-model.md:177` ile birebir. Mevcut satır olmadığından (tablo hiç kullanılmıyor) tüm yeni kolonlar `DEFAULT`'lu → hiçbir mevcut akış bozulmaz. Numaralandırma sahibi `19-data-and-worker-architecture.md` (plan §5); burada **numara icat edilmez**, plan §5'in verdiği **050** kullanılır.

Eklenen kolonlar (`mig 050`, mevcut repo idiomu — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, "SQL Editor'da elle uygulanır"):

| Kolon | Tip / kısıt | Amaç |
|---|---|---|
| `scope_type` | TEXT DEFAULT `'global'` CHECK IN (`lead`,`person`,`global`) | izolasyon ekseni |
| `scope_id` | UUID (soft-ref, hard FK DEĞİL) | `lead`→`leads.id`, `person`→`person_leads.id`; validate uygulama katmanında (`mig 033:67` deseni) |
| `layer` | TEXT DEFAULT `'preference'` CHECK IN (`contact`,`company`,`outreach`,`offer`,`preference`) | 5 katman |
| `sensitivity` | TEXT DEFAULT `'internal'` CHECK IN (`public`,`internal`,`confidential`,`secret`) | **`mig 043:27-28` ile AYNI enum** (yeniden kullan, yeni sözlük yaratma) |
| `supersedes_id` | UUID REFERENCES `agent_memory(id)` ON DELETE SET NULL | çelişki-çözüm zinciri |
| `source_evidence_id` | UUID (soft-ref → `lead_evidence.id`, `mig 033`) | provenance/grounding |
| `last_verified_at` | TIMESTAMPTZ | decay/staleness hesabı |
| `human_approved` | BOOLEAN DEFAULT FALSE | hassas kayıt retrieval-gate |
| `memory_type` | TEXT (mevcut/ext) — `voice_pattern` dahil | Voice DNA (K4) |

Bütünlük + performans:
```sql
ALTER TABLE agent_memory ADD CONSTRAINT agent_memory_scope_consistency CHECK (
  (scope_type = 'global' AND scope_id IS NULL) OR
  (scope_type IN ('lead','person') AND scope_id IS NOT NULL) );
CREATE INDEX IF NOT EXISTS idx_agent_memory_scope ON agent_memory(scope_type, scope_id, layer);
```

**`scope_id` neden hard FK değil:** `leads` ve `person_leads` iki ayrı tablo (`mig 027`), tek kolon her ikisine işaret etmeli. Repo bu deseni zaten kullanıyor (`lead_service_matches.lead_id` bilerek FK değil, `mig 033`). Aynı yaklaşım tekrarlanır.

---

## 4. İzolasyon — filter-before-retrieval (defense-in-depth = HER İKİSİ)

Plan §3 ruling: **memory izolasyonu için scope kolonları VE `lead:<id>:` key-prefix — her ikisi** (defense-in-depth). Tek katman yeterli değil; ikisi birbirini yedekler.

**İlke (araştırma, multi-tenant RAG izolasyonu):** "retrieval'dan ÖNCE filtrele, sonra değil." Dört-kiracılı bir test corpus'unda "organik varlık bağlantıları" yüzünden zararsız sorguların %95'i kiracılar-arası sızıntı tetiklemiş (adversarial değil, sıradan retrieval). AgencyOS'ta tek kiracı (Cem) var → risk "yetkisiz erişim" değil **karışıklık**: asistanın Lead A'ya ait bir gerçeği Lead B'nin dosyasına yazması/hatırlaması.

**İki savunma katmanı:**

1. **SQL WHERE filtresi (birincil).** Her okuma fonksiyonu şu filtreyi **SQL seviyesinde** zorunlu tutar — asla LLM prompt'una veya post-hoc filtreye bırakılmaz:
   ```sql
   WHERE scope_type = 'global' OR (scope_type IN ('lead','person') AND scope_id = $1)
   ```
   `scope_type='global'` (L1 Preference) tek kasıtlı istisna — TÜM lead'lere görünür, çünkü Cem'in kendi tercihidir, bir lead'in sırrı değildir.
2. **`lead:<id>:` key-prefix (ikincil, defense-in-depth).** `memory_key` alanı `lead:<uuid>:winning_angle` gibi namespace'lenir. WHERE filtresi bir gün yanlış çağrılsa bile, key-prefix eşleşmesi ikinci bir bariyer sağlar. Kod yanlışlıkla scope'suz sorgu yaparsa, prefix'siz global anahtarlarla lead-anahtarları karışmaz.

**Semantik retrieval (V2):** mig 042 `memory_embeddings` tablosuna `scope_type`/`scope_id` **denormalize** edilir; cosine sorgusu `WHERE`'inde (üst-k SONRASI değil, `ORDER BY` ile AYNI sorguda) uygulanır. Embedding üretimi `gemini-embedding-001` (768d, `embeddings.ts` — OpenRouter'dan DEĞİL, `16-openrouter-routing.md §Embeddings`), depolama pgvector exact-cosine (ANN YAGNI, 487 satırda yeterli).

---

## 5. Çelişki çözümü — gerçekler SİLİNMEZ, geçersiz kılınır (supersession)

Şirket hafızası değişir: karar-verici ayrılır, bütçe güncellenir, ilişki "soğuk"tan "sıcak"a döner. Kural (bi-temporal, araştırma): **eski gerçek asla hard-delete edilmez; geçersiz kılınır ve `supersedes_id` zinciriyle yeni gerçeğe bağlanır** — "şu tarihte ne biliyorduk" sorgusu hâlâ cevaplanabilir.

AgencyOS'ta bu **bedavaya** geliyor — `governance.ts`'in zaten sahip olduğu `archived` durumuyla (`MemoryStatus`, `:5`):

- Aynı `(scope_id, layer, memory_key)` için yeni gözlem geldiğinde: eski satır `status='archived'` (silinmez), yeni satır `supersedes_id=<eski_id>` ile eklenir.
- `promotionDecision()` (`governance.ts:25-33`) **DEĞİŞMEDEN** kullanılır — sadece çağrı yerinde "bu key var mı" kontrolü `(scope_id, layer, memory_key)` üçlüsüne göre yapılır (mentor_memory'nin `(kind,key)` aramasıyla aynı desen, `assistant/memory.ts:126-131`).
- Zincir traversali basit recursive CTE ile "bu firma hakkında zaman içinde ne öğrendik" görünümü üretir (V2 kapsamı).

**`archived`/`rejected` terminal** (`governance.ts:27-28`) → geçersiz kılınan gerçek geri-terfi edemez; yeni bir gözlem yeni bir satır açar. Bu, hafıza tutarlılığını yapısal garanti eder.

---

## 6. Confidence çürümesi (decay) — çekirdeğe eklenecek TEK saf fonksiyon

`confidenceFromOccurrences()` (`governance.ts:37-41`) yalnız **tekrar arttıkça** güveni yükseltiyor — zamanla düşüş yok. Araştırma: "gerçek dünya testlerinde saklanan gerçeklerin üçte birinden fazlası 3 ay içinde yanlış çıktı"; tipik üretim politikası **yarı-ömür (half-life 30 gün) + doğrulanmadan-geçen-süre cezası** içerir.

`governance.ts`'e eklenecek saf fonksiyon (yeni dosya değil, DB'ye dokunmaz, tam test edilebilir — mevcut `confidenceWeightedScore` ile aynı aileden):
```ts
export function decayConfidence(confidence: number, daysSinceVerified: number, halfLifeDays = 30): number {
  if (daysSinceVerified <= 0) return confidence
  const factor = Math.pow(0.5, daysSinceVerified / halfLifeDays)
  return Number((confidence * factor).toFixed(3))
}
```
- `last_verified_at=null` (hiç doğrulanmamış) → etkisiz (çürüme başlamaz; yeni gözlem `last_verified_at` set eder).
- Çağrı yeri: retrieval anında (anlık efektif skor) VEYA haftalık cron toplu güncellemesi. **Yeni cron AÇILMAZ** — mevcut `/api/cron/weekly-retro` (vercel.json'da zaten haftalık) içine ek adım: 30+ gün doğrulanmamış kayıtların `confidence`'ı düşürülür + operatöre "gözden geçir" listesi yüzeylenir.
- **[ASSUMPTION]** half-life=30 gün makul çıkış noktası (yaygın varsayılan) ama AgencyOS satış döngüsü (haftalar/aylar) için kalibre edilmedi — ilk üretim verisiyle ayarlanır.

**Retrieval efektif skoru:** `confidenceWeightedScore(similarity, decayConfidence(confidence, daysSinceVerified))` — mevcut fonksiyon + decay bileşimi. `sensitivity IN ('confidential','secret') AND human_approved=false` → skoru sıfırla (retrieval'da gizle, §7).

---

## 7. Memory WRITE policy — tek düzenleme ASLA kalıcı kural olmaz

Bu, poisoning'in birincil savunmasıdır: **bir defalık bir düzeltme/gözlem doğrudan kalıcı hafızaya (active) yazılmaz.** Yazma bir HAT'tan geçer:

```
feedback_event / gözlem
   → pattern candidate (quarantine satırı, confidence=base)
      → proposed_memory_update (memory.proposed event, occurrence++)
         → confidence eşiği (occurrence≥3) VEYA human_approved=true
            → approved memory (active, memory.approved event)
```

Adım adım (kod noktaları):

1. **feedback_event / gözlem.** İki kaynak: (a) **K4 Voice edit-delta** — operatör outreach taslağını düzeltince `original_body` (LLM) vs `final_body` (gönderilen) farkı `outreach_messages`'a yazılır (`mig 046`, `04-domain-model.md:128`); (b) genel gözlem — `extract-memory` skill thread'den fact çıkarır (`07-skill-registry.md:216`).
2. **pattern candidate.** Fark/fact `agent_memory`'ye `status='quarantine'`, `confidence=confidenceFromOccurrences(1)` ile yazılır. **`memory.proposed`** event (`05-event-contracts.md:227`, Actor `system:relationship-memory`, Kalıcılık durable `status='quarantine'`). Quarantine satır **inert** — retrieval'a girmez.
3. **occurrence merge.** Aynı `(scope_id, layer, memory_key)` tekrar gözlenirse `mergeOccurrence` (`governance.ts:58-61`) occurrence++ + confidence yeniden hesaplanır. Tek-sefer gözlem occurrence=1'de kalır → asla terfi etmez.
4. **terfi kapısı (`promotionDecision`).** quarantine→active yalnız: `occurrences ≥ 3` (DEFAULT_PROMOTION_THRESHOLD, `governance.ts:7`) **VEYA** `operatorApproved=true`. **`memory.approved`** event (`05-event-contracts.md:235`, Actor `system:governance`(occ≥3) | `operator`(HITL), Kalıcılık durable `status='active'`).
5. **hassas kayıt HITL.** `sensitivity IN ('confidential','secret')` işaretli kayıtlar `human_approved=false` iken retrieval'da **varsayılan GİZLİ**. `promotionDecision`'daki `operatorApproved` yolu zaten var — kalıcı `human_approved` kolonuna bağlanır. Mevcut `approval_requests` (`mig 043`) akışı + aynı `data_sensitivity` sözlüğü → **ayrı onay UI'ı gerekmez**.

**Voice DNA (K4) özel notu:** Tek bir edit "Cem böyle yazar" kuralı **yapmaz**. Aynı düzenleme deseni (ör. belirli bir klişenin sürekli silinmesi, belirli bir CTA'ya sürekli çevirme) 3 kez tekrarlanınca `voice_pattern` `layer='preference'` `scope_type='global'` active olur → `coldEmail.ts` persona'sına enjekte edilir. Corpus bootstrap yok (plan K4); öğrenme edit-delta'dan büyür.

---

## 8. Risk matrisi — poisoning / cross-lead leakage / stale-data

| Risk | Senaryo | Mitigasyon (bu doküman) | Nerede zorlanır |
|---|---|---|---|
| **Memory poisoning** | Kötü/yanlış bir gözlem kalıcı hafızayı zehirler, sonraki tüm outreach'i bozar | Tek-edit asla active olmaz (§7); quarantine inert; terfi occ≥3 VEYA HITL; `governance.ts:1-3` bu amaçla yazılmış | `promotionDecision` (`governance.ts:25-33`) |
| **Cross-lead leakage** | Lead A'nın gerçeği Lead B'nin taslağında görünür | filter-before-retrieval: SQL WHERE `scope_id=$1` + `lead:<id>:` key-prefix (defense-in-depth, §4); global tek kasıtlı istisna | okuma fonksiyonu SQL'i (asla LLM) |
| **Stale data** | 6 ay önceki karar-verici/bütçe hâlâ "güncel" sanılır | decay (half-life 30g, §6) + supersession (§5); `last_verified_at` + weekly-retro gözden-geçir listesi | `decayConfidence` + weekly-retro cron |
| **Sensitivity sızıntısı** | Kişisel telefon/özel bilgi taslağa/log'a sızar | `sensitivity` gate: `confidential`/`secret` + `human_approved=false` → retrieval GİZLİ; ham metin `run_spans`'a yazılmaz (`spans.ts:15` redaction) | retrieval skoru sıfırlama + `redactAttributes` |
| **Confusion via prompt-injection** | Web/email içeriği "bunu hafızaya yaz" talimatı içerir | dış içerik = DATA, talimat değil; `extract-memory` çıktısı quarantine (inert) + scope zorunlu; talimat gerçek-alan whitelist'ine takılır | `extract-memory` skill schema (`07-skill-registry.md:216`) |

---

## 9. Data-access katmanı (somut, çekirdeği bozmadan)

- **`governance.ts` DEĞİŞMEZ** — sadece `decayConfidence()` (saf, §6) eklenir.
- **Yeni ince katman `src/lib/memory/relationshipMemory.ts`** — `assistant/memory.ts`'teki `recordMemory`/`getTopMemories` ile **AYNI şekil** (best-effort try/catch, hata fırlatmaz):
  - `recordScopedMemory({scopeType, scopeId, layer, key, value, source, evidenceId?, sensitivity?})` — quarantine yazar, `memory.proposed` yayınlar.
  - `getMemoryForScope(scopeType, scopeId, layer?)` — **scope filtresi SQL'de** (§4), asla sonradan; decay uygulanmış efektif skor; `human_approved=false` hassas kayıt gizli.
  - `supersede(oldId, newValue)` — eski `archived` + yeni `supersedes_id` (§5).
- **L5 (Sales-Learning) yazma noktası:** `proposalGenerator.ts` `buildProposal()` **stateless kalır** (saf üretici bozulmaz); teklif operatöre sunulup onaylanınca **çağıran kod** `recordScopedMemory({layer:'offer', ...})` yazar (çağıran-taraf sorumluluğu).
- **L4 (Outreach) özet:** ham `outreach_messages`/`follow_up_sequences` yeniden yapılandırılmaz; yanıt geldiğinde/sequence bittiğinde `recordScopedMemory({layer:'outreach', key:'winning_angle', ...})` gibi **türetilmiş** özet-satırlar yazılır.
- **Model preset:** `extract-memory` + consolidation → `agencyos-memory` (`16-openrouter-routing.md:119-124`): extract `qwen3.6-flash` → consolidate `gpt-5.6-luna` → high-risk `claude-sonnet-5`. Sensitivity katmanına göre alt-yol.
- **Trace:** her yazma/terfi `recordSpan()` (`spans.ts:81`) ile `run_spans`'a; ham content yazılmaz (redaction).

---

## 10. MVP / V1 / V2

- **MVP:** `mig 050` (scope/layer/sensitivity/supersedes/last_verified/human_approved/memory_type) + `relationshipMemory.ts` (`recordScopedMemory`/`getMemoryForScope`, scope filtresi SQL'de zorunlu) + `decayConfidence` çekirdeğe. **L1 Voice/Preference ilk gerçek yazar** — K4 edit-delta (`original_body`/`final_body` → 3× tekrar → `voice_pattern` active). Hiçbir mevcut akış bozulmaz (tüm kolonlar DEFAULT'lu, mevcut satır yok).
- **V1:** L5 Sales-Learning yazma noktası (proposal çağıran-taraf), L4 Outreach özet-satırları, decay job'ın weekly-retro'ya eklenmesi, hassas kayıt HITL bağlantısı (`mig 043`).
- **V2:** `memory_embeddings` scope-farkında semantik retrieval ("bu lead'le daha önce ne konuşmuştuk"), supersession recursive-CTE "zaman içinde ne öğrendik" görünümü, Contact/Company hafızasının `/pipeline`/`/firsatlar` ekranlarında salt-okunur "hafıza" paneli.

---

## Grounding & açık noktalar

- **Repo atıfları:** `src/lib/memory/governance.ts:5` (MemoryStatus), `:7` (threshold=3), `:25-33` (promotionDecision), `:37-41` (confidenceFromOccurrences), `:43-50` (retention), `:58-61` (mergeOccurrence), `:64-66` (confidenceWeightedScore). `src/lib/assistant/memory.ts:115-159` (recordMemory deseni), `:126-131` ((kind,key) arama), `:181-194` (getTopMemories). `src/lib/assistant/embeddings.ts:8-9` (gemini-embedding-001, 768d). `src/lib/coldEmail.ts:51-77` (persona, Voice DNA seed). `src/lib/trace/spans.ts:15` (SENSITIVE_KEY redaction). mig 042 (memory_embeddings), 043 (approvals + data_sensitivity enum), 044 (agent_memory), 050 (scope, plan §5).
- **Sibling atıfları:** `04-domain-model.md:177-178` (MemoryItem kolonları/izolasyon), `05-event-contracts.md:227` (memory.proposed), `:235` (memory.approved), `:68` (idempotency key), `07-skill-registry.md:216-223` (extract-memory), `16-openrouter-routing.md:119-124` (agencyos-memory), `:126-127` (embeddings OpenRouter'dan değil).
- **[CERTAIN]** `agent_memory` bugün hiçbir TS dosyasından okunmuyor/yazılmıyor (governance.ts kullanımsız); MVP sıfırdan-kullanım riski düşük çünkü mevcut satır yok.
- **[UNKNOWN]** mig 044 (`agent_memory`) prod app DB'sinde fiilen uygulanmış mı — repo migration'ları elle SQL, canlı `list_tables`/`list_migrations` ile Sprint öncesi doğrulanmalı (bu görevde canlı DB sorgusu yok).
- **[ASSUMPTION]** half-life=30g kalibre edilmedi; `scope_type='person'` gelecekte `person_leads`↔`leads` birleşmesi varsayılmadı (mig 027 kasıtlı ayrık).
- **Cross-refs:** `14-proposal-engine.md` (L5 yazma tetikleyicisi), `11-outreach-engine.md` (K4 Voice DNA tüketicisi), `18-evaluation-framework.md` (edit-distance/feedback ortak `original_body`), `21-security-and-compliance.md` (cross-lead leakage threat), `20-observability-and-analytics.md` (decay gözden-geçir listesi).
