---
Doküman: 13-follow-up-engine
Tarih: 2026-07-11
Kaynak kalitesi: karışık (repo=birincil/doğrulanmış, gecikme-günleri ve TR tatil takvimi=ikincil web)
Güven: orta
AgencyOS'a etki: follow_up_sequences + nextActionEngine + staleDeals'ı TEK durum makinesinde birleştirip iş-günü/durdurma mantığı ekler; DB/kod değişikliği bu dokümanda YAPILMAZ
---

## Özet

AgencyOS'ta takip (follow-up) mantığı bugün **üç ayrı, birbirinden habersiz kural seti** olarak dağınık: `follow_up_sequences` (gün-bazlı sabit sekans), `nextActionEngine.ts` (SLA etiketleri) ve `staleDeals.ts` (soğuma eşiği). Üçü de takvim günü sayıyor, iş günü/hafta sonu/resmi tatil bilmiyor; hiçbiri yanıt/bounce/unsubscribe geldiğinde diğerini durdurmuyor. `outreach_messages.status='replied'` alanı şemada var ama kodun hiçbir yerinde **yazılmıyor** — yani "yanıt geldi" sinyali bugün sistemsel olarak asla üretilmiyor, sadece metrik ekranında okunuyor. Bu doküman, mevcut parçaları koruyarak tek bir durum makinesi + iş günü hesaplayıcı + durdurma kuralı seti önerir; harici araştırma (3-7-7 kademesi, Salesloft/Outreach.io durdurma tetikleyicileri, TR 2026 resmi tatil takvimi) bu öneriyi destekler.

## 1. Mevcut durum — repo bulguları (doğrulanmış)

| Bileşen | Dosya | Ne yapıyor | Sınırlama |
|---|---|---|---|
| Gün-bazlı çok-kanallı sekans | `src/lib/outreach/sequences.ts`, `src/lib/outreach/channelMatrix.ts` | Lead oluşunca gün 1/2/4/7/10/14'te sabit adım planlar (`follow_up_sequences` tablosu, mig `010_outreach.sql`) | Takvim günü; lead durumundan/yanıttan bağımsız; hafta sonu/tatil bilmiyor |
| Sıradaki-aksiyon etiketi | `src/lib/nextActionEngine.ts` | `STAGE_SLA_DAYS` (new:3, contacted:4, responded:3, meeting:5, proposal:5) ile pipeline/dashboard için "ne yapmalı" etiketi üretir | Ayrı eşik seti; DB'ye yazmaz, sadece UI'da hesaplanır |
| Soğuma kuralı | `src/lib/leads/staleDeals.ts`, `src/app/api/leads/stale/route.ts` | `RULES` (contacted:3, responded:2, meeting:7, proposal:4) + proposal→nurture 14 gün | Üçüncü, farklı eşik seti; `nextActionEngine` ile tutarsız (ör. contacted: 4 gün vs 3 gün) |
| Cron promotion | `src/app/api/cron/agent-tick/route.ts` → `processDueSequences()` | Günde **bir kez** (`vercel.json`: `0 9 * * *`, her gün dahil hafta sonu) due satırları `agent_tasks`'a terfi ettirir | Cron hafta sonu da çalışıyor; iş günü filtresi YOK — bu yüzden iş günü kuralı *scheduling* (due_at hesaplama) katmanında olmalı, cron tetikleyicisinde değil |
| Yanıt durumu | `outreach_messages.status` CHECK `('draft','approved','sent','replied','failed')` (mig `010_outreach.sql`) | Şemada `'replied'` durumu tanımlı | **Hiçbir kod yolu bu alanı `'replied'` yapmıyor** (grep doğrulandı) — yalnız `src/lib/outreach/metrics.ts` ve `KanbanBoard.tsx` okuyor. Reply intelligence yok = bu alan ölü kod |
| Pipeline zaman damgaları | `leads.stage_entered_at`, `leads.next_follow_up_at`, `leads.last_contact_at` (mig `004_evidence_engine.sql`, yorum: "read by nextActionEngine") | Var ama yalnız `nextActionEngine` okuyor; `follow_up_sequences` bu alanları hiç güncellemiyor | İki sistem aynı lead için farklı "bir sonraki takip" hesaplayabilir |
| Uyum footer | `src/lib/coldEmail.ts` `buildComplianceFooter()` (mig `018`) | KVKK/İYS metni; ret = "yanıtla ve dur" talimatı (link yok, manuel-gönder modeli) | Otomatik bir DNC/suppression listesi yok — operatör "dur" derse sistemin bunu bilmesi için ayrı bir alan/akış gerekir |

