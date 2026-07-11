---
Doküman: 09-outreach-personalization
Tarih: 2026-07-11
Kaynak kalitesi: karışık (repo denetimi birincil; web bulguları ikincil — pazarlama/ürün blogları, resmi platform dokümantasyonu değil)
Güven: orta (yapısal ilkeler — klişe listesi, kanal uzunluk sırası, 5 parçalı ilk-mesaj iskeleti — birden fazla bağımsız kaynakta tutarlı; sayısal oranlar %22/%24-32/%1-5 gibi doğrulanmamış pazarlama iddiaları, yön göstergesi olarak alındı, kanıt olarak DEĞİL)
AgencyOS'a etki: `coldEmail.ts` sistem promptunu ve `channelMatrix.ts` kanal politikasını genişletir; öğrenen bir "Voice DNA" katmanı için mevcut `memory/governance.ts` primitiflerinin yeniden kullanımını önerir. Yeni gönderim kanalı, otomasyon veya paket YOK.
---

# Outreach Kişiselleştirme + Voice DNA

## 0. Tek cümle
AgencyOS'un outreach katmanı (`coldEmail.ts` + `coldEmailTemplates.ts` + `channelMatrix.ts`) klişe-yasağı ve kanıt-bağlama disiplinini **zaten** doğru kurmuş; asıl eksik, Cem'in gönderirken yaptığı düzeltmelerin **hiçbir yerde yakalanmaması** — sistem her taslağı sıfırdan, aynı statik kurallarla üretiyor, geçmişten öğrenmiyor.

## 1. Mevcut durum: neden "Voice DNA" henüz yok

Repo denetiminde doğrulanan zincir:
1. `POST /api/leads/[id]/cold-email` → `buildColdEmailSystemPrompt()` + `buildColdEmailUserPrompt()` (`src/lib/coldEmail.ts`) LLM'e gönderilir, çıktı `parseColdEmailOutput()` ile ayrıştırılır.
2. Taslak `outreach_messages` tablosuna `status='draft'` yazılır (`supabase/migrations/010_outreach.sql` — kolonlar: `subject`, `body`, `status`, `channel`, `sequence_step`; **düzenlenmiş/orijinal ayrımı yok**).
3. Operatör taslağı görür, kendi eliyle gönderir; `markMessageSent()` (`src/lib/outreach/email.ts`) yalnızca `status='sent'` + `sent_at` yazar — **gönderilen nihai metin hiç kaydedilmiyor**.
4. UI tarafında `outreach_messages.body` için bir textarea/contentEditable düzenleme yüzeyi bulunamadı (`src/components/**` taraması) — taslak muhtemelen kopyala-yapıştır ile dışarıya (e-posta istemcisi) taşınıyor, yani Cem'in yaptığı düzenlemeler bugün **uygulamanın görüş alanı dışında**.

**Çıkarım:** Edit-delta yakalamanın önündeki engel model değil, yakalama noktasının yokluğu. Bu, MVP'nin neden küçük bir UI eklentisi + governance yeniden kullanımı olduğunu belirliyor (bkz. §6).

## 2. Öğrenen Voice DNA — teknik yaklaşım

Ürün/blog kaynaklarında (ForthWrite, Draft AI, My Writing Twin — hepsi ikincil, doğrulanmamış pazarlama içeriği) tekrarlanan ortak mimari 5 katman [çıkarım, doğrulanmamış]:

| Katman | Ne yapar | AgencyOS karşılığı |
|---|---|---|
| Context profile | Hangi bağlamda ne yazılacağı | `ColdEmailLead` + `template.angle` (mevcut) |
| Critics | Çıktıyı puanlar (klişe var mı, ton uygun mu) | `buildColdEmailSystemPrompt` kural listesi (mevcut, statik) |
| Writing profile | Sesin "olması gereken" tanımı | `PERSONA_CONTEXT` benzeri ama outreach'e özgü YOK (bkz. §6 boşluk) |
| Exemplar database | Gerçek gönderilmiş örnekler | YOK — `outreach_messages.body` yalnız taslağı tutuyor, sent-versiyon yok |
| Auto-diff feedback loop | Taslak vs gönderilen farkını öğrenir | YOK — bu doküman bunu önerir |

