---
Doküman: 10-email-deliverability
Tarih: 2026-07-11
Kaynak kalitesi: karışık (resmi kaynak ağırlıklı: Google/Microsoft/Yahoo/IETF birincil; sentez blogları ikincil doğrulama için)
Güven: yüksek (kimlik doğrulama eşikleri ve bulk-sender kuralları resmi kaynaklardan); orta (pratik hacim/warm-up sayıları sektör ortalaması, resmi değil)
AgencyOS'a etki: Cem'in düşük-hacimli, insan-onaylı, 1:1 kişiselleştirilmiş B2B outreach modeli bulk-sender eşiklerinin çok altında kalıyor — bu doküman "bulk marketing" kurallarını REDDETMEK değil, hangilerinin bugün zorunlu olmadığını ve hangi temel hijyenin (SPF/DKIM/DMARC, suppression list, doğru başarı metriği) her hacimde şart olduğunu ayırt ediyor.
---

## Kısa özet

AgencyOS'ta e-posta gönderimi bugün **tamamen manuel-dispatch**: sistem taslak üretir (`src/lib/coldEmail.ts`), operatör (Cem) kendi Gmail/Workspace hesabından elle gönderir, sistem yalnızca "gönderildi" olarak işaretler (`src/lib/outreach/email.ts` → `markMessageSent`). Otomatik SMTP/Resend entegrasyonu **yok**. Bu, Google/Yahoo/Microsoft'un 2024-2025'te sıkılaştırdığı "bulk sender" kurallarının (SPF+DKIM+DMARC zorunlu, tek-tık abonelikten çıkma, spam oranı <%0.3) çoğunu bugün için **hukuken/teknik olarak devreye sokmuyor** — çünkü eşik günde 5.000+ ileti ve Cem'in hacmi (günde 2 fırsat seçimi, `src/lib/leadIntel/selection.ts`) bunun çok altında. Ama düşük hacim, kötü pratiklerden muaf olmak anlamına gelmiyor: tek bir spam şikâyeti bile yeni/küçük bir domainde orantısız ağırlık taşıyor, ve mevcut metrik tasarımı (`src/lib/outreach/metrics.ts`) zaten open-rate'i **kasıtlı olarak dışlıyor** — bu doğru bir mimari karar ve güncel araştırmayla birebir örtüşüyor (Apple Mail Privacy Protection, aşağıda). Bu doküman, Gmail gönderme entegrasyonu (Eksik #1) hayata geçtiğinde neyin zorunlu, neyin isteğe bağlı, neyin YAPILMAMASI gerektiğini tanımlıyor.

## 1. Kimlik doğrulama: SPF, DKIM, DMARC

| Katman | Ne yapar | Google (2024-2026) | Microsoft (2025) | Kaynak |
|---|---|---|---|---|
| SPF | Gönderen IP'nin domain adına yetkili olduğunu doğrular | Tüm göndericiler için önerilir; bulk göndericide SPF **veya** DKIM zorunlu | 5.000+/gün göndericide zorunlu | [Google — Email sender guidelines](https://support.google.com/a/answer/81126?hl=en), 2026 |
| DKIM | Mesaj imzası; içerik değişmemiş mi doğrular | Bulk göndericide zorunlu, anahtar ≥1024-bit (2048-bit önerilir) | 5.000+/gün göndericide zorunlu | aynı kaynak |
| DMARC | SPF/DKIM hizalamasını zorunlu kılar, raporlama sağlar | Bulk göndericide zorunlu (policy=`none` yeterli), From: alan adı SPF veya DKIM alan adıyla hizalı olmalı | 5.005+/gün göndericide zorunlu | aynı kaynak; Microsoft Tech Community, 5 Mayıs 2025 duyurusu |

