# Derin Araştırma Promptu — Türkiye Sektör × Şehir Lead Önceliklendirme

> **Kullanım:** Aşağıdaki bloğun tamamını bir deep-research aracına (Gemini Deep Research, ChatGPT Deep Research, Perplexity) yapıştır. Çıktı, AgencyOS lead motorunu eğitmek için doğrudan ingest edilecek — bu yüzden **ÇIKTI ŞEMASI bölümündeki yapı birebir korunmalı.**

---

## ROL VE BAĞLAM

Sen Türkiye pazarına hakim bir B2B pazar-giriş (go-to-market) ve sektör ekonomisi araştırmacısısın. Görevin: aşağıda hizmetlerini tanımlayan bir **AI-destekli kreatif & otomasyon ajansı** için, Türkiye'de **hangi sektörlerin × hangi şehirlerde** en yüksek değerli müşteri (lead) yoğunluğuna sahip olduğunu kanıta dayalı olarak belirlemek.

Bu sıradan bir "popüler sektörler" listesi DEĞİL. Çıktı bir lead-puanlama motorunu eğitecek; bu yüzden her iddia **ödeme gücü + dijital olgunluk açığı + erişilebilirlik + hacim** ekseninde gerekçelendirilmeli.

### Ajansın sattığı hizmetler (teklif kataloğu)

Kreatif:
- Sosyal medya tasarımı & içerik üretimi (Instagram odaklı)
- Logo & kurumsal kimlik
- AI-destekli görsel & video üretimi (reklam kreatifi)
- Banner / kampanya / ambalaj / mockup tasarımı
- UI/UX & web tasarımı

Otomasyon & büyüme (AI ajanları):
- AI lead yanıt botu / WhatsApp satış asistanı
- Randevu kurtarma & no-show azaltma
- Google yorum yönetim motoru
- Eski müşteri / eski hasta yeniden canlandırma (CRM reaktivasyon)
- Yenileme/poliçe hatırlatma takibi
- Reklam optimizasyonu & sepet kurtarma
- Teklif/portföy takip masası, belge otomasyonu

### İdeal müşteri profili (ICP)

Yüksek öncelikli leadler şu özelliklere sahip:
1. **Ödeme gücü** — yüksek bilet (ticket) değeri, sık tekrar eden hizmet ihtiyacı, çok şubeli olabilir.
2. **Dijital olgunluk açığı (pain)** — web sitesi yok ya da Instagram'ı site gibi kullanıyor, online randevu yok, WhatsApp/form eksik, reklam veriyor ama kreatifi zayıf. *Açık ne kadar büyükse satış o kadar kolay.*
3. **Erişilebilirlik** — telefon/Instagram üzerinden ulaşılabilir, karar verici küçük işletmede sahibinin kendisi.
4. **Hacim** — o şehirde yeterli sayıda işletme var ki sürekli lead akışı olsun.
5. **Görsel bağımlılık** — işin doğası gereği görsele/sosyal medyaya muhtaç (estetik, moda, restoran, emlak vitrini vb.).

---

## ARAŞTIRMA SORULARI

Aşağıdakileri sistematik olarak yanıtla:

1. **Sektör ödeme gücü:** Türkiye'de bu hizmetleri satın alabilecek bütçeye sahip sektörler hangileri? Her sektörün ortalama pazarlama/dijital harcama eğilimini ve tipik bilet bandını (premium/high/mid/low) gerekçelendir.

2. **Sektörel dijital olgunluk açığı:** Hangi sektörlerde işletmelerin çoğu hâlâ web/online-randevu/CRM açısından zayıf ama ödeme gücü var? (En kârlı kesişim burası.)

3. **Şehir bazlı ekonomik yoğunluk:** Türkiye'nin ilk ~20 ekonomik merkezini (İstanbul, Ankara, İzmir, Bursa, Antalya, Kocaeli, Gaziantep, Konya, Adana, Mersin, Kayseri, Denizli, Eskişehir, Samsun, Trabzon, Muğla, Sakarya, Tekirdağ, Manisa, Şanlıurfa vb.) işletme yoğunluğu, KOBİ sayısı, kişi başı gelir ve sektörel uzmanlaşma açısından sırala.

4. **Sektör × şehir kesişimi:** Hangi sektör hangi şehirde anormal yoğun/zengin? Örnekler: Antalya → otel/turizm + saç ekim/medikal turizm; Denizli/Bursa → tekstil; İstanbul → her şey + estetik/hukuk/emlak; Konya → imalat/otomotiv yan sanayi; Muğla → butik otel/lüks emlak. Bu eşleşmeleri kanıta dayalı doğrula ve genişlet.

5. **Erişim kanalı:** Her öncelikli sektör için lead'e ulaşmanın en iyi yolu ne (Google Maps yoğunluğu mu, Instagram mı, sektör dizinleri mi)? Google Places metin sorgusu (textsearch) önerileri ver.

6. **Mevsimsellik & "şimdi neden":** Hangi sektörde hangi dönem satın alma sinyali güçlü (kayıt dönemi, sezon açılışı, yenileme ayları)?

---

## METODOLOJİ KISITLARI

