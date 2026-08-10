# AgencyOS Karar Yüzeyi İlkeleri — 2026-08-10

Kaynaklar: arkadaş paneli ("Bennett OS") video analizi · Founder Consulting ürün ilkeleri · `docs/route-inventory-2026-08-10.md` · mevcut `src/components/layout/*`.

**Kural:** referansın görsel kalitesi kopyalanmaz. Alınan şey bilgi mimarisi, hiyerarşi, yoğunluk kararı, gezinme, ajan görünürlüğü ve karar yüzeyi disiplinidir.

---

## 1. Video analizinden çıkan yapı (72 sn, 14 kare, ses yok)

Panelin gözlenen yüzeyleri: Dashboard · Agents (Roster / Hermes Workers) · Org Chart · Tasks (Company Board) · G-Brain (Knowledge Core) · Skill/yetenek kartı.

| Gözlem | Ne öğretiyor |
|---|---|
| Sol ray **fiile göre** gruplanmış: `OPERATE` · `AGENTS` · `INTELLIGENCE` · `SYSTEM`. Rayın dibinde kalıcı sistem sağlığı sayacı ("16/32 systems live"). | Menü özelliğe göre değil, kullanıcının o an ne yaptığına göre gruplanır. Sistem sağlığı ayrı sayfa değil, kalıcı bir satır. |
| Her sayfa aynı başlık deseni: breadcrumb → mono eyebrow (`// RUNTIME`, `// AGENT WORK`, `// KNOWLEDGE CORE`) → büyük başlık → sekmeler. | Eyebrow **sistem katmanını**, başlık **yüzeyi** adlandırır. Tek desen, istisnasız. |
| Ajan listesi konfigürasyon değil **canlı akış**: rol tek satır, model adı, son yaptığı iş zaman damgasıyla, tek CTA ("Message the CEO"). Hata satırı satır içinde **kırmızı `FAIL`**. | Otomasyon görünürlüğü = durum + son eylem + tek eylem. Hata log'a gömülmez. |
| Ajan kartı ne yaptığını **birinci tekil, düz cümleyle** anlatıyor: "First I'll look up the agent roster to get their IDs, then create all six child issues in one parallel batch." + "Working for 9 seconds · called 2 tools". | Makine durumu, teknik telemetriyle değil, okunabilir niyet cümlesiyle anlaşılır. |
| Stat kutusu: **büyük sayı + altında tek satır kırılım** (`10 Agents Enabled` / `1 running, 2 paused, 1 errors`). Grafikler küçük ve ikincil. | Sayı karar verdirir, grafik bağlam verir. Tersi değil. |
| Tasks sayfasının tepesinde **tek serbest metin girişi**: "Give the company a task — the Conductor triages it…". Altında kart başına **sorumlu ajan adı**. | Tek niyet girişi, arkada yönlendirme. Her iş biriminin görünür bir sahibi var. |
| Yoğun radyal bilgi grafiği **yalnız G-Brain'de**. Karar yüzeylerinde yok. | Yoğunluğa tek bir yerde izin verilir: keşif yüzeyinde. Karar yüzeyi seyrek kalır. |
| **Yetenek kartı — en aktarılabilir parça.** Başlık + alan · alt-alan, `FULLY AUTONOMOUS` rozeti, `READY TO RUN` durumu, kalın tek kural cümlesi ("No deal marked paid without an API receipt"), `BREAKS INTO` (alt adımlar), `BUILDS ON` (bağımlılık), `WHAT IT REPLACES` (bugünkü insan davranışı), `THE LADDER` (human-led → human-assisted → fully autonomous, güncel basamak vurgulu), `THE HUMAN` (insanda kalan sorumluluk). | Aşağıdaki §2'ye bakınız. Bu, AgencyOS'un tam ihtiyacı olan sözlük. |

Görsel dil: neredeyse siyah lacivert zemin · etiket/metadata mono, gövde sans · durum başına **tek** renk (yeşil çalışıyor, turuncu dikkat, kırmızı hata) · 1px ince kenarlık · gradient yok, glow yok, gölge yok. Hiyerarşi kutuyla değil **tipografi ağırlığı + büyük harf + renk rolüyle** taşınıyor.

---

## 2. Otomasyon merdiveni — benimsenen ana kavram

Referanstaki `THE LADDER` bloğu, AgencyOS'un yıllardır dağınık taşıdığı üç ayrı soruyu tek sözlükte birleştiriyor: "bu iş agent gerektirir mi?", "insan onayı nerede?", "ne satıyoruz?".

Her AgencyOS yeteneği bundan sonra dört alanı zorunlu taşır:

- **BASAMAK** — `insan-yürütür` · `insan-destekli` · `tam-otonom`. Güncel basamak vurgulu, diğerleri soluk.
- **NEYİN YERİNE GEÇER** — bugün insanın yaptığı davranış, düz cümleyle.
- **İNSANDA KALAN** — sistemin asla devralmadığı sorumluluk.
- **KIRILMAZ KURAL** — tek cümlelik fail-closed garanti.

Mevcut sisteme uygulanmış hali (yeni davranış icat etmez, var olanı görünür kılar):

| Yetenek | Basamak | Kırılmaz kural |
|---|---|---|
| Outreach gönderimi | **insan-destekli** | Onaysız ve digest'i eşleşmeyen hiçbir mesaj gönderilmez (`approval_requests`, mig 043). |
| Lead araştırma + skor | tam-otonom | Kaynak URL'si olmayan hiçbir puan üretilmez. |
| Apollo zenginleştirme | insan-destekli | Aynı sorgu için ikinci kez ücret ödenmez; tahmin edilmiş e-posta doğrulanmış gibi gösterilmez. |
| Uyum / suppression | tam-otonom | Fail-closed: yasal dayanak veya suppression belirsizse eylem durur (mig 047). |
| Kariyer kanıt doğrulama | tam-otonom | Erişilemeyen kanıt ilerlemeyi sessizce korumaz. |
| Niş ve fiyat kararı | **insan-yürütür** | Sistem fiyat üretmez; yalnız hipotez aralığı gösterir. |

