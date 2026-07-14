# YouTube cold outreach sistemi → AgencyOS ürün incelemesi

Kaynak: [Reklam Bütçesi Olmadan Müşteri Bulma Rehberi: 2026’da Soğuk Erişim Stratejileri](https://www.youtube.com/watch?v=dC5N8fGKNmg)

İnceleme tarihi: 2026-07-14. Video süresi: 79:33. İnceleme; video açıklaması ve
2.211 parçalık otomatik Türkçe transkript üzerinden yapıldı. Videodaki gelir,
yanıt oranı ve müşteri sayıları anlatıcının kendi beyanıdır; bağımsız doğrulanmış
benchmark olarak kullanılmamalıdır.

## Kısa hüküm

Videonun AgencyOS için en değerli katkısı yeni bir scraper değildir. Değerli olan
model şudur:

1. Lead kaynağını müşteri tipine göre seç.
2. Şirket yerine doğru karar vericiyi bul.
3. Aynı anda üç niş–problem–teklif hipotezini küçük örneklerle test et.
4. Açılma oranı yerine gerçek yanıt, pozitif yanıt, görüşme, teklif ve satış ölç.
5. Yalnız kanıtlanan segmenti büyüt; çalışmayan hipotezi değiştir.

AgencyOS bu zincirin büyük bölümüne zaten sahipti. Eksik olan, Gmail otomasyonunu
besleyecek e-posta önceliği ve gerçek sonuçları niş deneyi olarak görünür kılan
kapalı döngüydü.

## Videodaki sistemin zaman blokları

| Zaman | Anlatılan sistem | AgencyOS karşılığı |
|---|---|---|
| 00:00–13:00 | Yerel işletmeleri bölge/anahtar kelime ile bulma, web ve iletişim sinyali çıkarma | Places taraması, `lead_evidence`, web kalite sinyalleri, maliyet kaydı mevcut |
| 13:00–20:00 | LinkedIn karar vericisi, etkinlik/post sinyali, yüksek değerli hesapta manuel kişiselleştirme | `contacts`, primary contact, risk route ve evidence-bound cold email mevcut; LinkedIn otomasyonu bilinçli yok |
| 20:00–36:00 | Kanal karşılaştırması; e-posta ana kanal, LinkedIn destek, telefon sonra | Çok kanallı matris vardı fakat kalite motoru fiilen telefon/WhatsApp önceliyordu; bu incelemede düzeltildi |
| 36:00–56:00 | Fiverr/Upwork talebiyle niş–problem–teklif keşfi; üç nişi test et | Hizmet kataloğu, fırsat taraması ve teklif eşleştirme var; kalıcı experiment nesnesi henüz yok |
| 56:00–75:00 | Landing page, karar verici listesi, kısa mail, follow-up, analytics ve sektör paketleri | Voice DNA, cold email gate, follow-up FSM, teklif motoru ve funnel telemetrisi var |
| 75:00–79:33 | Workspace/domain/deliverability, segmentasyon, yanıt odaklı optimizasyon | OAuth/Vault/DNS health kapıları hazır; gerçek Workspace ve provider canary dış adım olarak bekliyor |

## Bu incelemede doğrudan ürüne alınanlar

### 1. E-posta-öncelikli kanal yönlendirme

- E-posta mevcutsa `best_channel=email`.
- Telefonu olmayan fakat e-postası olan lead artık elenmiyor.
- E-postalı A/B lead için sonraki iş `send_audit`; telefon, e-posta yoksa destek
  kanalı olarak kullanılıyor.
- Telefon/e-posta/WhatsApp yok ama gerçek web sitesi varsa lead hemen çöpe
  atılmıyor; contact enrichment için tutuluyor.
- E-ticaret, yerel, B2B ajans ve founder kanal matrisinde ölçülebilir ilk kanal
  e-posta oldu. LinkedIn/Instagram/WhatsApp/telefon destek adımlarıdır.

### 2. “3 Niş Deneyi” gerçek sonuç skor kartı

Komuta Merkezi cold-email KPI alanına sektör bazlı skor kartı eklendi:

- gerçek Gmail provider gönderimi,
- insan yanıtı,
- `positive_interest`,
- görüşme,
- teklif,
- satış/converted.

İlk mail ve follow-up aynı lead için tek örnek sayılır. Dry-run, auto-reply ve
opt-out performans sinyali değildir. Sektör başına 20 gerçek lead oluşmadan
“başarılı” veya “optimize” etiketi verilmez.

### 3. Kanıtsız ikna cümlelerinin temizlenmesi

Kalite motorunda kanıta bağlı olmayan yüzde kayıp, kesin ciro artışı ve doğrudan
rakibe kayıp ifadeleri kaldırıldı. Yeni dil:

- gözlemlenebilir problemi söyler,
- etkisini olasılık olarak çerçeveler,
- sonucu küçük ve ölçülebilir pilotla doğrulamayı önerir.

Bu, videonun güçlü satış sistemini alırken videodaki kanıtlanmamış performans
iddialarını kopyalamamayı sağlar.

## Zaten bulunan güçlü parçalar

- Places/yerel lead taraması ve maliyet ölçümü.
- Contact enrichment, primary contact ve rol bilgisi.
- Web sitesi, form, booking, WhatsApp, reklam, yorum ve teknoloji kanıtları.
- Voice DNA ile profesyonel dil; claim→evidence fail-closed kalite kapısı.
- HITL onayı, digest lock, suppression ve at-most-once Gmail gönderimi.
- Cevap sınıflandırma: positive interest, objection, not-now, auto-reply, opt-out.
- Cevap geldiğinde follow-up iptali; cevapsız lead için idempotent sequence.
- Versiyonlu ve onay kapılı teklif motoru.
- Telegram’dan günlük satış özeti, lead aksiyonu, imzalı gönderim ve reconcile.

## Sonraki gerçek ürün yükseltmeleri

### P0 — Kalıcı gelir deneyi nesnesi

Sektör kırılımı yararlı ancak “hangi teklif ve hangi mesaj varyantı kazandı?”
sorusunu tek başına cevaplamaz. Sonraki additive migration şu modeli kurmalı:

- `growth_experiments`: hipotez, ICP, sektör, problem, offer, kanal, örnek hedefi,
  durum ve bütçe.
- `growth_experiment_variants`: konu, mesaj açısı, CTA ve Voice DNA sürümü.
- `outreach_messages.experiment_id` + `variant_id`.
- Sonuç: sent → human reply → positive → meeting → proposal → won.
- Otomatik karar yalnız minimum örnek ve gerçek provider verisi sonrası;
  “büyüt/düzelt/durdur” önerisi HITL kalmalı.

### P0 — Kaynak ve karar verici kalitesi

- Yerel/KOBİ: resmi Places API + işletmenin kendi web sitesi.
- B2B: izinli veri sağlayıcı/API + primary decision-maker contact.
- Generic `info@` ile rol doğrulanmış kişi e-postası ayrı kalite bandında tutulmalı.
- Company size, role seniority, verified email ve teknoloji sinyali scoring'e
  deterministik girdi olmalı.

### P1 — Landing ve toplantı attribution

- Lead/experiment bazlı UTM üretimi.
- Landing CTA, Calendly/Google Calendar meeting ve proposal-view event'i.
- `email → landing → meeting → proposal → won` attribution görünümü.
- Sektör paketleri katalogdan üretilmeli; kanıtsız sosyal kanıt yazılmamalı.

### P1 — Yüksek değerli hesap araştırma kuyruğu

`manual_hyper_personalization` route'undaki lead için operatöre kısa görev:

- son şirket haberi veya kendi sitesindeki güncel sinyal,
- karar verici rolü,
- tek somut kişiselleştirme kanıtı,
- onaylanmış Loom/mini-audit taslağı.

LinkedIn scraping veya otomatik DM yapılmamalı; araştırma ve gönderim operatör
kontrollü olmalı.

## Bilinçli olarak alınmayan öneriler

- **Google Maps HTML scraping / “sınırsız ücretsiz lead”:** AgencyOS resmi Places
  API yolunda kalmalı. Güncel Places politikaları içerik saklama ve attribution
  kısıtları getiriyor: https://developers.google.com/maps/documentation/places/web-service/policies
- **LinkedIn scraper ve otomatik DM:** LinkedIn izinsiz otomatik crawling'i açıkça
  yasaklıyor: https://www.linkedin.com/legal/crawling-terms
- **Kontrolsüz 10.000 mail veya sabit %5 hedef:** hacim amaç değil; spam, ret,
  bounce ve gerçek gelir birlikte ölçülmeli.
- **AI cold call:** marka ve rıza riski yüksek; AgencyOS'ta cold-call botu
  açılmamalı.
- **Warm-up aracı başarı garantisi:** deliverability yalnız “iki hafta ısıtma”
  değildir. SPF, DKIM, DMARC, TLS, düşük spam oranı ve unsubscribe gereklidir:
  https://support.google.com/mail/answer/14229414
- **İzinsiz ticari ileti:** suppression/consent fail-closed kalmalı. İYS, ticari
  ileti onay ve ret kayıtlarını yöneten resmi sistemdir: https://iys.org.tr/
- **Open rate optimizasyonu:** Apple MPP/bot etkisi nedeniyle AgencyOS gerçek
  human reply, positive reply, meeting ve won kullanmaya devam etmeli.

## Ürün kararı

Videodan alınacak ana ders bir “n8n kopyası” değil, AgencyOS'u deney yöneten bir
gelir işletim sistemine çevirmektir. İlk paket bunu e-posta önceliği ve sektör
sonuç kartıyla başlattı. En yüksek değerli devam işi P0 kalıcı experiment +
variant attribution modelidir; gerçek Gmail canary'den önce hazır olabilir fakat
kazanan varyant kararı gerçek provider verisi gelmeden verilmemelidir.
