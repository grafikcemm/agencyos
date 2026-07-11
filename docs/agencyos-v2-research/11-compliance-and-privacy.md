---
Doküman: 11-compliance-and-privacy
Tarih: 2026-07-11
Kaynak kalitesi: karışık (KVKK.gov.tr / mevzuat.gov.tr / resmigazete.gov.tr / ico.org.uk / ftc.gov birincil; hukuk bürosu blogları ikincil sentez)
Güven: orta (temel çerçeveler yüksek güven; TR uygulama nüansları ve eşik değerleri orta-düşük güven — hukuki kesinlik iddia edilmiyor)
AgencyOS'a etki: Mevcut mig 018 compliance footer + manuel-gönder modeli doğru yönde ama MERSİS alanı boş, kalıcı suppression list yok ve kişisel veri saklama/silme mekanizması eksik — bunlar V1 önceliği.
---

## Özet

AgencyOS bugün TEK bir hukuki dayanağı (6563 sayılı ETK'nin tacir/esnaf istisnası) deterministik bir footer ile uyguluyor (`supabase/migrations/018_compliance_footer.sql`, `src/lib/coldEmail.ts::buildComplianceFooter`). Bu doğru başlangıç noktası ama altı ayrı rejimin (KVKK, 6563/İYS, GDPR, ePrivacy, CAN-SPAM) hiçbiri birbirinin yerine geçmiyor — her biri farklı bir soruya cevap veriyor: KVKK "bu kişisel veriyi işleyebilir miyim", 6563/İYS "bu adrese ticari e-posta atabilir miyim", GDPR/ePrivacy "AB'deki bir kişiye/şirkete ne zaman yazabilirim", CAN-SPAM "ABD alıcısına ne yazmalıyım". AgencyOS şu an TR-merkezli B2B outreach yapıyor (manuel-gönder, düşük hacim, HITL) — bu risk profilini büyük ölçüde azaltıyor ama sıfırlamıyor. En somut boşluk: (1) kalıcı bir suppression/ret listesi yok, (2) kişisel veri (person_leads) için saklama/imha süresi tanımlı değil, (3) MERSİS alanı canlıda boş. Bu doküman her rejimi ayrı ayrı özetliyor, AgencyOS'un mevcut dosyalarıyla eşliyor ve güvenli varsayılanlar öneriyor. **Hukuki kesinlik iddia edilmiyor — işaretli noktalarda profesyonel hukuk incelemesi gerekir.**

## 1) Rejim karşılaştırma tablosu

| Rejim | Neyi düzenler | AgencyOS'a uygulanabilirlik | Ana risk |
|---|---|---|---|
| **KVKK (6698)** | Kişisel veri işleme (toplama, saklama, aktarma) | Her zaman — lead'lerdeki isim/e-posta/telefon kişisel veridir | Saklama süresi yok, yurt dışı LLM aktarımı |
| **6563 ETK + İYS** | Ticari elektronik iletinin GÖNDERİLMESİ (onay/ret) | Her zaman — outreach TR B2B | MERSİS boş, ret takibi manuel |
| **GDPR** | AB'deki gerçek kişilere ait veri işleme | Şartlı — hedef AB'de ise (mevcut ICP çoğunlukla TR) | Şu an düşük öncelik, global genişlemede devreye girer |
| **ePrivacy Direktifi** | AB'de elektronik pazarlama iletişimi (e-posta özelinde) | Şartlı — GDPR ile aynı tetik | Ülkeye göre B2B istisnası değişir (DE sıkı, NL/UK gevşek) |
| **CAN-SPAM** | ABD alıcılarına ticari e-posta | Şartlı — ABD merkezli lead hedeflenirse | B2B muafiyeti YOK, e-posta başına yüksek ceza |

Kaynak: 6698 sayılı KVKK (mevzuat.gov.tr), 6563 sayılı ETK (mevzuat.gov.tr, sen.av.tr özeti), GDPR Recital 47/Md.6 (ico.org.uk), ePrivacy Direktifi Md.13 (Fieldfisher/Matheson özetleri), CAN-SPAM Act (ftc.gov, 2026-güncel) — erişim 2026-07-11.

## 2) KVKK (6698) — kişisel veri işleme boyutu

KVKK, ticari e-posta göndermeyi değil, arkasındaki **kişisel veri işlemeyi** (toplama, saklama, LLM'e prompt olarak verme, skorlama) düzenler. İki ayrı işleme şartı seti var:

- **Madde 5/2 istisnaları** (açık rıza gerekmeyen haller): sözleşmenin kurulması/ifası için gerekli olma, hukuki yükümlülük, **ilgili kişinin kendisi tarafından alenileştirilmiş olması**, bir hakkın tesisi/korunması, **veri sorumlusunun meşru menfaati için zorunlu olma** (temel hak ve özgürlüklere zarar vermemek kaydıyla). [ASSUMPTION] AgencyOS'un web/LinkedIn/Google Maps'ten topladığı iş iletişim bilgisi (`person_leads`, `leads`) çoğunlukla "alenileştirme" + "meşru menfaat" ikilisiyle savunulabilir çünkü bilgi zaten kamuya açık ve amaç (B2B hizmet teklifi) o kişinin mesleki rolüyle doğrudan ilgili.
- **Meşru menfaat testi iki aşamalı**: (1) veri sorumlusunun gerçek bir meşru menfaati var mı, (2) bu menfaat ilgili kişinin temel hak/özgürlükleriyle dengelendiğinde üstün mü. KVKK Kurulu kararları bu dengelemeyi somut olay bazında yapıyor (örn. 2019/78 sayılı karar) — genel bir "B2B her zaman meşru menfaattir" kuralı YOK, çıkarım: AgencyOS'un düşük hacim + kolay ret + iş-bağlamlı hedefleme pratiği bu dengeyi lehine çeviriyor ama garanti değil.

**Otomatik karar verme / profilleme (Md. 11/1-g):** Lead Intelligence v2'nin skorlama zinciri (`difficulty_score`, `person_score`, evidence council C1-C4) bir tür otomatik değerlendirmedir ama kişi hakkında doğrudan hukuki/maddi bir sonuç DOĞURMUYOR — skor yalnızca Cem'in iç önceliklendirmesi için üretiliyor, kişiye otomatik ret/onay uygulanmıyor. [LIKELY] Bu haliyle Md.11/1-g'nin hedeflediği "münhasıran otomatik sistemle olumsuz sonuç" senaryosuna girmiyor. Risk, skorlama aşamasında değil, **temas kurulduğunda** (outreach gönderildiğinde) başlıyor.

**Yurt dışına aktarım (Md. 9, 7499 sayılı Kanunla değişik, 01.06.2024 sonrası yeni rejim):** OpenRouter (ABD merkezli model sağlayıcıları) ve Gemini embedding (Google) API çağrılarında lead'in isim/unvan/e-posta/telefonu prompt içinde yurt dışı sunucuya gidiyorsa, bu KVKK Md.9 kapsamında "yurt dışına aktarım" sayılabilir. Yeni rejimde öncelik sırası: yeterlilik kararı → uygun güvence (standart sözleşme/bağlayıcı şirket kuralları, KVKK 2024/959 sayılı kararla kabul edilen standart sözleşme metinleri) → istisnalar. [UNKNOWN] TR'nin ABD'ye (veya OpenRouter/Google'ın barındığı ülkelere) yönelik güncel bir yeterlilik kararı olup olmadığı bu araştırmada teyit edilemedi — **profesyonel hukuk incelemesi gerekir.** Pratik güvenli varsayım: prompt'lara giden veri mümkün olduğunca minimize edilmeli (tam isim yerine rol/unvan, e-posta yerine domain gibi) — bu, `evidenceEngine`/`leadIntel` promptlarının tasarımında zaten kısmen doğal (skorlama şirket sinyaline dayanıyor, kişi promptunun ne kadar ham kişisel veri taşıdığı doğrulanmadı).

**Saklama/imha:** "Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik" (RG 2017/30224) — saklama-imha politikası olan veri sorumluları için periyodik imha **azami 6 ayda bir**; politikası olmayanlar için yükümlülüğün doğduğu tarihten itibaren **3 ay içinde** silme/yok etme/anonimleştirme. İmha işlemleri en az 3 yıl kayıt altında tutulmalı. **GAP:** `leads`, `person_leads` tablolarında `retention_until` kolonu YOK (mig 027, 029 incelendi) — oysa `agent_memory` (mig 044) ve trace tabloları zaten bu deseni (`retention_until TIMESTAMPTZ`) kullanıyor. Bu deseni lead tablolarına **additive migration** ile taşımak doğal bir sonraki adım.

## 3) 6563 sayılı ETK + Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik (2015) + İYS

Bu, AgencyOS'un cold email'i için **birincil ve en somut** rejim çünkü zaten kısmen kodlanmış.

- **Tanım:** Ticari elektronik ileti = ticari amaçlarla gönderilen, telefon arama hariç, data/ses/görüntü içerikli her türlü elektronik ileti (e-posta, SMS dahil).
- **Tacir/esnaf istisnası [CERTAIN, birincil kaynak]:** Bir **tacir veya esnafın kendi ticari faaliyeti kapsamındaki** elektronik iletişim adresine gönderilen ticari elektronik ileti için **ön onay gerekmez.** Ancak alıcı **ret hakkını** kullanırsa, o andan sonra onay olmadan gönderim yasaklanır. AgencyOS'un `buildComplianceFooter` fonksiyonu tam olarak bu istisnaya dayanıyor ve bunu doğru okumuş.
- **Gerçek kişi (tüketici) alıcı:** Ön onay ZORUNLU + İYS kaydı gerekir. AgencyOS'un ICP'si (işletme karar vericileri) bu kategoriye girmemeli ama `person_leads`'teki freemail adresler (gmail/hotmail/yahoo — bkz. `isFreemail()` in `src/lib/leadScoringV3.ts`) bu ayrımı BULANIKLAŞTIRIYOR: bir kişinin işle ilgili faaliyetinde gmail kullanması onu otomatik olarak "gerçek kişi tüketici" yapmaz (esnaf da freemail kullanabilir) ama ispat/temkin açısından daha yüksek dikkat gerektirir.
- **İçerik zorunlulukları:** Tacir → ticaret unvanı + MERSİS numarası; esnaf → ad-soyad + TCKN/VKN; her ikisinde kolay ret imkânı. **GAP:** mig 018'de `mersis_no` varsayılan değeri **boş string** (`''`) — `buildComplianceFooter` bu durumda MERSİS'siz sadece unvanla devam ediyor (kod fallback'i doğru: `if (!unvan && !mersis) return ''`, yani en azından footer'ı tamamen atlamıyor), ama gerçek uyum için Cem'in ticari statüsüne göre (şahıs şirketi/esnaf) doğru alan doldurulmalı — [ASSUMPTION] Cem şahıs mükellefiyetiyle çalışıyorsa MERSİS değil TCKN+ad-soyad formatı daha doğru olabilir; ticari sicil kaydı doğrulanmadı, operatör teyidi gerekir.
- **İYS'nin rolü:** İYS, onay/ret **yönetim** platformu. B2B (tacir→tacir) onaysız gönderimde İYS'ye ÖN KAYIT zorunlu değil gibi görünüyor ama **ret geldiğinde** bu ret kaydının bir yerde (İYS veya en azından dahili suppression list) kalıcı olarak tutulması gerekiyor — mevzuatın İYS kayıt yükümlülüğü eşiği (ölçek/ciro bazlı muafiyet olup olmadığı) bu araştırmada net doğrulanamadı [UNKNOWN, hukuki danışmanlık gerekir].
- **GAP — en kritik pratik boşluk:** AgencyOS'ta Gmail gönderme/yanıt okuma yok (bilinen gap #1), dolayısıyla "ret" yazan bir alıcının cevabı **tamamen manuel** olarak Cem tarafından görülüp işlenmeli. Sistemsel bir garanti (kalıcı suppression list + gönderim-öncesi kontrol) yok. Bu, mevcut düşük hacimde yönetilebilir ama hacim arttıkça veya Gmail entegrasyonu geldiğinde ilk yapılması gereken şey.

## 4) GDPR (AB'de gerçek kişiye ait veri işleme)

AgencyOS'un ICP'si bugün TR-merkezli olsa da global genişleme veya AB şirketlerine outreach ihtimali için:

- **Yasal dayanak — meşru menfaat (Md.6/1-f, Recital 47):** Recital 47 doğrudan "doğrudan pazarlama amaçlı işleme meşru menfaat sayılabilir" der. ICO'nun 3 aşamalı testi: **amaç testi** (neden bu kişiyle iletişime geçiliyor — rolüyle somut ilgi), **gereklilik testi** (e-posta en az müdahaleci yol mu), **denge testi** (kişinin gizlilik hakkı vs. işletme menfaati).
- **İtiraz hakkı (Md.21):** Her zaman mevcut ve İLK temas mesajında bildirilmeli; itiraz gelirse derhal durdurulmalı. Bu, 6563'ün "ret hakkı" ile aynı mantık — AgencyOS'un footer'ı bunu zaten TR bağlamında karşılıyor, global gönderimde İngilizce eşdeğeri gerekecek [V2 notu].
- **ePrivacy'nin önceliği:** ePrivacy Direktifi email pazarlaması özelinde GDPR'ın önüne geçer ve ülke bazında farklı uygulanır — bu yüzden "GDPR'a uygunum" demek email göndermek için yeterli değildir.

## 5) ePrivacy Direktifi — Madde 13 (B2B nüansı)

- **Genel kural:** Elektronik pazarlama için önceden opt-in onay gerekir.
- **Soft opt-in istisnası (Md.13/2):** İletişim bilgisi bir **satış bağlamında** elde edilmişse ve **benzer ürün/hizmetler** için kullanılıyorsa ve alıcı her mesajda kolayca itiraz edebiliyorsa, onaysız gönderim mümkün. (CJEU C-654/23 kararı bunu freemium/kayıt bağlamları için netleştirdi.)
- **Kurumsal-abone istisnası (bazı ülkeler):** Hollanda, İngiltere, İrlanda, Belçika ve İskandinav ülkelerinde B2B cold email belirli koşullarla onaysız yasal; **Almanya istisna** — hem B2B hem B2C için sıkı. [ASSUMPTION] Yani AgencyOS AB'ye açılırsa "tek tip AB kuralı" yok, ülke bazlı matris gerekir — bu şimdilik V2/erteleme.
- Türkiye'nin 6563 tacir/esnaf istisnası kavramsal olarak buna benziyor (kurumsal bağlamda onaysız izin) ama ayrı bir ulusal rejim, birbirinin yerine geçmez.

## 6) CAN-SPAM (ABD alıcıları)

- **B2B muafiyeti YOK** — CAN-SPAM, alıcının tüketici mi şirket mi olduğuna bakmaz; "birincil amacı ticari reklam/tanıtım olan" her e-postayı kapsar. Bu, Türkiye'nin tacir/esnaf istisnasından temel farkıdır — **TR mantığını ABD alıcısına uygulamak yanlış** olur.
- **7 temel kural:** dürüst başlık/gönderen bilgisi, dürüst konu satırı, reklam olduğunun açık belirtilmesi (gerekliyse), fiziksel adres, çalışan bir opt-out mekanizması, opt-out talebinin **10 iş günü içinde** işlenmesi, üçüncü taraf gönderici/vendörün denetlenmesi.
- **Ceza:** 2026 enflasyon ayarlı üst sınır e-posta başına **~$53.088** — her uyumsuz e-posta ayrı ihlal sayılır, düşük hacimde bile kümülatif risk yüksek olabilir.
- [ASSUMPTION] AgencyOS'un ICP'si bugün ağırlıklı TR şirketleri olduğundan CAN-SPAM riski şu an düşük öncelikli, ama ABD merkezli bir lead'e (örn. Apollo üzerinden bulunan İngilizce konuşan kurucu) outreach gönderilirse devreye girer — bu ayrım şu an kodda YOK.

## 7) Kişisel-vs-kurumsal e-posta ayrımı — pratik kural önerisi

| Adres türü | Örnek | KVKK/6563 risk | GDPR/ePrivacy risk |
|---|---|---|---|
| Kurumsal genel kutu | info@, sales@, iletisim@ | Düşük — açıkça tacir/kurum adresi | Düşük — kurumsal işlev |
| Kurumsal isimli | ad.soyad@sirket.com | Orta — kişiye ait ama iş bağlamı net | Orta — legitimate interest güçlü |
| Freemail (kişisel görünümlü) | gmail/hotmail/yahoo/outlook/icloud | Yüksek — "tacir/esnaf faaliyeti kapsamında mı" belirsiz | Yüksek — bireysel veri gibi ele alınmalı |

AgencyOS'ta `isFreemail()` (`src/lib/leadScoringV3.ts`) bugün SADECE satış riski sinyali olarak kullanılıyor ("kurumsal alan adı yok" = düşük web olgunluğu göstergesi). **Öneri (MVP):** aynı sinyali uyum tarafında da işaretle — freemail adreslere giden outreach'te footer'a ek bir dikkat notu veya operatöre "bu adres bireysel görünüyor, ret hakkı bildirimini vurgula" uyarısı.

## 8) AgencyOS'a entegrasyon (mevcut dosyalar üzerine)

- `supabase/migrations/018_compliance_footer.sql` + `src/lib/outreach/channelMatrix.ts::buildComplianceFooter` — **koru**, MERSİS/TCKN alanını doğru doldur (operatör aksiyonu, `settings` tablosu zaten var).
- `src/lib/leadScoringV3.ts::isFreemail()` — **genişlet**, uyum-dikkat sinyali olarak da kullan (küçük, izole değişiklik).
- `supabase/migrations/027_person_leads.sql`, `leads` tablosu — **additive migration** ile `retention_until TIMESTAMPTZ` kolonu ekle (mig 044'teki `agent_memory`/`run_spans` deseniyle tutarlı).
- **Yeni, küçük tablo (V1):** `outreach_suppressions` (email_hash veya email, reason: 'ret'|'unsubscribe'|'bounce'|'manual', created_at) — coldEmail taslak üretimi öncesi kontrol noktası. Kişisel veri minimize: sadece e-posta + tarih + sebep, isim/unvan gerekmez.
- `src/lib/coldEmail.ts`, `src/app/api/leads/[id]/cold-email/route.ts` — taslak üretim akışına suppression kontrolü eklenebilir (LLM'e değil, deterministik lookup'a).
- Gmail entegrasyonu geldiğinde (roadmap gap #1/#2) — "ret" kelime tespiti **deterministik regex/keyword** olmalı, LLM'e bırakılmamalı (kullanıcı kuralına uygun: "deterministik işe LLM koyma").

## 9) MVP / V1 / V2 ayrımı

**MVP (kod değişikliği minimal, çoğunlukla operatör aksiyonu):**
- Cem'in ticari statüsüne göre MERSİS no veya ad-soyad+TCKN alanını `settings` üzerinden doldur.
- `isFreemail()` sinyalini uyum-dikkat notuna da bağla (tek fonksiyon, düşük risk).
- Bu dokümandaki açık soruları (ticari statü, İYS kayıt eşiği) Cem'e/muhasebeciye sor.

**V1 (küçük, izole şema + kod eklemesi):**
- `leads` + `person_leads`'e `retention_until` kolonu (additive migration, mevcut pattern).
- `outreach_suppressions` tablosu + coldEmail taslak akışına kontrol noktası.
- Basit "N gün sonra anonimleştir" cron (mevcut cron altyapısına eklenir, KVKK 6 ay azami periyodik imha ile uyumlu bir varsayılan, örn. 180 gün).

**V2 (Gmail entegrasyonu + global genişleme sonrası):**
- Deterministik "ret" tespiti → otomatik suppression list güncelleme (HITL onaylı).
- Yurt dışına veri aktarımı için resmi hukuki değerlendirme + gerekiyorsa prompt-seviyesi kişisel veri maskeleme (OpenRouter/Gemini'ye giden isim/e-posta yerine rol/domain).
- GDPR/ePrivacy ülke-bazlı matris ve İngilizce opt-out dili (AB'ye açılırsa).
- CAN-SPAM'a özgü fiziksel adres + 10 iş günü opt-out SLA (ABD lead'i hedeflenirse).

## 10) Açık sorular / doğrulanamayanlar

- Cem'in ticari sicil statüsü (şahıs şirketi/esnaf/tacir) — MERSİS mi TCKN formatı mı doğru, doğrulanamadı; muhasebeci/hukuk teyidi gerekir.
- İYS'ye kayıt yükümlülüğünün ölçek/ciro eşiği net teyit edilemedi — tek kişilik düşük hacimli hizmet sağlayıcı için muafiyet olup olmadığı belirsiz.
- KVKK'nın ABD'ye (OpenRouter/Google barındığı bölgelere) yönelik güncel bir yeterlilik kararı olup olmadığı bu araştırmada doğrulanamadı.
- "Ret" cevabının kaç gün içinde işlenmesi gerektiğine dair TR mevzuatında CAN-SPAM'daki gibi (10 iş günü) net bir süre bulunamadı; önerilen kısa süre (ör. 24-48 saat) bir güvenli varsayımdır, yasal zorunluluk olarak sunulmuyor.
- Evidence Engine'in ürettiği ekran görüntüleri/PageSpeed verisi büyük ölçüde işletmeye ait (kişisel veri değil) kabul edildi — ekran görüntüsünde bir gerçek kişinin görseli/adı geçme ihtimali (örn. "hakkımızda" sayfası fotoğrafı) ayrıca değerlendirilmedi.

## Kaynaklar

- KVKK Kurumu — Yurt Dışına Aktarım: https://www.kvkk.gov.tr/Icerik/2053/Yurtdisina-Aktarim (erişim 2026-07-11)
- KVKK Kurumu — 2025/1072 sayılı İlke Kararı: https://www.kvkk.gov.tr/Icerik/8338/2025-1072 (erişim 2026-07-11)
- KVKK Kurumu — Silme/Yok Etme/Anonimleştirme Yönetmeliği: https://www.kvkk.gov.tr/Icerik/5441/ (erişim 2026-07-11)
- 6698 sayılı KVKK, 6563 sayılı ETK — mevzuat.gov.tr (erişim 2026-07-11)
- Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik — resmigazete.gov.tr, 2015/20150715-4 (erişim 2026-07-11)
- İYS (İleti Yönetim Sistemi) resmi platform: https://iys.org.tr/ ve T.C. Ticaret Bakanlığı sayfası (erişim 2026-07-11)
- ICO — Business-to-business marketing: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/ (erişim 2026-07-11, doğrudan içerik 403 ile engellendi, arama özeti kullanıldı)
- ICO — Legitimate interests guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/legitimate-interests/when-can-we-rely-on-legitimate-interests/ (erişim 2026-07-11)
- FTC — CAN-SPAM Act Compliance Guide: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business (erişim 2026-07-11)
- ePrivacy Direktifi Md.13 analizleri — Fieldfisher, Matheson, Reed Smith (CJEU C-654/23) (erişim 2026-07-11)
- Repo doğrulaması: `supabase/migrations/018_compliance_footer.sql`, `027_person_leads.sql`, `029_rls_person_leads.sql`, `044_trace_memory_governance.sql`, `src/lib/coldEmail.ts`, `src/lib/outreach/channelMatrix.ts`, `src/lib/leadScoringV3.ts`, `src/app/(os)/settings/page.tsx`
