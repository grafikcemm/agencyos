---
Doküman: 02-product-and-daily-ux
Tarih: 2026-07-11
Kaynak kalitesi: karışık (repo bulguları birincil/yüksek güven; dış CRM/UX pratikleri ikincil, orta güven)
Güven: orta-yüksek
AgencyOS'a etki: Mevcut 5 dağınık ekranı (harita/firsatlar/pipeline/command-center + kullanılmayan dashboard) tek "Günlük Satış Merkezi" karar akışında birleştirme, pipeline'ı 8 durumdan sadeleştirme, teknik ekranları günlük navigasyondan gizleme planı
---

## Özet

Cem şu anda satış kararı vermek için 4 canlı ekran (`/harita`, `/firsatlar`, `/pipeline`, `/command-center`) + 1 ölü ekran (`/dashboard`, sidebar'da yok) arasında geziniyor. Her ekran kendi veri çağrısını yapıyor, kendi "bugün ne yapmalıyım" mantığını taşıyor ve hiçbiri diğerini bilmiyor. Bu doküman (a) günün 10 sorusunu bugün hangi ekranın/kodun cevapladığını haritalar, (b) 4 ekranı BOZMADAN tek karar merkezinde toplayan bir sekme/bölüm mimarisi önerir, (c) mevcut `LeadDrawer` bileşenini temel alan bir lead inceleme paneli tarifi verir, (d) 14 aday CRM aşamasını mevcut 8 durumla karşılaştırıp tek kişilik operatör için gereksiz olanları eler, (e) görev/alışkanlık ayrımının zaten sağlandığını doğrular, (f) `/konsol` ve `/agents`'ın günlük akıştan gizlenmesini önerir, (g) bildirim tasarımı ve mobil kapsamı için somut kurallar verir, (h) teklif/outreach üretiminin bugün kaç adım sürdüğünü ölçer ve MVP'de nasıl kısaltılacağını gösterir.

En önemli bulgu: sistemde **zaten ölü kod var** — `/dashboard` sayfası, `RightPanel.tsx`, `FollowUpWidget/UrgentLeadsWidget/AICostWidget`, `KanbanBoard.tsx` + `LeadModal.tsx` hiçbir route'tan erişilmiyor (sidebar'da yok, hiçbir canlı sayfa import etmiyor). Yeni bir "cockpit" inşa etmeden önce bu 6 dosyanın silinip silinmeyeceği ayrı bir temizlik kararı olarak işaretlenmeli — bu doküman sadece tespit eder, silmez.

## 1. Günün 10 sorusu — bugün nerede cevaplanıyor