- **Bulk sender eşiği**: Gmail ve Yahoo aynı fikirde — kişisel hesaplara günde **5.000+ ileti**. Microsoft aynı eşiği 5 Mayıs 2025'ten itibaren Outlook/Hotmail/Live/MSN için uyguluyor. [CERTAIN] — kaynak: Google resmi sayfa + Microsoft Tech Community blog, 2025.
- **Spam oranı eşiği**: Google — tüm göndericilerde <%0.3 zorunlu, <%0.1 önerilen tavan; %0.3+ oranlar teslim edilebilirliği ciddi şekilde düşürür. [CERTAIN]
- **Düşük hacimli gönderici muafiyeti YOK**: Google/Microsoft dokümanları "kişisel/düşük hacim" için ayrı bir istisna tanımlamıyor — SPF/DKIM temel hijyen her göndericiden bekleniyor, sadece DMARC+tek-tık-çıkış zorunluluğu 5.000 eşiğine bağlı. Yani Cem'in hacmi DMARC'ı zorunlu kılmasa da, SPF/DKIM olmadan gönderim büyük ihtimalle zaten spam'e düşer. [LIKELY]

**Çıkarım**: Cem'in gönderim yaptığı domain/mailbox'ta SPF+DKIM'in zaten var olup olmadığı bu araştırmanın kapsamı dışında (DNS sorgusu gerektirir) — **doğrulanamadı**, aşağıda açık soru olarak işaretlendi.

## 2. Domain/subdomain stratejisi ve mailbox reputation

- Sentez kaynaklar (2025-2026): Soğuk/outreach e-postası için **ayrı bir alt-alan adı** (ör. `outreach.grafikcem.com`) kullanmak, ana kurumsal domainin itibarını izole eder — ama Google Postmaster Tools itibarı **kök domain seviyesinde** izlediği için izolasyon kısmi: alt-domain'de yüksek şikâyet oranı ana domaine de bulaşabilir. [LIKELY — ikincil kaynak sentezi, resmi Google kaynağı bu detayı doğrulamıyor]
- Alt-domain kullanılacaksa her alt-domain için **ayrı SPF/DKIM/DMARC kaydı** gerekir — miras alınmaz.
- Cem'in mevcut modelinde (kişisel imza + gerçek Gmail/Workspace hesabından elle gönderim, `buildSignatureBlock` içinde "Ali Cem Bozma" imzası) alt-domain stratejisi **düşük öncelikli**: hacim düşük, gönderim zaten kişisel bir hesaptan, "pazarlama otomasyonu" görünümünden kaçınmak (kişisel/1:1 ton) zaten stratejinin parçası. Alt-domain önerisi yalnızca hacim büyür veya otomatik gönderim (Gmail API) devreye girerse anlamlı hale gelir.

