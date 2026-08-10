# Ürün Sınırı — AgencyOS ↔ GrafikcemOS

Son güncelleme: 2026-08-10 (ikinci tur — kariyer devri). Bu belge, iki sistemin neyi sahiplendiğinin **kanonik** kaydıdır. Çelişki çıktığında bu belge kazanır.

## Sahiplik

| AgencyOS sahibi | GrafikcemOS sahibi |
|---|---|
| şirket ve kişi lead'leri | günlük karar |
| niş, ICP, satın alma sinyali, teklif | kişisel görevler ve alışkanlıklar |
| araştırma ve kanıt | kapasite ve teslim çakışması |
| outreach, yanıt, takip, toplantı | spor ve vitamin planı |
| teklif, sözleşme, onboarding, teslimat | içerik üretim sistemi |
| müşteri ve proje pipeline'ı | ajanlar, rutinler, ortak hafıza |
| vaka, tekrar satış, tavsiye | **kariyer fırsatları ve iş başvuruları** |
| müşteri belge merkezi (TR + Global) | **kariyer gelişim rotası, beceri açığı, portföy kanıtı** |
| ülke uyum motoru ve gönderim kapısı | kişisel gelişim ve öğrenme |

**KARİYER ARTIK AgencyOS'UN DEĞİL.** Bu, aynı günün sabahındaki "kariyer AgencyOS'undur" kararının
**üzerindedir** ve onu geçersiz kılar. `/kariyer` ve `/gelisim` veri okumayan "geçiş hazırlanıyor"
ekranı döner; menüdeki `KARİYER` grubu kaldırıldı. Devir envanteri, veri sözleşmesi ve geri dönüş
planı: [`CAREER-HANDOFF-2026-08-10.md`](CAREER-HANDOFF-2026-08-10.md).

Kişisel görev, alışkanlık, finans, sağlık, içerik sistemi ve iş arama **hiçbir koşulda** AgencyOS'a
geri dönmez.

## Uygulanmış kapılar

| Rota | Kapı | Davranış |
|---|---|---|
| `/gorevler` | kesin GrafikcemOS sahipliği | veri OKUMAZ, her zaman "taşındı" ekranı |
| `/aliskanliklar` | kesin GrafikcemOS sahipliği | aynı |
| `/finans` | kesin GrafikcemOS sahipliği | aynı |
| `/kariyer` | kesin GrafikcemOS sahipliği | veri OKUMAZ, "geçiş hazırlanıyor" ekranı |
| `/gelisim` | kesin GrafikcemOS sahipliği | aynı |

Rotalar silinmez. 404 döndürmek, kaydedilmiş bir yer imini "sayfa yok" diye göstermek olurdu; sayfa yok değil, **başka yerde**.

## Köprü sözleşmesi

İki **ayrı** token çifti. LIFE token'ı growth verisini okuyamaz, growth token'ı LIFE'a yazamaz.

| | LIFE köprüsü | GROWTH köprüsü |
|---|---|---|
| Env | `CEMOS_LIFE_{CLIENT_ID,READ_TOKEN,WRITE_TOKEN}` | `CEMOS_AGENCYOS_{CLIENT_ID,READ_TOKEN,WRITE_TOKEN}` |
| Oran sınırı | okuma 120/dk, yazma 30/dk | okuma 60/dk, yazma 20/dk |
| Denetim | LIFE DB `cemos_bridge_audit` | App DB `cemos_growth_audit` |

Karşılaştırma **SHA-256 digest üzerinden sabit zamanlı**; uzunluk farkı sızmaz. Token yoksa **her ortamda** 401 — "dev'de açık bırakılan kapı, prod'da unutulan kapıdır".

### AgencyOS → GrafikcemOS (büyüme özeti) — PII YOK

bugün onay bekleyen outreach sayısı · en güçlü fırsat (isimsiz) · yaklaşan toplantı/teklif son tarihi · haftalık huni özeti · tek kariyer eylemi · veri tazeliği ve bağlantı sağlığı.

`findForbiddenSnapshotKeys()` gövdeyi yeniden denetler ve PII anahtarı görürse **fail-closed fırlatır**.

### GrafikcemOS → AgencyOS (kapasite özeti) — henüz canlı DEĞİL

