---
Doküman: 01-final-product-spec
Dalga: 2 (Motorlar — Dalga 1 sözleşmelerine referans)
Tarih: 2026-07-11
Durum: Ürün tanımı (nav/flow/data dokümanları buna referans verir)
Bağımlılık: plan §4 (V2 ürün şekli), K1-K4; 04-domain-model.md (entity), 06-agent-registry.md (11 rol), 02-final-information-architecture.md (nav), 03-user-flows.md (akışlar); research 02-product-and-daily-ux.md
---

# AgencyOS V2 — Nihai Ürün Spesifikasyonu

## 0. Bir cümlede

AgencyOS bugün lead **buluyor, puanlıyor, kategorize ediyor, eşleştiriyor, pipeline'da takip ediyor** ama satış döngüsünü **kapatamıyor** (plan §Context). V2 tek şeyi ekler: **Ali Cem'in dilinden, role özel outreach üret → onayla → Gmail'den gönder → takip et → yanıtı anla → sonraki eylemi öner** döngüsünü (K1). Yeni ürün = mevcut deterministik çekirdek + bu kapanış halkası. **Yeni ekran şişkinliği yok; recomposition var.**

## 1. Hedef ürün tanımı

**Kullanıcı:** tek operatör (Ali Cem), tek makine, `LOCAL_USER` (plan §2, `auth.ts`). Çoklu-kullanıcı, ekip, rol-tabanlı erişim **kapsam dışı**. Her tasarım kararı tek-kullanıcı gerçeğini korur (anti-bloat).