Önerilen döngü (mevcut mimariye eklenir, yeniden yazılmaz):
1. **Yakala**: Operatör taslağı düzenleyip gönderdiğinde (veya "olduğu gibi gönderdim" onayladığında), `outreach_messages` satırına `final_body` (yeni kolon, nullable) yazılır. Düzenlenmediyse `final_body = body` (sıfır maliyetli sinyal: "bu taslak aynen onaylandı").
2. **Diff çıkar**: Basit, deterministik bir fark fonksiyonu (LLM değil — `rules/os` "deterministik işe LLM koyma" ilkesiyle uyumlu): kelime-sayısı deltası, silinen cümleler, eklenen cümleler, silinen/eklenen kalıp ifadeler (klişe listesine karşı regex tarama).
3. **Özellik çıkar**: Diff'ten yapısal özellikler türet — "operatör CTA cümlesini hep kısaltıyor", "operatör 'harika' kelimesini hep siliyor", "operatör paragraf sayısını 4'ten 3'e indiriyor" gibi. Bu, serbest metin değil, sayılabilir/etiketlenebilir küçük bir sözlük olmalı.
4. **Governance ile terfi ettir**: `src/lib/memory/governance.ts` **zaten** bu tam problemi çözüyor — `quarantine → active` (occurrence ≥ 3 VEYA operatör onayı), `confidenceFromOccurrences`, 90 gün retention. Yeni bir governance modeli icat etmeye gerek yok; aynı fonksiyonlar `agent_memory` tablosuna (mig 044) `memory_type: 'voice_pattern'` gibi yeni bir tür olarak yazılabilir.
5. **Geri besle**: `buildColdEmailSystemPrompt()`'a, mentor promptundaki `formatMemoriesForPrompt` deseniyle birebir aynı şekilde (`src/lib/assistant/memory.ts`), yalnızca `active` durumundaki (confidence-ağırlıklı, en fazla 5-8) voice-pattern'ler "ÖĞRENİLEN TERCİHLER" bloğu olarak eklenir.

Bu, mevcut `agent_memory` governance + `getTopMemories`/`formatMemoriesForPrompt` desenini outreach'e **yeniden kullanır** — yeni bir alt sistem değil.

## 3. Kanal bazlı ton/uzunluk politikası

`src/lib/outreach/channelMatrix.ts` içindeki `CHANNEL_CONFIG` zaten kanal başına ton + günlük limit tanımlıyor. Web araştırması bu değerleri büyük ölçüde doğruluyor ve eksik kanallar (contact form, referral) için veri sağlıyor:

| Kanal | AgencyOS mevcut (`CHANNEL_CONFIG`) | Araştırma bulgusu (ikincil kaynak) | Değerlendirme |
|---|---|---|---|
| İlk soğuk e-posta | 70-110 kelime | Kısa, tek somut gözlem; şablonlanmış övgü tespit ediliyor ve filtreleniyor | Uyumlu — değişiklik gerekmiyor |
| Takip e-postası | (ayrı config yok, "second_email" adımı var) | Daha kısa, farklı açı; ısrarcı olmayan ton | `channelMatrix.ts`'e ayrı `followUpTone` alanı eklenebilir (V1) |
| LinkedIn bağlantı notu | 180-250 karakter (genel "linkedin" girişi) | Bağlantı notu ayrı: 120-180 karakter optimal, ilk DM 300-400 karakter, InMail 500-700 karakter | `linkedin` tek girişi 3 alt-tipe bölünmeli: connect / first_dm / inmail (V1) |
| Instagram DM | 180-350 karakter, ilk mesajda link yok | Kişiselleştirilmiş + takip-sonrası mesaj daha iyi karşılanıyor; soğuk/toplu DM platform kurallarınca fiilen engelleniyor (otomasyon saatlik ~200 mesaj tavanı) | Uyumlu; "ilk önce takip et, 3-5 gün etkileşim, sonra mesaj" adımı sekansa eklenebilir (V1/V2) |
| WhatsApp | 1-3 balon, izin bazlı | Yalnız açık rıza/mevcut ilişki; toplu soğuk mesaj yüksek ban + itibar riski | AgencyOS zaten "izin bazlı" diyor — brief'teki "yalnız izinli" kuralıyla birebir örtüşüyor, değişiklik gerekmiyor |
| Telefon | 20-30 sn açılış | (araştırılmadı — düşük öncelik, mevcut kural yeterli) | Değişiklik yok |
| Contact form (web sitesi formu) | **AgencyOS'ta kanal olarak yok** | Genelde e-postaya yakın ama daha resmi/kısa; formun kendi karakter sınırı olabilir | Yeni kanal — V1'de `channelMatrix.ts`'e eklenebilir |
| Referral (tanıdık üzerinden) | **AgencyOS'ta kanal olarak yok** | Sıcak giriş; "X sizi önerdi" çerçevesi, soğuk-e-posta klişe kurallarının çoğu geçerli değil (zaten bir güven köprüsü var) | Yeni kanal + ayrı sistem promptu gerekir — V2 |