bugün ayrılabilir süre · yoğunluk sınıfı · toplantı/teslim çakışması · kullanıcının kilitlediği öncelik.

Bu yön kodda modellendi (`CapacitySummary`) ama köprü açık değil. `/gelisim` kapasiteyi **"ölçülmedi"** gösterir — `0` değil. Sıfır saat, Cem'in hiç çalışmadığı iddiasıdır; sistem bunu bilmiyor.

**Asla geçmez:** günlük, sağlık ayrıntısı, kişisel görev metni, vitamin dozu.

## Kabul edilmeyen sınırlar

- GrafikcemOS'un AgencyOS veritabanına genel API veya **service-role** erişimi
- ortak `CRON_SECRET`
- tarayıcı çerezi kazıma
- otomatik e-posta gönderimi
- kaynaksız lead skoru
- duplicate memory sistemi
- anahtarların depoya veya loga yazılması

## Otomasyon merdiveni

Her yetenek nerede durduğunu bildirir (bkz. `docs/ui-principles-2026-08-10.md` §2).

| Yetenek | Basamak | Kırılmaz kural |
|---|---|---|
| Outreach gönderimi | **insan-destekli** | Onaysız ve digest'i eşleşmeyen mesaj gönderilmez (mig 043) |
| Lead araştırma + skor | tam-otonom | Kaynak URL'si olmayan puan üretilmez |
| Apollo zenginleştirme | insan-destekli | Aynı sorgu ikinci kez ödenmez (mig 070); tahmin edilmiş e-posta gönderilemez |
| Uyum / suppression | tam-otonom | Fail-closed (mig 047) |
| Kariyer kanıt doğrulama | tam-otonom | Erişilemeyen kanıt ilerlemeyi sessizce korumaz |
| Niş ve fiyat kararı | **insan-yürütür** | Sistem fiyat üretmez; yalnız hipotez aralığı |

## Cem neyi onaylar

nihai niş ve fiyat · yasal dayanak ve mesaj · gönderim · görüşme · teslimat kabulü · vaka yayımlama izni · canlı migration ve seed · `agencyos-ozet` işinin açılması · Vercel deploy modeli.

Varsayılan otomatik gönderim kararı **kapalıdır**.


## Edinim dönemi (2026-08-10)

Eski/test/seed/yerel-sektör lead dönemi **silinmeden** kapatılır. Her lead bir döneme aittir:

| Dönem | Anlam |
|---|---|
| `legacy-pre-2026-08` | kapandı — veri korunur, varsayılan operasyon görünümünde gösterilmez |
| `epoch-2026-08` | güncel — tüm ekranların varsayılanı |

Emeklilik (`retired_at`) bir **işarettir**; satır yerinde, denetlenebilir ve geri alınabilir.
Uyum/denetim tabloları (`NEVER_TOUCHED_TABLES`) hiçbir koşulda yazılmaz.
Araç: `npm run epoch:reset` · Şema: `migrations/071_acquisition_epoch.sql`

## Pazar çalışma alanları

Lead Radar iki alan olarak çalışır — **ikinci bir CRM veya lead veritabanı YOKTUR**.

| | Türkiye | Global |
|---|---|---|
| Ülkeler | TR | US, GB |
| Dil / para / saat | tr · TRY · Europe/Istanbul | en · USD · UTC |
| Coğrafya görünümü | il/ilçe | dünya/ülke |
| Aylık prospect hedefi | 900 | 600 |

`send_allowed` bir **sütun değildir**: DB yalnız olguları tutar (ülke, alıcı tipi, kanıt, e-posta
güveni, suppression), karar `src/lib/compliance/countryPolicy.ts` içinde türetilir.

## Gönderim sahipliği

- **GrafikcemOS ajanları** araştırır, kanıt toplar, taslak önerir, **onay isteği açar**.
- **AgencyOS** tek system of record ve **tek send gateway**'dir.
- Hiçbir GrafikcemOS ajanı Gmail/Instantly tokenı tutamaz veya AgencyOS dışında gerçek mail gönderemez.
- `GMAIL_SEND_ENABLED=false` ve `INSTANTLY_ENABLED=false`, hukuki/teknik hazırlık **ve** kullanıcının
  ayrı gerçek-gönderim onayı tamamlanana kadar korunur.