Bu tablo `docs/PRODUCT-BOUNDARY.md`'nin de omurgasıdır ve "Cem neyi onaylar" listesinin UI karşılığıdır.

---

## 3. Founder Consulting'den alınan ürün ilkeleri

Yalnız ilke alınır; kaynaktaki gelir, kapasite, pazar ve dönüşüm iddiaları **veri sayılmaz ve hedefe çevrilmez**.

1. **Araç değil sonuç sat.** Yüzeyde Apollo/Claude/Gmail/MCP adı geçmez; müşterinin iş sonucu geçer.
2. **Tek aktif değer bölgesi.** Aynı anda tek niş hücresi, tek giriş teklifi. Üç niş aynı kampanyada karışmaz.
3. **Hedefli erişim.** Hacim değil, kanıtlı eşleşme.
4. **Onboarding bir teslim aşamasıdır**, satışın bitişi değil.
5. **Vaka ve tavsiye döngüsü** ürünün parçası; CRM notunda kaybolmaz.

---

## 4. AgencyOS'a uygulanan kurallar

### 4.1 Gezinme
Ray fiile göre gruplanır: `ÜST` (Ana Merkez, Bugün) · `MÜŞTERİ` · `KARİYER` · `ARAÇLAR` · `SİSTEM`. `YAŞAM` grubu kalkar. Rayın dibine kalıcı **bağlantı sağlığı satırı** gelir (Supabase / Gmail / Apollo / köprü — kaç tanesi canlı). Birincil işe adım sayısı ≤3.

### 4.2 Sayfa başlığı — tek desen
Her sayfa: breadcrumb → mono eyebrow → başlık → (varsa) sekmeler → içerik. Paylaşılan `PageHeader` bileşeniyle zorlanır; sayfa-yerel başlık markup'ı kalmaz.

### 4.3 Karar yüzeyi seyrek, keşif yüzeyi yoğun
- **Seyrek (Bugün, Lead Radar üst bloğu, Gelişim ilk ekran):** tek birincil CTA, en fazla 3-5 bilgi birimi, eş ağırlıklı kart dizisi yok.
- **Yoğun (tam yetkinlik haritası, lead tablosu, cron manifesti, arşiv):** yoğunluk serbest — ama daima bir açılır/katlanır kabuğun arkasında.

### 4.4 Durum rengi anlamlıdır, dekoratif değil
Yeşil = doğrulandı/çalışıyor · Turuncu = **sende bekliyor** · Kırmızı = hata/engel · Nötr = bilgi. Dördü dışında durum rengi yok. Mevcut neon parıltılar, kalın cyan çerçeveler ve rozet dizileri kaldırılır.

### 4.5 Sayı + kırılım
Her stat kutusu: büyük sayı + altında tek satır kırılım. Ölçülmemiş değer **"ölçülmedi"** yazar, `0` yazmaz.

### 4.6 Ajan/otomasyon görünürlüğü — sayaç değil, bekleyen karar
Referanstaki "30 agents / 37+ agent team" vitrini **benimsenmez** (ajan çoğaltma bu projede açık bir yasak). AgencyOS'un karşılığı:

> Bugün **senden** bekleyen karar sayısı + her birinin son eylemi + tek CTA.

Ajan adı ancak bir iş biriminin sahibi olarak görünür (referanstaki "🅐 Comms Agent" deseni), kadro listesi olarak değil. Hata satır içinde ve kırmızı; log'a gömülmez.

### 4.7 Tek niyet girişi
`Ana Merkez` tepesinde tek serbest metin girişi: yazılan niyet doğru yüzeye yönlendirilir (mevcut `/api/ai/command-center` + JARVIS yönlendirme altyapısı). Yeni bir ajan katmanı eklenmez — var olan yönlendirme görünür kılınır.

---

## 5. Alınmayanlar ve nedeni

| Referanstaki | Neden alınmadı |
|---|---|
| "37+ AI Agent Team" / "30 agents" vitrini | Ajan sayısı kullanıcı değeri değil. Kontrolsüz ajan çoğaltma bu projede yasak. Karşılığı: bekleyen karar sayısı. |
| ASCII banner, terminal estetiği dekorasyon olarak | Gürültü. Mono tipografi yalnız etiket/metadata için işlevsel kullanılır. |
| Radyal bilgi grafiği ana yüzey olarak | Keşif aracı; karar verdirmiyor. AgencyOS'ta karşılığı yok, eklenmez. |
| Para ve dış iletişime dokunan işlerde `FULLY AUTONOMOUS` varsayılanı | AgencyOS'ta gönderim ve ücretli çağrı **insan-destekli** basamağında kalır. Merdiven kavramı alınır, varsayılanı alınmaz. |
| Kaynaktaki gelir/kapasite/dönüşüm rakamları | Doğrulanmış veri değil; hedefe çevrilmez. |

---

## 6. Kabul ölçütü

Bir yüzey bu belgeye uygundur ancak ve ancak: tek desenli başlık taşıyor · birincil CTA tek ve açık · durum renkleri dört anlamdan birini taşıyor · ölçülmemiş değer `0` göstermiyor · yoğun içerik katlanır kabuğun arkasında · otomasyon taşıyan her blok merdiven basamağını ve insanda kalanı bildiriyor · 375/768/1440'ta yatay taşma yok · klavye ile gezilebiliyor · `prefers-reduced-motion` korunuyor.
