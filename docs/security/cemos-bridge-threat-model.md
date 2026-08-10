# CemOS Köprüsü — Tehdit Modeli ve `agencyos-ozet` Açma Koşulu

Tarih: 2026-08-10. Durum: **`agencyos-ozet` işi KAPALI kalır.**

## Kapanma gerekçesi (kaynak alıntı)

GrafikcemOS tarafında `console/server/jobs.mjs` içindeki devre dışı bırakma kaydı:

```
"agencyos-ozet": "AgencyOS köprüsünde güvenlik açığı — köprü offline, iş kapalı"
```

Somut açık `Grafikcem_OS/SOUL.md:106`'da adlandırılmış: **"kimliksiz Supabase service-role key"**.

> `SOUL.md` makine tarafından yazılamaz (`console/server/protect.mjs` PreToolUse ile engeller). Burada yalnız **alıntılanıyor**, değiştirilmiyor.

## Tehdidin tanımı

Bir service-role anahtarı Supabase'de RLS'i **baypas eder**. Kimlik doğrulaması olmayan bir yüzeye ulaşırsa, saldırgan:

1. `leads` tablosunun tamamını (şirket, iletişim, notlar) okuyabilir,
2. `suppression` ve `lawful_basis` kayıtlarını değiştirip opt-out etmiş birine mesaj gönderilmesini mümkün kılabilir,
3. `approval_requests` üzerinde onay uydurabilir,
4. LIFE DB'deki kişisel veriye erişebilir.

Etki: **KRİTİK** (veri ihlali + hukuki maruziyet + geri alınamaz gönderim).

## AgencyOS tarafındaki mevcut durum

Köprü uç noktaları (`/api/integrations/cemos/**`) service-role anahtarını **hiçbir yolla dışarı vermez**:

- Yetkilendirme yalnız `Authorization: Bearer <token>` ile; token'lar `CEMOS_*_READ_TOKEN` / `_WRITE_TOKEN` env değişkenlerinden gelir ve Supabase anahtarlarından **ayrıdır**.
- Karşılaştırma SHA-256 digest üzerinden **sabit zamanlı** (`timingSafeEqual`).
- Token tanımsızsa **her ortamda** 401.
- Okuma token'ı yazma yoluna **giremez**; yazma token'ı okumayı ima eder, tersi değil.
- Growth snapshot `select('*')` **kullanmaz**; her alan tek tek seçilir ve `findForbiddenSnapshotKeys()` gövdeyi PII için yeniden denetleyip fail-closed fırlatır.
- Yazma yolu yalnız `status='proposed'` öneri satırı üretir; hiçbir şey otomatik uygulanmaz, hiçbir gönderim tetiklenmez.

GrafikcemOS tarafındaki istemci (`console/server/agencyos-life.mjs`) de sıkı: HTTPS zorunlu, `redirect: 'manual'` (3xx hata), yol allowlist'i, 200 KB gövde sınırı, 10 sn timeout, yazmada kuyruk yok (fail-closed).

## Neden bu YETMİYOR

Yukarıdakiler **kodun bugünkü hâlini** anlatıyor. Bayrağı açmak için gereken, kodun değil **canlı sistemin** durumudur:

1. Açığa çıkmış anahtarın gerçekten döndürülüp döndürülmediği — kod okuyarak bilinemez.
2. Anahtarın nereye sızdığı (log, hata mesajı, eski deploy, ortam değişkeni dökümü) tespit edilmeden "artık güvenli" denemez.
3. İki taraf da deploy edilmeden canlı transport sözleşmesi doğrulanamaz.

**Bayrağı silmek çözüm sayılmaz.** `enabled:false` + gerekçe, hem koşuyu durdurur hem nedenini yanında taşır; silinen bir işin neden silindiği altı ay sonra hiçbir yerde yazmaz.

## Açma koşulları — HEPSİ sağlanmalı

- [ ] **(a)** Service-role anahtarının köprü istemcisine hiçbir yolla ulaşmadığı testle kanıtlandı
- [ ] **(b)** Açığa çıkmış anahtar **döndürüldü** ve eski anahtar iptal edildi
- [ ] **(c)** Bu belge, sızıntının nereden olduğu tespitiyle güncellendi
- [ ] **(d)** İki taraf da deploy edildi
- [ ] **(e)** Canlı transport sözleşmesi uçtan uca doğrulandı (snapshot şeması, PII reddi, oran sınırı, replay penceresi)
- [ ] **(f)** İş bir **feature flag** arkasına alındı
- [ ] **(g)** Kullanıcı açıkça onay verdi

Testlerin yeşil olması **(a)** maddesini karşılar, diğer altısını karşılamaz.

## Çözülmemiş asimetri

`deney-degerlendirme` işi (Pazar 19:00) **aynı köprüyü** kullanıyor ve **kapalı değil**. "Köprü offline" gerekçesi yalnız bir işe uygulanmış.

İki olasılık var ve hangisi olduğu belirlenmeden ikisi de risk taşıyor:

- **Gözden kaçma** → `deney-degerlendirme` de kapatılmalı,
- **Bilinçli ayrım** (o iş yalnız POST yapıyor, okuma yapmıyor) → gerekçe yazılmalı ve `agencyos-ozet` de aynı ölçütle yeniden değerlendirilmeli.

Bu, kullanıcı kararına sunulan açık bir maddedir. Bu turda **hiçbiri değiştirilmedi**.

## Bu turda yapılanlar

- Tehdit tanımlandı ve kaynağı alıntılandı (yukarıda).
- AgencyOS tarafındaki koruma yüzeyi denetlendi; service-role anahtarının köprü yoluna ulaşmadığı doğrulandı.
- Asimetri tespit edildi ve kayda geçti.
- **Bayrak DEĞİŞTİRİLMEDİ.** `agencyos-ozet` kapalı.