- **Kanıt zorunlu:** Her sektör/şehir iddiası için kaynak göster (TÜİK, ticaret/sanayi odaları, sektör raporları, Google Maps gözlemi, ihracatçı birlikleri, KOSGEB verileri).
- **TR-spesifik:** Global ortalamaları değil, Türkiye gerçeğini kullan. Türkçe arama yap.
- **Spekülasyonu işaretle:** Sert veri yoksa "tahmin" diye belirt, uydurma.
- **Çelişkileri çöz:** Kaynaklar çelişiyorsa hangisine neden güvendiğini söyle.
- Sayıların kabaca yuvarlanması sorun değil; yön ve sıralama doğru olsun yeter.

---

## ÇIKTI ŞEMASI (ZORUNLU — birebir bu yapıda ver)

Çıktıyı **üç tablo + bir matris + bir özet** olarak ver. JSON blokları lead motoruna doğrudan ingest edilecek.

### 1. SEKTÖR ÖNCELİK TABLOSU

Her sektör için (mevcut motorla uyumlu alanlar):

```json
[
  {
    "id": "kisa_slug",
    "displayName": "Sektör Adı",
    "priority": 0,            // 0-100, fit_score sürücüsü (95=en üst dalga)
    "wave": 1,               // 1 | 2 | 3 (1=hemen tara, 3=düşük öncelik)
    "ticketBand": "premium", // premium | high | mid | low (money_score sürücüsü)
    "primaryNeed": "En kritik 1-2 ihtiyaç (hangi teklif satılır)",
    "recommendedOffers": ["teklif_id", "teklif_id"],
    "painLevel": "high",     // dijital olgunluk açığı: high|mid|low
    "googleQueries": ["google maps textsearch sorgusu", "..."],
    "justification": "Neden bu priority/band — kanıtla (2-3 cümle + kaynak)"
  }
]
```

Mevcut 22 sektörü (diş kliniği, medikal estetik, özel poliklinik, hukuk, mimarlık, emlak, sigorta, otel, oto servis, özel okul, e-ticaret, muhasebe, psikolog/diyetisyen, veteriner, özel kurs, düğün organizasyon, spor salonu, güzellik, moda/giyim, ev dekorasyon/mobilya, restoran/kafe) **yeniden puanla** ve havuza eklenmesi gereken **yeni yüksek-değerli sektörler öner** (ör. medikal turizm, kurumsal etkinlik, lüks gayrimenkul, klinik zincirleri, özel sağlık grupları).

### 2. ŞEHİR ÖNCELİK TABLOSU

```json
[
  {
    "city": "istanbul",
    "cityBonus": 15,         // 0-15, fit_score şehir bonusu
    "rank": 1,
    "economicJustification": "KOBİ yoğunluğu, kişi başı gelir, neden bu bonus",
    "topSectors": ["sektor_id", "sektor_id", "sektor_id"],
    "notes": "Bu şehre özgü fırsat/uyarı"
  }
]
```

İlk ~20 şehri kapsa. (Mevcut motorda sadece 7 şehir var: İstanbul 15, Ankara/İzmir 10, Bursa/Antalya/Kocaeli 5, Gaziantep 3 — bunu genişlet ve gerekirse yeniden dengele.)

### 3. SEKTÖR × ŞEHİR FIRSAT MATRİSİ

En yüksek değerli **ilk 30 kesişimi** sırala (ajansın ilk taraması bunlardan başlayacak):

```json
[
  {
    "rank": 1,
    "city": "antalya",
    "sectorId": "medikal_estetik",
    "opportunityScore": 0,   // 0-100, ödeme gücü × pain × hacim × erişim
    "estimatedTargetCount": "kaba işletme sayısı tahmini",
    "whyNow": "Bu kesişim neden öncelikli (mevsim/yoğunluk/açık)",
    "evidence": "kaynak"
  }
]
```

### 4. TARAMA BAŞLANGIÇ PLANI

İlk derin-araştırma sonucundan çıkan **öncelik sırası** — motor lead bulmaya bu sırayla başlayacak. İlk 10 (şehir, sektör, sorgu) üçlüsünü net ver.

### 5. YÖNETİCİ ÖZETİ

- En kârlı 3 sektör × şehir kesişimi ve nedeni
- Mevcut motorun gözden kaçırdığı en büyük fırsat
- En büyük yanlış-öncelik (motorun fazla değer verdiği ama aslında zayıf olan sektör/şehir)
- Eyleme dönük 5 madde

---

## DEĞERLENDİRME RUBRİĞİ (puanlarken bunu kullan)

`opportunityScore = ödeme_gücü(0-30) + dijital_açık(0-25) + hacim(0-25) + erişilebilirlik(0-20)`

- **Ödeme gücü:** bilet değeri + tekrar/abonelik potansiyeli + şube sayısı
- **Dijital açık:** site yok / Instagram-as-site / online randevu yok / zayıf kreatif → ne kadar büyükse o kadar iyi
- **Hacim:** o şehirde sürdürülebilir lead akışı sağlayacak işletme sayısı
- **Erişilebilirlik:** telefon/Instagram ile karar vericiye doğrudan ulaşım kolaylığı

Yüksek bulunabilirlik ≠ yüksek öncelik. Çok ama fakir (ör. küçük kafe) düşük; az ama zengin + açık (ör. çok şubeli özel klinik) yüksek.