**Not:** Sayısal yanıt-oranı iddiaları (ör. "%22 daha yüksek yanıt", "%24-32 IG yanıt oranı") 2026 tarihli SEO/pazarlama blog gönderilerinden geliyor, birincil/resmi kaynak (LinkedIn/Meta developer docs) doğrulanmadı — yön göstergesi olarak kullanılmalı, kesin sayı olarak sunulmamalı.

## 4. İlk mesaj yapısı — 5 parçalı iskelet

Brief'in istediği yapı zaten `coldEmail.ts` + Lead Intelligence v2 kanıt motoruyla büyük ölçüde kodlanmış durumda; aşağıdaki tablo her parçayı somut koda bağlıyor:

| Parça | Ne | AgencyOS'ta karşılığı |
|---|---|---|
| 1. Doğrulanabilir gözlem | Google puanı, web sitesi yokluğu, reklam/işe-alım sinyali gibi kanıta dayalı, uydurulmamış bir tespit | `ColdEmailLead.pain_signals` / `proof_points` / `has_real_website` / `has_ads_signal` — Lead Intelligence v2 kanıt motorundan (`lead_evidence`, mig 033) gelir, her iddia `evidence_id`'ye bağlı |
| 2. Belirli problem/fırsat | Gözlemin işletme için ne anlama geldiği | `why_now` / `why_this_will_convert` alanları + şablon `angle` (`coldEmailTemplates.ts`) |
| 3. Cem'in ilgili uzmanlığı | Tek cümlelik, hizmet listesi olmayan konumlandırma | Sistem promptu kuralı: "Kendini en fazla bir cümlede tanıt; hizmet listesi sayma" (mevcut, `coldEmail.ts:67`) |
| 4. Düşük sürtünme değer | Satış değil, önce değer teklifi (mini-audit, 2 fikir, örnek) | `mini_audit` / `launch` / `before_after` şablon iskeletleri zaten bu çerçevede yazılmış |
| 5. Tek net CTA | Tek, yumuşak, evet/hayır'ı kolay bir kapanış | Sistem promptu kuralı: "Yumuşak bir CTA ile bitir" (mevcut) |

Buradaki tek gerçek boşluk: şablonlar (`COLD_EMAIL_TEMPLATES`) her biri kendi 5-parça akışını içeriyor ama bu 5-parça sözleşmesi kod içinde **açık bir tip/validasyon olarak yok** — LLM çıktısının gerçekten 5 parçayı içerip içermediği doğrulanmıyor, yalnızca `{subject, body}` parse ediliyor. V1'de bir "yapı kontrolü" (ör. gözlem cümlesi var mı, CTA cümlesi var mı) eklenebilir ama bu deterministik bir regex/heuristik olmalı, LLM'e tekrar sorulmamalı.

## 5. Kaçınılacaklar — klişe listesi (genişletilmiş)

`coldEmail.ts` sistem promptu zaten sağlam bir yasak listesi içeriyor: "Umarım bu mail sizi iyi bulur", "Değerli yetkili", "sektörünüzde lider", "çözüm ortağınız", "sinerji", "değer katmak". Web araştırması, İngilizce AI-outreach ekosisteminde tekrarlayan ek kalıpları doğruluyor — bunların TR karşılıkları henüz listede yok:

| Kategori | Örnek klişe | Neden kötü | AgencyOS durumu |
|---|---|---|---|
| Sahte övgü | "Markanızı çok beğendim", "Harika iş çıkarmışsınız", "İçeriklerinizi takip ediyorum" | Somut değil, 200 farklı işletmeye aynen gönderilebilir — okuyucu anında tanır | **Kısmen kapsanıyor**: "en az bir somut gözlem" kuralı var ama "sahte övgü YASAK" açıkça yazılı değil — V1'de eklenmeli |
| Uzun ajans tanıtımı | "Biz 10 yıldır... ekibimizle... 360 derece..." | Karar vericinin zamanını çalar, tek-cümle kuralını ihlal eder | **Zaten yasak** ("hizmet listesi sayma") |
| Template-şirket-adı-değiştir | Yalnız `[isim]`/`[şirket]` değişmiş, gövde birebir aynı | AI/spam filtreleri ve insan gözü bunu kolayca tespit ediyor | **Zaten önlenmiş**: köşeli parantez placeholder yasak + zorunlu somut gözlem |
| Uydurma problem/metrik | "Dönüşüm oranınız düşük olmalı", "%40 kayıp yaşıyorsunuzdur" gibi kanıtsız iddialar | Yanlış çıkarsa güven sıfırlanır; brief'in "kanıtsız %/ROI YASAK" kuralına doğrudan aykırı | **Zaten yapısal olarak engelli**: Offer Matcher deterministik (C2), her iddia `evidence_id`'ye bağlı (Lead Intelligence v2) |
| Manipülatif aciliyet | "Bu hafta sona eriyor", "Sınırlı kontenjan", "Sadece 3 kişiye" | Baskı hissettirir, marka değerine aykırı, kaçınılması istenen "sert satış" tonu | **Açık yasak değil** — sistem promptuna eklenmeli (V1) |
| AI-tell fiil/isim kalıpları | "leverage", "elevate", "transformative growth", "unlock potential" (TR: "potansiyelinizi ortaya çıkaralım", "dönüşüm yolculuğu") | Kurumsal/AI-jenerik sinyali; okuyucu şablon tanır | **Kısmen kapsanıyor** (sinerji/değer katmak yasak) — TR AI-klişe sözlüğü genişletilmeli |
| Genel geçer değer önermesi | "Ekibinizin daha hızlı satış kapatmasına yardımcı olurum" gibi her sektöre uyan cümleler | Kişiselleştirme yokmuş gibi okunur | Şablon `angle`'lar zaten sektöre/sinyale özel — düşük risk |

**Aksiyon (V1, düşük maliyetli)**: `buildColdEmailSystemPrompt()` içindeki klişe listesine 3 yeni madde eklenir: (a) sahte/genel övgü yasağı, (b) manipülatif aciliyet yasağı, (c) TR AI-klişe kalıpları ("dönüşüm yolculuğu", "potansiyelinizi ortaya çıkaralım", "vizyonunuzu hayata geçirelim" vb.). Bu, tek dosyada birkaç satırlık bir değişiklik — mevcut fonksiyonun sözleşmesini bozmaz.

## 6. AgencyOS'a entegrasyon — dosya haritası

| İhtiyaç | Mevcut dosya | Değişiklik türü |
|---|---|---|
| Klişe listesi genişletme | `src/lib/coldEmail.ts` → `buildColdEmailSystemPrompt()` | Küçük ekleme (madde listesi) |
| Kanal ton/uzunluk politikası genişletme | `src/lib/outreach/channelMatrix.ts` → `CHANNEL_CONFIG` | `linkedin`'i connect/first_dm/inmail'e ayır; `contact_form` ekle |
| Edit-delta yakalama | `outreach_messages` tablosu (mig 010) | Yeni nullable kolon `final_body` + bunu dolduran bir UI adımı (bugün yok — bkz. §7 açık soru) |
| Voice pattern governance | `src/lib/memory/governance.ts` (mevcut, saf fonksiyonlar) | **Değişiklik gerekmiyor** — doğrudan yeniden kullanılır |
| Voice pattern depolama | `agent_memory` tablosu (mig 044) | Yeni `memory_type: 'voice_pattern'` değeri (şema değişmez, sadece yeni bir değer) |
| Prompt'a geri besleme | `src/lib/assistant/memory.ts` (`getTopMemories`/`formatMemoriesForPrompt` deseni) | Aynı desen `coldEmail.ts` için kopyalanır (yeni fonksiyon, mevcut dosya bozulmaz) |
| Persona/ton temeli | `src/data/personaContext.ts` | Outreach'e özgü değil (mentor-terapötik bağlam) — outreach için ayrı, iş-tonu odaklı küçük bir sabit gerekebilir (V1) |
| Görsel/video prompt stili | `knowledge/PROMPT_STYLE_GUIDE.md` | **İlgisiz** — bu dosya yalnız AI görsel/video prompt kuralları için; metin/e-posta sesi için karşılığı yok (gap, ama küçük öncelik) |

## 7. MVP / V1 / V2