**Ürün üç katmanlı kalır (değişmez):**
1. **Deterministik satış çekirdeği (korunur):** leadScoringV3, highQualityLeadEngine, customerCategory (7 kategori), offerMatcher (evidence-gated), council (Lead Intel v2 budget-cap'li). Bunlar LLM-siz veya bütçe-sınırlı; V2 bunları **yeniden yazmaz**, üstüne bağlanır (plan §2).
2. **Yaşam katmanı (dokunulmaz):** Görev/Alışkanlık/Rutin (`/gorevler`, `/aliskanliklar`, LIFE DB). Satıştan tamamen ayrı; hiçbir satış rolü bu scope'u talep etmez (06 §5).
3. **Yeni kapanış halkası (asıl build):** Contact+Role, Email Thread/Message, Reply Analysis, Follow-up state machine, Suppression/Consent, Portfolio, Proposal (persistent), Relationship Memory, Voice edit-delta, Signal (plan §4 domain eklemeleri; 04-domain-model).

**Ne DEĞİL:** çok-ajanlı orkestra, ayrı VM, kurumsal CRM (14 aşama), corpus-bootstrap Voice DNA, otomatik gönderim (HITL pazarlıksız). Bunların hepsi araştırmada değerlendirilip **elendi** (plan §3, 06 §0).

## 2. Tek günlük kokpit — "BUGÜN" (recomposition, YENİ ekran DEĞİL)

**Kilit kısıt:** `/command-center` bugün zaten sunucu-taraflı bir günlük brief iskeleti (`command-center/page.tsx:99-217`): DailyBriefCard (`:122`) → DirectivePanel (`:124`) → 3 lead (`:127-163`) → ritim+alışkanlık (`:165-207`) → OutreachKpi (`:209`) → EngineStatus (`:211-213`). V2 **bu iskeleti BUGÜN kokpitine dönüştürür** — sıfırdan sayfa açmaz (research 02 §2).

**İki sorun düzeltilir (research 02 §2):**
- **(a) Yaşam/satış karışımı:** ritim+alışkanlık bloğu (`:165-207`) kokpitten ÇIKARILIR — zaten `/aliskanliklar` + `/gorevler` sidebar'ın en tepesinde birinci sınıf yüzeyler (Sidebar `TOP_ITEMS:31-34`). DailyBriefCard (üst-seviye mentor özeti) kalabilir.
- **(b) Statik lead kartları:** 3 lead kartı (`:147-160`, yalnız "Tümü →" linki) aksiyon-alınabilir karar listesine dönüşür.

**BUGÜN kokpiti = "günün 10 sorusuna tek yerden cevap" (research 02 §1):**

| Bölüm | İçerik | Kaynak (mevcut) |
|---|---|---|
| **Üst şerit — 6 sayaç** (tıklanabilir → derin ekrana `?highlight=` deep-link) | İncelenecek lead · Onay bekleyen taslak · Follow-up zamanı · Yeni yanıt · Teklif bekleyen · Riskli/geciken | leads sorgusu + `approval_requests` (mig 043) + `follow_up_sequences` + reply_classifications (mig 051) + `leads.status='proposal'` + `staleDeals.ts` |
| **Orta gövde — Bugünün Fırsatları** (2 kart) | council'in seçtiği 2 fırsat (business_name, ana hizmet, kanıt sayısı, Uygun/Uygun değil) | `firsatlar/page.tsx`'ten MERGE (council çıktısı); `/firsatlar` arşiv görünümüne iner (silinmez) |
| **Follow-up şeridi** | Bugün due olan follow-up'lar | `follow_up_sequences.scheduled_at<=now` (bugün ölü `FollowUpWidget.tsx` sorgusu doğru, yeniden bağlanır) |
| **Riskli/geciken şeridi** | Stale deal listesi | `staleDeals.ts` + `/api/leads/stale` (bugün yalnız sayı, liste yok) |
| **Derinlik kısayolları** | "Pipeline'a git" / "Harita'ya git" büyük kartlar | kanban ve coğrafi keşif kendi tam sayfalarında kalır |

**Sonuç:** 4 canlı ekran (`/harita`, `/firsatlar`, `/pipeline`, `/command-center`) SİLİNMEZ; kokpit onları "bugün ne acil" özetiyle bağlayan hub olur, derin iş kendi sayfasında kalır (research 02 §2). Bu bir **UI kompozisyonu**, üretim mantığı (offerMatcher, coldEmail, council) değişmez.

## 3. MVP satış döngüsü (K1) — çekirdek akış

Kokpitten başlar, tek karar hattı olarak akar. Her adımın **sahibi 06-agent-registry'deki roldür** (yeni ajan değil, mevcut ajana grant edilen skill):

| # | Adım | Sahip rol (06) | Skill (07) | Çıktı | Kapı |
|---|------|----------------|------------|-------|------|
| 1 | Dossier + rol-aware önerilen hizmet/kanıt | **Lead Intelligence** (`researcher`+council) | build-lead-dossier, extract-signals, score-lead | dossier + evidence + signals + skor | deterministik/internal (auto) |
| 2 | Rol-aware kişiselleştirilmiş taslak | **Outreach** (`sales_rep`+coldEmail) | generate-outreach (K2 rol-aware, K4 edit-delta) | subject+body (`original_body`) + evidenceIds; imza/footer deterministik | — |
| 3 | Voice Guard + bağımsız judge | **Outreach Reviewer** (ephemeral judge) | review-outreach | verdict pass/revise/block + voiceScore | cross-family judge |
| 4 | Uyumluluk ön-kapısı | **Compliance & Risk** (deterministik) | audit-compliance | footer/opt-out/suppression kontrolü | `ok:false` → **gönderim bloke** |
| 5 | **HITL onay** | operatör | — | onay/red | `approval_requests` digest-lock (mig 043) |
| 6 | Gmail gönderim | **Email Ops** (araç-çağıran) | send-gmail (taslak uygulama-içi tutulur; create-gmail-draft **V1**, `gmail.compose` gerektirir — 12 §A.1, 23 §2) | gmailMessageId + thread | **external** — `approved_digest===action_digest` (`repo.ts:77`) |
| 7 | Thread takibi | **Email Ops** | sync-email-thread **(V1 / Sprint 2)** | yeni EmailMessage (mig 046) | 15dk poll cron (History API) |
| 8 | 5-7 iş günü follow-up | **Pipeline Manager** (deterministik FSM) | schedule-follow-up | sequence + dueAt (TR tatil/iş-günü) | yanıt/bounce/opt-out'ta **iptal** |
| 9 | Yanıt sınıflandırma (+/-) | **Reply Intelligence** (izole) | classify-reply | label + confidence | inbound=**DATA**, düşük confidence→needs_human |
| 10 | Sonraki eylem | **Pipeline Manager** + **Reply Intelligence** | recommend-next-action, draft-reply **(V1 / Sprint 2)** | status geçişi + öneri/cevap taslağı | draft→gönderim yine HITL external |

**Pazarlıksız kurallar (K1):** HITL onay kapısı + suppression + opt-out (plan K1). Gönderim asla otomatik değil (06 §2/§5). Voice DNA = persona + edit-delta öğrenme (K4); corpus bootstrap yok.

## 4. Birincil görev ≤3 adımda (rules/os/70)

**Birincil görev = "Bugün bu lead'e outreach gönder."**

1. BUGÜN kokpitini aç (landing; bugün `/` → `/harita` redirect'i `page.tsx:4` V2'de BUGÜN'e döner).
2. Fırsat kartında/lead'de "Taslağı gör" → rol-aware taslak + Voice Guard verdict + uyumluluk durumu tek panelde.
3. "Onayla ve gönder" → HITL digest-lock → Email Ops gönderir.

Follow-up + takip **operatör eylemi gerektirmez** (deterministik, arka planda). Teklif hattı da aynı disiplinde: lead aç → teklif üret (gate'li) → onayla (≤3).

## 5. Her durum tasarlı (loading / empty / error / success)

Bir durum tasarlanmamışsa özellik bitmemiştir (rules/os/70). Mevcut command-center deseni bunu zaten uyguluyor; V2 her yeni yüzeyde tekrarlar:

| Yüzey | Loading | Empty | Error | Success |
|---|---|---|---|---|
| **BUGÜN — 6 sayaç** | skeleton sayaç | "0" göster, gizleme (Yeni yanıt Gmail gelene kadar sabit 0) | loader try/catch → 0'a düş (command-center `:54/:80/:94` deseni) | canlı sayı + deep-link |
| **Fırsat kartları** | skeleton kart | "Açık lead bulunamadı" (mevcut `:142-144`) | sessiz boş dizi, kokpit çökmez | 2 kart + Uygun/Uygun değil |
| **Taslak paneli** | "Taslak üretiliyor…" | kanıt yok → taslak üretilmez + neden (evidence_id grounding zorunlu, 06 §3.4) | üretim/judge hatası → step 'error', taslak yaratılmaz | subject+body + voiceScore + "Onayla ve gönder" |
| **Gönderim** | "Gönderiliyor…" | — | Gmail API hata → step 'error', **taslak inert=teslimat yok** (06 §3.6) | thread satırı + kokpit sayacı güncellenir |
| **Follow-up şeridi** | skeleton | "Planlı follow-up yok" | boş dizi | due liste + iptal-nedeni rozetleri |
| **Yanıt** | — | yeni inbound yok → sayaç 0 | classify timeout → `needs_human`, otomatik iş yok | +/- etiket + önerilen eylem |
| **Teklif** | "Teklif üretiliyor…" | gate eksik → aksiyon disabled + `missing[]` (mig 020) | fiyat kuralı yok → fiyat alanı boş + operatör-girişi işareti (LLM sayı uydurmaz) | versiyonlu proposal + onay |

## 6. Başarı kriterleri (ürün "hazır" mı)

- **Döngü kapanır:** bir lead için dossier→taslak→onay→Gmail gönderim→thread→follow-up→yanıt-sınıf→sonraki-eylem uçtan uca çalışır (03-user-flows'daki 3 akış demo edilebilir).
- **HITL pazarlıksız:** hiçbir e-posta operatör onayı olmadan gitmez; "X'i onayla, Y'yi gönder" **yapısal imkânsız** (digest-lock, `repo.ts:77`).
- **Suppression/opt-out çalışır:** her gönderim öncesi suppression kontrolü (mig 047); opt-out/bounce anında suppress + açık follow-up iptal.
- **≤3 adım korunur:** birincil görev entry'den 3 adımda ulaşılır; kokpit yaşam verisi taşımaz.
- **Her durum tasarlı:** 4 durumun hiçbiri unhandled değil (§5 tablosu).
- **Anti-bloat:** yeni route açılmadı (recomposition); premium model default değil; her göreve premium judge eklenmedi (plan §4 cost funnel).
- **Voice öğrenir:** `original_body`/`final_body` edit-delta yakalanır → quarantine→active voice_pattern (K4).
- **Dokunulmazlar korundu:** Görev/Alışkanlık/Rutin + LIFE DB hiç değişmedi.

## 7. Kapsam dışı / dokunulmazlar

- **Dokunulmaz:** Görev/Alışkanlık/Rutin (`/gorevler`, `/aliskanliklar`, LIFE DB `xcqrk…`); Kariyer Radarı (`/kariyer`, ayrı job engine, mig 011).
- **Bu fazda yapılmayacaklar (plan §Context):** kod değişimi, migration uygulama, paket kurulumu, env değişimi, gerçek Gmail gönderimi, contact toplama, production verisine dokunma.
- **Gmail OAuth = Sprint-0 önkoşulu** (K1): fabrike edilemeyen tek blokör; kullanıcı yetkilendirir. Scope **send + readonly**; `modify`/full YASAK (plan §3).
- **`assumption:`** BUGÜN'ün `/` landing'i olması bir ürün kararı; bugünkü redirect `/harita`'ya (`page.tsx:4`) — recompose fazında BUGÜN'e çevrilir, bu doküman kapsamında değiştirilmez.