**Ana çıkarım (repo-temelli, [CERTAIN]):** Follow-up motoru "sıfırdan" değil, üç örtüşen mekanizmayı **konsolide eden** bir iş — `follow_up_sequences` şeması ve `agent-tick` promotion akışı korunmalı; `nextActionEngine` ve `staleDeals`'ın SLA sayıları `follow_up_sequences`'ın tek kaynağına devredilmeli.

## 2. Önerilen durum makinesi

Kullanıcının verdiği zincir doğrudan uygulanabilir; her geçiş bir tetikleyiciye ve (varsa) mevcut bir tabloya bağlanır:

| Durum | Tetikleyici | Mevcut karşılık |
|---|---|---|
| Initial Draft | Operatör/agent taslak üretir | `outreach_messages.status='draft'` (var) |
| Approved | Operatör onaylar (HITL) | `outreach_messages.status='approved'`; genel onay altyapısı `approvals_hitl` (mig 043) ile hizalanabilir |
| Sent | Operatör manuel gönderir, sistem işaretler | `outreach_messages.status='sent'`, `markMessageSent` (`src/lib/outreach/email.ts`) |
| Waiting | Gönderim sonrası bekleme penceresi | **YOK** — `follow_up_sequences.done=false` + `due_at` bunu zımnen temsil ediyor ama açık bir "waiting" etiketi yok |
| Reply Received | Gelen yanıt algılanır (bkz. §5, ayrı doküman konusu) | `outreach_messages.status='replied'` şeması var, **yazıcı yok** — kritik boşluk |
| Follow-up Due | İş günü hesaplı `due_at` geçti | `follow_up_sequences.due_at <= now AND done=false` (var, iş günü düzeltmesi eksik) |
| Follow-up Drafted | Yeni taslak (farklı açı) üretilir | `agent_tasks` (sales_rep) zaten üretiliyor ama taslak metnini otomatik yazmıyor — şu an sadece "hatırlatma görevi" |
| Approved → Sent | Aynı döngü tekrar | — |
| Nurture | Max deneme sayısı veya proposal 14 gün aşımı | `staleDeals.move_to_nurture` kavramsal olarak var, ayrı `leads.status='nurture'` değeri **yok** (şu an `waiting`/`lost` kullanılıyor, karışık) |
| Closed | `converted`/`lost`/`archived` | `leads.status` zaten bu değerleri destekliyor (mig `026_archive_leads.sql` — CHECK kısıtı yok, serbest metin) |

`leads.status` üzerinde CHECK kısıtı olmadığı doğrulandı (`026_archive_leads.sql` yorumu) — bu, yeni bir `nurture` değeri eklemenin **migration'sız, düşük riskli** olduğu anlamına gelir ([LIKELY], CHECK yoksa uygulama tarafı validasyon yeterli olur).

## 3. İş günü / TR saat dilimi / hafta sonu / resmi tatil

Repoda iş günü hesaplayan hiçbir yardımcı fonksiyon yok (grep doğrulandı — `getIstanbulDateAndDay` yalnız saat dilimi çeviriyor, hafta sonu/tatil bilmiyor). Önerilen kural seti:

