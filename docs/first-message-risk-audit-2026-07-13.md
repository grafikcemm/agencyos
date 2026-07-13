# First Message Risk Audit — 2026-07-13 (SALT-OKUNUR)

Kapsam: canlı App DB'deki `leads.first_message` dolu **44 satır** (sorgu: `first_message is not null`).
Hiçbir canlı kayıt DEĞİŞTİRİLMEDİ — bu rapor yalnız sınıflandırır. Düzeltme,
kullanıcı onayıyla ayrı bir adımdır.

## Şablon aileleri ve risk sınıfı

| # | Şablon (özet) | Adet | İddia | Kanıt bağı | Risk | Faz 1 kapı sonucu |
|---|---------------|------|-------|-----------|------|-------------------|
| T1 | "müşterileriniz mesaj atıp geç yanıt aldığında **rakibe geçiyor**" + AI asistan pitch | 12 | Müşteri davranışı iddiası (doğrulanmamış genelleme) | YOK | **YÜKSEK** | ⛔ `CLAIM_WITHOUT_EVIDENCE` (yeni `rakibe geç` kalıbı) |
| T2 | "Google yorumlarınız rakiplerinizin gerisinde. **90 günde** yorum sayınızı **3 katına** çıkarmak mümkün" | 17 | Süre + çarpan performans vaadi | YOK | **YÜKSEK** | ⛔ `CLAIM_WITHOUT_EVIDENCE` (süre `90 günde` + `3 kat` kalıpları) |
| T3 | "online randevu sisteminiz yok — bu no-show ve kayıp randevu anlamına geliyor" | 4 | Tespit (lead-intel'den doğrulanabilir) + sonuç iması | Kısmi (has_online_booking sinyali) | ORTA | ✅ geçer (tespit spesifik kanıtla eşlenirse); kanıt kaydı bağlanana kadar prefil metinsiz |
| T4 | "Google profilinizde doğrulanabilir bir web sitesi görünmüyor — ciddi müşteri kaybına yol açabilir" | 8 | Tespit (has_website sinyali) + yumuşak sonuç iması ("açabilir") | Kısmi | ORTA-DÜŞÜK | ✅ geçer (kalıplara takılmıyor; "yol açabilir" koşullu) |
| T5 | "no-show oranınızı **yarıya indiren** otomatik hatırlatma sistemi" | 5 | Performans vaadi (yarıya indirme) | YOK | **YÜKSEK** | ⛔ `CLAIM_WITHOUT_EVIDENCE` (yeni `yarıya indir` kalıbı) |
| — | (T1+T2+T5 toplamı: kanıtsız iddialı) | **34/44** | | | | |

## Ne değişti (kod, canlı veri DEĞİL)

- `qualityLint.ts` CLAIM kalıplarına canlı şablonlardan türetilen 2 kalıp eklendi:
  `rakibe/rakiplere geç…` ve `yarıya indir/düşür…`. Böylece T1 ve T5 de
  yapısal olarak yakalanıyor (T2 zaten süre+kat kalıplarıyla yakalanıyordu).
- Sonuç: 34 YÜKSEK riskli metin artık hiçbir yüzeyden (drawer copy, wa.me
  prefill, request-send onayı) kanıt bağı olmadan ÇIKAMAZ — wa.me linki
  metinsiz sohbet açar, neden + düzeltme aksiyonu kullanıcıya görünür.

## Önerilen (ONAY GEREKTİREN) sonraki adım

1. T1/T2/T5 metinlerini kanıt-bağlı yeniden üretim: iddia ya SİLİNİR ya lead'in
   gerçek `lead_evidence` kaydına (ör. yorum sayısı karşılaştırması) bağlanır.
2. Bu, canlı `leads.first_message` alanlarını değiştirir → kullanıcı onayı
   olmadan YAPILMAYACAK.