**MVP** (düşük maliyet, mevcut dosyalara küçük ek):
- `coldEmail.ts` klişe listesine sahte-övgü + manipülatif-aciliyet + TR AI-klişe maddelerini ekle.
- `channelMatrix.ts`'e `contact_form` kanalını (e-postaya yakın, biraz daha resmi ton) ekle; `linkedin` konfigürasyonuna alt-not olarak connect/DM/InMail uzunluk farkını belgele (kod davranışını değiştirmeden, sabitleri ayarla).
- Bunların hiçbiri şema/migration gerektirmiyor.

**V1** (küçük şema eklentisi + tek yeni UI adımı):
- `outreach_messages`'a `final_body` kolonu + operatör taslağı düzenleyip gönderdiğinde bunu yakalayan minimal bir "gönderildi, metni yapıştır (opsiyonel)" adımı — bugünkü kopyala-yapıştır akışını bozmadan, isteğe bağlı bir onay kutusu/textarea.
- Deterministik diff fonksiyonu (kelime sayısı, silinen/eklenen cümle, klişe-regex eşleşmesi) + `agent_memory`'ye `voice_pattern` yazımı, mevcut `governance.ts` occurrence/confidence mantığıyla.
- `coldEmail.ts`'e "ÖĞRENİLEN TERCİHLER" bloğu (yalnız `active` durumundaki, en fazla 5-8 pattern) — mentor promptundaki `formatMemoriesForPrompt` deseninin birebir tekrarı.
- `referral` kanalı: sıcak giriş çerçevesi, ayrı ve daha kısa sistem promptu.

**V2** (yalnızca reply-intelligence [gerçek eksik #2] kodlandıktan sonra anlamlı):
- Voice pattern'leri yanıt/sonuç (toplantı oldu mu, görmezden gelindi mi) ile ilişkilendirip `sectorRotation.ts`/`cityTargeting.ts` desenindeki gibi "öğrenen görünüm" (learned view) üretmek — hangi ton/açı hangi sektörde/kanalda gerçekten dönüşüyor.
- Instagram'da "önce takip et, 3-5 gün etkileşim, sonra DM" ön-adımını sekansa (`sequences.ts`) eklemek — bugünkü `social_connect`/`social_dm` adımları bunu kısmen karşılıyor ama gecikme mantığı yok.

## 8. Açık sorular / doğrulanamayanlar

- **[UNKNOWN]** Operatörün taslağı göndermadan önce düzenlediği bir UI adımı var mı? Repo taramasında (`src/components/**`) `outreach_messages.body` için bir textarea/edit yüzeyi bulunamadı — taslak muhtemelen kopyalanıp harici bir e-posta istemcisine yapıştırılıyor. Bu doğruysa, edit-delta yakalama **yeni bir UI adımı gerektirir** (yalnız arka-uç değişikliği yeterli değil). Bunu Cem'e sormadan MVP/V1 ayrımı netleşmez.
- **[ASSUMPTION]** Sayısal yanıt-oranı iddiaları (LinkedIn %22, Instagram %24-32, cold email %1-5 ortalama) 2026 tarihli SEO/pazarlama blog kaynaklarından geliyor — LinkedIn/Meta'nın resmi geliştirici dokümantasyonuyla çapraz doğrulanmadı. Yön göstergesi olarak kullanıldı, kesin performans hedefi olarak kullanılmamalı.
- **[UNKNOWN]** LinkedIn bağlantı notu karakter sınırının "300 karakter" olduğu iddiası birden fazla 2026 blogunda tekrarlanıyor ama LinkedIn'in kendi yardım sayfası doğrudan doğrulanmadı (bu araştırmada birincil kaynağa gidilmedi — maliyet sınırı).
- **[UNKNOWN]** WhatsApp Business API'nin resmi "template mesaj" / opt-in politikası (Meta'nın kendi sayfası) bu turda taranmadı; brief'in "yalnız izinli" kuralı zaten muhafazakâr olduğundan acil değil, ama V1'de referral/contact-form kanalları eklenirken Meta'nın güncel politika sayfası birincil kaynak olarak kontrol edilmeli.
- **[LIKELY]** `agent_memory` (mig 044) şemasının `memory_type` alanı serbest metin/enum olabilir — yeni bir değer eklemenin migration gerektirip gerektirmediği doğrulanmadı (bu doküman kapsamında migration dosyası satır satır okunmadı, yalnız governance.ts saf fonksiyonları incelendi).