- **Referans saat dilimi:** `Europe/Istanbul`, mevcut `src/lib/assistant/timezone.ts`'teki `getIstanbulDateAndDay()` deseniyle aynı yaklaşım (Intl.DateTimeFormat, sunucu-local saate güvenmeden).
- **Hafta sonu:** Cumartesi/Pazar iş günü sayılmaz — `due_at` hafta sonuna denk gelirse **bir sonraki Pazartesiye** kaydırılır (öne çekmek yerine öteleme; erken gönderim daha az riskli).
- **Resmi tatil (2026):** Aşağıdaki liste [Turkcell/İş Bankası/resmitatiller.org, 2026 — ikincil kaynak, çapraz doğrulandı, güven: orta — dini bayram tarihleri Diyanet'in resmi ilanına kadar kesin değildir]:

| Tatil | 2026 tarihi |
|---|---|
| Yılbaşı | 1 Ocak |
| Ramazan Bayramı arifesi (yarım gün) | 19 Mart |
| Ramazan Bayramı | 20–22 Mart |
| Ulusal Egemenlik ve Çocuk Bayramı | 23 Nisan |
| Emek ve Dayanışma Günü | 1 Mayıs |
| Atatürk'ü Anma, Gençlik ve Spor Bayramı | 19 Mayıs |
| Kurban Bayramı arifesi (yarım gün) | 26 Mayıs |
| Kurban Bayramı | 27–30 Mayıs |
| Demokrasi ve Millî Birlik Günü | 15 Temmuz |
| Zafer Bayramı | 30 Ağustos |
| Cumhuriyet Bayramı arifesi (yarım gün) | 28 Ekim |
| Cumhuriyet Bayramı | 29 Ekim |

**Çıkarım:** Sabit bir tatil listesi kod içine (`data/` altına, `orchestratorConfig.ts` deseniyle) yıllık olarak elle girilmeli — resmi bir TR tatil API'si yaygın/güvenilir değil; yıl başına manuel güncelleme kabul edilebilir maliyet (12 satırlık dizi). **[ASSUMPTION]** Yarım gün (arefe) kuralı: öğleden sonra gönderilecek bir takip varsa arefe günü tam iş günü sayılmamalı — ancak B2B ticari e-posta gönderimi zaten düşük hacimli olduğundan bu inceliği MVP'de atlamak (arefe = tam tatil say) basitlik için savunulabilir.
- **Cron uyumu:** `agent-tick` günde bir kez (öğlen ~12:00 İstanbul) çalıştığı ve hafta sonu/tatilde de tetiklendiği için, iş günü mantığı **cron'da değil `due_at` hesaplamasında** olmalı: `processDueSequences()` bir satırı gördüğünde, o satırın `due_at`'i zaten iş günü düzeltmesinden geçmiş olmalı (scheduling anında hesaplanır) — cron sadece "şimdi mi geçti" kontrolü yapar, ekstra mantık eklemez.

## 4. Gecikme hipotezi — doğrulama ve segment önerisi

Kullanıcının hipotezi ("1. takip 3-4 iş günü, 2. takip 5-7 iş günü, sonra nurture/kapat") **genel endüstri verisiyle uyumlu, ILICI segment-bağımsız bir varsayılan olarak makul** [WebSearch, 2026, ikincil/sentez kaynak — Growth List, Woodpecker, Allegrow; güven: orta]:

- Endüstri konsensüsü **"3-7-7"** kademesini optimum gösteriyor: gün 3, gün 10, gün 17'de takip, 10 gün içinde toplam yanıtların ~%93'ünü yakalıyor. İlk takip tek başına en yüksek yanıt oranını taşıyor (~%8.4), 3 e-postadan sonra yanıt oranı platoya giriyor ve 3'ten fazla takipte spam şikayeti/unsubscribe artıyor.
- En iyi gönderim günleri Salı–Perşembe, saat 10–11 veya 14–16 (yerel saat) — Pazartesi/Cuma ~%15 daha düşük performans.

**Segment-bazlı öneri (mevcut `CustomerType` — `channelMatrix.ts`'teki `ecommerce/local/agency_b2b/founder` ile hizalı):**

| Segment | 1. takip | 2. takip | Nurture eşiği | Gerekçe |
|---|---|---|---|---|
| `local` (esnaf, kuaför, restoran vb.) | 3 iş günü | 5 iş günü | 3 takipten sonra | Karar döngüsü kısa, sahiplik tek kişi — hızlı evet/hayır beklenir |
| `ecommerce` | 3 iş günü | 6 iş günü | 3 takipten sonra | Kampanya takvimine bağlı, ama tek karar verici genelde var |
| `agency_b2b` | 4 iş günü | 7 iş günü | 4 takipten sonra (uzun nurture) | Çok paydaşlı karar, daha yavaş — araştırma B2B için daha uzun pencere öneriyor |
| `founder` (startup) | 3 iş günü | 5 iş günü | 3 takipten sonra | Hızlı karar verme kültürü, ama yoğunluktan kaynaklı gecikme payı |

Bu tablo **[LIKELY]** düzeyinde: yön (kısa segment = kısa pencere) endüstri verisiyle destekleniyor, ancak kesin gün sayıları AgencyOS'un kendi gerçek yanıt verisiyle (feedback tablosu zaten var: `lead_match_feedback`, mig 033) zamanla kalibre edilmeli — bu, mevcut "öğrenen" mimari (sectorRotation/cityTargeting) desenine uygun bir sonraki adım.

**Maksimum takip sayısı:** 2 otomatik takip + 1 "close-loop" (kapanış) mesajı = toplam 3 dokunuş sonrası önce, mevcut `channelMatrix.ts` `close_loop` adımıyla zaten örtüşüyor (gün 14). Bu sayı korunabilir; sadece "iş günü" olarak yeniden hesaplanmalı.

## 5. Durdurma kuralları (stop conditions)

Salesloft/Outreach.io gibi olgun sistemlerin **durdurma mimarisi** AgencyOS'un HITL/manuel-gönder felsefesiyle doğrudan örtüşüyor [WebSearch, 2026, ikincil kaynak, güven: orta] — "yanıtta anında duraklat", "sert bounce'ta kalıcı durdur", "opt-out'ta bastır", "toplantı ayarlandığında tüm sekansı durdur" ilkeleri endüstri standardı. AgencyOS'a uyarlaması:

| Sinyal | Aksiyon | Mevcut/eksik |
|---|---|---|
| Yanıt geldi | Sekansı durdur, `leads.status='responded'`, `outreach_messages.status='replied'` | **Yazıcı yok** (bkz. §1) — reply intelligence dokümanı (14) bunu üretmeli |
| Bounce (hard) | Kalıcı durdur, lead'i "geçersiz e-posta" işaretle | Yok — e-posta gönderimi zaten manuel/Resend üzerinden, bounce webhook'u yok |
| Unsubscribe / "dur" cevabı | Sekansı durdur + DNC alanı | Yok — `buildComplianceFooter` yalnız metin üretir, DNC state'i yok |
| Manuel operatör müdahalesi | Sekansı durdur veya operatör kararına bırak | `follow_up_sequences.done` operatör tarafından elle `true` yapılabilir (API üzerinden) ama arayüzde belirgin "durdur" butonu yok |
| Max takip sayısı aşıldı | Nurture'a taşı | `staleDeals.move_to_nurture` kavramı var, `leads.status='nurture'` değeri yok |
| Toplantı/proposal'a geçti | Sekansı durdur (pipeline zaten ilerledi) | Kısmen var — `nextActionEngine` durum bazlı davranıyor ama `follow_up_sequences` bunu bilmiyor (senkron değil) |

**Kritik tasarım kuralı:** `processDueSequences()` şu an bir satırın `lead_id`'sine bakmadan, sadece `due_at`/`done` alanına göre terfi ettiriyor. Konsolide durum makinesi, promotion öncesi `leads.status` kontrolü eklemeli (ör. status zaten `responded`/`converted`/`lost`/`archived` ise o satırı sessizce `done=true` yapıp atla) — bu, mevcut fonksiyonun içine eklenecek **tek bir ek sorgu**, yeni tablo gerektirmez.

## 6. Farklı açı kuralı (tekrar etmeme)

Mevcut `src/lib/coldEmailTemplates.ts` zaten 4 açı barındırıyor: `mini_audit`, `launch`, `hiring`, `before_after`. Follow-up motoru bu envanteri **rotasyon mantığıyla** kullanabilir:

- 1. e-posta: sinyale göre seçilen açı (`selectColdEmailTemplate`).
- 1. takip: aynı açıyı **tekrar etme** — bir sonraki en uygun açıya geç (ör. ilk mesaj `mini_audit` ise takip `before_after` somut örnek gösterebilir).
- 2. takip: son iletişimi referans alan kısa not + farklı kanal öner (`channelMatrix.ts`'teki `CHANNEL_PRIORITY` zaten segment bazlı ikinci kanalı biliyor).
- Klişe yasak listesi: "bunu gördünüz mü", "yukarıdaki e-postaya binaen", "sadece hatırlatmak istedim" — bu tür ifadeler `coldEmail.ts`'teki anti-klişe lint mantığına (zaten var) eklenebilir bir kelime listesi olarak.
- Baskı yapmama: CTA her takipte daha da düşük baskılı hale gelmeli (1. e-posta: "10 dk konuşalım mı" → 1. takip: "faydalı olur mu bilemedim, kısa bir not" → 2. takip/close-loop: "şu an sırası değilse sorun değil, ihtiyaç olursa yazarsınız").

## 7. AgencyOS'a entegrasyon (mevcut dosyalar üstüne)

- **`src/lib/outreach/channelMatrix.ts`**: `STEP_TEMPLATE`'teki sabit `day` alanlarını iş-günü hesaplayan bir yardımcıya (`addBusinessDays(from, n)`, yeni `src/lib/businessDays.ts`) yönlendir; segment tablosundaki (§4) gün sayılarını `CustomerType`'a göre parametrize et.
- **`src/lib/nextActionEngine.ts`**: `STAGE_SLA_DAYS`'i kaldırıp `follow_up_sequences`/`leads.next_follow_up_at` alanını **tek kaynak** olarak oku — iki paralel eşik setini birleştir.
- **`src/lib/leads/staleDeals.ts`**: Aynı şekilde `RULES` sabitlerini merkezi segment tablosuna devret; fonksiyon imzası korunabilir (saf fonksiyon deseni iyi, sadece girdi kaynağı değişir).
- **`src/lib/outreach/sequences.ts`**: `processDueSequences()` içine promotion öncesi `leads.status` kontrolü ekle (§5); yeni bir `businessDays.ts` yardımcıyla `scheduleFollowUp`'ın `dueInDays` hesaplamasını iş günü bazlı yap.
- **`src/app/api/cron/agent-tick/route.ts`**: Değişiklik gerekmez — mantık scheduling katmanında çözülüyor.
- **Yeni (küçük) dosya önerisi:** `src/data/trHolidays2026.ts` (12 satırlık sabit tarih dizisi, `orchestratorConfig.ts` deseniyle) + `src/lib/businessDays.ts` (saf fonksiyon: hafta sonu + tatil listesi kontrolü, `Europe/Istanbul` bazlı).
- **Reply intelligence bağımlılığı:** §5'teki "Reply Received" durumu doküman **14 (reply-intelligence)** kapsamında ele alınmalı — bu doküman yalnız o sinyal geldiğinde follow-up motorunun ne yapacağını tanımlar, sinyalin nasıl üretileceğini değil.
- **Görev/Alışkanlık dokunulmazlığı:** Bu değişikliklerin hiçbiri `active_tasks`/`habits` tablolarına veya `/gorevler`/`/aliskanliklar` sayfalarına dokunmuyor — tamamen `leads`/`follow_up_sequences`/`outreach_messages` kapsamında.

## 8. MVP / V1 / V2

- **MVP:** `businessDays.ts` + `trHolidays2026.ts` yardımcıları; `channelMatrix.ts`'teki sabit günleri iş-günü bazlı hesaplamaya çevir; `processDueSequences()`'a lead-status guard ekle (durmuş/kapanmış lead'lere görev üretme). Tamamı deterministik, LLM yok, migration yok.
- **V1:** `nextActionEngine` + `staleDeals` eşiklerini tek segment tablosuna konsolide et; `leads.status='nurture'` değerini uygulama tarafında tanıt (CHECK kısıtı yok → migration'sız); operatör arayüzünde açık "sekansı durdur" aksiyonu (mevcut `follow_up_sequences` satırlarını `done=true` yapan buton, ör. `/pipeline` veya lead detay ekranında).
- **V2:** Segment bazlı gün sayılarını `lead_match_feedback` gerçek yanıt verisiyle otomatik kalibre eden öğrenen katman (sectorRotation/cityTargeting deseniyle uyumlu); reply-intelligence (doküman 14) canlıya alındıktan sonra tam "Reply Received → otomatik durdur" entegrasyonu.

## 9. Açık sorular / doğrulanamayanlar

- 2026 dini bayram tarihleri (Ramazan/Kurban Bayramı) Diyanet'in resmi ay gözlemi ilanına kadar **kesinleşmiş sayılmamalı** — [ASSUMPTION], yıl başında (Ocak 2026) resmi kaynaktan tek satırlık teyit önerilir.
- Segment bazlı gün sayıları (§4 tablosu) endüstri ortalamasından türetilmiş çıkarım — AgencyOS'un kendi gerçek TR B2B yanıt verisiyle doğrulanmamış; ilk 2-3 ayda `lead_match_feedback` ile kalibre edilmeli.
- Arefe (yarım gün) günlerinde takip e-postası gönderilip gönderilmemesi netleştirilmedi — MVP'de tam tatil sayılması önerildi ama nihai karar operatöre bırakılmalı.
- Bounce webhook entegrasyonu (Resend tarafında var mı, yoksa manuel-gönder kanallarda hiç yok mu) bu doküman kapsamında doğrulanmadı — outreach altyapısı dokümanına (varsa) bırakılmalı.