| # | Soru | Bugün cevaplayan yüzey | Durum |
|---|------|------------------------|-------|
| 1 | Bugün kiminle iletişim kurmalıyım? | `/pipeline` (next_action_priority sıralı kart) + `/command-center` (3 öncelikli lead) | Çakışıyor — iki farklı sıralama mantığı aynı soruyu farklı cevaplıyor |
| 2 | Gerçek problem ne? | `LeadDrawer` (kanıt/skor kırılımı) + `/firsatlar` (kanıt listesi, ekran görüntüsü) | Var, ama iki ayrı bileşende (`src/components/map/LeadDrawer.tsx`, `firsatlar/page.tsx`) |
| 3 | Hangi hizmet uygun? | `/firsatlar` (`chair.primary_service_name`, deterministik `matches[]`) | Var ve güçlü — Lead Intelligence v2 council çıktısı |
| 4 | Neden Cem (bu işletme neden hedef)? | `CustomerCategory` rozeti (`src/lib/customerCategory.ts`) LeadDrawer'da gösteriliyor | Var ama zayıf vurgulanmış, küçük rozet |
| 5 | İlk mesaj ne olmalı? | `LeadDrawer` → `buildProposal()` (`src/lib/proposalBuilder.ts`) + cold-email taslağı (`/api/leads/[id]/cold-email`) | Var, iki ayrı üretim yolu (WhatsApp teklif metni vs. e-posta taslağı) |
| 6 | Hangi kanal? | `channelMatrix.ts` `CHANNEL_PRIORITY` müşteri tipine göre öneriyor ama UI'da GÖSTERİLMİYOR | **Eksik** — mantık var, arayüze bağlı değil |
| 7 | Ne gönderdim? | `outreach_messages` tablosu var, `markMessageSent()` kaydediyor ama tek görünür yüzeyi yok | **Kısmen eksik** — veri var, "gönderilenler" listesi UI'da yok |
| 8 | Ne zaman follow-up? | `follow_up_sequences` + `FollowUpWidget.tsx` (**ölü kod**, hiçbir route render etmiyor) | **Eksik** — tek gerçek yüzey ölü bileşen |
| 9 | Yanıt ne demek? | Yok — reply intelligence hiç yok (brief'te GERÇEK EKSİK #2) | **Eksik** |
| 10 | Sonraki eylem? | `enrichLead()` → `next_action` / `next_action_priority` alanı `/pipeline` kartında gösteriliyor | Var ama yalnız pipeline'da, diğer 3 ekranda yok |

Ek olarak brief'te istenen envanterler bugün şu durumda:

| İhtiyaç | Bugünkü karşılığı |
|---|---|
| Bugün araştırılacak/iletişim kurulacak leadler | `/firsatlar` (2/gün seçim) + `/pipeline` "new"/"contacted" kolonu |
| Onay bekleyen taslaklar | Brain v2 HITL onayları `/konsol` `ApprovalItem[]` listesinde — ama bunlar **agent aksiyonu onayı**, outreach taslağı onayı değil (outreach zaten manuel-gönder, ayrı onay akışı yok) |
| Follow-up zamanı gelenler | `follow_up_sequences.due_at <= now` — cron `processDueSequences()` bunu `agent_task`'a terfi ediyor ama operatöre görünür tek bir liste yok |
| Yanıt bekleyenler / yeni yanıtlar | Yok (Gmail entegrasyonu yok) |
| Teklif bekleyenler | `/pipeline` "TEKLİF" kolonu (status=`proposal`) |
| Riskli/geciken fırsatlar | `staleDeals.ts` + `/api/leads/stale` — `/pipeline` özet kartında "Geciken" sayısı var, liste görünümü yok |
| Günün aktif görevleri | `/gorevler` (ayrı, LIFE DB, kasıtlı olarak satıştan ayrı) |

## 2. Tek Günlük Satış Merkezi — 4 ekranı bozmadan birleştirme

**Kısıt:** `/harita`, `/firsatlar`, `/pipeline` her biri kendi derin işlevini koruyor (harita = coğrafi keşif + tarama tetikleme; firsatlar = council kanıt/karar yüzeyi; pipeline = kanban + drag-drop durum geçişi). Bunları tek dev sayfaya eritmek hem kod riski hem "her şeyi tek ekrana sıkıştırma" anti-pattern'i olur (bkz. web design-quality kuralı: "Dashboard-by-numbers layouts... no point of view" yasaklı).

**Önerilen model: "Komuta katmanı + derinlik katmanı" (rota değişmez, roller değişir)**

`/command-center` bugün zaten sunucu tarafı bir "günlük brief" iskeleti (asistan özeti → direktif → 3 lead → ritim → motor durumu, bkz. `src/app/(os)/command-center/page.tsx`). Bu iskelet doğru yönde ama İKİ sorunu var: (1) satış ve yaşam (ritim/alışkanlık) verisini aynı sayfada karıştırıyor — brief'in "görev/alışkanlık ekranlarını satıştan ayır" talebiyle çelişiyor; (2) 3 lead kartı statik, aksiyon alınamıyor (yalnız "Tümü →" linki).

Önerilen değişiklik — **`/command-center`'ı "bugünün karar listesi" yap, `/harita` `/firsatlar` `/pipeline`'a birer kısayol/özet kartı olarak bağla, derin işi kendi sayfasında bırak:**

1. **Üst şerit — 10 sorudan türeyen 6 sayaç** (tıklanabilir, ilgili derin ekrana `?highlight=` query param ile deep-link): Bugün iletişim (n), Onay bekleyen taslak (n), Follow-up zamanı (n), Yeni yanıt (n) [Gmail gelene kadar 0 sabit göster, gizleme], Teklif bekleyen (n), Riskli/geciken (n).
2. **Orta gövde — "Bugünün Fırsatları" özetinin BURAYA taşınması** (bugün `/firsatlar`'da ayrı sayfa): council'in seçtiği 2 fırsat kartı (business_name, ana hizmet, kanıt sayısı, Uygun/Uygun değil geri bildirimi) command-center'a gömülür; `/firsatlar` sayfası "Tüm geçmiş fırsatlar + filtreler" arşiv görünümüne indirgenir (silinmez, ikinci sıraya düşer).
3. **Follow-up şeridi** — `follow_up_sequences` verisi gerçek bir bileşene bağlanır (bugün ölü olan `FollowUpWidget.tsx` yeniden kullanılabilir — sorgusu zaten doğru, sadece render edilmiyor).
4. **Riskli/geciken şeridi** — `staleDeals.ts` çıktısı (bugün sadece `/pipeline` özet sayısında var, liste yok).
5. **"Pipeline'a git" / "Harita'ya git" iki büyük kart** — kanban ve coğrafi keşif kendi tam sayfalarında kalır; command-center yalnız "bugün kaç tanesi acil" özetini gösterir.
6. **Yaşam bloğu (ritim/alışkanlık) command-center'dan ÇIKARILIR** — zaten `/aliskanliklar` ve `/gorevler` sidebar'ın en üstünde birinci sınıf yüzeyler; günlük satış merkezinde tekrarına gerek yok. `DailyBriefCard` (asistan mentor brifingi) kalabilir çünkü o zaten hem yaşam hem iş sinyalini birleştiren üst-seviye bir özet, ayrı bir modül.

Bu model 4 ekranı SİLMEZ, sadece command-center'ı "hangi 10 soruya bugün cevap ver" özetine, diğer üçünü kendi derinliğine bırakan bir hub yapar. `/dashboard` (ölü route, sidebar'da yok) ve ona bağlı 4 dosya (`RightPanel.tsx`, 3 widget) bu yeni tasarımda ya silinir ya da `FollowUpWidget` gibi tek parçası yeniden bağlanır — implementasyon fazında karar.

## 3. Lead inceleme paneli — mevcut `LeadDrawer` üstüne

`src/components/map/LeadDrawer.tsx` (690 satır) zaten güçlü bir taban: skor kırılımı (`SUB_SCORE_LABELS` — 8 alt skor), müşteri kategorisi rozeti, `buildProposal()` çıktısı (WhatsApp/e-posta iki görünüm), cold-email taslağı çekme, Apollo zenginleştirme, WhatsApp linki (`wa.me`) üretimi. Bu paneli yeniden yazmaya gerek yok; günlük merkez için eklenmesi gereken 3 şey:

- **Kanal önerisi görünür olsun**: `channelMatrix.ts`'deki `CHANNEL_PRIORITY[customerType]` bugün hesaplanıyor ama drawer'da gösterilmiyor — "Hangi kanal?" sorusunun cevabı zaten kodda, sadece render eksik.
- **"Ne gönderdim" geçmişi**: drawer bugün yalnız SON taslağı çekiyor (`/api/leads/${id}/cold-email`); `outreach_messages` tablosundan o lead'e ait TÜM gönderilmiş mesajların mini zaman çizelgesi eklenmeli.
- **Follow-up planı görünürlüğü**: `follow_up_sequences` o lead için varsa (gün X'te hangi kanal) drawer altında küçük bir liste — bugün tamamen yok.

## 4. Pipeline aşamaları — 14 aday vs. gerçek ihtiyaç

Dış araştırma: konsolidasyon deneyimi olan kaynaklar tek kişilik danışmanlık/satış operasyonları için **5-6 aşamayı yeterli** buluyor; 7-11 aşama çok-kişili ajans/kurumsal ekipler için önerilir [ikincil kaynak, orta güven, Ungrind/Nutshell CRM blog analizleri, 2026]. Bir kaynak solo operatörler için somut 6'lı model öneriyor: LEAD → CONVERSATION → PROPOSAL → WIN / LOSS / NURTURE [ikincil, orta güven].

AgencyOS'un bugünkü gerçek durumu **zaten bu aralıkta**: `LeadStatus` tipi (`src/lib/types.ts`) 8 değer tanımlıyor (`new, contacted, responded, meeting, proposal, converted, lost, waiting`), ama `/pipeline` kanban'ı yalnız **6 kolon** render ediyor (`new, contacted, responded, meeting, proposal, converted` — `lost` ve `waiting` kolon değil, filtre/arşiv durumu). Bu, brief'in bahsettiği "14 aday aşamadan (Discovered..Disqualified)" jenerik kurumsal CRM şablonuna göre **zaten sadeleştirilmiş** durumda — [çıkarım: 14'lü model muhtemelen Discovered/Qualifying/Contacted/Engaged/Meeting Scheduled/Meeting Held/Needs Analysis/Proposal Sent/Negotiation/Verbal Commit/Contract Sent/Won/Lost/Disqualified gibi kurumsal SaaS CRM şablonlarından — repo'da bu ada sahip bir yapı bulunamadı, karşılaştırma referans amaçlı].

**Değerlendirme — mevcut 8 durumdan hangisi kalsın:**

| Durum | Gerekli mi? | Gerekçe |
|---|---|---|
| `new` | Evet | Keşif/giriş noktası |
| `contacted` | Evet | İlk temas kaydı |
| `responded` | Evet | "Yanıt bekleyenler" sorusunun ayırt edici durumu — kaldırılırsa soru 9 cevapsız kalır |
| `meeting` | Evet | Somut sonraki adım, takvim bağlanabilir |
| `proposal` | Evet | Zaten gate'li (`pipelineGate.ts`) — pain_point+decision_maker+budget_band olmadan girilemiyor |
| `converted` | Evet | Kazanım |
| `lost` | Evet ama kolon değil | Arşiv filtresi olarak kalsın, kanban'da yer kaplamasın (bugünkü davranış zaten doğru) |
| `waiting` | **Tartışmalı** | Kanban'da hiç görünmüyor, `responded` ile anlam çakışması var ("yanıt bekliyorum" mu "cevap aldım" mı belirsiz) — [ASSUMPTION] muhtemelen kullanılmıyor, kod/DB'de gerçek kullanım oranı doğrulanmadı |

**Öneri:** 6 kolonu KORU (zaten doğru ölçek), `waiting` durumunun gerçekten kullanılıp kullanılmadığını bir sonraki fazda `leads.status='waiting'` sayımıyla doğrula — kullanılmıyorsa `responded`'a birleştir. **Yeni aşama EKLEME** — 14'lü modele doğru büyümek, tek operatörün "hangi kolona sürükleyeceğim" kararını yavaşlatır ve gerçek CRM literatüründeki solo-operatör tavsiyesiyle çelişir.

## 5. Görev/Alışkanlık ayrımı — zaten sağlanmış, koru

`src/components/layout/Sidebar.tsx`'daki `TOP_ITEMS` (Alışkanlıklar, Aktif Görevler) sidebar'ın en üstünde, PIPELINE grubundan tamamen ayrı bir blokta duruyor — bu zaten doğru mimari karar (muhtemelen önceki "Active Tasks UI" fazında bilinçli yapılmış, bkz. memory `active-tasks-ui-status.md`). Tek risk: `/command-center`'ın bugünkü içeriği (ritim + alışkanlık bloğu, madde 2'de belirtildi) bu ayrımı sulandırıyor — komuta merkezinden bu blok çıkarılırsa ayrım tam anlamıyla korunmuş olur.

## 6. Teknik ajan ekranları (`/konsol`, `/agents`) — günlük navigasyondan gizlensin mi?

**Evet, gizlenmeli — ama silinmemeli.** `/konsol` (registry sayaçları, HITL onay kartları, run geçmişi) ve `/agents` (6 ajanla sohbet + telemetri) bugün sidebar'ın "KOMUTA" grubunda `Command Center` ve `Asistan` ile YAN YANA duruyor — yani günlük satış operatörü için aynı görsel öncelikte. Bu, brief'in "≤3 adımda birincil göreve ulaş" kuralını (rules/os/70) zedeliyor: birincil görev (bugün kiminle konuşayım) ile ikincil/mühendislik görevi (agent registry sağlığı) aynı seviyede rekabet ediyor.

Öneri: `/konsol` ve `/agents`'ı sidebar'ın ana gruplarından çıkarıp mevcut alt "SİSTEM" bloğuna (`Zamanlanmış İşler`, `Bilgi Hazinesi`, `Ayarlar` ile birlikte) taşı. Bu sadece bir sidebar sıralama değişikliği — route'lar, API'ler, hiçbir backend değişmez. HITL onay bekleyen kartları (approvals) günlük merkeze bir SAYAÇ olarak sızdırılabilir (madde 2, üst şerit), böylece "onay bekleyen var" bilgisi kaybolmaz ama tam konsol arayüzü günlük yoldan çekilir.

## 7. Bildirim yorgunluğu

**Bugünkü durum:** `AppLayout.tsx`'deki zil ikonu tamamen dekoratif — sabit bir nokta gösteriyor, gerçek bir sayaç veya veri kaynağına bağlı değil (`<Bell />` + statik `div` noktası, hiçbir state yok). Gerçek proaktif bildirim kanalı zaten var ama farklı yerde: Telegram asistanı (`src/lib/assistant/morningBriefing.ts`, memory `telegram-two-way-deliberation.md`) sabah brifingi gönderiyor. Yani sistemde ZATEN iki paralel "bildirim" kavramı var — biri sahte (header zili), biri gerçek ama ayrı kanalda (Telegram).

**Tasarım ilkeleri** [ikincil kaynak, orta güven — dashboard/alert fatigue literatürü, 2025-2026]: sadece en kritik, yüksek etkili sinyaller bildirim tetiklesin; düşük öncelikli uyarılarla bombalamak kullanıcının HEPSİNİ görmezden gelmesine yol açar. Bildirim "aksiyona bağlı" olmalı — sorunu belirtmek yetmez, bağlam (ne zamandır böyle, ne yapılmalı) ve bir sonraki adım linki taşımalı. Sağlıklı sistemlerde bildirimlerin %30-50'si gerçekten aksiyona dönüşür; %10'un altı gürültü demektir.

**AgencyOS'a öneri:** Header zilini ya (a) gerçek bir sayaca bağla — yalnız şu 3 kaynaktan: onay bekleyen HITL kartı sayısı + bugün geciken follow-up sayısı + yeni gelen yanıt sayısı (Gmail entegrasyonu geldiğinde), ya da (b) tamamen kaldır ve tek bildirim kanalı olarak Telegram'ı bırak (zaten çalışıyor, HITL onayıyla uyumlu, düşük gürültülü). İki paralel yarım-bildirim sistemi tutmak en kötü seçenek — kullanıcı hangisine bakacağını şaşırır.

## 8. Mobil — hangi işlemler

`AppLayout.tsx` zaten responsive bir temel sağlıyor (mobil off-canvas sidebar, `hidden md:block` deseni). Ancak `/pipeline`'ın sürükle-bırak kanban'ı ve `/harita`'nın harita etkileşimi mobilde zayıf çalışan desenlerdir (dokunmatik sürükleme + küçük ekran + çok kolon yan yana kaydırma). Dış araştırma [ikincil kaynak, orta güven, saha satış CRM mobil kılavuzları 2025-2026]: sahada iyi çalışan işlemler — hızlı not/sesli not, tek dokunuşla arama/WhatsApp linki, durum değiştirme (dropdown/büyük buton, sürükle-bırak DEĞİL), bildirim onaylama; masaüstüne bırakılması gerekenler — çok alanlı rapor kurma, toplu veri işlemleri, karmaşık filtre kombinasyonları.

**AgencyOS'a somut öneri:** Mobilde birincil akış = Günlük Satış Merkezi'nin üst şeridi (6 sayaç) + lead kartı üzerinde 3 büyük buton (Ara / WhatsApp / Durum değiştir — dropdown, sürükleme yok). `/pipeline` kanban'ı ve `/harita` haritası mobilde "masaüstünde aç" bilgilendirmesiyle sınırlı işlevsellikte kalabilir — bunları mobil için yeniden tasarlamak bu fazın kapsamı dışında (V2 adayı).

## 9. Teklif/outreach üretimi — bugün kaç adım

Mevcut akışı `LeadDrawer.tsx` + `proposalBuilder.ts` + `coldEmail.ts` üzerinden izleyerek:

1. Operatör lead'i açar (`/pipeline` veya `/harita` kartına tıklar → drawer açılır).
2. Drawer skor/kanıt/kategoriyi gösterir (otomatik, adım sayılmaz).
3. Operatör "Teklif oluştur" benzeri bir aksiyonla `buildProposal()` çağrısını tetikler → WhatsApp/e-posta iki görünümlü teklif metni üretilir (deterministik, `src/lib/proposalBuilder.ts`).
4. Operatör ayrıca (ayrı bir çağrı) cold-email taslağını ister → `/api/leads/[id]/cold-email` → `coldEmail.ts` + `coldEmailTemplates.ts` (4 açı: mini_audit/launch/hiring/before_after) LLM ile taslak üretir.
5. Operatör metni kopyalar (`Copy` butonu) ve KENDİ WhatsApp/e-posta istemcisine yapıştırıp gönderir (sistem göndermiyor — `markMessageSent()` yalnız "gönderildi" işaretini kaydeder, bu da AYRI bir aksiyon, adım 6).
6. Operatör "gönderildi" işaretler (varsa) → `outreach_messages.status='sent'`.
7. Follow-up sekansı `scheduleMultiChannelSequence()` ile ayrı bir çağrıda planlanır (bugün bu adımın UI'da tetiklendiği net değil — [UNKNOWN: hangi ekrandan çağrılıyor, kodda çağıran nokta bulunamadı bu araştırma kapsamında]).

**Toplam: en az 4-5 ayrı operatör aksiyonu** (aç → teklif üret → e-posta üret → kopyala/gönder → işaretle), 2 farklı üretim kaynağı (proposalBuilder deterministik metin vs. coldEmail LLM taslağı) arasında geçiş gerektiriyor. Bu, "teklif/outreach üretimi kaç adım" sorusuna doğrudan cevap: **bugün 4-5 adım, 2 paralel içerik kaynağı.**

**MVP'de kısaltma önerisi:** Drawer'da tek "Bugün gönder" bölümü — kanal önerisine göre (madde 3) otomatik olarak DOĞRU taslağı öne çıkar (yerel esnaf → WhatsApp/proposalBuilder metni; B2B/agency → cold-email LLM taslağı), kopyala + "gönderildi" işaretle + follow-up planla TEK ekranda 3 buton olsun. Bu, üretim mantığını (proposalBuilder, coldEmail) DEĞİŞTİRMEZ, yalnız aynı ekranda sıralar — kod tarafında yeniden yazma değil, UI kompozisyonu değişikliği.

## AgencyOS'a entegrasyon

- `src/app/(os)/command-center/page.tsx` + `CommandCenterClient.tsx`: yaşam bloğunu çıkar, 2 fırsat kartını `firsatlar/page.tsx`'ten taşı, follow-up/riskli şeritlerini ekle. Server-shell deseni zaten var, genişletilebilir.
- `src/components/dashboard/FollowUpWidget.tsx`: sorgusu doğru, yeniden bağlanabilir (bugün hiçbir route render etmiyor).
- `src/lib/leads/staleDeals.ts` + `/api/leads/stale`: command-center'a "riskli/geciken" şeridi için doğrudan kullanılabilir, yeni mantık gerekmez.
- `src/components/map/LeadDrawer.tsx`: kanal önerisi (`channelMatrix.CHANNEL_PRIORITY`) render'ı eklenir; `outreach_messages` geçmişi ve `follow_up_sequences` planı eklenir.
- `src/lib/outreach/channelMatrix.ts`: mantık hazır, yalnız UI'ya bağlanması gerekiyor.
- `src/components/layout/Sidebar.tsx`: `/konsol` ve `/agents`'ı `NAV_GROUPS`'tan `SYSTEM_ITEMS`'a taşı (tek dosya, düşük risk).
- `src/components/layout/AppLayout.tsx`: zil ikonuna gerçek sayaç bağla veya kaldır; `PAGE_TITLES` haritası zaten tüm rotaları biliyor.
- Ölü kod envanteri (silme kararı ayrı, bu doküman kapsamı dışında): `src/app/(os)/dashboard/page.tsx`, `src/components/layout/RightPanel.tsx`, `src/components/dashboard/{FollowUpWidget,UrgentLeadsWidget,AICostWidget}.tsx` (FollowUpWidget hariç yeniden kullanılabilir), `src/components/pipeline/KanbanBoard.tsx` + `LeadModal.tsx`.
- `src/lib/leads/pipelineGate.ts`: değişiklik gerekmiyor, mevcut proposal gate korunuyor.
- `src/lib/types.ts` `LeadStatus`: değişiklik önerilmiyor (8 durum zaten doğru ölçek).

## MVP / V1 / V2

**MVP (mevcut dosyaları yeniden kompoze et, yeni tablo/migration yok):**
- Command-center'dan yaşam bloğunu çıkar, 2 fırsat kartını taşı, follow-up + riskli şeritlerini bağla (mevcut sorgular).
- `LeadDrawer`'a kanal önerisi + outreach geçmişi + follow-up planı render'ı ekle.
- Sidebar'da `/konsol` `/agents`'ı SİSTEM bloğuna taşı.
- Header zilini gerçek sayaca bağla (onay + geciken follow-up + [Gmail gelene kadar 0]).

**V1 (küçük yeni bağlantı noktaları, migration gerekebilir):**
- "Ne gönderdim" için `outreach_messages`'ın lead bazlı zaman çizelgesi UI'ı (yeni component, mevcut tablo).
- Follow-up sekansının hangi ekrandan tetiklendiğinin netleştirilmesi + tek tıkla planlama butonu.
- Mobilde lead kartı 3-buton hızlı aksiyon (Ara/WhatsApp/Durum) — kanban'ı mobilde yeniden tasarlamadan.
- `waiting` durumunun gerçek kullanım oranı doğrulanıp gerekirse `responded`'a birleştirilmesi.

**V2 (Gmail/reply intelligence bağımlı, ayrı araştırma dokümanına bağlı):**
- "Yeni yanıt" sayacı ve yanıt intelligence paneli (bu doküman kapsamında GERÇEK EKSİK #1/#2 olarak işaretlenen, ayrı doküman konusu).
- `/pipeline` kanban'ının mobil-native yeniden tasarımı.
- Ölü kod temizliği (dashboard/RightPanel/KanbanBoard/LeadModal) — ayrı, düşük riskli bir "cleanup" görevi olarak.

## Açık sorular / doğrulanamayanlar

- `leads.status='waiting'` DB'de gerçekten kaç kayıtta kullanılıyor — bu araştırma kapsamında sorgulanmadı, implementasyon öncesi `SELECT count(*) FROM leads WHERE status='waiting'` ile doğrulanmalı.
- `scheduleMultiChannelSequence()` / `scheduleFollowUp()` bugün hangi UI aksiyonundan çağrılıyor — kod tabanında çağıran nokta bu araştırmada bulunamadı (yalnız cron tarafındaki `processDueSequences()` tüketici tarafı doğrulandı).
- `/dashboard`, `RightPanel.tsx`, `KanbanBoard.tsx`/`LeadModal.tsx`'ın silinip silinmeyeceği — kasıtlı "gelecek iterasyon" taslağı mı yoksa unutulmuş ölü kod mu, yalnız Cem karar verebilir.
- Header zilinin Telegram bildirimleriyle nasıl ilişkileneceği (ikisi birden mi kalsın, biri mi kaldırılsın) — ürün tercihi, bu doküman yalnız seçenekleri sunar.
- 14 aşamalı "Discovered..Disqualified" modelinin brief'te hangi somut kaynaktan geldiği bu araştırmada teyit edilemedi; repo içinde bu adlandırmayla bir yapı yok — karşılaştırma jenerik kurumsal CRM şablonlarına dayandırıldı [ASSUMPTION].

Sources:
- [Build the Perfect Sales Pipeline for Consultants (Keap)](https://keap.com/small-business-automation-blog/sales/consultant-sales-pipeline)
- [The Best CRM Setup for Independent Consultants in 2026 (Ungrind)](https://ungrind.ai/blog/crm-for-consultants/)
- [How to Manage a Sales Pipeline for a Consulting Firm (Nutshell)](https://www.nutshell.com/blog/sales-pipeline-management-for-consulting-firm)
- [10 Essential Dashboard Design Best Practices for SaaS in 2025](https://www.context.dev/blog/dashboard-design-best-practices)
- [Alert fatigue solutions for DevOps teams in 2025 (incident.io)](https://incident.io/blog/alert-fatigue-solutions-for-dev-ops-teams-in-2025-what-works)
- [Data Quality Alerts: Setup, Best Practices & Reducing Fatigue (Atlan)](https://atlan.com/know/data-quality-alerts/)
- [Best Mobile CRM for Sales Reps: The Field Buyer's Guide (Leadbeam)](https://www.leadbeam.ai/blog/best-mobile-crm-for-sales-reps)
- [10 Best CRM for Sales Reps in 2026 (SimplyDepo)](https://simplydepo.com/industry/best-crm-for-sales-reps/)