Kaynak: [growleads.io — Subdomain for Cold Email 2026](https://growleads.io/blog/subdomain-for-cold-email-protect-main-domain/), [suped.com knowledge base](https://www.suped.com/knowledge/email-deliverability/sender-reputation/should-i-use-a-subdomain-or-separate-domain-for-marketing-emails-and-cold-outreach) — ikincil, 2025-2026, orta güven.

## 3. Warm-up (ısınma)

- Standart tavsiye: yeni domain/mailbox için ~30 günlük kademeli ısınma — Hafta 1: günde 5-10 ileti, her 3-4 günde iki katına çıkarma, Hafta 4'te hedef hacme ulaşma. [LIKELY — ikincil kaynak, sektör pratiği, resmi ISP kaynağı yok]
- **Güncel risk (2025-2026)**: Otomatik "warm-up pool" servisleri (bot ağları birbirine sahte açma/yanıtlama sinyali üretir) ISP'ler tarafından giderek daha iyi tespit ediliyor; yapay etkileşim sinyali gerçek kullanıcı davranışından ayrıştırılabiliyor ve bazı durumlarda itibarı **iyileştirmek yerine kötüleştirebiliyor**. [ASSUMPTION — bu spesifik iddia ikincil kaynaklarda tekrar ediyor ama tek bir otoriter ölçüm yok; temkinli okunmalı]
- Cem'in modelinde ısınma **kritik değil**: gönderim gerçek, uzun süredir kullanılan kişisel/kurumsal Gmail hesabından yapılıyor gibi görünüyor (imza bloğunda gerçek website/Instagram/LinkedIn), yani muhtemelen zaten "ısınmış" bir mailbox. Yeni bir domain/subdomain'e geçilmediği sürece warm-up planı gereksiz.

Kaynak: [smartflowpros — Email Warmup Strategy](https://smartflowpros.com/blog/email-warmup-strategy-new-domain-cold-emails-2), [mailreach.co — Domain variations](https://www.mailreach.co/blog/domain-variations-for-cold-email), 2025-2026, ikincil, orta güven.

## 4. Hacim ve gönderim ritmi

Cem'in hacmi — günde 2 fırsat seçimi (`src/lib/leadIntel/selection.ts`, bütçe tavanı $0.40/gün) → günlük onaylanan taslak sayısı muhtemelen tek haneli. Bu, 5.000/gün bulk eşiğinin **binde biri** mertebesinde. Pratik sonuç:
- DMARC zorunluluğu, one-click-unsubscribe zorunluluğu **teknik olarak devreye girmiyor** [CERTAIN — eşik resmi kaynaklarda net].
- Ama "az sayıda + yüksek kalite" gönderim, düşük hacimli göndericiler için asıl risk: **tek bir spam şikâyeti orantısız ağırlıklı** oluyor çünkü payda küçük. Bu yüzden hedefleme kalitesi (mevcut sektör/şehir öğrenen sistemi, `src/lib/sectorRotation.ts`, `src/lib/cityTargeting.ts`) deliverability için de dolaylı bir savunma katmanı — yanlış kişiye giden e-posta şikâyet riskini büyütür.

## 5. Bounce yönetimi (hard/soft)

- **Hard bounce** (geçersiz adres, kalıcı red — SMTP 550 vb.): anında suppression list'e eklenmeli, bir daha asla gönderilmemeli.
- **Soft bounce** (geçici — kutu dolu, sunucu hatası): 2-3 deneme sonrası hâlâ başarısızsa hard bounce gibi işlem görmeli.
- **Kasım 2025+ önemli değişiklik**: Gmail/Yahoo uyumsuz kimlik doğrulama veya kötü itibar durumunda artık **kalıcı 550 red** uyguluyor (geçici değil) — yani "sonra tekrar dene" mantığı bazı hata kodlarında artık geçerli olmayabilir. [LIKELY — bu detay kullanıcı bağlamında verilmiş, bu araştırmada bağımsız doğrulanmadı, "doğrulanamadı" olarak işaretli]

**AgencyOS mevcut durumu**: `outreach_messages.status` alanı `sent`/`replied`/`failed` üçlüsünü destekliyor (`src/lib/outreach/metrics.ts` yorumu: "`failed`: bounce/hata proxy'si"). **Bounce, ayrı bir status değil** — `failed` genel bir yakalayıcı. Hard/soft ayrımı ve gerçek SMTP bounce kodu bugün hiç yakalanmıyor çünkü gönderim zaten manuel (Gmail arayüzünden) — sistem bounce event'ini göremiyor. Bu, Gmail API entegrasyonu gelene kadar **yapısal bir kısıt**, hata değil.

## 6. Spam şikâyeti ve abonelikten çıkma (unsubscribe)

| Sağlayıcı | One-click unsubscribe zorunlu mu | Eşik | Uygulama tarihi |
|---|---|---|---|
| Gmail | Evet (bulk sender) | 5.000+/gün | Şubat 2024 |
| Yahoo | Evet (bulk sender) | 5.000+/gün | 2024 |
| Microsoft/Outlook | "Fonksiyonel" abonelik linki zorunlu; RFC 8058 önerilir ama tek başına şart değil | 5.000+/gün | 5 Mayıs 2025 |

Kaynak: [Google sender guidelines](https://support.google.com/a/answer/81126?hl=en); [Microsoft Tech Community — Outlook high-volume sender requirements](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%e2%80%99s-new-requirements-for-high%e2%80%90volume-senders/4399730), 2025; [RFC 8058 (IETF, resmi standart)](https://www.rfc-editor.org/rfc/rfc8058).

**RFC 8058 teknik özet** (birincil kaynak, IETF): `List-Unsubscribe` başlığı bir HTTPS URI içermeli (mailto: de eklenebilir); `List-Unsubscribe-Post: List-Unsubscribe=One-Click` başlığı tek-tık desteğini işaretler; her iki başlık DKIM imzasının `h=` etiketine dahil edilmeli; mail istemcisi HTTPS POST atar, **cookie/auth/redirect içeremez** (POST redirect'i tarihsel olarak güvenilmez çalışıyor).

**AgencyOS mevcut durumu — önemli fark**: `src/lib/coldEmail.ts` → `buildComplianceFooter()` abonelikten çıkmayı **link değil, yanıt talimatıyla** çözüyor: *"Bu tür e-postaları almak istemezseniz 'ret' yazarak yanıtlamanız yeterlidir."* Bu KVKK/İYS açısından geçerli bir ret mekanizması ama RFC 8058 tek-tık standardı **değil**. Bugün sorun değil (hacim eşiğin çok altında, zorunluluk yok) — ama not: eğer ileride otomatik/yüksek hacimli gönderim eklenirse (Eksik #1 tam gerçekleşirse) bu, ilk yapılması gereken uyum değişikliklerinden biri olur.

## 7. Open-tracking pixel — güncel sorunlar (ANA METRİK YAPMA)

- **Apple Mail Privacy Protection (MPP, 2021'den beri aktif, 2025'te kullanıcı tabanı büyüdü)**: Apple, e-postaları kullanıcı açmadan önce kendi proxy sunucusunda **önceden yükler** (pre-fetch) — bu, tracking pixel'in kullanıcı gerçekten bakmasa bile tetiklenmesine, yani "hayalet açılma" (phantom open) sinyaline yol açıyor. 2025 itibarıyla Apple Mail kullanıcılarının ~%64'ü MPP'li sürümde. [CERTAIN — Apple'ın kendi 2021 duyurusu + 2025 kullanım oranı ikincil kaynak sentezi]
- Sonuç: **open-rate güvenilmez bir metrik** — hem şişirilmiş (phantom open) hem de gizlilik araçları/resim engelleme nedeniyle düşük gösterilebilir aynı anda.
- **AgencyOS zaten doğru tasarlanmış**: `src/lib/outreach/metrics.ts` dosyasının başındaki yorum bunu **açıkça** belirtiyor: *"Open rate KASITLI kullanılmaz (Apple MPP + bot aktivitesi nedeniyle güvenilmez); başarı metriği positive reply / bounce'tur."* Bu, bu araştırmanın bulgusuyla birebir örtüşüyor — **değişiklik gerektirmiyor, mevcut kararı doğruluyor**.

Kaynak: [beehiiv — Impact of Apple MPP on Open Rates](https://www.beehiiv.com/blog/apple-mpp-open-rate); [gmass.co — Apple MPP cold email strategies](https://www.gmass.co/blog/apple-mail-privacy-protection/), 2025, ikincil, yüksek güven (tutarlı çoklu kaynak).

## 8. Link tracking, plain-text vs HTML, ekler

- **Link tracking**: Yönlendirme (redirect) domain'leri kullanan link-tracking servisleri (çoğu ESP'nin varsayılanı) bazı spam filtrelerinde şüpheli olarak işaretlenebiliyor, özellikle bilinmeyen/kısaltılmış kısaltma servisleriyle. Cem'in modelinde link tracking **yok** (draft-only, elle gönderim) — bu bir eksiklik değil, mevcut düşük-hacim/yüksek-güven stratejisiyle uyumlu.
- **Plain-text vs HTML**: 2025-2026 sentez kaynaklarının ortak görüşü — soğuk/1:1 B2B outreach'te **düz metne yakın, minimal HTML** (imza bloğu hariç ağır tasarım yok) hem "kişisel e-posta" algısını korur hem de HTML-ağırlıklı gövdelerin tetiklediği bazı filtre sinyallerinden kaçınır. AgencyOS'un mevcut çıktısı (`coldEmail.ts` prompt yapısı, düz metin gövde + imza bloğu) bu yönde zaten hizalı. [LIKELY]
- **Ekler (attachment)**: Soğuk e-postada ek dosya (PDF teklif, vs.) spam filtrelerinde ek risk taşır; tercih edilen pratik: ekler yerine bağlantı (Drive/Notion linki) paylaşmak, özellikle ilk temas e-postasında. AgencyOS'un `proposalGenerator.ts` çıktısının e-postaya ek olarak mı yoksa link olarak mı gideceği bu araştırmanın kapsamında doğrulanmadı — **açık soru**.

## 9. Spam tetikleyici kelimeler — efsane vs gerçek

- 2025-2026 kaynaklarının ortak bulgusu: Gmail/Yahoo/Microsoft artık **kelime listesi değil, davranışsal + bağlamsal makine öğrenmesi** kullanıyor — gönderen itibarı, kimlik doğrulama durumu, alıcı etkileşim geçmişi (kullanıcı bazlı "engagement scoring") ağırlıklı sinyal. "Ücretsiz", "garanti" gibi kelimeler tek başına spam'e düşürmüyor; SPF/DKIM/DMARC başarısızlığı kelimelerden bağımsız olarak doğrudan blok/karantina nedeni. [LIKELY — çoklu ikincil kaynak tutarlı, ama Google/Microsoft'un algoritma iç detayları resmi olarak yayınlanmıyor]
- **AgencyOS'a etki**: `src/lib/coldEmail.ts` içindeki "anti-klişe" kuralları (somut gözlem şartı, jenerik pazarlama dilinden kaçınma) zaten kelime-listesi endişesinden bağımsız, **okunabilirlik ve kişiselleştirme** için var — bu tesadüfen deliverability'i de destekliyor çünkü kişiselleştirilmiş 1:1 ton, davranışsal spam sinyallerini azaltan bir yaklaşım.

Kaynak: [gocustomer.ai — Spam words 2025](https://www.gocustomer.ai/blog/email-spam-words-and-what-to-do-instead); [leavemealone.com — AI Spam Filtering 2026](https://leavemealone.com/blog/ai-spam-filtering/), ikincil, orta-yüksek güven.

## 10. Deliverability monitoring araçları

| Araç | Sağlayıcı | Ne gösterir | Erişim |
|---|---|---|---|
| Google Postmaster Tools | Google | Domain/IP itibarı, spam oranı, kimlik doğrulama başarı oranı, teslim hataları | Ücretsiz, DNS sahipliği doğrulaması gerekir |
| SNDS (Smart Network Data Services) | Microsoft | IP bazlı hacim, şikâyet oranı, spam trap isabetleri | Ücretsiz, kayıt gerekir |
| JMRP (Junk Mail Reporting Program) | Microsoft | Kullanıcı "junk" işaretlediğinde mesajın kopyasını gönderir (complaint feedback loop) | Ücretsiz, kayıt + karşılıklı doğrulama gerekir |
| Yahoo Feedback Loop | Yahoo/AOL | Şikâyet bildirimleri | Ücretsiz, kayıt gerekir |

Kaynak: [Microsoft SNDS FAQ](https://sendersupport.olc.protection.outlook.com/snds/faq); [mailtrap.io — Microsoft SNDS Tutorial 2026](https://mailtrap.io/blog/microsoft-snds/), 2026, birincil (Microsoft resmi) + ikincil özet.

Bugün AgencyOS'un bu araçlardan hiçbirine entegrasyonu yok — beklenen, çünkü gönderim manuel ve düşük hacimli. Gmail API entegrasyonu geldiğinde (Eksik #1), Google Postmaster Tools kurulumu **düşük maliyetli, yüksek değerli** bir ilk adım olur (ücretsiz, sadece DNS TXT kaydı gerektirir).

## 11. Suppression / do-not-contact listesi

Endüstri standardı: hard bounce, spam şikâyeti, açık "ret/unsubscribe" talebi alan her adres kalıcı bir suppression list'e düşmeli ve **hiçbir gelecek kampanya bu listeyi bypass edememeli** — kampanya bazlı değil, global. AgencyOS'ta bugün:
- `leads.status` alanı pipeline durumunu tutuyor (`new→contacted→...→lost/archived`, `src/lib/leads/pipelineGate.ts`) ama bu **satış hunisi durumu**, ayrı bir "do-not-contact" bayrağı değil.
- "ret" yanıtı geldiğinde bunu otomatik olarak lead'i suprese eden bir mekanizma **repo'da görülmedi** (bu doküman kapsamında tam doğrulanmadı — Eksik #2 "Reply intelligence YOK" ile doğrudan örtüşüyor).

**Bu, bu araştırmanın en somut, en düşük riskli, en yüksek öncelikli bulgusu**: reply-intelligence inşa edilmeden ÖNCE bile, `leads` tablosuna basit bir `do_not_contact boolean` + `do_not_contact_reason` alanı eklemek (ayrı bir "araştırma" gerektirmeyen, standart CRM pratiği) gelecekteki her outreach akışını güvenli hale getirir.

## AgencyOS'a entegrasyon

- **`src/lib/outreach/metrics.ts`**: Zaten doğru — open-rate yok, `positiveReplyRate` + `bounceRate` ana KPI. Değişiklik gerekmiyor; bu dokümanın bulgularıyla mimari zaten hizalı.
- **`src/lib/outreach/email.ts` (`markMessageSent`)**: Bugünkü "sadece kaydet" modeli deliverability riskini sıfıra indiriyor çünkü gönderim gerçek insan eylemidir. Gmail API entegrasyonu (Eksik #1) geldiğinde bu dosyanın SPF/DKIM/DMARC'ı **AgencyOS'un kontrol edemeyeceği** (Cem'in Google hesabı zaten kimlik doğrulamalı) ama **suppression kontrolü göndermeden önce burada zorunlu hale gelmeli** — yeni send çağrısı önce `do_not_contact`/bounce geçmişini kontrol etmeden mesaj atmamalı.
- **`src/lib/coldEmail.ts` (`buildComplianceFooter`)**: Reply-based "ret" mekanizması bugünkü hacimde yeterli ve KVKK'ya uygun; RFC 8058 tek-tık linkine geçiş şu an **gereksiz karmaşıklık** (YAGNI) — yalnızca hacim/otomasyon eşiği değişirse gündeme gelmeli.
- **`src/lib/outreach/sequences.ts` (`processDueSequences`, `follow_up_sequences`)**: Takip zinciri bugün lead'in "ret" dediğini veya bounce olduğunu bilmiyor — sıradaki adımı hâlâ kuyruğa alabilir. Suppression bayrağı eklenince, bu fonksiyona *"do_not_contact ise sequence'i iptal et"* kontrolü eklenmeli (kod değişikliği bu dokümanın kapsamı dışında, sadece nokta işaretleniyor).
- **`outreach_messages.status`**: `sent/replied/failed` üçlüsü bounce/complaint/unsubscribe ayrımını yapamıyor. Şema genişlemesi (`bounced_hard`, `bounced_soft`, `complained`, `unsubscribed`) gelecekte Gmail API entegrasyonuyla birlikte planlanmalı — bugün zorunlu değil çünkü sistem bu event'leri zaten göremiyor.
- **Sektör/şehir hedefleme (`sectorRotation.ts`, `cityTargeting.ts`) ve Lead Intelligence v2 (`src/lib/leadIntel/*`)**: Dolaylı ama gerçek bir deliverability savunması — daha isabetli hedefleme = daha düşük şikâyet oranı. Mevcut mimari zaten bunu yapıyor, ek iş gerekmiyor.

## MVP / V1 / V2 ayrımı

- **MVP (bugün, kod değişikliği asgari)**: (1) Cem'in gönderim yaptığı domain/mailbox'ta SPF+DKIM'in var olduğunu DNS üzerinden doğrula (bu araştırmanın kapsamı dışı, tek seferlik manuel kontrol). (2) `leads` tablosuna `do_not_contact` + `do_not_contact_reason` alanı ekle, tüm outreach yazma yollarının bunu kontrol ettiğinden emin ol. (3) Mevcut reply-based "ret" mekanizmasını KORU — değiştirme.
- **V1 (Gmail gönderme entegrasyonu geldiğinde, Eksik #1 ile birlikte)**: Google Postmaster Tools kaydı (ücretsiz, DNS TXT). `outreach_messages.status`'a bounce/complaint ayrımı ekle. Gönderim öncesi suppression-check zorunlu hale getir. Hacim hâlâ 5.000/gün'ün çok altında kalacağı için DMARC/one-click-unsubscribe **hâlâ yasal zorunluluk değil** ama DMARC (policy=none, sadece raporlama) düşük maliyetli olduğu için erken eklenebilir.
- **V2 (hacim büyürse veya reply-intelligence tam devreye girerse)**: RFC 8058 tek-tık unsubscribe (yalnızca otomatik/yarı-otomatik gönderim + hacim artışı senaryosunda), Microsoft SNDS/JMRP kaydı, dedicated subdomain değerlendirmesi, deliverability monitoring dashboard'u command-center'a entegre etme. Bunların hiçbiri bugünkü düşük-hacim/HITL modeliyle **acil** değil.

## Açık sorular / doğrulanamayanlar

- Cem'in cold outreach gönderdiği gerçek domain/mailbox'ta SPF/DKIM/DMARC kayıtları mevcut mu? — **doğrulanamadı** (DNS sorgusu bu araştırmanın kapsamı dışında; hızlı ve düşük riskli bir sonraki adım).
- Kasım 2025+ Gmail/Yahoo'nun bazı red kodlarını "geçici"den "kalıcı 550"ye çevirdiği iddiası bağımsız birincil kaynakla bu araştırmada doğrulanamadı — kullanıcı bağlamından alındı, teyit önerilir.
- `proposalGenerator.ts` çıktısının e-postaya ek (attachment) olarak mı yoksa link olarak mı gönderildiği bu doküman kapsamında doğrulanmadı.
- KVKK/İYS açısından "ret yazarak yanıtla" mekanizmasının hacim büyüdükçe (veya İYS'ye kayıt zorunluluğu tetiklendiğinde) yeterliliğini koruyup korumayacağı **hukuki bir soru** — bu doküman hukuki kesinlik iddia etmiyor, profesyonel hukuk incelemesi önerilir (aynı not diğer AgencyOS v2 araştırma dokümanlarında da tekrarlanmalı).
- Google/Microsoft/Yahoo'nun iç makine öğrenmesi spam-skorlama modellerinin tam ağırlıkları hiçbir zaman kamuya açıklanmıyor — bu dokümandaki "davranışsal sinyal ağırlıklı" sonucu, ISP'lerin resmi rehberliği + tutarlı ikincil kaynak sentezine dayanıyor, algoritmanın kendisi doğrulanamaz.
