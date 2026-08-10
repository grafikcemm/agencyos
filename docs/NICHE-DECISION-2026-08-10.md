# Niş Kararı ve Kaynak Uzlaştırması — 2026-08-10

İki belge farklı nişler öneriyordu. Bu belge çelişkiyi **sessizce ezmeden** çözer.

## Çelişen kaynaklar

| | 30 Temmuz 2026 — kariyer müfredatı | 9 Ağustos 2026 — B2B araştırması |
|---|---|---|
| Belge | `grafikcem-kariyer-mufredati-ve-agencyos-lead-stratejisi.md` | `docs/grafikcem-b2b-pazar-arastirmasi-2026-08-09.{md,json}` |
| 1. niş | TR dijital-native **kozmetik ve kişisel bakım** (5-50 çalışan) | **Güzellik, parfüm ve kozmetik** (51-500 çalışan) — %60 |
| 2. niş | 5-25 çalışanlı **butik performans/kreatif ajanslar** (white-label) | **Premium ev/mutfak + çok markalı perakende** — %25 |
| 3. niş | 20k+ takipçili **creator-led eğitim işletmeleri** | **Oyuncak, çocuk ve aile** — %15 |
| Ana teklif | 4 haftalık AI Destekli Performance Creative & Conversion Sprint | Nişe özgü 7/10/5 günlük ücretli diagnostic → core → retainer |

## Karar

**9 Ağustos araştırması kaynak üstünlüğüne sahiptir.** Gerekçe:

1. Kullanıcı bu belgeyi açıkça **"nihai"** olarak verdi.
2. 10 gün daha yeni.
3. Üç nişin her biri için 20 doğrulanmış şirket, kanıt URL'si, karar verici rolü ve skor kırılımı taşıyor — 30 Temmuz belgesi niş **tezini** sunuyordu, doğrulanmış hesap listesini değil.
4. Vaka eşleşmesi somut: YOS · Enplus · Dede Oyuncak. 30 Temmuz belgesinde vaka eşleşmesi yok.

Uygulanan: `src/data/niches.ts` üç nişi %60/%25/%15 outbound payıyla taşır ve `src/data/niches.test.ts` her alanı araştırma JSON'una karşı doğrular.

## Ezilmeyenler

30 Temmuz belgesinin **silinmeyen** katkıları:

- **Butik ajans (white-label Creative Ops)** ve **creator-led eğitim** segmentleri → runner-up olarak kayıtta kalır. Araştırmanın §7.4/7.5'i de bunları "en güçlü beş niş" içinde ama 90 günlük plan dışında sayıyor. İki kaynak burada **çelişmiyor**, önceliklendirme farkı var.
- **Kariyer kimliği ve dört aylık üretim rotası** → `src/data/careerRoute.ts`'in tamamı bu belgeden geliyor. Araştırma kariyer tarafına hiç değinmiyor; çelişki yok, tamamlayıcılık var.
- **Kalıcı beceri listesi** (`Kalıcı Becerilerde Kalacaklar.txt`) → kullanıcı kararıdır, silinmez. Yalnız yeniden adlandırma/sınıflandırma yapıldı (aşağıda).
- **Fiyat disiplini** → "tam liste fiyatından kurs alma", "ayda en fazla bir ücretli kurs" kuralları `careerRoute.ts` kaynak sınırına (en fazla 3 bağlamsal kaynak) dönüştü.

## Kozmetik nişindeki ICP farkı — bilinçli

30 Temmuz: **5-50 çalışan**. 9 Ağustos: **51-500 çalışan**.

Araştırmanın bandı benimsendi. Gerekçe araştırmanın kendi metodolojisinde: `budget_capacity` ağırlığı 15 puan ve giriş teklifi 45.000-80.000 TL. 5-10 çalışanlı bir marka bu bandı düzenli karşılamaz; 51+ çalışanda pazarlama ekibi ve tekrarlayan kreatif ihtiyacı ölçülebilir hale gelir.

**Bu bir tahmin değil, bir seçim** — ve yanlış çıkarsa `niches.ts` içinde tek satırda değişir.

## Fiyat statüsü

Tüm fiyatlar **hipotezdir** (`PRICE_HYPOTHESIS_NOTE`). Pazar ortalaması değildir, KDV ve üçüncü taraf lisans maliyeti hariçtir. Sistem otomatik kesin fiyat üretmez.

90 günlük 7-9 ücretli giriş / 3-4 ana proje / 2 retainer hedefi araştırmanın **kapasite hipotezidir**, pazar istatistiği değil. Vaat olarak gösterilmez.

## Vaka kanıtı statüsü

YOS, Enplus ve Dede Oyuncak için **yayımlanabilir müşteri KPI'ı YOKTUR**. Eşleşme yalnız *hizmet uyumu* düzeyindedir. Teklif metnine sayı koymak kullanıcı + müşteri iznine bağlıdır — bu, kullanıcıdan alınacak kararlar listesindedir.

## Eski yerel sektör odağı

`sectorRotation.ts` (24 sektör: diş kliniği, oto servis, kuaför, restoran…) **silinmedi**, varsayılan olmaktan çıkarıldı. Kullanıcının `localStorage['saved_business_types']` kayıtları korunuyor. Medikal estetik artık varsayılan hedef değil.
